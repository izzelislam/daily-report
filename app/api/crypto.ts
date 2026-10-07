import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * AES-256-GCM encryption for secrets stored in SQLite (external platform password/token).
 * The key lives in <dataDir>/secret.key (mode 0600), so a leaked app.db alone is not enough.
 */
function loadKey(dataDir: string): Buffer {
  const path = join(dataDir, 'secret.key');
  if (existsSync(path)) return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex');
  const key = randomBytes(32);
  writeFileSync(path, key.toString('hex'), { mode: 0o600 });
  return key;
}

export class SecretBox {
  private key: Buffer;
  constructor(dataDir: string) {
    this.key = loadKey(dataDir);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string | null {
    try {
      const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
      const d = createDecipheriv('aes-256-gcm', this.key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
