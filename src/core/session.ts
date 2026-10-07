import makeWASocket, {
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
  delay,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import {
  WacapConfig,
  SessionInfo,
  WacapEventType,
  IStorageAdapter,
  IWASocket,
  SessionStatus,
} from '../types';
import { EventManager } from '../events';
import { EventBus } from '../events/event-bus';
import {
  registerConnectionHandlers,
  registerMessageHandlers,
  registerGroupHandlers,
  registerTypingHandlers,
  registerContactHandlers,
  registerProfileHandlers,
  registerCallHandlers,
} from '../handlers';

/**
 * WhatsApp session manager
 * Handles individual WhatsApp connections
 */
export class Session {
  private sessionId: string;
  private config: Required<WacapConfig>;
  private socket: (WASocket & { sessionId: string }) | null = null;
  private eventManager: EventManager;
  private storageAdapter: IStorageAdapter;
  private sessionPath: string;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private reconnecting: boolean = false;
  private retryCount: number = 0;
  private createdAt: Date = new Date();
  private startedAt: Date | undefined;
  private updatedAt: Date | undefined;
  private lastSeenAt: Date | undefined;
  private status: SessionStatus = 'disconnected';
  private lastError?: string;
  private globalBus: EventBus;
  private persistCreds?: () => Promise<void>;

  constructor(
    sessionId: string,
    config: WacapConfig,
    storageAdapter: IStorageAdapter,
    globalBus: EventBus
  ) {
    this.sessionId = sessionId;
    this.storageAdapter = storageAdapter;
    this.eventManager = new EventManager(sessionId);
    this.globalBus = globalBus;
    this.updatedAt = this.createdAt;
    
    // Set default config values
    this.config = {
      sessionsPath: config.sessionsPath || './sessions',
      storageAdapter: config.storageAdapter || 'sqlite',
      debug: config.debug || false,
      logger: config.logger || { level: 'warn' },
      prismaClient: config.prismaClient,
      autoDisplayQR: config.autoDisplayQR !== false,
      qrCode: config.qrCode || { format: 'terminal' },
      browser: config.browser || ['Wacap', 'Chrome', '1.0.0'],
      connectionTimeout: config.connectionTimeout || 60000,
      maxRetries: config.maxRetries || 5,
    };

    this.sessionPath = join(this.config.sessionsPath, this.sessionId);

    // Ensure session directory exists
    if (!existsSync(this.sessionPath)) {
      mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  /**
   * Start the WhatsApp session
   */
  async start(): Promise<void> {
    if (this.isConnecting || this.socket) {
      throw new Error(`Session ${this.sessionId} is already active or connecting`);
    }

    this.shouldReconnect = true;
    this.retryCount = 0;
    this.updateStatus('connecting');

    try {
      await this.connect();
    } catch (error) {
      this.updateStatus('error', error);
      throw error;
    }
  }

  /**
   * Connect to WhatsApp
   */
  private async connect(): Promise<void> {
    if (this.isConnecting || this.reconnecting) return;
    this.isConnecting = true;
    this.updateStatus('connecting');

    const logger = pino({
      level: this.config.logger.level,
    });

    // Load auth state
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      // Persist lightweight metadata to storage without double-serializing creds
      await this.storageAdapter.saveSession(this.sessionId, {
        updatedAt: Date.now(),
      });
      const persistCreds = async () => {
        await saveCreds();
        await this.storageAdapter.saveSession(this.sessionId, {
          updatedAt: Date.now(),
        });
      };
      this.persistCreds = persistCreds;

      // Get latest version
      const { version } = await fetchLatestBaileysVersion();

      // Create socket
      this.socket = makeWASocket({
        version,
        logger,
        printQRInTerminal: false, // We handle QR display ourselves
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: this.config.browser,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        shouldIgnoreJid: (jid) => jid === 'status@broadcast',
      }) as WASocket & { sessionId: string };

      this.socket.sessionId = this.sessionId;

      // Setup event handlers
      this.setupEventHandlers();

      this.startedAt = this.startedAt || new Date();
      this.touchActivity();
      this.emitBoth(WacapEventType.SESSION_START, {
        sessionId: this.sessionId,
        timestamp: this.startedAt,
      });
    } catch (error) {
      this.updateStatus('error', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Setup event handlers for the socket
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    const ctx = {
      sessionId: this.sessionId,
      socket: this.socket,
      config: this.config,
      storageAdapter: this.storageAdapter,
      emit: (event: WacapEventType, data: Record<string, any>) => this.emitBoth(event, data),
      touchActivity: () => this.touchActivity(),
      updateStatus: (status: SessionStatus, error?: unknown) => this.updateStatus(status, error),
      handleReconnect: (error?: unknown) => this.handleReconnect(error),
      handleLoggedOut: (error?: unknown) => this.handleLoggedOut(error),
      resetRetry: () => {
        this.retryCount = 0;
      },
      setSocket: (socket: (WASocket & { sessionId: string }) | null) => {
        this.socket = socket;
      },
    };

    registerConnectionHandlers(ctx, this.persistCreds || (async () => {}));
    registerMessageHandlers(ctx);
    registerGroupHandlers(ctx);
    registerTypingHandlers(ctx);
    registerContactHandlers(ctx);
    registerProfileHandlers();
    registerCallHandlers(ctx);
  }

  /**
   * Update session status & last error message
   */
  private updateStatus(status: SessionStatus, error?: unknown): void {
    this.status = status;
    this.updatedAt = new Date();
    this.lastError = error
      ? error instanceof Error
        ? error.message
        : String(error)
      : undefined;
  }

  /**
   * Track activity timestamps
   */
  private touchActivity(): void {
    const now = new Date();
    this.lastSeenAt = now;
    this.updatedAt = now;
  }

  /**
   * Handle reconnect attempts with retry budget
   */
  private async handleReconnect(error?: unknown): Promise<void> {
    if (!this.shouldReconnect || this.reconnecting) return;
    this.reconnecting = true;

    if (this.retryCount < this.config.maxRetries) {
      this.retryCount++;
      const backoffMs = Math.min(30000, 2000 * Math.pow(2, this.retryCount - 1));
      console.log(
        `[${this.sessionId}] Reconnecting... (Attempt ${this.retryCount}/${this.config.maxRetries}) in ${backoffMs}ms`
      );

      await delay(backoffMs);
      this.cleanupSocketListeners();
      this.socket = null;
      this.reconnecting = false;
      await this.connect();
    } else {
      console.error(`[${this.sessionId}] Max retry attempts reached. Stopping session.`);
      this.reconnecting = false;
      this.updateStatus('error', error);
      this.emitBoth(WacapEventType.SESSION_ERROR, {
        error: new Error('Max retry attempts reached'),
      });
    }
  }

  /**
   * Handle logged out / corrupted creds by resetting auth state
   */
  private async handleLoggedOut(error?: unknown): Promise<void> {
    this.updateStatus('disconnected', error);
    this.retryCount = 0;
    this.cleanupSocketListeners();
    this.socket = null;
    this.resetAuthState();

    if (!this.shouldReconnect) return;

    console.log(`[${this.sessionId}] Session logged out. Resetting auth and waiting for new QR.`);
    this.emitBoth(WacapEventType.SESSION_ERROR, {
      error: error || new Error('Logged out'),
    });

    await delay(1000);
    await this.connect();
  }

  /**
   * Wipes existing auth files to force a fresh QR
   */
  private resetAuthState(): void {
    try {
      rmSync(this.sessionPath, { recursive: true, force: true });
      mkdirSync(this.sessionPath, { recursive: true });
    } catch (err) {
      console.error(`[${this.sessionId}] Failed to reset auth state`, err);
    }
  }

  /**
   * Stop the session without logging out (preserves credentials)
   * Use this for server restart/shutdown
   */
  async stop(): Promise<void> {
    this.shouldReconnect = false;
    this.retryCount = 0;

    if (this.socket) {
      this.cleanupSocketListeners();
      // Hanya disconnect, TIDAK logout - credentials tetap tersimpan
      this.socket.end(undefined);
      this.socket = null;
    }

    this.updateStatus('disconnected');

    this.emitBoth(WacapEventType.SESSION_STOP, {
      sessionId: this.sessionId,
      timestamp: new Date(),
    });
  }

  /**
   * Logout and stop the session (removes credentials)
   * Use this to completely remove a session
   */
  async logout(): Promise<void> {
    this.shouldReconnect = false;
    this.retryCount = 0;

    if (this.socket) {
      this.cleanupSocketListeners();
      try {
        await this.socket.logout();
      } catch (err) {
        // Ignore logout errors
      }
      this.socket = null;
    }

    this.updateStatus('disconnected');

    this.emitBoth(WacapEventType.SESSION_STOP, {
      sessionId: this.sessionId,
      timestamp: new Date(),
    });
  }

  /**
   * Get session info
   */
  getInfo(): SessionInfo {
    const connectionState = this.socket?.user
      ? { connection: 'open' as const }
      : { connection: 'close' as const };

    return {
      sessionId: this.sessionId,
      status: this.status,
      isActive: !!this.socket,
      connectionState: connectionState as any,
      phoneNumber: this.socket?.user?.id?.split(':')[0],
      userName: this.socket?.user?.name,
      createdAt: this.createdAt,
      lastSeenAt: this.lastSeenAt,
      updatedAt: this.updatedAt,
      error: this.lastError,
    };
  }

  /**
   * Get event manager for registering event handlers
   */
  getEventManager(): EventManager {
    return this.eventManager;
  }

  /**
   * Get the socket instance
   */
  getSocket(): IWASocket | null {
    return this.socket;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return !!this.socket;
  }

  /**
   * Emit to local event manager and global bus
   */
  private emitBoth(event: WacapEventType, data: any): void {
    const base = {
      sessionId: this.sessionId,
      timestamp: data?.timestamp || new Date(),
    };

    const payload = { ...base, ...data };
    this.eventManager.emit(event, payload);
    this.globalBus.emit(event, payload);
  }

  /**
   * Clean up event listeners on the current socket to avoid leaks
   */
  private cleanupSocketListeners(): void {
    if (this.socket) {
      try {
        // Baileys event emitter allows removing all listeners without args
        (this.socket.ev as any).removeAllListeners();
      } catch (err) {
        if (this.config.debug) {
          console.warn(`[${this.sessionId}] Failed cleanup listeners`, err);
        }
      }
    }
  }
}
