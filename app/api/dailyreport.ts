import type { AppDB, RunRow, StepLog } from './db';
import { randomBytes } from 'crypto';
import type { SecretBox } from './crypto';
import type { WacapService } from './service';

// ---------------------------------------------------------------- types

export interface DRSettings {
  baseUrl: string;
  timezone: string;
  /** Overrides employee_position_id found in /me (leave empty for auto). */
  positionId: string;
  waSession: string;
  /** Phone number or group JID that receives the report. */
  waTarget: string;
  sendTyping: boolean;
  typingSeconds: number;
  /** Step 6 (set-today-recheck) */
  recheckMethod: 'POST' | 'PUT' | 'GET';
  recheckBody: string;
  /** Step 7 (new-task). Body is JSON text, supports {{date}} and {{employee_position_id}}. */
  newTaskMethod: 'POST' | 'PUT' | 'GET';
  newTaskBody: string;
  /** Master switch for all schedules below. */
  scheduleEnabled: boolean;
  /** Test mode: scheduled runs are dry runs (nothing is sent) and ignore "already sent today". */
  schedulerTestMode: boolean;
  /** Force: scheduled runs are REAL (send to WhatsApp) even if today's report was already sent. */
  schedulerForce: boolean;
  schedules: Schedule[];
}

export interface Schedule {
  id: string;
  time: string; // HH:mm
  days: number[]; // 0=Sun … 6=Sat
  enabled: boolean;
}

export const DEFAULT_SETTINGS: DRSettings = {
  baseUrl: 'https://api.dparagon.com/v2',
  timezone: 'Asia/Jakarta',
  positionId: '',
  waSession: '',
  waTarget: '',
  sendTyping: true,
  typingSeconds: 3,
  recheckMethod: 'POST',
  recheckBody: '{"employee_position_id":{{employee_position_id}}}',
  newTaskMethod: 'POST',
  newTaskBody: '',
  scheduleEnabled: false,
  schedulerTestMode: false,
  schedulerForce: false,
  schedules: [{ id: 'default', time: '17:00', days: [1, 2, 3, 4, 5], enabled: true }],
};

interface Conn {
  email: string;
  baseUrl: string;
  tokenEnc: string;
  passwordEnc?: string;
  connectedAt: number;
}

