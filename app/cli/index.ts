import { Command } from 'commander';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { connect } from 'net';
import { createInterface } from 'readline';
import { resolveConfig, saveConfig } from '../api/config';
import { AppDB } from '../api/db';
import { startServer, saveCliToken } from '../api/server';
import { validateWebhookUrl } from '../api/webhooks';

// dist/cli.js and cli/index.ts both sit one level below the package root.
const pkgVersion = (): string => {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
};

const program = new Command();
program
  .name('dailyreport')
  .description('Daily Report - WhatsApp dashboard, API and CLI')
  .version(pkgVersion())
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
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readPid = (path: string) => {
  const pid = existsSync(path) ? Number(readFileSync(path, 'utf8')) : 0;
  return pid && alive(pid) ? pid : 0;
};
const portOpen = (port: number) =>
  new Promise<boolean>((res) => {
    const s = connect({ port, host: '127.0.0.1' }, () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
  });

server
  .command('start')
  .description('Start the server (API + Web UI) in the background')
  .option('-p, --port <port>', 'port', (v) => Number(v))
  .option('-H, --host <host>', 'host')
  .option('-t, --tunnel', 'expose publicly via Cloudflare Tunnel (cloudflared)')
  .option('--tunnel-token <token>', 'Cloudflare named-tunnel token (default: $CLOUDFLARE_TUNNEL_TOKEN, else random quick tunnel)')
  .option('-f, --foreground', 'stay attached to this terminal instead of running in the background')
  .action(async (opts) => {
    const c = resolveConfig({ dataDir: program.opts().data, port: opts.port, host: opts.host });
    const shownHost = c.host === '0.0.0.0' ? 'localhost' : c.host;

    if (!opts.foreground) {
      const running = readPid(c.pidPath);
      if (running) fail(`Already running (pid ${running}). Use "dailyreport server stop" or "dailyreport server logs".`);
      const log = openSync(c.logPath, 'a');
      const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1), '--foreground'], {
        detached: true,
        stdio: ['ignore', log, log],
        env: process.env,
      });
      child.unref();
      for (let i = 0; i < 60 && !(await portOpen(c.port)); i++) {
        if (child.exitCode !== null) fail(`Server exited during startup. See: dailyreport server logs`);
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!(await portOpen(c.port))) fail('Server did not come up in 15s. See: dailyreport server logs');
      console.log(`\n  Daily Report started in the background (pid ${child.pid})`);
      console.log(`  Web : http://${shownHost}:${c.port}`);
      console.log(`  Logs: dailyreport server logs   Stop: dailyreport server stop\n`);
      if (readSavedUsers(c.dbPath) === 0) console.log('  No users yet. Run:  dailyreport init\n');
      return;
    }

    const { db, tunnel } = await startServer(c);
    writeFileSync(c.pidPath, String(process.pid));
    const cleanup = () => {
      try {
        if (Number(readFileSync(c.pidPath, 'utf8')) === process.pid) unlinkSync(c.pidPath);
      } catch {
        /* already gone */
      }
    };
    process.on('exit', cleanup);
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));
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

server.command('stop').description('Stop the background server').action(() => {
  const c = cfg();
  const pid = readPid(c.pidPath);
  if (!pid) return console.log('Not running.');
  process.kill(pid, 'SIGTERM');
  console.log(`Stopped (pid ${pid}).`);
});

server.command('status').description('Show whether the server is running').action(() => {
  const c = cfg();
  const pid = readPid(c.pidPath);
  console.log(pid ? `Running (pid ${pid}) · http://localhost:${c.port}` : 'Not running.');
});

server
  .command('logs')
  .description('Show the server log (use -f to follow)')
  .option('-f, --follow', 'follow new output')
  .option('-n, --lines <n>', 'lines to show', '50')
  .action((opts) => {
    const c = cfg();
    if (!existsSync(c.logPath)) return console.log('No log yet.');
    spawn('tail', [...(opts.follow ? ['-f'] : []), '-n', String(opts.lines), c.logPath], { stdio: 'inherit' });
  });

function readSavedUsers(dbPath: string): number {
  try {
    const d = new AppDB(dbPath);
    const n = d.countUsers();
    d.close();
    return n;
  } catch {
    return -1;
  }
}

