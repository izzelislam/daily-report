import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync, writeFileSync, chmodSync } from 'fs';
import { AppDB, User, Webhook } from './db';
import { WacapService } from './service';
import { validateWebhookUrl, WEBHOOK_EVENTS } from './webhooks';
import { TunnelManager } from './tunnel';
import { SecretBox } from './crypto';
import { DailyReportService, nowIn } from './dailyreport';
import { AppConfig } from './config';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export async function startServer(cfg: AppConfig) {
  const db = new AppDB(cfg.dbPath);
  const service = new WacapService(cfg, db);
  const tunnel = new TunnelManager();
  await service.init();
  const dailyReport = new DailyReportService(db, new SecretBox(cfg.dataDir), service);
  dailyReport.startScheduler();

  // Trust X-Forwarded-For only from loopback (i.e. our own cloudflared), so remote clients
  // can't spoof their IP to dodge the login limiter.
  const app = Fastify({ logger: { level: 'warn' }, trustProxy: 'loopback' });
  // Must be registered before routes so every route returns { error: message }.
  app.setErrorHandler((err: any, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.code(status).send({ error: err.message || 'Internal error' });
  });
  await app.register(cors, { origin: true });

  // ---------- auth ----------
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/')) return;
    if (url === '/api/health' || url === '/api/auth/login') return;

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const queryToken = (req.query as any)?.token as string | undefined; // for EventSource
    const token = bearer || queryToken;
    const user = token ? db.authenticate(token) : null;
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    req.user = user;
  });

  const needSession = (id: string) => {
    if (!service.wacap.sessions.get(id)) throw Object.assign(new Error(`Session "${id}" not found`), { statusCode: 404 });
  };

  app.get('/api/health', async () => ({ ok: true, users: db.countUsers() }));

  // Login brute-force guard: max 10 failed attempts / 10 min per IP (in-memory).
  const failures = new Map<string, { n: number; reset: number }>();
  const LOGIN_MAX = 10;
  const LOGIN_WINDOW = 10 * 60 * 1000;

  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', async (req, reply) => {
    const ip = req.ip;
    const rec = failures.get(ip);
    if (rec && rec.reset > Date.now() && rec.n >= LOGIN_MAX)
      return reply.code(429).send({ error: 'Too many failed attempts. Try again later.' });

    const { username, password } = req.body || ({} as any);
    const user = username && password ? db.verifyLogin(username, password) : null;
    if (!user) {
      const cur = rec && rec.reset > Date.now() ? rec : { n: 0, reset: Date.now() + LOGIN_WINDOW };
      cur.n++;
      failures.set(ip, cur);
      return reply.code(401).send({ error: 'Invalid username or password' });
    }
    failures.delete(ip);
    const { token } = db.createToken(user.id, 'web-login');
    return { token, user };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user }));

  // ---------- tokens ----------
  app.get('/api/tokens', async (req) => db.listTokens(req.user!.role === 'admin' ? undefined : req.user!.id));
  app.post<{ Body: { name?: string } }>('/api/tokens', async (req) => {
    const { token, row } = db.createToken(req.user!.id, (req.body?.name || 'api-token').slice(0, 64));
    return { token, ...row };
  });
  app.delete<{ Params: { id: string } }>('/api/tokens/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const visible = db.listTokens(req.user!.role === 'admin' ? undefined : req.user!.id);
    if (!visible.some((t) => t.id === id)) return reply.code(404).send({ error: 'Token not found' });
    return { ok: db.revokeToken(id) };
  });

  // ---------- sessions ----------
  app.get('/api/sessions', async () => service.listSessions());

  app.post<{ Body: { id: string } }>('/api/sessions', async (req, reply) => {
    const id = req.body?.id;
    if (!id || !SESSION_ID_RE.test(id)) return reply.code(400).send({ error: 'Invalid session id (a-z, 0-9, _ -)' });
    await service.wacap.sessions.start(id);
    return service.wacap.sessions.info(id);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const info = service.wacap.sessions.info(req.params.id);
    return info || reply.code(404).send({ error: 'Session not found' });
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/qr', async (req) => {
    const info = service.wacap.sessions.info(req.params.id);
    return { status: info?.status ?? 'disconnected', qr: service.getQR(req.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/stop', async (req) => {
    await service.wacap.sessions.stop(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/logout', async (req) => {
    await service.wacap.logoutSession(req.params.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req) => {
    await service.wacap.deleteSession(req.params.id);
    return { ok: true };
  });

  // ---------- send ----------
  app.post<{ Body: { sessionId: string; to: string; text: string } }>('/api/send/text', async (req, reply) => {
    const { sessionId, to, text } = req.body || ({} as any);
    if (!sessionId || !to || !text) return reply.code(400).send({ error: 'sessionId, to, text are required' });
    needSession(sessionId);
    const res = await service.wacap.send.text(sessionId, to, text);
    service.recordOutgoing(sessionId, res?.key?.remoteJid || to, text, 'text', res?.key?.id);
    return { ok: true, id: res?.key?.id };
  });

  app.post<{ Body: { sessionId: string; to: string; url: string; mimetype?: string; caption?: string; fileName?: string } }>(
    '/api/send/media',
    async (req, reply) => {
      const { sessionId, to, url, mimetype, caption, fileName } = req.body || ({} as any);
      if (!sessionId || !to || !url) return reply.code(400).send({ error: 'sessionId, to, url are required' });
      needSession(sessionId);
      const res = await service.wacap.send.media(sessionId, to, { url, mimetype, caption, fileName });
      service.recordOutgoing(sessionId, res?.key?.remoteJid || to, caption || url, 'media', res?.key?.id);
      return { ok: true, id: res?.key?.id };
    }
  );

  app.post<{ Body: { sessionId: string; number?: string; numbers?: string[] } }>('/api/contacts/check', async (req, reply) => {
    const { sessionId, number, numbers } = req.body || ({} as any);
    const list = numbers?.length ? numbers : number ? [number] : [];
    if (!sessionId || !list.length) return reply.code(400).send({ error: 'sessionId and number(s) are required' });
    if (list.length > 100) return reply.code(400).send({ error: 'Max 100 numbers per request' });
    needSession(sessionId);
    return service.wacap.contacts.checkMultiple(sessionId, list);
  });

  // ---------- groups ----------
  const groupBase = '/api/sessions/:id/groups';

  app.get<{ Params: { id: string } }>(groupBase, async (req) => {
    needSession(req.params.id);
    const sock = service.wacap.getSocket(req.params.id);
    if (!sock) throw Object.assign(new Error('Session not connected'), { statusCode: 409 });
    const all = await sock.groupFetchAllParticipating();
    return Object.values(all)
      .map((g: any) => ({ id: g.id, subject: g.subject, size: g.participants?.length ?? g.size ?? 0, owner: g.owner, creation: g.creation, announce: !!g.announce }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  });

  app.get<{ Params: { id: string; gid: string } }>(`${groupBase}/:gid`, async (req) => {
    needSession(req.params.id);
    const g = await service.wacap.groups.getInfo(req.params.id, req.params.gid);
    return {
      id: g.id,
      subject: g.subject,
      desc: g.desc,
      owner: g.owner,
      creation: g.creation,
      announce: !!g.announce,
      participants: (g.participants || []).map((p: any) => ({ id: p.id, admin: p.admin || null })),
    };
  });

  app.post<{ Params: { id: string }; Body: { subject: string; participants: string[] } }>(groupBase, async (req, reply) => {
    const { subject, participants } = req.body || ({} as any);
    if (!subject || !Array.isArray(participants) || !participants.length)
      return reply.code(400).send({ error: 'subject and participants[] are required' });
    needSession(req.params.id);
    const g = await service.wacap.groups.create(req.params.id, subject, participants);
    return { id: g.id, subject: g.subject };
  });

  app.post<{ Params: { id: string; gid: string }; Body: { action: 'add' | 'remove' | 'promote' | 'demote'; participants: string[] } }>(
    `${groupBase}/:gid/participants`,
    async (req, reply) => {
      const { action, participants } = req.body || ({} as any);
      const fns: Record<string, Function> = {
        add: service.wacap.groups.addParticipants,
        remove: service.wacap.groups.removeParticipants,
        promote: service.wacap.groups.promoteParticipants,
        demote: service.wacap.groups.demoteParticipants,
      };
      if (!fns[action] || !Array.isArray(participants) || !participants.length)
        return reply.code(400).send({ error: 'action (add|remove|promote|demote) and participants[] are required' });
      needSession(req.params.id);
      return { ok: true, result: await fns[action](req.params.id, req.params.gid, participants) };
    }
  );

  app.get<{ Params: { id: string; gid: string } }>(`${groupBase}/:gid/invite`, async (req) => {
    needSession(req.params.id);
    const code = await service.wacap.groups.getInviteCode(req.params.id, req.params.gid);
    return { code, link: `https://chat.whatsapp.com/${code}` };
  });

  app.post<{ Params: { id: string; gid: string } }>(`${groupBase}/:gid/leave`, async (req) => {
    needSession(req.params.id);
    await service.wacap.groups.leave(req.params.id, req.params.gid);
    return { ok: true };
  });

  // ---------- messages (persisted in SQLite) + stats ----------
  app.get<{ Querystring: { sessionId?: string; peer?: string; q?: string; limit?: string; before?: string } }>('/api/messages', async (req) =>
    db.listMessages({
      sessionId: req.query.sessionId || undefined,
      peer: req.query.peer || undefined,
      q: req.query.q || undefined,
      limit: Number(req.query.limit) || 100,
      before: Number(req.query.before) || undefined,
    })
  );

  app.get('/api/stats', async () => ({
    sessions: service.listSessions().length,
    connected: service.listSessions().filter((s: any) => s.status === 'connected').length,
    ...db.messageStats(),
  }));

  // ---------- webhooks (admin only) ----------
  const adminOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
  };
  const publicHook = (w: Webhook) => ({ ...w, secret: undefined, hasSecret: !!w.secret, enabled: !!w.enabled });

  app.get('/api/webhooks/events', async () => WEBHOOK_EVENTS);
  app.get('/api/webhooks', { preHandler: adminOnly }, async () => db.listWebhooks().map(publicHook));

  app.post<{ Body: { name: string; url: string; secret?: string; events?: string[] } }>(
    '/api/webhooks',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { name, url, secret, events } = req.body || ({} as any);
      if (!name || !url) return reply.code(400).send({ error: 'name and url are required' });
      const bad = validateWebhookUrl(url);
      if (bad) return reply.code(400).send({ error: bad });
      const valid = (events || ['*']).filter((e) => e === '*' || (WEBHOOK_EVENTS as readonly string[]).includes(e));
      if (!valid.length) return reply.code(400).send({ error: 'No valid events' });
      return publicHook(db.createWebhook({ name: name.slice(0, 64), url, secret, events: valid.join(',') }));
    }
  );

  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>('/api/webhooks/:id', { preHandler: adminOnly }, async (req, reply) =>
    db.setWebhookEnabled(Number(req.params.id), !!req.body?.enabled) ? { ok: true } : reply.code(404).send({ error: 'Webhook not found' })
  );

  app.post<{ Params: { id: string } }>('/api/webhooks/:id/test', { preHandler: adminOnly }, async (req, reply) => {
    const hook = db.getWebhook(Number(req.params.id));
    if (!hook) return reply.code(404).send({ error: 'Webhook not found' });
    return { status: await service.hooks.deliver(hook, 'webhook.test', { message: 'Hello from Daily Report' }) };
  });

  app.delete<{ Params: { id: string } }>('/api/webhooks/:id', { preHandler: adminOnly }, async (req, reply) =>
    db.deleteWebhook(Number(req.params.id)) ? { ok: true } : reply.code(404).send({ error: 'Webhook not found' })
  );

  // ---------- daily report (dparagon pipeline, admin only) ----------
  app.get('/api/dr/connection', { preHandler: adminOnly }, async () => dailyReport.connection());

  app.post<{ Body: { email: string; password: string; remember?: boolean; baseUrl?: string } }>(
    '/api/dr/connect',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { email, password, remember, baseUrl } = req.body || ({} as any);
      if (!email || !password) return reply.code(400).send({ error: "email and password are required" });
      try {
        return await dailyReport.connect({ email, password, remember: remember !== false, baseUrl });
      } catch (e: any) {
        return reply.code(e?.status === 401 ? 401 : 400).send({ error: e.message });
      }
    }
  );

  app.post('/api/dr/disconnect', { preHandler: adminOnly }, async () => {
    dailyReport.disconnect();
    return { ok: true };
  });

  app.get('/api/dr/settings', { preHandler: adminOnly }, async () => ({
    settings: dailyReport.getSettings(),
    schedule: dailyReport.nextScheduled(),
    today: nowIn(dailyReport.getSettings().timezone).date,
  }));

  app.put<{ Body: Record<string, any> }>('/api/dr/settings', { preHandler: adminOnly }, async (req, reply) => {
    try {
      return { settings: dailyReport.saveSettings(req.body || {}) };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post<{ Body: { mode?: string; dryRun?: boolean } }>('/api/dr/run', { preHandler: adminOnly }, async (req, reply) => {
    const mode = (req.body?.mode || 'manual') as 'manual' | 'scheduler' | 'bot';
    try {
      return { id: dailyReport.start(mode, req.body?.dryRun !== false) }; // dry run unless explicitly false
    } catch (e: any) {
      return reply.code(e.message.includes('progress') ? 409 : 400).send({ error: e.message });
    }
  });

  app.get('/api/dr/runs', { preHandler: adminOnly }, async () => ({
    running: dailyReport.isRunning(),
    runs: db.listRuns(50).map(({ steps, ...r }) => r),
  }));

  app.get<{ Params: { id: string } }>('/api/dr/runs/:id', { preHandler: adminOnly }, async (req, reply) =>
    db.getRun(Number(req.params.id)) || reply.code(404).send({ error: 'Run not found' })
  );

  // ---------- public access (Cloudflare tunnel, admin only) ----------
  app.get('/api/tunnel', { preHandler: adminOnly }, async () => tunnel.status());

  app.post('/api/tunnel/start', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      return await tunnel.start(cfg.port, process.env.CLOUDFLARE_TUNNEL_TOKEN);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post('/api/tunnel/stop', { preHandler: adminOnly }, async () => {
    tunnel.stop();
    return tunnel.status();
  });

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    service.bus.on('event', send);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.raw.on('close', () => {
      clearInterval(ping);
      service.bus.off('event', send);
    });
  });

  // ---------- web (static) ----------
  if (existsSync(cfg.webDir)) {
    await app.register(fastifyStatic, { root: cfg.webDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async (_req, reply) =>
      reply.type('text/html').send('<h3>Daily Report API is running.</h3><p>Web UI not built. Run <code>npm run build:web</code> in /app.</p>')
    );
  }

  await app.listen({ port: cfg.port, host: cfg.host });

  const shutdown = async () => {
    dailyReport.stopScheduler();
    tunnel.stop();
    await app.close().catch(() => {});
    await service.destroy().catch(() => {});
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return { app, db, service, tunnel };
}

export function saveCliToken(path: string, token: string) {
  writeFileSync(path, token, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
}
