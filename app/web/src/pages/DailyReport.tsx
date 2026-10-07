import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  FiAlertCircle, FiCheckCircle, FiChevronRight, FiClock, FiCpu, FiLink2, FiLoader, FiMinusCircle, FiPlay, FiSave,
  FiSettings, FiPlus, FiTrash2, FiUser, FiX, FiXCircle, FiZap, FiEye, FiFileText,
} from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SessionInfo } from '../api';
import { Alert, Empty, fmtTime, PageHeader } from '../ui';

// ---------------------------------------------------------------- types

interface Connection {
  connected: boolean;
  email: string | null;
  baseUrl: string;
  connectedAt: number | null;
  rememberPassword: boolean;
  positionId: string;
  me: any;
}

interface Settings {
  baseUrl: string;
  timezone: string;
  positionId: string;
  waSession: string;
  waTarget: string;
  sendTyping: boolean;
  typingSeconds: number;
  recheckMethod: 'POST' | 'PUT' | 'GET';
  recheckBody: string;
  newTaskMethod: 'POST' | 'PUT' | 'GET';
  newTaskBody: string;
  scheduleEnabled: boolean;
  schedulerTestMode: boolean;
  schedulerForce: boolean;
  schedules: Schedule[];
}

interface Schedule {
  id: string;
  time: string;
  days: number[];
  enabled: boolean;
}

interface Step {
  key: string;
  name: string;
  status: 'ok' | 'skipped' | 'warn' | 'error';
  detail?: string;
  output?: string;
  ms: number;
}

interface Run {
  id: number;
  date: string;
  mode: 'manual' | 'scheduler' | 'bot';
  dryRun: boolean;
  status: 'running' | 'success' | 'skipped' | 'failed';
  sent: boolean;
  reportCode: string | null;
  message: string | null;
  error: string | null;
  steps?: Step[];
  startedAt: number;
  finishedAt: number | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const runBadge: Record<Run['status'], string> = {
  running: 'bg-amber-50 text-amber-700 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  skipped: 'bg-slate-100 text-slate-600 ring-slate-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

const Badge = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{children}</span>
);

const Step = ({ n, title, desc }: { n: number; title: string; desc: string }) => (
  <div className="flex items-center gap-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">{n}</span>
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-slate-500">{desc}</p>
    </div>
  </div>
);

// ---------------------------------------------------------------- connect modal

function ConnectModal({ baseUrl, onClose, onDone }: { baseUrl: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [url, setUrl] = useState(baseUrl);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('POST', '/api/dr/connect', { email, password, remember, baseUrl: url });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Connect to Paragon</h3>
            <p className="text-sm text-slate-500">Sign in with your dparagon account.</p>
          </div>
          <button type="button" className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required autoComplete="email" />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" className="mt-1" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            Remember password for automatic re-login (needed for the scheduler when the token expires).
            <span className="block text-xs text-slate-400">Stored encrypted (AES-256-GCM) in the local database; the key is a separate file in the data folder.</span>
          </span>
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Advanced</summary>
          <input className="input mt-2 font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Base URL" />
        </details>
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? 'Connecting…' : 'Connect'}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- steps / run detail

function StepIcon({ s }: { s: Step['status'] }) {
  if (s === 'ok') return <FiCheckCircle className="text-emerald-500" />;
  if (s === 'warn') return <FiAlertCircle className="text-amber-500" />;
  if (s === 'error') return <FiXCircle className="text-red-500" />;
  return <FiMinusCircle className="text-slate-400" />;
}

function StepList({ run }: { run: Run }) {
  const steps = run.steps || [];
  return (
    <div className="space-y-3">
      <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {steps.map((s) => (
          <li key={s.key} className="px-4 py-2.5 text-sm">
            <div className="flex items-center gap-3">
              <StepIcon s={s.status} />
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="text-xs text-slate-400">{s.ms} ms</span>
            </div>
            {s.detail && <p className="ml-7 mt-0.5 text-xs text-slate-500">{s.detail}</p>}
            {s.output && (
              <details className="ml-7 mt-1">
                <summary className="cursor-pointer text-xs text-slate-400">output</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">{s.output}</pre>
              </details>
            )}
          </li>
        ))}
        {run.status === 'running' && (
          <li className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-600"><FiLoader className="animate-spin" /> Running…</li>
        )}
      </ol>
      {run.error && <Alert kind={run.status === 'skipped' ? 'success' : 'error'}>{run.error}</Alert>}
      {run.message && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-slate-600">Message {run.sent ? '(sent)' : '(preview — not sent)'}</h4>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm">{run.message}</pre>
        </div>
      )}
    </div>
  );
}

function RunModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    api<Run>('GET', `/api/dr/runs/${id}`).then(setRun).catch(() => {});
  }, [id]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Run #{id}{run?.dryRun ? ' · dry run' : ''}</h3>
          <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>
        {run ? <StepList run={run} /> : <p className="text-sm text-slate-400">Loading…</p>}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- settings

