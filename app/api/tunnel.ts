import { ChildProcess, spawn, spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type TunnelState = 'stopped' | 'starting' | 'running' | 'error';

export interface TunnelStatus {
  installed: boolean;
  state: TunnelState;
  url: string | null;
  mode: 'quick' | 'named' | null;
  error: string | null;
  startedAt: number | null;
}

const NOT_FOUND = 'cloudflared not found. Install: brew install cloudflared';

export function isCloudflaredInstalled(): boolean {
  return spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).status === 0;
}

/**
 * Manages one Cloudflare tunnel process for the whole server (shared by CLI flag and web UI).
 * - no token  -> quick tunnel (random https://*.trycloudflare.com URL, no account needed)
 * - with token -> named tunnel (your own stable domain configured in Cloudflare dashboard)
 */
export class TunnelManager {
  private child: ChildProcess | null = null;
  private s: Omit<TunnelStatus, 'installed'> = { state: 'stopped', url: null, mode: null, error: null, startedAt: null };

  status(): TunnelStatus {
    return { installed: isCloudflaredInstalled(), ...this.s };
  }

  async start(port: number, token?: string): Promise<TunnelStatus> {
    if (this.child) return this.status(); // already starting/running
    if (!isCloudflaredInstalled()) {
      this.s = { state: 'error', url: null, mode: null, error: NOT_FOUND, startedAt: null };
      throw new Error(NOT_FOUND);
    }

    let args: string[];
    if (token) {
      args = ['tunnel', '--no-autoupdate', 'run', '--token', token];
    } else {
      // A quick tunnel must ignore ~/.cloudflared/config.yml: a configured named tunnel there
      // would hijack our ingress and every request would return 404.
      const emptyConfig = join(mkdtempSync(join(tmpdir(), 'dr-cf-')), 'config.yml');
      writeFileSync(emptyConfig, '');
      args = ['tunnel', '--no-autoupdate', '--config', emptyConfig, '--url', `http://127.0.0.1:${port}`];
    }

    const child = spawn('cloudflared', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    this.s = { state: 'starting', url: null, mode: token ? 'named' : 'quick', error: null, startedAt: null };

    return new Promise<TunnelStatus>((resolve, reject) => {
      const timer = setTimeout(() => fail('Tunnel did not become ready in 30s'), 30_000);
      const ready = (url: string) => {
        clearTimeout(timer);
        this.s = { ...this.s, state: 'running', url, startedAt: Date.now() };
        resolve(this.status());
      };
      const fail = (msg: string) => {
        clearTimeout(timer);
        if (this.child === child) this.child = null;
        child.kill('SIGTERM');
        this.s = { state: 'error', url: null, mode: this.s.mode, error: msg, startedAt: null };
        reject(new Error(msg));
      };

      const onData = (buf: Buffer) => {
        const text = buf.toString();
        const quick = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (quick && this.s.state === 'starting') ready(quick[0]);
        else if (token && this.s.state === 'starting' && /Registered tunnel connection/i.test(text))
          ready('(named tunnel connected — open your Cloudflare hostname)');
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData); // cloudflared logs to stderr
      child.once('error', (e: NodeJS.ErrnoException) => fail(e.code === 'ENOENT' ? NOT_FOUND : e.message));
      child.once('exit', (code) => {
        const wasActive = this.child === child;
        if (wasActive) this.child = null;
        if (this.s.state === 'starting') return fail(`cloudflared exited (code ${code})`);
        if (wasActive) this.s = { state: 'stopped', url: null, mode: null, error: null, startedAt: null };
      });
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.s = { state: 'stopped', url: null, mode: null, error: null, startedAt: null };
    child?.kill('SIGTERM');
  }
}
