import {
  WacapConfig,
  SessionConfig,
  SessionInfo,
  MessageOptions,
  IStorageAdapter,
  WacapEventType,
  EventHandler,
} from '../types';
import { Session } from './session';
import { SessionRegistry } from './session-registry';
import { EventBus } from '../events/event-bus';
import { SQLiteStorageAdapter, PrismaStorageAdapter } from '../storage';
import type { WASocket } from '@whiskeysockets/baileys';
import { promises as fs } from 'fs';
import {
  sendText,
  sendMedia,
  createGroup,
  updateGroupParticipants,
  getSessionOrThrow,
  // New features
  checkNumberStatus,
  checkNumbersStatus,
  getProfilePicture,
  getContactInfo,
  sendLocation,
  sendContact,
  sendContacts,
  sendReaction,
  removeReaction,
  sendPoll,
  sendButtons,
  sendList,
  markAsRead,
  sendPresence,
  getGroupInfo,
  updateGroupSubject,
  updateGroupDescription,
  updateGroupSettings,
  leaveGroup,
  getGroupInviteCode,
  revokeGroupInviteCode,
  joinGroupViaCode,
  blockContact,
  unblockContact,
  updateProfileStatus,
  updateProfileName,
  archiveChat,
  muteChat,
  pinChat,
  starMessage,
  deleteMessage,
  forwardMessage,
  getBusinessProfile,
} from '../handlers/wrapper.helpers';

/**
 * Main wrapper class for managing multiple WhatsApp sessions
 */