// ---------------- config ----------------
program
  .command('config')
  .description('Show or change saved settings (port, host); restart the server to apply')
  .option('-P, --port <port>', 'set port', (v) => Number(v))
  .option('-H, --host <host>', 'set bind address (0.0.0.0 or 127.0.0.1)')
  .action((opts) => {
    const c = cfg();
    if (opts.port !== undefined) {
      if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) fail('Port must be a number between 1 and 65535');
      saveConfig(c.dataDir, { port: opts.port });
    }
    if (opts.host !== undefined) saveConfig(c.dataDir, { host: opts.host });
    const now = cfg();
    console.log(`port: ${now.port}\nhost: ${now.host}\nfile: ${now.dataDir}/config.json`);
    if ((opts.port !== undefined || opts.host !== undefined) && readPid(now.pidPath)) console.log('Restart to apply: dailyreport server stop && dailyreport server start');
  });


/** `init` on an already-initialized install: a small menu instead of an error. */
async function manageExisting(c: ReturnType<typeof cfg>) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
  const running = () => readPid(c.pidPath);
  console.log('\n  Daily Report is already set up.');
  try {
    for (;;) {
      const now = resolveConfig({ dataDir: c.dataDir });
      console.log(`\n  Current: port ${now.port} · host ${now.host} · data ${now.dataDir}`);
      console.log('    1) Change port / host');
      console.log('    2) Add a user');
      console.log('    3) Create an access token');
      console.log('    4) Reset a user password');
      console.log('    0) Exit');
      const pick = (await ask('\n  Choose [0-4]: ')).trim();
      if (pick === '' || pick === '0') break;
      if (pick === '1') {
        const p = (await ask(`  Web/API port [${now.port}]: `)).trim();
        const port = p ? Number(p) : now.port;
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          console.log('  ✗ Port must be a number between 1 and 65535');
          continue;
        }
        const h = (await ask(`  Allow access from other devices? (y = 0.0.0.0, n = 127.0.0.1 only) [${now.host === '127.0.0.1' ? 'n' : 'Y'}]: `)).trim().toLowerCase();
        const host = h ? (h.startsWith('y') ? '0.0.0.0' : '127.0.0.1') : now.host;
        saveConfig(c.dataDir, { port, host });
        console.log(`  ✓ Saved: port ${port}, host ${host}`);
        if (running()) console.log('  Restart to apply: dailyreport server stop && dailyreport server start');
      } else if (pick === '2') {
        const name = (await ask('  Username: ')).trim();
        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name)) { console.log('  ✗ Username: letters, numbers, . _ - (max 64)'); continue; }
        const role = (await ask('  Role (admin/user) [user]: ')).trim() || 'user';
        if (!['admin', 'user'].includes(role)) { console.log('  ✗ Role must be admin or user'); continue; }
        const pw = (await ask('  Password [random]: ')).trim() || randomBytes(9).toString('base64url');
        withDb((db) => {
          if (db.getUserByName(name)) return console.log(`  ✗ User "${name}" already exists`);
          db.createUser(name, pw, role as 'admin' | 'user');
          console.log(`  ✓ Created ${role} "${name}"  Password: ${pw}`);
        });
      } else if (pick === '3') {
        const owner = (await ask('  Token owner (username) [admin]: ')).trim() || 'admin';
        const label = (await ask('  Token label [cli]: ')).trim() || 'cli';
        const save = (await ask('  Save as the CLI default token? [y/N]: ')).trim().toLowerCase().startsWith('y');
        withDb((db) => {
          const u = db.getUserByName(owner);
          if (!u) return console.log(`  ✗ User "${owner}" not found`);
          const { token: t } = db.createToken(u.id, label);
          if (save) saveCliToken(c.cliTokenPath, t);
          console.log(`  ✓ Token (shown once): ${t}`);
        });
      } else if (pick === '4') {
        const name = (await ask('  Username: ')).trim();
        const pw = (await ask('  New password [random]: ')).trim() || randomBytes(9).toString('base64url');
        withDb((db) => console.log(db.setPassword(name, pw) ? `  ✓ Password updated  Password: ${pw}` : `  ✗ User "${name}" not found`));
      } else {
        console.log('  ✗ Pick a number from 0 to 4');
      }
    }
  } finally {
    rl.close();
  }
}