class StopRun extends Error {}
class ApiFail extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- helpers

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Depth-first search for the first non-null value stored under `key`. */
export function findKey(obj: any, key: string, depth = 0): any {
  if (obj == null || typeof obj !== 'object' || depth > 6) return undefined;
  if (key in obj && obj[key] != null) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findKey(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** employee_position_id from the /me payload (any nesting), as a string, or '' if absent. */
export function positionFromMe(me: unknown): string {
  const v = findKey(me, 'employee_position_id');
  return v === undefined || v === null || typeof v === 'object' ? '' : String(v).trim();
}

function asArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  for (const k of ['payload', 'data', 'items', 'results', 'list']) {
    if (x && x[k] !== undefined) {
      const r = asArray(x[k]);
      if (r.length || Array.isArray(x[k])) return r;
    }
  }
  return [];
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function extractText(res: any): string {
  // The API wraps data in an envelope { url, method, request, code, message, payload }.
  // `message` there is a status line ("data successfully retrieved"), never the content.
  const root = res && typeof res === 'object' && 'payload' in res ? res.payload : res;
  if (typeof root === 'string') return root.trim();
  for (const k of ['summary', 'text', 'content', 'report', 'body', 'result', 'message']) {
    const v = findKey(root, k);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function clip(v: unknown, n = 4000): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function nowIn(tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}`, dow };
}

/** A schedule keeps retrying (skipped = not checked in yet) for this long after its set time. */
const RETRY_WINDOW_MIN = 120;
const RETRY_EVERY_MS = 10 * 60 * 1000;

const minutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'yyyy-MM-dd' shifted by N days (calendar math in UTC, so no DST/timezone surprises). */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** [1,2,3,4,5] -> "Mon–Fri", [6] -> "Sat", [0,6] -> "Sun, Sat" */
export function fmtDays(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'Every day';
  const parts: string[] = [];
  for (let i = 0; i < d.length; ) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    parts.push(j - i >= 2 ? `${DAY_NAMES[d[i]]}–${DAY_NAMES[d[j]]}` : d.slice(i, j + 1).map((x) => DAY_NAMES[x]).join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------- service

export class DailyReportService {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(private db: AppDB, private box: SecretBox, private wa: WacapService) {}

  // ---- settings
  getSettings(): DRSettings {
    const raw = this.db.getKV('dr.settings');
    const parsed = raw ? JSON.parse(raw) : {};
    // Migrate the old single schedule (scheduleTime/scheduleDays) to the list format.
    if (!parsed.schedules && (parsed.scheduleTime || parsed.scheduleDays)) {
      parsed.schedules = [{ id: 'default', time: parsed.scheduleTime || '17:00', days: parsed.scheduleDays || [1, 2, 3, 4, 5], enabled: true }];
    }
    delete parsed.scheduleTime;
    delete parsed.scheduleDays;
    return { ...DEFAULT_SETTINGS, ...parsed };
  }

  saveSettings(patch: Partial<DRSettings>): DRSettings {
    const cur = this.getSettings();
    const next: DRSettings = { ...cur };
    const s = (k: keyof DRSettings) => patch[k] !== undefined;

    if (s('baseUrl')) {
      const u = String(patch.baseUrl).trim().replace(/\/+$/, '');
      // https only; plain http is allowed just for a local mock/dev API.
      if (!/^https:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u))
        throw new Error('Base URL must start with https://');
      next.baseUrl = u;
    }
    if (s('timezone')) {
      try { new Intl.DateTimeFormat('en', { timeZone: patch.timezone }); } catch { throw new Error('Invalid timezone'); }
      next.timezone = String(patch.timezone);
    }
    for (const k of ['positionId', 'waSession', 'waTarget', 'recheckBody', 'newTaskBody'] as const)
      if (s(k)) next[k] = String(patch[k] ?? '').trim();
    for (const k of ['recheckBody', 'newTaskBody'] as const) {
      if (next[k]) { try { JSON.parse(next[k].replace(/\{\{\w+\}\}/g, '0')); } catch { throw new Error(`${k}: invalid JSON`); } }
    }
    for (const k of ['recheckMethod', 'newTaskMethod'] as const)
      if (s(k)) {
        if (!['POST', 'PUT', 'GET'].includes(patch[k] as string)) throw new Error(`${k}: invalid method`);
        next[k] = patch[k] as any;
      }
    if (s('sendTyping')) next.sendTyping = !!patch.sendTyping;
    if (s('typingSeconds')) next.typingSeconds = Math.min(Math.max(Number(patch.typingSeconds) || 0, 0), 30);
    if (s('schedulerForce')) next.schedulerForce = !!patch.schedulerForce;
    if (s('schedulerTestMode')) next.schedulerTestMode = !!patch.schedulerTestMode;
    if (s('scheduleEnabled')) next.scheduleEnabled = !!patch.scheduleEnabled;
    if (s('schedules')) {
      const list = patch.schedules;
      if (!Array.isArray(list) || list.length > 10) throw new Error('schedules: up to 10 entries');
      const seen = new Set<string>();
      next.schedules = list.map((x, i) => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x?.time))) throw new Error(`Schedule ${i + 1}: time must be HH:mm`);
        const days = [...new Set((x.days || []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[];
        if (!days.length) throw new Error(`Schedule ${i + 1}: pick at least one day`);
        let id = String(x.id || '').replace(/[^\w-]/g, '').slice(0, 24) || randomBytes(4).toString('hex');
        while (seen.has(id)) id = randomBytes(4).toString('hex');
        seen.add(id);
        return { id, time: String(x.time), days: days.sort(), enabled: x.enabled !== false };
      });
    }

    if (next.scheduleEnabled && (!next.waSession || !next.waTarget))
      throw new Error('Set the WhatsApp session and target before enabling the scheduler');
    if (next.scheduleEnabled && !next.schedules.some((x) => x.enabled)) throw new Error('Add at least one enabled schedule');

    this.db.setKV('dr.settings', JSON.stringify(next));
    return next;
  }

  // ---- connection
  private getConn(): Conn | null {
    const raw = this.db.getKV('dr.conn');
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c.email && c.username) c.email = c.username; // legacy field name
    return c as Conn;
  }

  connection() {
    const c = this.getConn();
    const me = this.db.getKV('dr.me');
    return {
      connected: !!c,
      email: c?.email ?? null,
      baseUrl: c?.baseUrl ?? this.getSettings().baseUrl,
      connectedAt: c?.connectedAt ?? null,
      rememberPassword: !!c?.passwordEnc,
      positionId: this.getSettings().positionId,
      me: me ? JSON.parse(me) : null,
    };
  }

  async connect(input: { email: string; password: string; remember: boolean; baseUrl?: string }) {
    if (input.baseUrl) this.saveSettings({ baseUrl: input.baseUrl });
    const baseUrl = this.getSettings().baseUrl;
    const token = await this.login(baseUrl, input.email, input.password);
    const me = await this.http(baseUrl, token, 'GET', '/me');

    const conn: Conn = {
      email: input.email,
      baseUrl,
      tokenEnc: this.box.encrypt(token),
      passwordEnc: input.remember ? this.box.encrypt(input.password) : undefined,
      connectedAt: Date.now(),
    };
    this.db.setKV('dr.conn', JSON.stringify(conn));
    this.db.setKV('dr.me', JSON.stringify(me));
    this.syncFromMe(me);
    return this.connection();
  }

  /**
   * Auto-fill settings from /me: employee_position_id always follows the connected account,
   * and the recheck body gets the default (with the id) if it was still empty.
   */
  private syncFromMe(me: unknown): string {
    const pid = positionFromMe(me);
    if (!pid) return '';
    const cur = this.getSettings();
    const patch: Partial<DRSettings> = {};
    if (cur.positionId !== pid) patch.positionId = pid;
    if (!cur.recheckBody.trim()) patch.recheckBody = DEFAULT_SETTINGS.recheckBody;
    if (Object.keys(patch).length) {
      try {
        this.saveSettings(patch);
      } catch {
        /* never fail connect/run because of settings validation */
      }
    }
    return pid;
  }

  disconnect() {
    this.db.deleteKV('dr.conn');
    this.db.deleteKV('dr.me');
  }

  // ---- http to dparagon
  private async login(baseUrl: string, email: string, password: string): Promise<string> {
    const res = await this.http(baseUrl, null, 'POST', '/login', { body: { email, password } });
    const token =
      findKey(res, 'access_token') ?? findKey(res, 'token') ?? findKey(res, 'plainTextToken') ?? findKey(res, 'bearer_token');
    if (typeof token !== 'string' || !token) throw new ApiFail('Login succeeded but no token was found in the response');
    return token;
  }

  private async http(
    baseUrl: string,
    token: string | null,
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown } = {}
  ): Promise<any> {
    // encodeURIComponent (spaces -> %20) exactly like the original n8n flow
    const qs = opts.query
      ? '?' + Object.entries(opts.query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      : '';
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}${qs}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      throw new ApiFail(`Network error calling ${path}: ${e?.cause?.code || e?.name || 'failed'}`);
    }
    const text = await res.text();
    let data: any = text;
    try { data = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
    if (!res.ok) {
      const msg = (typeof data === 'object' && data && (data.message || data.error)) || `HTTP ${res.status}`;
      throw new ApiFail(`${path}: ${msg}`, res.status, clip(data, 1500));
    }
    return data;
  }

  /** Authenticated call; on 401 re-logins once if the password was remembered. */
  private async call(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}) {
    const conn = this.getConn();
    if (!conn) throw new ApiFail('Not connected to dparagon. Open Daily Report → Connect first.');
    const token = this.box.decrypt(conn.tokenEnc);
    if (!token) throw new ApiFail('Stored token cannot be decrypted. Please reconnect.');
    try {
      return await this.http(conn.baseUrl, token, method, path, opts);
    } catch (e) {
      if (!(e instanceof ApiFail) || e.status !== 401) throw e;
      if (!conn.passwordEnc) throw new ApiFail('Paragon session expired. Reconnect (tip: enable "Remember password" to re-login automatically).', 401);
      const pw = this.box.decrypt(conn.passwordEnc);
      if (!pw) throw e;
      const fresh = await this.login(conn.baseUrl, conn.email, pw);
      this.db.setKV('dr.conn', JSON.stringify({ ...conn, tokenEnc: this.box.encrypt(fresh), connectedAt: Date.now() }));
      return this.http(conn.baseUrl, fresh, method, path, opts);
    }
  }

  // ---- pipeline
  isRunning() {
    return this.running;
  }

  /** Starts a run in the background and returns its id immediately. */
  start(mode: RunRow['mode'], dryRun: boolean): number {
    if (this.running) throw new Error('A run is already in progress');
    if (mode === 'bot') throw new Error('Bot mode is coming soon');
    const s = this.getSettings();
    const date = nowIn(s.timezone).date;
    const id = this.db.createRun({ date, mode, dryRun });
    this.running = true;
    void this.execute(id, mode, dryRun, s, date).finally(() => (this.running = false));
    return id;
  }

  private async execute(id: number, mode: RunRow['mode'], dryRun: boolean, s: DRSettings, date: string) {
    const steps: StepLog[] = [];
    let reportCode: string | null = null;
    let message: string | null = null;
    let sent = false;
    const persist = (extra: Parameters<AppDB['updateRun']>[1] = {}) => this.db.updateRun(id, { steps, reportCode: reportCode ?? undefined, message: message ?? undefined, ...extra });

    const step = async (key: string, name: string, fn: () => Promise<{ status?: StepLog['status']; detail?: string; output?: unknown } | void>) => {
      const t0 = Date.now();
      try {
        const r = (await fn()) || {};
        steps.push({ key, name, status: r.status || 'ok', detail: r.detail, output: r.output === undefined ? undefined : clip(r.output), ms: Date.now() - t0 });
      } catch (e: any) {
        steps.push({ key, name, status: e instanceof StopRun ? 'skipped' : 'error', detail: e.message, output: e instanceof ApiFail ? e.body : undefined, ms: Date.now() - t0 });
        persist();
        throw e;
      }
      persist();
    };
    const dry = (what: string) => ({ status: 'skipped' as const, detail: `Dry run — ${what} not executed` });

    try {
      let positionId = s.positionId;
      let onProgress: any[] = [];

      // Fail fast BEFORE anything that mutates data (steps 6/7). Dry runs only warn.
      await step('preflight', '0. Preflight (WhatsApp target)', async () => {
        try {
          this.requireWa(s);
        } catch (e: any) {
          if (dryRun) return { status: 'warn', detail: `${e.message} — a real run would stop here` };
          throw e;
        }
        return { detail: `${s.waSession} → ${s.waTarget}` };
      });

      await step('login', '1. Login', async () => {
        const c = this.getConn();
        if (!c) throw new ApiFail('Not connected. Open Daily Report → Connect first.');
        return { detail: `Using saved session for ${c.email}` };
      });

      await step('me', '2. Get profile (/me)', async () => {
        const me = await this.call('GET', '/me');
        this.db.setKV('dr.me', JSON.stringify(me));
        // /me is the source of truth; the Settings value is only a fallback if /me lacks it.
        positionId = this.syncFromMe(me) || positionId;
        if (!positionId) throw new ApiFail('employee_position_id not found in /me. Set it manually in Settings.');
        return { detail: `employee_position_id = ${positionId} (from /me)` };
      });

      await step('attendance', '3. Check attendance', async () => {
        const att = await this.call('GET', '/attendance/today');
        const fields = { in_time: findKey(att, 'in_time'), in_photo: findKey(att, 'in_photo'), in_latitude: findKey(att, 'in_latitude'), in_longitude: findKey(att, 'in_longitude') ?? findKey(att, 'in_logitude') };
        const missing = Object.entries(fields).filter(([, v]) => isEmpty(v)).map(([k]) => k);
        if (!missing.length) return { detail: `Checked in at ${fields.in_time}`, output: fields };
        if (mode === 'scheduler') throw new StopRun(`Not checked in yet (empty: ${missing.join(', ')}). Scheduler stops.`);
        return { status: 'warn', detail: `Attendance incomplete (empty: ${missing.join(', ')}) — continuing because run is manual`, output: fields };
      });

      await step('typing', '4. Send typing to WhatsApp', async () => {
        if (!s.sendTyping) return { status: 'skipped', detail: 'Disabled in settings' };
        if (dryRun) return dry('typing');
        this.requireWa(s);
        await this.wa.wacap.presence.update(s.waSession, s.waTarget, 'composing');
        return { detail: `composing → ${s.waTarget}` };
      });

      await step('onprogress', '5. Get on-progress tasks', async () => {
        const res = await this.call('GET', '/daily-reports/on-progress-task');
        onProgress = asArray(res?.payload ?? res).filter((t) => t && typeof t === 'object');
        const keys = onProgress[0] ? Object.keys(onProgress[0]) : [];
        return { detail: `${onProgress.length} task(s)${keys.length ? ` · fields: ${keys.join(', ')}` : ''}`, output: onProgress.length ? onProgress.slice(0, 3) : res };
      });

      await step('recheck', '6. Set today recheck', async () => {
        if (dryRun) return dry('set-today-recheck');
        const res = await this.call(s.recheckMethod, '/daily-reports/set-today-recheck', { body: this.body(s.recheckBody, date, positionId) });
        return { output: res };
      });

      await step('newtask', '7. Create task', async () => {
        const body = this.newTaskBody(s, date, positionId, onProgress);
        const n = onProgress.length;
        if (dryRun) return { status: 'skipped', detail: `Dry run — new-task not sent. Would POST ${n} task(s); body below.`, output: body };
        const res = await this.call(s.newTaskMethod, '/daily-reports/new-task', { body });
        return { detail: `${n} task(s) sent`, output: res };
      });

      await step('list', '8. Get daily report', async () => {
        const fetchList = async (from: string, to: string) => {
          const res = await this.call('GET', '/daily-reports/list', { query: { employee_position_id: positionId, dates: `${from} - ${to}` } });
          // n8n: const group = payload.group; code = Object.values(group)[0].daily_report_code
          const group = res?.payload?.group;
          const groups: any[] = group && typeof group === 'object' ? Object.values(group) : [];
          const item = groups[0];
          const code = String(item?.daily_report_code ?? findKey(res, 'daily_report_code') ?? '');
          return { res, item, code, count: groups.length };
        };

        const today = await fetchList(date, date);
        if (today.code) {
          reportCode = today.code;
          return { detail: `daily_report_code = ${reportCode}`, output: today.item ?? today.res };
        }

        if (dryRun) {
          // Step 7 (which creates today's report) was skipped, so today's report may not exist yet.
          // Preview with the most recent report from the last 14 days instead.
          const back = await fetchList(shiftDate(date, -14), date);
          if (back.code) {
            reportCode = back.code;
            return {
              status: 'warn',
              detail: `No report for ${date} yet (dry run skipped step 7, which creates it). Previewing latest report ${reportCode}.`,
              output: back.item ?? back.res,
            };
          }
          return {
            status: 'warn',
            detail: `No report for ${date} or the last 14 days (API returned ${today.count} item(s)). Steps 9–10 can't be previewed.`,
            output: today.res,
          };
        }
        throw new ApiFail(`No daily report found for ${date} (API returned ${today.count} item(s)). Response: ${clip(today.res, 300)}`);
      });

      await step('summary', '9. Get summary', async () => {
        if (!reportCode) return { status: 'skipped', detail: 'No report code to summarize (dry run)' };
        const res = await this.call('GET', '/daily-reports/summary-daily-report', { query: { code: reportCode! } });
        message = extractText(res);
        if (!message) {
          // Never push raw JSON to WhatsApp; show the response so the extractor can be fixed.
          if (dryRun) return { status: 'warn', detail: 'Could not find the summary text in the response', output: res };
          throw new ApiFail(`Could not find the summary text in the response: ${clip(res, 500)}`);
        }
        return { detail: `${message.length} chars`, output: { response: res, extractedMessage: message } };
      });

      await step('send', '10. Send WhatsApp', async () => {
        if (dryRun) return dry('WhatsApp send');
        this.requireWa(s);
        if (!message || !message.trim()) throw new ApiFail('Summary is empty — nothing to send');
        if (s.sendTyping && s.typingSeconds > 0) await sleep(s.typingSeconds * 1000);
        await this.wa.wacap.send.text(s.waSession, s.waTarget, message!);
        sent = true;
        return { detail: `Sent to ${s.waTarget}` };
      });

      persist({ status: 'success', sent, finishedAt: Date.now() });
    } catch (e: any) {
      if (e instanceof StopRun) persist({ status: 'skipped', error: e.message, finishedAt: Date.now() });
      else persist({ status: 'failed', error: e?.message || String(e), finishedAt: Date.now() });
    }
  }

  private requireWa(s: DRSettings) {
    if (!s.waSession || !s.waTarget) throw new ApiFail('WhatsApp session and target are not set in Settings');
    if (this.wa.wacap.sessions.info(s.waSession)?.status !== 'connected') throw new ApiFail(`WhatsApp session "${s.waSession}" is not connected`);
  }

  private body(tpl: string, date: string, positionId: string, tasks: unknown[] = []): unknown {
    if (!tpl.trim()) return undefined;
    const filled = tpl
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{employee_position_id\}\}/g, positionId)
      .replace(/\{\{tasks\}\}/g, JSON.stringify(tasks));
    return JSON.parse(filled);
  }

  /**
   * Body for /daily-reports/new-task — same as the n8n Code node:
   *   { daily_date, tasks: payload.map(t => ({ dates: `${start_date} - ${end_date}`, task_description })) }
   * using the tasks fetched in step 5. `daily_date` uses the configured timezone (n8n used UTC).
   * A custom body template in Settings may use {{date}}, {{employee_position_id}} and {{tasks}}.
   */
  private newTaskBody(s: DRSettings, date: string, positionId: string, onProgress: any[]): unknown {
    const tasks = onProgress.map((t) => ({ dates: `${t.start_date} - ${t.end_date}`, task_description: t.task_description }));
    return s.newTaskBody.trim() ? this.body(s.newTaskBody, date, positionId, tasks) : { daily_date: date, tasks };
  }

  // ---- scheduler
  startScheduler() {
    this.db.failStaleRuns();
    this.timer = setInterval(() => this.tick(), 20_000);
    this.timer.unref();
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
  }

  nextScheduled(): string | null {
    const s = this.getSettings();
    const active = s.schedules.filter((x) => x.enabled);
    if (!s.scheduleEnabled || !active.length) return null;
    return active.map((x) => `${fmtDays(x.days)} ${x.time}`).join(' · ') + ` (${s.timezone})`;
  }

  private tick() {
    const s = this.getSettings();
    if (!s.scheduleEnabled || this.running || !this.getConn()) return;
    const now = nowIn(s.timezone);
    const alreadySent = !s.schedulerTestMode && !s.schedulerForce && this.db.hasSentRun(now.date); // already delivered today

    type Fired = { date: string; at: number; runId: number; time?: string };
    const fired: Record<string, Fired> = JSON.parse(this.db.getKV('dr.lastScheduled') || '{}');
    const nowMs = Date.now();
    if (alreadySent) {
      // Leave a visible trace (once per schedule per day) instead of silently doing nothing.
      const idle = s.schedules.find((x) => {
        const late = minutes(now.hm) - minutes(x.time);
        return x.enabled && x.days.includes(now.dow) && late >= 0 && late <= RETRY_WINDOW_MIN && !this.firedToday(fired[x.id], x.time, now.date);
      });
      if (!idle) return;
      const runId = this.db.createRun({ date: now.date, mode: 'scheduler', dryRun: false });
      this.db.updateRun(runId, { status: 'skipped', error: `Schedule ${idle.time} reached, but today's report was already sent — nothing to do.`, finishedAt: Date.now() });
      fired[idle.id] = { date: now.date, at: nowMs, runId, time: idle.time };
      this.db.setKV('dr.lastScheduled', JSON.stringify(fired));
      return;
    }
    const due = s.schedules.find((x) => {
      if (!x.enabled || !x.days.includes(now.dow)) return false;
      const late = minutes(now.hm) - minutes(x.time);
      if (late < 0 || late > RETRY_WINDOW_MIN) return false;
      const f = fired[x.id];
      if (!this.firedToday(f, x.time, now.date)) return true; // not attempted yet today (or the time was edited)
      if (nowMs - f.at < RETRY_EVERY_MS) return false;
      return this.canRetry(f.runId);
    });
    if (!due) return;

    // Remember the attempt (prune other days' entries).
    const next: Record<string, Fired> = {};
    for (const [k, v] of Object.entries(fired)) if (v.date === now.date) next[k] = v;
    try {
      const runId = this.start('scheduler', s.schedulerTestMode);
      next[due.id] = { date: now.date, at: nowMs, runId, time: due.time };
      this.db.setKV('dr.lastScheduled', JSON.stringify(next));
    } catch {
      /* already running */
    }
  }

  /** True if this schedule (at this exact time) was already attempted today. Editing the time re-arms it. */
  private firedToday(f: { date: string; time?: string } | undefined, time: string, date: string) {
    return !!f && f.date === date && f.time === time;
  }

  /** A finished scheduler run may be retried if it stopped early (not checked in) or failed before changing any data. */
  private canRetry(runId: number): boolean {
    const r = this.db.getRun(runId);
    if (!r || r.status === 'running') return false;
    if (r.status === 'skipped') return true;
    if (r.status === 'failed') return !(r.steps || []).some((st) => (st.key === 'recheck' || st.key === 'newtask') && st.status !== 'skipped');
    return false;
  }
}
