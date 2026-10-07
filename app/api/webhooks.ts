import { createHmac } from 'crypto';
import type { AppDB, Webhook } from './db';

export const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'session.connected',
  'session.disconnected',
  'session.qr',
  'session.error',
] as const;

/** Only http(s) URLs are accepted. */
export function validateWebhookUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'URL must be http or https';
  } catch {
    return 'Invalid URL';
  }
}

export class WebhookDispatcher {
  constructor(private db: AppDB) {}

  /** Fire-and-forget delivery to all enabled webhooks subscribed to `event`. */
  dispatch(event: string, data: unknown) {
    for (const hook of this.db.listWebhooks(true)) {
      const subs = hook.events.split(',').map((s) => s.trim());
      if (subs.includes('*') || subs.includes(event)) void this.deliver(hook, event, data);
    }
  }

  async deliver(hook: Webhook, event: string, data: unknown): Promise<string> {
    const body = JSON.stringify({ event, timestamp: Date.now(), data });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-DailyReport-Event': event };
    if (hook.secret) headers['X-DailyReport-Signature'] = 'sha256=' + createHmac('sha256', hook.secret).update(body).digest('hex');

    let status = 'error';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
        status = String(res.status);
        if (res.ok) break;
      } catch (e: any) {
        status = `error: ${e?.cause?.code || e?.name || 'failed'}`;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    this.db.setWebhookResult(hook.id, status);
    return status;
  }
}
