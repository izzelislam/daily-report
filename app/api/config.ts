import { homedir } from 'os';
import { join, resolve } from 'path';
import { mkdirSync } from 'fs';

export interface AppConfig {
  dataDir: string;
  dbPath: string;
  sessionsPath: string;
  cliTokenPath: string;
  webDir: string;
  port: number;
  host: string;
}

export function resolveConfig(overrides: Partial<{ dataDir: string; port: number; host: string }> = {}): AppConfig {
  const dataDir = resolve(overrides.dataDir || process.env.DAILYREPORT_HOME || join(homedir(), '.dailyreport'));
  mkdirSync(dataDir, { recursive: true });

  return {
    dataDir,
    dbPath: join(dataDir, 'app.db'),
    sessionsPath: join(dataDir, 'sessions'),
    cliTokenPath: join(dataDir, 'cli-token'),
    // dist/cli.js -> ../web/dist  (also works from source: api/ -> ../web/dist)
    webDir: resolve(__dirname, '..', 'web', 'dist'),
    port: overrides.port ?? Number(process.env.PORT || 3000),
    host: overrides.host ?? (process.env.HOST || '0.0.0.0'),
  };
}
