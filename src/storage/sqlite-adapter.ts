import Database from 'better-sqlite3';
import { IStorageAdapter } from '../types';
import type { WAMessage, Contact } from '@whiskeysockets/baileys';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * SQLite storage adapter for session data
 */
export class SQLiteStorageAdapter implements IStorageAdapter {
  private db: Database.Database;
  private dbPath: string;

  constructor(baseDir: string = './sessions') {
    // Ensure sessions directory exists
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }

    this.dbPath = join(baseDir, 'wacap.db');
    this.db = new Database(this.dbPath);
  }

  async init(): Promise<void> {
    // Enable WAL mode to reduce corruption risk when accessed concurrently
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        creds TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        from_me INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `);

    // Create contacts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        name TEXT,
        notify TEXT,
        data TEXT NOT NULL,
        UNIQUE(session_id, jid),
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `);

    // Create chats table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(session_id, jid),
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_jid ON messages(session_id, jid);
      CREATE INDEX IF NOT EXISTS idx_contacts_session ON contacts(session_id);
      CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id);
    `);
  }

  async saveSession(sessionId: string, creds: any): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_id, creds, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        creds = excluded.creds,
        updated_at = excluded.updated_at
    `);

    stmt.run(sessionId, JSON.stringify(creds), now, now);
  }

  async loadSession(sessionId: string): Promise<any | null> {
    const stmt = this.db.prepare(`
      SELECT creds FROM sessions WHERE session_id = ?
    `);

    const row = stmt.get(sessionId) as { creds: string } | undefined;
    return row ? JSON.parse(row.creds) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE session_id = ?
    `);

    stmt.run(sessionId);
  }

  async hasSession(sessionId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM sessions WHERE session_id = ? LIMIT 1
    `);

    return stmt.get(sessionId) !== undefined;
  }

  async saveMessage(sessionId: string, message: WAMessage): Promise<void> {
    this.ensureSessionExists(sessionId);

    const messageId = String(message.key.id || "");
    const jid = String(message.key.remoteJid || "");

    // Convert timestamp Long → Number
    const rawTs = message.messageTimestamp;
    const timestamp =
        typeof rawTs === "object" && rawTs?.toNumber
        ? rawTs.toNumber()
        : Number(rawTs) || Date.now();

    const fromMe = message.key.fromMe ? 1 : 0;

    const stmt = this.db.prepare(`
        INSERT INTO messages (id, session_id, jid, message, timestamp, from_me)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
        message = excluded.message,
        timestamp = excluded.timestamp
    `);

    stmt.run(
        messageId,
        sessionId,
        jid,
        JSON.stringify(message),
        timestamp,
        fromMe
    );
    }

  async getMessages(
    sessionId: string,
    jid: string,
    limit: number = 50
  ): Promise<WAMessage[]> {
    const stmt = this.db.prepare(`
      SELECT message FROM messages
      WHERE session_id = ? AND jid = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(sessionId, jid, limit) as { message: string }[];
    return rows.map(row => JSON.parse(row.message));
  }

  async saveContact(sessionId: string, contact: Contact): Promise<void> {
    this.ensureSessionExists(sessionId);

    const stmt = this.db.prepare(`
      INSERT INTO contacts (id, session_id, jid, name, notify, data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, jid) DO UPDATE SET
        name = excluded.name,
        notify = excluded.notify,
        data = excluded.data
    `);

    const id = `${sessionId}:${contact.id}`;
    stmt.run(
      id,
      sessionId,
      contact.id,
      contact.name || null,
      contact.notify || null,
      JSON.stringify(contact)
    );
  }

  async getContacts(sessionId: string): Promise<Contact[]> {
    const stmt = this.db.prepare(`
      SELECT data FROM contacts WHERE session_id = ?
    `);

    const rows = stmt.all(sessionId) as { data: string }[];
    return rows.map(row => JSON.parse(row.data));
  }

  async saveChat(sessionId: string, chat: any): Promise<void> {
    this.ensureSessionExists(sessionId);

    const jid = chat.id;
    const timestamp = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO chats (id, session_id, jid, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, jid) DO UPDATE SET
        data = excluded.data,
        timestamp = excluded.timestamp
    `);

    const id = `${sessionId}:${jid}`;
    stmt.run(id, sessionId, jid, JSON.stringify(chat), timestamp);
  }

  async getChats(sessionId: string): Promise<any[]> {
    const stmt = this.db.prepare(`
      SELECT data FROM chats WHERE session_id = ? ORDER BY timestamp DESC
    `);

    const rows = stmt.all(sessionId) as { data: string }[];
    return rows.map(row => JSON.parse(row.data));
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async listSessions(): Promise<string[]> {
    const stmt = this.db.prepare(`SELECT session_id FROM sessions`);
    const rows = stmt.all() as { session_id: string }[];
    return rows.map(r => r.session_id);
  }

  /**
   * Ensure session record exists before saving related data
   */
  private ensureSessionExists(sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (session_id, creds, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    const now = Date.now();
    stmt.run(sessionId, '{}', now, now);
  }

  /**
   * Get database instance for advanced usage
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}
