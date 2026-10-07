import Database from 'better-sqlite3';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  created_at: number;
}

export interface TokenRow {
  id: number;
  user_id: number;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
}

export interface StoredMessage {
  cursor?: number;
  id: string;
  sessionId: string;
  direction: 'in' | 'out';
  peer?: string | null;
  body?: string | null;
  type?: string | null;
  timestamp: number;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret: string | null;
  events: string;
  enabled: number;
  last_status: string | null;
  last_at: number | null;
  created_at: number;
}

export interface StepLog {
  key: string;
  name: string;
  status: 'ok' | 'skipped' | 'warn' | 'error';
  detail?: string;
  output?: string;
  ms: number;
}

export interface RunRow {
  id: number;
  date: string;
  mode: 'manual' | 'scheduler' | 'bot';
  dryRun: boolean;
  status: 'running' | 'success' | 'skipped' | 'failed';
  sent: boolean;
  reportCode: string | null;
  message: string | null;
  error: string | null;
  steps: StepLog[];
  startedAt: number;
  finishedAt: number | null;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export class AppDB {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS messages (
        rowid_ INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        peer TEXT,
        body TEXT,
        type TEXT,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_ts ON messages(session_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp DESC);
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT,
        events TEXT NOT NULL DEFAULT '*',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_status TEXT,
        last_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dr_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        mode TEXT NOT NULL,
        dry_run INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0,
        report_code TEXT,
        message TEXT,
        error TEXT,
        steps TEXT NOT NULL DEFAULT '[]',
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_dr_runs_date ON dr_runs(date);
    `);
    this.db.pragma('foreign_keys = ON');
  }

  // ---- users ----
  countUsers(): number {
    return (this.db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c;
  }

  createUser(username: string, password: string, role: 'admin' | 'user' = 'admin'): User {
    const info = this.db
      .prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
      .run(username, hashPassword(password), role, Date.now());
    return this.getUserById(Number(info.lastInsertRowid))!;
  }

  getUserById(id: number): User | undefined {
    return this.db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id) as User | undefined;
  }

  getUserByName(username: string): User | undefined {
    return this.db
      .prepare('SELECT id, username, role, created_at FROM users WHERE username = ?')
      .get(username) as User | undefined;
  }

  listUsers(): User[] {
    return this.db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all() as User[];
  }

  setPassword(username: string, password: string): boolean {
    return this.db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashPassword(password), username).changes > 0;
  }

  deleteUser(username: string): boolean {
    return this.db.prepare('DELETE FROM users WHERE username = ?').run(username).changes > 0;
  }

  verifyLogin(username: string, password: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | (User & { password_hash: string })
      | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) return null;
    return { id: row.id, username: row.username, role: row.role, created_at: row.created_at };
  }

  // ---- tokens ----
  /** Returns the plaintext token ONCE; only its hash is stored. */
  createToken(userId: number, name: string): { token: string; row: TokenRow } {
    const token = `dr_${randomBytes(24).toString('hex')}`;
    const info = this.db
      .prepare('INSERT INTO tokens (user_id, name, prefix, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, name, token.slice(0, 8), sha256(token), Date.now());
    const row = this.db
      .prepare('SELECT id, user_id, name, prefix, created_at, last_used_at FROM tokens WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as TokenRow;
    return { token, row };
  }

  authenticate(token: string): User | null {
    const row = this.db.prepare('SELECT id, user_id FROM tokens WHERE token_hash = ?').get(sha256(token)) as
      | { id: number; user_id: number }
      | undefined;
    if (!row) return null;
    this.db.prepare('UPDATE tokens SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
    return this.getUserById(row.user_id) || null;
  }

  listTokens(userId?: number): (TokenRow & { username: string })[] {
    const sql = `SELECT t.id, t.user_id, t.name, t.prefix, t.created_at, t.last_used_at, u.username
                 FROM tokens t JOIN users u ON u.id = t.user_id
                 ${userId ? 'WHERE t.user_id = ?' : ''} ORDER BY t.id`;
    const stmt = this.db.prepare(sql);
    return (userId ? stmt.all(userId) : stmt.all()) as (TokenRow & { username: string })[];
  }

  revokeToken(id: number): boolean {
    return this.db.prepare('DELETE FROM tokens WHERE id = ?').run(id).changes > 0;
  }

  // ---- messages ----
  insertMessage(m: StoredMessage) {
    this.db
      .prepare('INSERT INTO messages (id, session_id, direction, peer, body, type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(m.id, m.sessionId, m.direction, m.peer ?? null, m.body ?? null, m.type ?? null, m.timestamp);
  }

  listMessages(opts: { sessionId?: string; peer?: string; q?: string; limit?: number; before?: number } = {}): StoredMessage[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.sessionId) (where.push('session_id = ?'), args.push(opts.sessionId));
    if (opts.peer) (where.push('peer = ?'), args.push(opts.peer));
    if (opts.q) (where.push("body LIKE ? ESCAPE '\\'"), args.push(`%${opts.q.replace(/[\\%_]/g, '\\$&')}%`));
    if (opts.before) (where.push('rowid_ < ?'), args.push(opts.before));
    const limit = Math.min(Math.max(opts.limit || 100, 1), 500);
    const rows = this.db
      .prepare(
        `SELECT rowid_ AS cursor, id, session_id AS sessionId, direction, peer, body, type, timestamp
         FROM messages ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY rowid_ DESC LIMIT ?`
      )
      .all(...args, limit);
    return rows as StoredMessage[];
  }

  messageStats(): { total: number; today: number } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const total = (this.db.prepare('SELECT COUNT(*) c FROM messages').get() as { c: number }).c;
    const today = (this.db.prepare('SELECT COUNT(*) c FROM messages WHERE timestamp >= ?').get(start.getTime()) as { c: number }).c;
    return { total, today };
  }

  pruneMessages(olderThanMs: number) {
    this.db.prepare('DELETE FROM messages WHERE timestamp < ?').run(Date.now() - olderThanMs);
  }

  // ---- webhooks ----
  createWebhook(w: { name: string; url: string; secret?: string; events?: string }): Webhook {
    const info = this.db
      .prepare('INSERT INTO webhooks (name, url, secret, events, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(w.name, w.url, w.secret || null, w.events || '*', Date.now());
    return this.getWebhook(Number(info.lastInsertRowid))!;
  }

  getWebhook(id: number): Webhook | undefined {
    return this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Webhook | undefined;
  }

  listWebhooks(onlyEnabled = false): Webhook[] {
    return this.db.prepare(`SELECT * FROM webhooks ${onlyEnabled ? 'WHERE enabled = 1' : ''} ORDER BY id`).all() as Webhook[];
  }

  setWebhookEnabled(id: number, enabled: boolean): boolean {
    return this.db.prepare('UPDATE webhooks SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id).changes > 0;
  }

  setWebhookResult(id: number, status: string) {
    this.db.prepare('UPDATE webhooks SET last_status = ?, last_at = ? WHERE id = ?').run(status, Date.now(), id);
  }

  deleteWebhook(id: number): boolean {
    return this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id).changes > 0;
  }

  // ---- key/value ----
  getKV(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return r ? r.value : null;
  }

  setKV(key: string, value: string) {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  deleteKV(key: string) {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  }

  // ---- daily report runs ----
  createRun(r: { date: string; mode: string; dryRun: boolean }): number {
    const info = this.db
      .prepare("INSERT INTO dr_runs (date, mode, dry_run, status, started_at) VALUES (?, ?, ?, 'running', ?)")
      .run(r.date, r.mode, r.dryRun ? 1 : 0, Date.now());
    return Number(info.lastInsertRowid);
  }

  updateRun(id: number, r: Partial<Omit<RunRow, 'id' | 'startedAt'>>) {
    const map: Record<string, string> = {
      status: 'status', sent: 'sent', reportCode: 'report_code', message: 'message', error: 'error', steps: 'steps', finishedAt: 'finished_at',
    };
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      if ((r as any)[k] === undefined) continue;
      sets.push(`${col} = ?`);
      const v = (r as any)[k];
      args.push(k === 'steps' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    if (sets.length) this.db.prepare(`UPDATE dr_runs SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
  }

  private mapRun(r: any): RunRow {
    return {
      id: r.id, date: r.date, mode: r.mode, dryRun: !!r.dry_run, status: r.status, sent: !!r.sent,
      reportCode: r.report_code, message: r.message, error: r.error, steps: JSON.parse(r.steps || '[]'),
      startedAt: r.started_at, finishedAt: r.finished_at,
    };
  }

  getRun(id: number): RunRow | undefined {
    const r = this.db.prepare('SELECT * FROM dr_runs WHERE id = ?').get(id);
    return r ? this.mapRun(r) : undefined;
  }

  listRuns(limit = 50): RunRow[] {
    return this.db.prepare('SELECT * FROM dr_runs ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 200)).map((r) => this.mapRun(r));
  }

  hasSentRun(date: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM dr_runs WHERE date = ? AND sent = 1 AND dry_run = 0 LIMIT 1').get(date);
  }

  /** Runs left in "running" by a crash/restart can never finish; mark them failed. */
  failStaleRuns() {
    this.db.prepare("UPDATE dr_runs SET status = 'failed', error = 'Interrupted (server restarted)', finished_at = ? WHERE status = 'running'").run(Date.now());
  }

  close() {
    this.db.close();
  }
}