// ---------------- reset ----------------
program
  .command('reset')
  .description('Delete ALL local data (database, WhatsApp sessions, keys, settings) and start fresh')
  .option('-y, --yes', 'skip the confirmation')
  .action(async (opts) => {
    const c = cfg();
    if (!existsSync(c.dataDir)) return console.log('Nothing to reset.');
    console.log(`\n  This permanently deletes everything in ${c.dataDir}:`);
    console.log('  users, tokens, message log, Daily Report login/settings, WhatsApp sessions, config.');
    if (!opts.yes) {
      if (!process.stdin.isTTY) fail('Not interactive. Pass --yes to confirm.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ans = await new Promise<string>((res) => rl.question('\n  Type "reset" to confirm: ', res));
      rl.close();
      if (ans.trim() !== 'reset') return console.log('  Cancelled.');
    }
    const pid = readPid(c.pidPath);
    if (pid) {
      process.kill(pid, 'SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
    }
    rmSync(c.dataDir, { recursive: true, force: true });
    console.log(`  ✓ Removed ${c.dataDir}. Run "dailyreport init" to set up again.\n`);
  });

// ---------------- init ----------------
program
  .command('init')
  .description('First-time setup: create admin user + access token')
  .option('-u, --username <name>', 'admin username (asked interactively if omitted)')
  .option('-p, --password <password>', 'admin password (random if omitted)')
  .option('-P, --port <port>', 'web/API port (asked interactively if omitted)', (v) => Number(v))
  .option('-H, --host <host>', 'bind address: 0.0.0.0 (all interfaces) or 127.0.0.1 (this machine only)')
  .action(async (opts) => {
    const c = cfg();
    if (readSavedUsers(c.dbPath) > 0) {
      if (!process.stdin.isTTY) fail('Already initialized. Use "dailyreport config", "dailyreport user create" or "dailyreport token create".');
      await manageExisting(c);
      return;
    }
    const interactive = process.stdin.isTTY && opts.username === undefined && opts.password === undefined && opts.port === undefined && opts.host === undefined;
    let username: string = opts.username ?? 'admin';
    let password: string | undefined = opts.password;
    let port: number = opts.port ?? c.port;
    let host: string = opts.host ?? c.host;
    if (interactive) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
      console.log('\n  Daily Report setup (press Enter to accept the [default])\n');
      username = (await ask('  Admin username [admin]: ')).trim() || 'admin';
      password = (await ask('  Admin password [random]: ')).trim() || undefined;
      const p = (await ask(`  Web/API port [${c.port}]: `)).trim();
      if (p) port = Number(p);
      const h = (await ask(`  Allow access from other devices? (y = 0.0.0.0, n = 127.0.0.1 only) [${c.host === '127.0.0.1' ? 'n' : 'Y'}]: `)).trim().toLowerCase();
      if (h) host = h.startsWith('y') ? '0.0.0.0' : '127.0.0.1';
      rl.close();
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Port must be a number between 1 and 65535');
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(username)) fail('Username: letters, numbers, . _ - (max 64)');
    withDb((db) => {
      if (db.countUsers() > 0) fail('Already initialized. Use "dailyreport user create" or "dailyreport token create".');
      const pw = password || randomBytes(9).toString('base64url');
      const user = db.createUser(username, pw, 'admin');
      const { token } = db.createToken(user.id, 'cli');
      saveCliToken(c.cliTokenPath, token);
      saveConfig(c.dataDir, { port, host });
      console.log('\n  Admin created (shown once, store it safely)');
      console.log(`  Username : ${user.username}`);
      console.log(`  Password : ${pw}`);
      console.log(`  Token    : ${token}`);
      console.log(`\n  CLI token saved to ${c.cliTokenPath}`);
      console.log(`  Port     : ${port}  Host: ${host} (saved to ${c.dataDir}/config.json, override with --port/--host)`);
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
    const c0 = cfg();
    const url = parent.optsWithGlobals().url || process.env.DAILYREPORT_URL || `http://localhost:${c0.port}`;
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
