import { homedir } from 'os';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

export interface AppConfig {
  dataDir: string;
  dbPath: string;
  sessionsPath: string;
  cliTokenPath: string;
  pidPath: string;
  logPath: string;
  webDir: string;
  port: number;
  host: string;
}

/** Settings chosen during `dailyreport init`, stored in <dataDir>/config.json. */
export function readSavedConfig(dataDir: string): { port?: number; host?: string } {
  try {
    const f = join(dataDir, 'config.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  } catch {
    return {};
  }
}

export function saveConfig(dataDir: string, patch: { port?: number; host?: string }) {
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ ...readSavedConfig(dataDir), ...patch }, null, 2) + '\n');
}

export function resolveConfig(overrides: Partial<{ dataDir: string; port: number; host: string }> = {}): AppConfig {
  const dataDir = resolve(overrides.dataDir || process.env.DAILYREPORT_HOME || join(homedir(), '.dailyreport'));
  mkdirSync(dataDir, { recursive: true });

  return {
    dataDir,
    dbPath: join(dataDir, 'app.db'),
    sessionsPath: join(dataDir, 'sessions'),
    cliTokenPath: join(dataDir, 'cli-token'),
    pidPath: join(dataDir, 'server.pid'),
    logPath: join(dataDir, 'server.log'),
    // dist/cli.js -> ../web/dist  (also works from source: api/ -> ../web/dist)
    webDir: resolve(__dirname, '..', 'web', 'dist'),
    port: overrides.port ?? (Number(process.env.DAILYREPORT_PORT || process.env.PORT) || readSavedConfig(dataDir).port || 3000),
    host: overrides.host ?? (process.env.DAILYREPORT_HOST || readSavedConfig(dataDir).host || '0.0.0.0'), // not $HOST: shells set it to the machine name
  };
}