interface GroupOpt {
  id: string;
  subject: string;
  size: number;
}

function SettingsForm({ onSaved }: { onSaved: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [groupsErr, setGroupsErr] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    api('GET', '/api/dr/settings').then((r) => setS(r.settings));
    api<SessionInfo[]>('GET', '/api/sessions').then(setSessions).catch(() => {});
  }, []);

  // Load the WhatsApp groups of the chosen session so the target can be picked, not typed.
  const sessionId = s?.waSession;
  const sessionReady = sessions.find((x) => x.sessionId === sessionId)?.status === 'connected';
  useEffect(() => {
    setGroups([]);
    setGroupsErr('');
    if (!sessionId || !sessionReady) return;
    api<GroupOpt[]>('GET', `/api/sessions/${encodeURIComponent(sessionId)}/groups`)
      .then(setGroups)
      .catch((e) => setGroupsErr(e.message));
  }, [sessionId, sessionReady]);

  if (!s) return <p className="text-sm text-slate-400">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api('PUT', '/api/dr/settings', s);
      setS(r.settings);
      setMsg({ kind: 'success', text: 'Settings saved' });
      onSaved();
    } catch (err: any) {
      setMsg({ kind: 'error', text: err.message });
    }
  };

  const label = 'block text-sm font-medium';
  const SecTitle = ({ n, title, desc }: { n: number; title: string; desc: string }) => (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
      <div><h3 className="font-semibold">{title}</h3><p className="text-xs text-slate-500">{desc}</p></div>
    </div>
  );
  return (
    <form onSubmit={save} className="space-y-6">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <section className="card space-y-4 p-5">
        <SecTitle n={1} title="WhatsApp" desc="Session mana yang dipakai dan ke siapa laporan dikirim." />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Session
            <select className="input mt-1" value={s.waSession} onChange={(e) => set('waSession', e.target.value)}>
              <option value="">— choose —</option>
              {sessions.map((x) => <option key={x.sessionId} value={x.sessionId}>{x.sessionId} ({x.status})</option>)}
            </select>
          </label>
          <label className={label}>Send to (number or group id)<span className="hint">Isi nomor (08…) atau pilih grup di bawah.</span>
            <input className="input mt-1" value={s.waTarget} onChange={(e) => set('waTarget', e.target.value)} placeholder="08123456789 / 1203…@g.us" />
          </label>
        </div>
        <label className={label}>Or pick a group
          <select
            className="input mt-1"
            value={groups.some((g) => g.id === s.waTarget) ? s.waTarget : ''}
            onChange={(e) => e.target.value && set('waTarget', e.target.value)}
            disabled={!groups.length}
          >
            <option value="">
              {!s.waSession ? 'Choose a session first' : !sessionReady ? 'Session is not connected' : groupsErr ? groupsErr : groups.length ? '— select group —' : 'Loading groups…'}
            </option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.subject} ({g.size})</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.sendTyping} onChange={(e) => set('sendTyping', e.target.checked)} /> Show "typing…" before sending</label>
          <label className="flex items-center gap-2">for
            <input className="input !w-20" type="number" min={0} max={30} value={s.typingSeconds} onChange={(e) => set('typingSeconds', Number(e.target.value))} /> seconds
          </label>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <SecTitle n={2} title="Scheduler" desc="Jadwal otomatis. Kosongkan kalau hanya mau jalan manual." />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.scheduleEnabled} onChange={(e) => set('scheduleEnabled', e.target.checked)} /> Run automatically</label>
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={s.schedulerTestMode} onChange={(e) => set('schedulerTestMode', e.target.checked)} />
          <span>
            <b>Test mode</b> — jadwal tetap jalan sesuai jam, tapi hanya sebagai <b>dry run</b> (tidak mengirim WhatsApp) dan tidak peduli laporan hari ini sudah terkirim.
            <span className="hint">Pakai untuk mengetes: set jam 2–3 menit ke depan, aktifkan Run automatically + Test mode, Save, lalu lihat tab Recap. Matikan lagi setelah selesai.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={s.schedulerForce && !s.schedulerTestMode} disabled={s.schedulerTestMode} onChange={(e) => set('schedulerForce', e.target.checked)} />
          <span>
            <b>Force send</b> — jadwal tetap <b>mengirim ke WhatsApp</b> walau laporan hari ini sudah pernah terkirim.
            <span className="hint">Berlaku sekali per jadwal per hari. Test mode harus mati. Matikan lagi setelah selesai supaya tidak kirim ganda.</span>
          </span>
        </label>
        <label className={`${label} max-w-xs`}>Timezone
          <input className="input mt-1" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </label>

        <div className="space-y-3">
          {s.schedules.map((sc, idx) => {
            const patch = (p: Partial<Schedule>) => set('schedules', s.schedules.map((x, i) => (i === idx ? { ...x, ...p } : x)));
            return (
              <div key={sc.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${sc.enabled ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                <input className="input !w-32" type="time" value={sc.time} onChange={(e) => patch({ time: e.target.value })} required />
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = sc.days.includes(i);
                    return (
                      <button type="button" key={d} onClick={() => patch({ days: on ? sc.days.filter((x) => x !== i) : [...sc.days, i] })}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>{d}</button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={sc.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /> on</label>
                <button type="button" className="btn btn-danger !px-2.5" title="Remove schedule" onClick={() => set('schedules', s.schedules.filter((_, i) => i !== idx))}><FiTrash2 /></button>
              </div>
            );
          })}
          {s.schedules.length === 0 && <p className="text-sm text-slate-400">No schedules yet.</p>}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={s.schedules.length >= 10}
            onClick={() => set('schedules', [...s.schedules, { id: `n${Date.now().toString(36)}`, time: '12:00', days: s.schedules.some((x) => x.days.includes(6)) ? [1, 2, 3, 4, 5] : [6], enabled: true }])}
          >
            <FiPlus /> Add schedule
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Each schedule has its own time and days (e.g. Mon–Fri 17:00 and Sat 12:00). At its time a schedule runs; if you haven't checked in yet it retries every 10 minutes for up to 2 hours. Nothing runs once today's report has been sent.
        </p>
      </section>

      <details className="card p-5">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><FiSettings /> Advanced (API) <span className="text-xs font-normal text-slate-400">· opsional, biasanya tidak perlu diubah</span></summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>Base URL<input className="input mt-1 font-mono text-xs" value={s.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} /></label>
            <label className={label}>employee_position_id <span className="font-normal text-slate-400">(auto-filled from /me on connect)</span><input className="input mt-1" value={s.positionId} onChange={(e) => set('positionId', e.target.value)} /></label>
          </div>
          {([['recheck', 'Step 6 · set-today-recheck'], ['newTask', 'Step 7 · new-task']] as const).map(([k, title]) => (
            <div key={k} className="space-y-2">
              <h4 className="text-sm font-semibold">{title}</h4>
              <div className="flex gap-3">
                <select className="input !w-28" value={s[`${k}Method` as const]} onChange={(e) => set(`${k}Method` as const, e.target.value as any)}>
                  {['POST', 'PUT', 'GET'].map((m) => <option key={m}>{m}</option>)}
                </select>
                <textarea className="input min-h-16 font-mono text-xs" placeholder='Leave empty for the default: {"daily_date", "tasks"} built from on-progress tasks. Variables: {{date}}, {{employee_position_id}}, {{tasks}}' value={s[`${k}Body` as const]} onChange={(e) => set(`${k}Body` as const, e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <span className="text-xs text-slate-500">Perubahan baru berlaku setelah disimpan.</span>
        <button className="btn btn-primary"><FiSave /> Save settings</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- page

type Mode = 'manual' | 'scheduler';

export default function DailyReport() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [runs, setRuns] = useState<Omit<Run, 'steps'>[]>([]);
  const params = useParams();
  const navigate = useNavigate();
  const tab = (['run', 'recap', 'settings'].includes(params.tab || '') ? params.tab : 'run') as 'run' | 'recap' | 'settings';
  const [mode, setMode] = useState<Mode>('manual');
  const [schedule, setSchedule] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [forceMode, setForceMode] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [active, setActive] = useState<Run | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [today, setToday] = useState('');
  const poll = useRef<number | undefined>(undefined);

  const loadRuns = useCallback(() => {
    api('GET', '/api/dr/runs').then((r) => setRuns(r.runs)).catch(() => {});
  }, []);
  const loadConn = useCallback(() => {
    api<Connection>('GET', '/api/dr/connection').then(setConn).catch((e) => setError(e.message));
    api('GET', '/api/dr/settings').then((r) => (setSchedule(r.schedule), setTestMode(!!r.settings.schedulerTestMode), setForceMode(!!r.settings.schedulerForce), setToday(r.today), setMode(r.settings.scheduleEnabled ? 'scheduler' : 'manual'))).catch(() => {});
  }, []);

  useEffect(() => {
    loadConn();
    loadRuns();
    const t = window.setInterval(loadRuns, 15000); // pick up scheduler runs
    return () => (window.clearInterval(poll.current), window.clearInterval(t));
  }, [loadConn, loadRuns]);

  const watch = (id: number) => {
    window.clearInterval(poll.current);
    const tick = async () => {
      const r = await api<Run>('GET', `/api/dr/runs/${id}`).catch(() => null);
      if (!r) return;
      setActive(r);
      if (r.status !== 'running') {
        window.clearInterval(poll.current);
        loadRuns();
      }
    };
    tick();
    poll.current = window.setInterval(tick, 1000);
  };

  const run = async (dryRun: boolean, mode: 'manual' | 'scheduler' = 'manual') => {
    setError('');
    const alreadySent = runs.some((r) => r.date === today && r.sent && !r.dryRun);
    if (!dryRun && alreadySent && !window.confirm('A report was already sent today. Send again?')) return;
    if (!dryRun && !window.confirm('This will call set-today-recheck, create the task, and send the WhatsApp message. Continue?')) return;
    try {
      const r = await api<{ id: number }>('POST', '/api/dr/run', { mode, dryRun });
      watch(r.id);
      loadRuns();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleScheduler = async (on: boolean) => {
    setError('');
    try {
      await api('PUT', '/api/dr/settings', { scheduleEnabled: on });
      loadConn();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect and delete the stored token/password?')) return;
    await api('POST', '/api/dr/disconnect');
    loadConn();
  };

  const meName = conn?.me && (conn.me.data?.name ?? conn.me.name ?? conn.me.data?.employee?.name ?? null);
  const running = active?.status === 'running';

  return (
    <>
      <PageHeader icon={FiFileText} title="Daily Report" subtitle="Check attendance → build today's report → send to WhatsApp" />
      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}

      {/* connection */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${conn?.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><FiUser size={20} /></span>
          <div>
            <div className="font-semibold">{conn?.connected ? `Connected as ${meName || conn.email}` : 'Not connected'}</div>
            <div className="text-xs text-slate-500">
              {conn?.connected ? `${conn.email}${conn.positionId ? ` · position #${conn.positionId}` : ''} · ${conn.baseUrl} · since ${fmtTime(conn.connectedAt)}${conn.rememberPassword ? ' · auto re-login on' : ''}` : 'Connect your Paragon account to start.'}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => setShowConnect(true)}><FiLink2 /> {conn?.connected ? 'Reconnect' : 'Connect'}</button>
          {conn?.connected && <button className="btn btn-ghost" onClick={disconnect}>Disconnect</button>}
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {([
          ['run', 'Run', FiPlay, 'Jalankan laporan'],
          ['recap', 'Recap', FiClock, 'Riwayat'],
          ['settings', 'Settings', FiSettings, 'Pengaturan'],
        ] as const).map(([t, name, Icon, sub]) => (
          <button key={t} onClick={() => navigate(`/daily-report/${t}`)} className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon size={16} /> {name} <span className="hidden text-xs font-normal text-slate-400 sm:inline">· {sub}</span>
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <SettingsForm onSaved={loadConn} />
      ) : tab === 'recap' ? (
        <div className="card overflow-hidden">
            <div className="card-header"><div><h2 className="text-sm font-semibold">Run history</h2><p className="text-xs text-slate-500">Klik baris untuk melihat detail tiap langkah.</p></div><span className="chip">{runs.length} runs</span></div>
            {runs.length === 0 ? (
              <Empty icon={<FiClock />} text="No runs yet" hint="Jalankan laporan dari tab Run — hasilnya tercatat di sini." action={<button className="btn btn-primary" onClick={() => navigate('/daily-report/run')}>Go to Run</button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-5 py-3">Date</th><th className="px-5 py-3">Mode</th><th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Sent</th><th className="hidden px-5 py-3 md:table-cell">Report</th><th className="hidden px-5 py-3 sm:table-cell">Started</th><th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((r) => (
                      <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailId(r.id)}>
                        <td className="px-5 py-3 font-medium">{r.date}</td>
                        <td className="px-5 py-3 capitalize">{r.mode}{r.dryRun && <span className="ml-1 text-xs text-slate-400">(dry)</span>}</td>
                        <td className="px-5 py-3"><Badge cls={runBadge[r.status]}>{r.status}</Badge></td>
                        <td className="px-5 py-3">{r.sent ? <span className="text-emerald-600">✓ sent</span> : <span className="text-slate-400">—</span>}</td>
                        <td className="hidden px-5 py-3 font-mono text-xs text-slate-500 md:table-cell">{r.reportCode || '-'}</td>
                        <td className="hidden px-5 py-3 text-slate-500 sm:table-cell">{fmtTime(r.startedAt)}</td>
                        <td className="px-5 py-3 text-slate-300"><FiChevronRight /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      ) : (
        <div className="space-y-6">
          <Step n={1} title="Pilih mode" desc="Manual = jalankan sekarang. Scheduler = jalan otomatis sesuai jadwal." />
          <div className="grid gap-4 md:grid-cols-3">
            <button onClick={() => setMode('manual')} className={`card p-5 text-left transition ${mode === 'manual' ? 'ring-2 ring-emerald-500' : 'hover:shadow-md'}`}>
              <FiPlay className="mb-2 text-emerald-600" size={20} />
              <div className="font-semibold">Manual</div>
              <p className="text-sm text-slate-500">Run now. Continues even if attendance is empty.</p>
            </button>
            <button onClick={() => setMode('scheduler')} className={`card p-5 text-left transition ${mode === 'scheduler' ? 'ring-2 ring-emerald-500' : 'hover:shadow-md'}`}>
              <FiClock className="mb-2 text-sky-600" size={20} />
              <div className="flex items-center gap-2 font-semibold">Scheduler {schedule && <Badge cls="bg-emerald-50 text-emerald-700 ring-emerald-200">on</Badge>}</div>
              <p className="text-sm text-slate-500">{schedule ? schedule : 'Runs automatically. Stops if not checked in.'}</p>
            </button>
            <div className="card cursor-not-allowed p-5 opacity-60">
              <FiCpu className="mb-2 text-violet-600" size={20} />
              <div className="flex items-center gap-2 font-semibold">Bot <Badge cls="bg-violet-50 text-violet-700 ring-violet-200">coming soon</Badge></div>
              <p className="text-sm text-slate-500">Trigger from a WhatsApp command.</p>
            </div>
          </div>

          <Step n={2} title={mode === 'manual' ? 'Jalankan' : 'Atur scheduler'} desc={mode === 'manual' ? 'Coba dulu dengan Dry run, lalu Run now kalau hasilnya sudah sesuai.' : 'Aktifkan lalu atur jam & hari di tab Settings.'} />
          <div className="card space-y-4 p-5">
            {mode === 'manual' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="font-semibold">Dry run <span className="text-xs font-normal text-slate-400">(safe test)</span></div>
                    <p className="mb-3 mt-1 text-xs text-slate-500">Only reads data and previews the message. Does not send typing, set recheck, create the task, or send WhatsApp.</p>
                    <button className="btn btn-ghost w-full" disabled={!conn?.connected || running} onClick={() => run(true)}>
                      <FiEye /> {running ? 'Running…' : 'Run dry run'}
                    </button>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                    <div className="font-semibold">Run for real</div>
                    <p className="mb-3 mt-1 text-xs text-slate-500">Executes every step: typing, set recheck, create task, and sends the report to WhatsApp.</p>
                    <button className="btn btn-primary w-full" disabled={!conn?.connected || running} onClick={() => run(false)}>
                      <FiZap /> {running ? 'Running…' : 'Run now'}
                    </button>
                  </div>
                </div>
                {!conn?.connected && <p className="text-xs text-slate-400">Connect first.</p>}
              </>
            ) : (
              <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">{schedule ? `Scheduler is ON · ${schedule}` : 'Scheduler is OFF.'}{forceMode && !testMode && <span className="ml-2 chip !bg-red-100 !text-red-700">force send</span>}{testMode && <span className="ml-2 chip !bg-amber-100 !text-amber-700">test mode · dry run</span>} Edit times and days in the <button type="button" className="font-medium text-emerald-600 hover:underline" onClick={() => navigate('/daily-report/settings')}>Settings tab</button>.</p>
                <button className={`btn ${schedule ? 'btn-ghost' : 'btn-primary'}`} disabled={!conn?.connected} onClick={() => toggleScheduler(!schedule)}>
                  {schedule ? 'Turn off' : 'Turn on'}
                </button>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <div className="font-semibold">Force run <span className="text-xs font-normal text-slate-400">(jalankan scheduler sekarang, tanpa menunggu jam)</span></div>
                <p className="mb-3 mt-1 text-xs text-slate-500">Memakai alur scheduler (berhenti kalau belum check-in) dan mengabaikan jadwal serta status "sudah terkirim hari ini". Hasilnya tercatat di Recap.</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost" disabled={!conn?.connected || running} onClick={() => run(true, 'scheduler')}><FiEye /> Force dry run</button>
                  <button className="btn btn-primary" disabled={!conn?.connected || running} onClick={() => run(false, 'scheduler')}><FiZap /> Force run (real)</button>
                </div>
              </div>
              </>
            )}
          </div>

          {active && (
            <div className="card p-5">
              <h3 className="mb-3 font-semibold">Hasil · Run #{active.id}{active.dryRun ? ' · dry run' : ''}</h3>
              <StepList run={active} />
            </div>
          )}

        </div>
      )}

      {showConnect && <ConnectModal baseUrl={conn?.baseUrl || ''} onClose={() => setShowConnect(false)} onDone={() => { setShowConnect(false); loadConn(); }} />}
      {detailId !== null && <RunModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
