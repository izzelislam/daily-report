import { EventEmitter } from 'events';
import { WacapWrapper, WacapEventType } from '../../src';
import type { AppConfig } from './config';
import type { AppDB, StoredMessage } from './db';
import { WebhookDispatcher } from './webhooks';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // keep 30 days of messages

/**
 * Service around WacapWrapper: QR cache, message persistence (SQLite),
 * webhook dispatch and SSE re-broadcast.
 */
export class WacapService {
  readonly wacap: WacapWrapper;
  readonly bus = new EventEmitter();
  readonly hooks: WebhookDispatcher;
  private qr = new Map<string, { qr?: string; qrBase64?: string; at: number }>();
  private pruneTimer?: NodeJS.Timeout;

  constructor(cfg: AppConfig, private db: AppDB) {
    this.bus.setMaxListeners(0);
    this.hooks = new WebhookDispatcher(db);
    this.wacap = new WacapWrapper({
      sessionsPath: cfg.sessionsPath,
      qrCode: { format: 'base64', width: 300 },
      logger: { level: 'warn' },
    });
  }

  async init() {
    await this.wacap.init();

    this.wacap.onGlobal(WacapEventType.QR_CODE, (d: any) => {
      this.qr.set(d.sessionId, { qr: d.qr, qrBase64: d.qrBase64, at: Date.now() });
      this.bus.emit('event', { type: 'qr', sessionId: d.sessionId });
      this.hooks.dispatch('session.qr', { sessionId: d.sessionId });
    });

    const sessionEvents: [WacapEventType, string][] = [
      [WacapEventType.CONNECTION_OPEN, 'session.connected'],
      [WacapEventType.CONNECTION_CLOSE, 'session.disconnected'],
      [WacapEventType.SESSION_ERROR, 'session.error'],
      [WacapEventType.SESSION_START, 'session.start'],
      [WacapEventType.SESSION_STOP, 'session.stop'],
    ];
    for (const [ev, hookName] of sessionEvents) {
      this.wacap.onGlobal(ev, (d: any) => {
        if (ev === WacapEventType.CONNECTION_OPEN) this.qr.delete(d.sessionId);
        this.bus.emit('event', { type: 'session', sessionId: d.sessionId, event: ev });
        if (hookName.match(/connected|disconnected|error/)) {
          this.hooks.dispatch(hookName, { sessionId: d.sessionId, error: d.error?.message });
        }
      });
    }

    const onMessage = (direction: 'in' | 'out') => (d: any) => {
      this.record({
        id: d.message?.key?.id || `${Date.now()}`,
        sessionId: d.sessionId,
        direction,
        peer: d.from, // remoteJid = the chat, for both directions
        body: d.body,
        type: d.messageType,
        timestamp: Date.now(),
      });
    };
    this.wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, onMessage('in'));
    this.wacap.onGlobal(WacapEventType.MESSAGE_SENT, onMessage('out'));

    this.db.pruneMessages(RETENTION_MS);
    this.pruneTimer = setInterval(() => this.db.pruneMessages(RETENTION_MS), 6 * 60 * 60 * 1000);
    this.pruneTimer.unref();

    // Resume previously saved sessions (no QR re-scan).
    await this.wacap.sessions.startAll().catch(() => []);
  }

  private seen = new Set<string>();

  private record(m: StoredMessage) {
    const key = `${m.sessionId}:${m.direction}:${m.id}`;
    if (this.seen.has(key)) return; // dedupe API-send vs MESSAGE_SENT event
    this.seen.add(key);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value as string);

    this.db.insertMessage(m);
    this.bus.emit('event', { type: 'message', message: m });
    this.hooks.dispatch(m.direction === 'in' ? 'message.received' : 'message.sent', m);
  }

  recordOutgoing(sessionId: string, to: string, body: string, type = 'text', id?: string) {
    this.record({ id: id || `${Date.now()}`, sessionId, direction: 'out', peer: to, body, type, timestamp: Date.now() });
  }

  getQR(sessionId: string) {
    return this.qr.get(sessionId) || null;
  }

  listSessions() {
    return this.wacap.sessions.list().map((id) => this.wacap.sessions.info(id)).filter(Boolean);
  }

  async destroy() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    await this.wacap.destroy();
  }
}
