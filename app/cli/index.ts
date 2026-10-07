import { Command } from 'commander';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolveConfig } from '../api/config';
import { AppDB } from '../api/db';
import { startServer, saveCliToken } from '../api/server';
import { validateWebhookUrl } from '../api/webhooks';

const program = new Command();
program
  .name('dailyreport')
  .description('Daily Report - WhatsApp dashboard, API and CLI')
  .version('0.1.0')
  .option('-d, --data <dir>', 'data directory (default: ~/.dailyreport or $DAILYREPORT_HOME)');

const cfg = () => resolveConfig({ dataDir: program.opts().data });
const withDb = <T>(fn: (db: AppDB) => T): T => {
  const db = new AppDB(cfg().dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
};
const fmt = (ts?: number | null) => (ts ? new Date(ts).toLocaleString() : '-');
const fail = (msg: string): never => {
  console.error(`Error: ${msg}`);
  process.exit(1);
};

// ---------------- server ----------------
const server = program.command('server').description('Run the API + web server');
server
  .command('start')
  .description('Start the server (API + Web UI)')
  .option('-p, --port <port>', 'port', (v) => Number(v))
  .option('-H, --host <host>', 'host')
  .option('-t, --tunnel', 'expose publicly via Cloudflare Tunnel (cloudflared)')
  .option('--tunnel-token <token>', 'Cloudflare named-tunnel token (default: $CLOUDFLARE_TUNNEL_TOKEN, else random quick tunnel)')
  .action(async (opts) => {
    const c = resolveConfig({ dataDir: program.opts().data, port: opts.port, host: opts.host });
    const { db, tunnel } = await startServer(c);
    const shownHost = c.host === '0.0.0.0' ? 'localhost' : c.host;
    console.log(`\n  Daily Report running`);
    console.log(`  Web : http://${shownHost}:${c.port}`);
    console.log(`  API : http://${shownHost}:${c.port}/api`);
    console.log(`  Data: ${c.dataDir}`);
    if (db.countUsers() === 0) {
      console.log('\n  No users yet. In another terminal run:  dailyreport init');
    }

    if (opts.tunnel) {
      console.log('\n  Starting Cloudflare tunnel…');
      try {
        const st = await tunnel.start(c.port, opts.tunnelToken || process.env.CLOUDFLARE_TUNNEL_TOKEN);
        console.log(`  Public: ${st.url}`);
        console.log('  ⚠ Anyone with this URL can reach the login page. Use a strong password.');
      } catch (e: any) {
        console.error(`  Tunnel failed: ${e.message} (server still running locally)`);
      }
    } else {
      console.log('\n  Public access: enable the Tunnel menu in the web UI, or restart with --tunnel');
    }
    console.log();
  });

// ---------------- init ----------------
program
  .command('init')
  .description('First-time setup: create admin user + access token')
  .option('-u, --username <name>', 'admin username', 'admin')
  .option('-p, --password <password>', 'admin password (random if omitted)')
  .action((opts) => {
    const c = cfg();
    withDb((db) => {
      if (db.countUsers() > 0) fail('Already initialized. Use "dailyreport user create" or "dailyreport token create".');
      const password = opts.password || randomBytes(9).toString('base64url');
      const user = db.createUser(opts.username, password, 'admin');
      const { token } = db.createToken(user.id, 'cli');
      saveCliToken(c.cliTokenPath, token);
      console.log('\n  Admin created (shown once, store it safely)');
      console.log(`  Username : ${user.username}`);
      console.log(`  Password : ${password}`);
      console.log(`  Token    : ${token}`);
      console.log(`\n  CLI token saved to ${c.cliTokenPath}`);
      console.log('  Now run: dailyreport server start\n');
    });
  });

// ---------------- user ----------------
const user = program.command('user').description('Manage users');
user
  .command('create <username>')
  .option('-p, --password <password>', 'password (random if omitted)')
  .option('-r, --role <role>', 'admin | user', 'user')
  .action((username, opts) => {
    if (!['admin', 'user'].includes(opts.role)) fail('role must be admin or user');
    withDb((db) => {
      if (db.getUserByName(username)) fail(`User "${username}" already exists`);
      const password = opts.password || randomBytes(9).toString('base64url');
      db.createUser(username, password, opts.role);
      console.log(`Created ${opts.role} "${username}"\nPassword: ${password}`);
    });
  });
user.command('list').action(() =>
  withDb((db) => console.table(db.listUsers().map((u) => ({ id: u.id, username: u.username, role: u.role, created: fmt(u.created_at) }))))
);
user
  .command('passwd <username>')
  .option('-p, --password <password>', 'new password (random if omitted)')
  .action((username, opts) =>
    withDb((db) => {
      const password = opts.password || randomBytes(9).toString('base64url');
      if (!db.setPassword(username, password)) fail(`User "${username}" not found`);
      console.log(`Password updated\nPassword: ${password}`);
    })
  );
user.command('delete <username>').action((username) =>
  withDb((db) => (db.deleteUser(username) ? console.log('Deleted') : fail(`User "${username}" not found`)))
);

// ---------------- token ----------------
const token = program.command('token').description('Manage access tokens');
token
  .command('create')
  .option('-u, --user <username>', 'owner username', 'admin')
  .option('-n, --name <name>', 'token label', 'cli')
  .option('--save', 'save as the CLI default token')
  .action((opts) =>
    withDb((db) => {
      const owner = db.getUserByName(opts.user) || fail(`User "${opts.user}" not found`);
      const { token: t } = db.createToken(owner.id, opts.name);
      if (opts.save) saveCliToken(cfg().cliTokenPath, t);
      console.log(`Token (shown once): ${t}`);
    })
  );
token.command('list').action(() =>
  withDb((db) =>
    console.table(
      db.listTokens().map((t) => ({ id: t.id, name: t.name, user: t.username, prefix: `${t.prefix}…`, created: fmt(t.created_at), lastUsed: fmt(t.last_used_at) }))
    )
  )
);
token.command('revoke <id>').action((id) =>
  withDb((db) => (db.revokeToken(Number(id)) ? console.log('Revoked') : fail('Token not found')))
);

// ---------------- remote commands (talk to a running server) ----------------
function remote(parent: Command) {
  return async (method: string, path: string, body?: unknown) => {
    const url = parent.optsWithGlobals().url || process.env.DAILYREPORT_URL || `http://localhost:${process.env.PORT || 3000}`;
    const c = cfg();
    const tk = parent.optsWithGlobals().token || process.env.DAILYREPORT_TOKEN || (existsSync(c.cliTokenPath) ? readFileSync(c.cliTokenPath, 'utf8').trim() : '');
    if (!tk) fail('No token. Run "dailyreport init" or pass --token / DAILYREPORT_TOKEN.');
    let res: Response;
    try {
      res = await fetch(`${url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${tk}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return fail(`Cannot reach server at ${url}. Is "dailyreport server start" running?`);
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) fail(data.error || `HTTP ${res.status}`);
    return data;
  };
}

const session = program
  .command('session')
  .description('Manage WhatsApp sessions (server must be running)')
  .option('--url <url>', 'server url')
  .option('--token <token>', 'access token');
const call = remote(session);

session.command('list').action(async () => {
  const list = await call('GET', '/api/sessions');
  console.table(list.map((s: any) => ({ id: s.sessionId, status: s.status, phone: s.phoneNumber || '-', name: s.userName || '-' })));
});
session
  .command('add <id>')
  .description('Create a session and print QR in terminal')
  .action(async (id) => {
    await call('POST', '/api/sessions', { id });
    console.log(`Session "${id}" started. Waiting for QR... (Ctrl+C to stop watching)`);
    let last = '';
    for (;;) {
      const r = await call('GET', `/api/sessions/${id}/qr`);
      if (r.status === 'connected') return console.log('Connected!');
      if (r.qr?.qr && r.qr.qr !== last) {
        last = r.qr.qr;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('qrcode-terminal').generate(r.qr.qr, { small: true });
      }
      await new Promise((r2) => setTimeout(r2, 2000));
    }
  });
session.command('stop <id>').action(async (id) => (await call('POST', `/api/sessions/${id}/stop`), console.log('Stopped')));
session.command('logout <id>').action(async (id) => (await call('POST', `/api/sessions/${id}/logout`), console.log('Logged out')));
session.command('delete <id>').action(async (id) => (await call('DELETE', `/api/sessions/${id}`), console.log('Deleted')));

const send = program
  .command('send')
  .description('Send messages (server must be running)')
  .option('--url <url>', 'server url')
  .option('--token <token>', 'access token');
const sendCall = remote(send);
send
  .command('text <session> <to> <message...>')
  .action(async (sid, to, message: string[]) => {
    const r = await sendCall('POST', '/api/send/text', { sessionId: sid, to, text: message.join(' ') });
    console.log(`Sent (id: ${r.id})`);
  });
send
  .command('media <session> <to> <url>')
  .option('-c, --caption <caption>')
  .option('-m, --mimetype <mimetype>')
  .action(async (sid, to, url, opts) => {
    const r = await sendCall('POST', '/api/send/media', { sessionId: sid, to, url, caption: opts.caption, mimetype: opts.mimetype });
    console.log(`Sent (id: ${r.id})`);
  });

// ---------------- webhook (offline, admin via DB) ----------------
const webhook = program.command('webhook').description('Manage webhooks');
webhook
  .command('add <name> <url>')
  .option('-s, --secret <secret>', 'HMAC secret (header X-DailyReport-Signature)')
  .option('-e, --events <events>', 'comma separated, or *', '*')
  .action((name, url, opts) =>
    withDb((db) => {
      const bad = validateWebhookUrl(url);
      if (bad) fail(bad);
      const w = db.createWebhook({ name, url, secret: opts.secret, events: opts.events });
      console.log(`Webhook #${w.id} created`);
    })
  );
webhook.command('list').action(() =>
  withDb((db) =>
    console.table(db.listWebhooks().map((w) => ({ id: w.id, name: w.name, url: w.url, events: w.events, enabled: !!w.enabled, last: w.last_status || '-' })))
  )
);
webhook.command('delete <id>').action((id) =>
  withDb((db) => (db.deleteWebhook(Number(id)) ? console.log('Deleted') : fail('Webhook not found')))
);

// ---------------- messages / groups / contacts (need running server) ----------------
const messages = program
  .command('messages')
  .description('Show stored messages (server must be running)')
  .option('-s, --session <id>')
  .option('-q, --query <text>')
  .option('-n, --limit <n>', 'number of messages', '20')
  .option('--url <url>')
  .option('--token <token>')
  .action(async (opts) => {
    const qs = new URLSearchParams({ limit: opts.limit });
    if (opts.session) qs.set('sessionId', opts.session);
    if (opts.query) qs.set('q', opts.query);
    const rows = await remote(messages)('GET', `/api/messages?${qs}`);
    console.table(
      rows.map((m: any) => ({ time: fmt(m.timestamp), dir: m.direction, session: m.sessionId, peer: (m.peer || '').split('@')[0], body: (m.body || `[${m.type}]`).slice(0, 60) }))
    );
  });

const group = program
  .command('group')
  .description('WhatsApp groups (server must be running)')
  .option('--url <url>')
  .option('--token <token>');
const groupCall = remote(group);
group.command('list <session>').action(async (sid) => {
  const rows = await groupCall('GET', `/api/sessions/${sid}/groups`);
  console.table(rows.map((g: any) => ({ id: g.id, subject: g.subject, members: g.size })));
});
group
  .command('create <session> <subject> <numbers...>')
  .action(async (sid, subject, numbers: string[]) => {
    const g = await groupCall('POST', `/api/sessions/${sid}/groups`, { subject, participants: numbers });
    console.log(`Created ${g.id}`);
  });

const contact = program
  .command('contact')
  .description('Contacts (server must be running)')
  .option('--url <url>')
  .option('--token <token>');
contact.command('check <session> <numbers...>').action(async (sid, numbers: string[]) => {
  const rows = await remote(contact)('POST', '/api/contacts/check', { sessionId: sid, numbers });
  console.table(rows.map((r: any) => ({ number: r.number, onWhatsApp: r.exists, jid: r.jid })));
});

program.parseAsync(process.argv).catch((e) => fail(e?.message || String(e)));