export class WacapWrapper {
  private config: WacapConfig;
  private registry: SessionRegistry;
  private storageAdapter: IStorageAdapter;
  private globalBus: EventBus;
  public send: {
    text: (
      sessionId: string,
      jid: string,
      text: string,
      options?: Partial<MessageOptions>
    ) => Promise<any>;
    media: (
      sessionId: string,
      jid: string,
      media: {
        url?: string;
        buffer?: Buffer;
        mimetype?: string;
        caption?: string;
        fileName?: string;
      }
    ) => Promise<any>;
    location: (
      sessionId: string,
      jid: string,
      latitude: number,
      longitude: number,
      options?: { name?: string; address?: string }
    ) => Promise<any>;
    contact: (
      sessionId: string,
      jid: string,
      contact: { name: string; phone: string }
    ) => Promise<any>;
    contacts: (
      sessionId: string,
      jid: string,
      contacts: Array<{ name: string; phone: string }>
    ) => Promise<any>;
    reaction: (
      sessionId: string,
      jid: string,
      messageId: string,
      emoji: string
    ) => Promise<any>;
    poll: (
      sessionId: string,
      jid: string,
      name: string,
      options: string[],
      selectableCount?: number
    ) => Promise<any>;
    buttons: (
      sessionId: string,
      jid: string,
      text: string,
      buttons: Array<{ id: string; text: string }>,
      footer?: string
    ) => Promise<any>;
    list: (
      sessionId: string,
      jid: string,
      title: string,
      text: string,
      buttonText: string,
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>,
      footer?: string
    ) => Promise<any>;
  };
  public groups: {
    create: (sessionId: string, subject: string, participants: string[]) => Promise<any>;
    addParticipants: (sessionId: string, groupId: string, participants: string[]) => Promise<any>;
    removeParticipants: (sessionId: string, groupId: string, participants: string[]) => Promise<any>;
    promoteParticipants: (sessionId: string, groupId: string, participants: string[]) => Promise<any>;
    demoteParticipants: (sessionId: string, groupId: string, participants: string[]) => Promise<any>;
    getInfo: (sessionId: string, groupId: string) => Promise<any>;
    updateSubject: (sessionId: string, groupId: string, subject: string) => Promise<void>;
    updateDescription: (sessionId: string, groupId: string, description: string) => Promise<void>;
    updateSettings: (sessionId: string, groupId: string, setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked') => Promise<void>;
    leave: (sessionId: string, groupId: string) => Promise<void>;
    getInviteCode: (sessionId: string, groupId: string) => Promise<string>;
    revokeInviteCode: (sessionId: string, groupId: string) => Promise<string>;
    joinViaCode: (sessionId: string, inviteCode: string) => Promise<string>;
  };
  public contacts: {
    check: (sessionId: string, phoneNumber: string) => Promise<{ exists: boolean; jid: string }>;
    checkMultiple: (sessionId: string, phoneNumbers: string[]) => Promise<Array<{ number: string; exists: boolean; jid: string }>>;
    getProfilePicture: (sessionId: string, jid: string, highRes?: boolean) => Promise<string | null>;
    getInfo: (sessionId: string, jid: string) => Promise<any>;
    block: (sessionId: string, jid: string) => Promise<void>;
    unblock: (sessionId: string, jid: string) => Promise<void>;
    getBusinessProfile: (sessionId: string, jid: string) => Promise<any>;
  };
  public chat: {
    markAsRead: (sessionId: string, jid: string, messageIds: string[]) => Promise<void>;
    archive: (sessionId: string, jid: string, archive?: boolean) => Promise<void>;
    mute: (sessionId: string, jid: string, muteEndTime: number | null) => Promise<void>;
    pin: (sessionId: string, jid: string, pin?: boolean) => Promise<void>;
    deleteMessage: (sessionId: string, jid: string, messageId: string, forEveryone?: boolean) => Promise<void>;
    starMessage: (sessionId: string, jid: string, messageId: string, star?: boolean) => Promise<void>;
    forwardMessage: (sessionId: string, jid: string, message: any, forceForward?: boolean) => Promise<any>;
  };
  public profile: {
    updateStatus: (sessionId: string, status: string) => Promise<void>;
    updateName: (sessionId: string, name: string) => Promise<void>;
  };
  public presence: {
    update: (sessionId: string, jid: string | null, presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused') => Promise<void>;
  };
  public sessions: {
    start: (sessionId: string, customConfig?: Partial<WacapConfig>) => Promise<Session>;
    stop: (sessionId: string) => Promise<void>;
    stopAll: () => Promise<void>;
    restartAll: () => Promise<Session[]>;
    startAll: () => Promise<string[]>;
    startByIds: (ids: string[], customConfig?: Partial<WacapConfig>) => Promise<Session[]>;
    list: () => string[];
    info: (sessionId: string) => SessionInfo | null;
    get: (sessionId: string) => Session | undefined;
  };

  constructor(config: WacapConfig = {}) {
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

    // Initialize storage adapter
    if (this.config.storageAdapter === 'prisma') {
      if (!this.config.prismaClient) {
        throw new Error(
          'Prisma storage adapter requires prismaClient to be provided in config'
        );
      }
      this.storageAdapter = new PrismaStorageAdapter(this.config.prismaClient);
    } else {
      this.storageAdapter = new SQLiteStorageAdapter(this.config.sessionsPath);
    }

    this.globalBus = new EventBus();
    this.registry = new SessionRegistry(this.config, this.storageAdapter, this.globalBus);

    // High-level helper APIs for ergonomics
    this.send = {
      text: this.sendMessage.bind(this),
      media: this.sendMedia.bind(this),
      location: (sessionId, jid, latitude, longitude, options) =>
        sendLocation(this.registry, sessionId, jid, latitude, longitude, options),
      contact: (sessionId, jid, contact) =>
        sendContact(this.registry, sessionId, jid, contact),
      contacts: (sessionId, jid, contacts) =>
        sendContacts(this.registry, sessionId, jid, contacts),
      reaction: (sessionId, jid, messageId, emoji) =>
        sendReaction(this.registry, sessionId, jid, messageId, emoji),
      poll: (sessionId, jid, name, options, selectableCount = 1) =>
        sendPoll(this.registry, sessionId, jid, name, options, selectableCount),
      buttons: (sessionId, jid, text, buttons, footer) =>
        sendButtons(this.registry, sessionId, jid, text, buttons, footer),
      list: (sessionId, jid, title, text, buttonText, sections, footer) =>
        sendList(this.registry, sessionId, jid, title, text, buttonText, sections, footer),
    };

    this.sessions = {
      start: this.sessionStart.bind(this),
      stop: this.sessionStop.bind(this),
      stopAll: this.stopAllSessions.bind(this),
      restartAll: this.restartAllSessions.bind(this),
      startAll: this.startAllSessions.bind(this),
      startByIds: this.startByIds.bind(this),
      list: this.getSessionIds.bind(this),
      info: this.getSessionInfo.bind(this),
      get: this.findSession.bind(this),
    };

    this.groups = {
      create: (sessionId, subject, participants) =>
        createGroup(this.registry, sessionId, subject, participants),
      addParticipants: (sessionId, groupId, participants) =>
        updateGroupParticipants(this.registry, sessionId, groupId, participants, 'add'),
      removeParticipants: (sessionId, groupId, participants) =>
        updateGroupParticipants(this.registry, sessionId, groupId, participants, 'remove'),
      promoteParticipants: (sessionId, groupId, participants) =>
        updateGroupParticipants(this.registry, sessionId, groupId, participants, 'promote'),
      demoteParticipants: (sessionId, groupId, participants) =>
        updateGroupParticipants(this.registry, sessionId, groupId, participants, 'demote'),
      getInfo: (sessionId, groupId) =>
        getGroupInfo(this.registry, sessionId, groupId),
      updateSubject: (sessionId, groupId, subject) =>
        updateGroupSubject(this.registry, sessionId, groupId, subject),
      updateDescription: (sessionId, groupId, description) =>
        updateGroupDescription(this.registry, sessionId, groupId, description),
      updateSettings: (sessionId, groupId, setting) =>
        updateGroupSettings(this.registry, sessionId, groupId, setting),
      leave: (sessionId, groupId) =>
        leaveGroup(this.registry, sessionId, groupId),
      getInviteCode: (sessionId, groupId) =>
        getGroupInviteCode(this.registry, sessionId, groupId),
      revokeInviteCode: (sessionId, groupId) =>
        revokeGroupInviteCode(this.registry, sessionId, groupId),
      joinViaCode: (sessionId, inviteCode) =>
        joinGroupViaCode(this.registry, sessionId, inviteCode),
    };

    this.contacts = {
      check: (sessionId, phoneNumber) =>
        checkNumberStatus(this.registry, sessionId, phoneNumber),
      checkMultiple: (sessionId, phoneNumbers) =>
        checkNumbersStatus(this.registry, sessionId, phoneNumbers),
      getProfilePicture: (sessionId, jid, highRes = true) =>
        getProfilePicture(this.registry, sessionId, jid, highRes),
      getInfo: (sessionId, jid) =>
        getContactInfo(this.registry, sessionId, jid),
      block: (sessionId, jid) =>
        blockContact(this.registry, sessionId, jid),
      unblock: (sessionId, jid) =>
        unblockContact(this.registry, sessionId, jid),
      getBusinessProfile: (sessionId, jid) =>
        getBusinessProfile(this.registry, sessionId, jid),
    };

    this.chat = {
      markAsRead: (sessionId, jid, messageIds) =>
        markAsRead(this.registry, sessionId, jid, messageIds),
      archive: (sessionId, jid, archive = true) =>
        archiveChat(this.registry, sessionId, jid, archive),
      mute: (sessionId, jid, muteEndTime) =>
        muteChat(this.registry, sessionId, jid, muteEndTime),
      pin: (sessionId, jid, pin = true) =>
        pinChat(this.registry, sessionId, jid, pin),
      deleteMessage: (sessionId, jid, messageId, forEveryone = false) =>
        deleteMessage(this.registry, sessionId, jid, messageId, forEveryone),
      starMessage: (sessionId, jid, messageId, star = true) =>
        starMessage(this.registry, sessionId, jid, messageId, star),
      forwardMessage: (sessionId, jid, message, forceForward = false) =>
        forwardMessage(this.registry, sessionId, jid, message, forceForward),
    };

    this.profile = {
      updateStatus: (sessionId, status) =>
        updateProfileStatus(this.registry, sessionId, status),
      updateName: (sessionId, name) =>
        updateProfileName(this.registry, sessionId, name),
    };

    this.presence = {
      update: (sessionId, jid, presence) =>
        sendPresence(this.registry, sessionId, jid, presence),
    };
  }

  /**
   * Initialize the wrapper
   */
  async init(): Promise<void> {
    await this.storageAdapter.init();
  }

  /**
   * Load and start all sessions stored in persistent storage.
   * Useful for SaaS / warm-boot scenarios.
   */
  async loadAllStoredSessions(): Promise<string[]> {
    const sessionIds = await this.discoverStoredSessionIds();
    const started: string[] = [];

    for (const id of sessionIds) {
      if (this.registry.has(id)) continue;
      try {
        await this.sessionStart(id);
        started.push(id);
      } catch (error) {
        if (this.config.debug) {
          console.error(`[wacap] Failed to start stored session ${id}`, error);
        }
      }
    }

    return started;
  }

  /**
   * Start all sessions discovered in storage (alias for loadAllStoredSessions)
   */
  async startAllSessions(): Promise<string[]> {
    return this.loadAllStoredSessions();
  }

  /**
   * Start several sessions by id list
   */
  async startByIds(ids: string[], customConfig?: Partial<WacapConfig>): Promise<Session[]> {
    return this.registry.startByIds(ids, customConfig);
  }

  /**
   * Stop all active sessions
   */
  async stopAllSessions(): Promise<void> {
    await this.registry.shutdownAll();
  }

  /**
   * Restart all currently known sessions
   */
  async restartAllSessions(): Promise<Session[]> {
    return this.registry.restartAll();
  }

  private async discoverStoredSessionIds(): Promise<string[]> {
    if (typeof this.storageAdapter.listSessions === 'function') {
      try {
        const ids = await this.storageAdapter.listSessions();
        if (ids.length > 0) {
          return ids;
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn('[wacap] listSessions failed, falling back to filesystem scan', error);
        }
      }
    }

    try {
      const entries = await fs.readdir(this.config.sessionsPath || './sessions', {
        withFileTypes: true,
      });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      if (this.config.debug) {
        console.warn('[wacap] Unable to read sessions directory', error);
      }
      return [];
    }
  }

  /**
   * Start a new session or resume existing one
   */
  async sessionStart(sessionId: string, customConfig?: Partial<WacapConfig>): Promise<Session> {
    const session = await this.registry.create(sessionId, customConfig);
    return session;
  }

  /**
   * Stop a session
   */
  async sessionStop(sessionId: string): Promise<void> {
    await this.registry.destroy(sessionId);
  }

  /**
   * Find and return a session
   */
  findSession(sessionId: string): Session | undefined {
    return this.registry.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Map<string, Session> {
    return this.registry.all();
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return this.registry.listIds();
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    const session = this.registry.get(sessionId);
    return session ? session.getInfo() : null;
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.registry.has(sessionId);
  }

  /**
   * Delete session data from storage (logout from WhatsApp)
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Logout session if active (this will logout from WhatsApp)
    if (this.registry.has(sessionId)) {
      await this.registry.logout(sessionId);
    }

    // Delete from storage
    await this.storageAdapter.deleteSession(sessionId);
  }

  /**
   * Logout a session from WhatsApp (removes credentials, requires new QR scan)
   */
  async logoutSession(sessionId: string): Promise<void> {
    if (this.registry.has(sessionId)) {
      await this.registry.logout(sessionId);
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(
    sessionId: string,
    jid: string,
    text: string,
    options?: Partial<MessageOptions>
  ): Promise<any> {
    return sendText(this.registry, sessionId, jid, text, options);
  }

  /**
   * Send media (image, video, audio, document)
   */
  async sendMedia(
    sessionId: string,
    jid: string,
    media: {
      url?: string;
      buffer?: Buffer;
      mimetype?: string;
      caption?: string;
      fileName?: string;
    }
  ): Promise<any> {
    return sendMedia(this.registry, sessionId, jid, media);
  }

  /**
   * Register event handler for a session
   */
  on(sessionId: string, event: WacapEventType, handler: EventHandler): void {
    const session = this.registry.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.getEventManager().on(event, handler);
  }

  /**
   * Register one-time event handler for a session
   */
  once(sessionId: string, event: WacapEventType, handler: EventHandler): void {
    const session = this.registry.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.getEventManager().once(event, handler);
  }

  /**
   * Get raw socket for advanced usage
   */
  getSocket(sessionId: string): WASocket | null {
    const session = this.registry.get(sessionId);
    return session ? session.getSocket() : null;
  }

  /**
   * Listen to events from all sessions globally.
   */
  onGlobal(event: WacapEventType, handler: EventHandler): void {
    this.globalBus.on(event, handler);
  }

  onceGlobal(event: WacapEventType, handler: EventHandler): void {
    this.globalBus.once(event, handler);
  }

  /**
   * Cleanup all sessions and close storage
   */
  async destroy(): Promise<void> {
    // Stop all sessions
    await this.registry.shutdownAll();

    // Close storage
    await this.storageAdapter.close();
  }
}
