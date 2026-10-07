import { Session } from './session';
import { EventBus } from '../events/event-bus';
import { WacapConfig } from '../types';
import { IStorageAdapter } from '../types';

/**
 * Manages lifecycle of Session instances and ensures isolation.
 */
export class SessionRegistry {
  private sessions = new Map<string, Session>();

  constructor(
    private baseConfig: WacapConfig,
    private storageAdapter: IStorageAdapter,
    private globalBus: EventBus
  ) {}

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  listIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  all(): Map<string, Session> {
    return this.sessions;
  }

  async create(sessionId: string, override?: Partial<WacapConfig>): Promise<Session> {
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      if (existing.isActive()) {
        return existing;
      }
      // remove inactive session before recreating it
      this.sessions.delete(sessionId);
    }

    const merged: WacapConfig = { ...this.baseConfig, ...override };
    const session = new Session(sessionId, merged, this.storageAdapter, this.globalBus);
    this.sessions.set(sessionId, session);
    await session.start();
    return session;
  }

  async destroy(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    await s.stop();
    this.sessions.delete(sessionId);
  }

  /**
   * Logout and destroy a session (removes credentials)
   */
  async logout(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    await s.logout();
    this.sessions.delete(sessionId);
  }

  async shutdownAll(): Promise<void> {
    for (const [id, s] of this.sessions) {
      await s.stop();
    }
    this.sessions.clear();
  }

  async startByIds(sessionIds: string[], override?: Partial<WacapConfig>): Promise<Session[]> {
    const started: Session[] = [];
    for (const id of sessionIds) {
      const s = await this.create(id, override);
      started.push(s);
    }
    return started;
  }

  async restartAll(): Promise<Session[]> {
    const ids = this.listIds();
    await this.shutdownAll();
    return this.startByIds(ids);
  }
}
