import type {
  ConnectionState,
  WAMessage,
  WASocket,
  BaileysEventMap,
  Contact,
  GroupMetadata,
  PresenceData,
  proto,
} from '@whiskeysockets/baileys';

/**
 * QR Code format options
 */
export type QRFormat = 'terminal' | 'base64' | 'raw' | 'all';

/**
 * QR Code configuration
 */
export interface QRConfig {
  /** Format output QR: 'terminal' | 'base64' | 'raw' | 'all' (default: 'terminal') */
  format?: QRFormat;
  
  /** Width of QR image in pixels (for base64, default: 300) */
  width?: number;
  
  /** Margin around QR code (default: 2) */
  margin?: number;
  
  /** Dark color (default: '#000000') */
  darkColor?: string;
  
  /** Light color (default: '#ffffff') */
  lightColor?: string;
}

/**
 * Configuration options for the WhatsApp wrapper
 */
export interface WacapConfig {
  /** Base directory for storing session data */
  sessionsPath?: string;
  
  /** Storage adapter to use (sqlite or prisma) */
  storageAdapter?: 'sqlite' | 'prisma';
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Logger configuration */
  logger?: {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  };
  
  /** Custom Prisma client instance (only if storageAdapter is 'prisma') */
  prismaClient?: any;
  
  /** Automatically handle QR code display (deprecated, use qrCode.format instead) */
  autoDisplayQR?: boolean;
  
  /** QR Code configuration */
  qrCode?: QRConfig;
  
  /** Browser configuration */
  browser?: [string, string, string];
  
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  
  /** Max retry attempts for connection */
  maxRetries?: number;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Unique session identifier */
  sessionId: string;
  
  /** Custom session configuration */
  config?: Partial<WacapConfig>;
}

/**
 * High level session lifecycle status
 */
export type SessionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'error';

/**
 * Session information
 */
export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  
  /** High-level lifecycle status */
  status: SessionStatus;

  /** Whether session is currently connected */
  isActive: boolean;

  /** Connection state as reported by Baileys */
  connectionState?: ConnectionState;

  /** Phone number (if connected) */
  phoneNumber?: string;

  /** User name (if available) */
  userName?: string;

  /** Session start time */
  createdAt?: Date;

  /** Last activity time */
  lastSeenAt?: Date;

  /** Last transitioned at */
  updatedAt?: Date;

  /** Most recent error if present */
  error?: string;
}

/**
 * Message sending options
 */
export interface MessageOptions {
  /** Target JID (phone number or group ID) */
  jid: string;
  
  /** Message text */
  text?: string;
  
  /** Media attachment */
  media?: {
    url?: string;
    buffer?: Buffer;
    mimetype?: string;
    caption?: string;
    fileName?: string;
  };
  
  /** Reply to a message */
  quoted?: WAMessage;
  
  /** Mentions */
  mentions?: string[];
  
  /** Additional options */
  options?: any;
}

/**
 * Event types for webhook support
 */
export enum WacapEventType {
  // Connection events
  CONNECTION_UPDATE = 'connection.update',
  CONNECTION_OPEN = 'connection.open',
  CONNECTION_CLOSE = 'connection.close',
  QR_CODE = 'qr.code',
  
  // Message events
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENT = 'message.sent',
  MESSAGE_UPDATE = 'message.update',
  MESSAGE_DELETE = 'message.delete',
  
  // Chat events
  CHAT_UPDATE = 'chat.update',
  CHAT_DELETE = 'chat.delete',
  
  // Contact events
  CONTACT_UPDATE = 'contact.update',
  
  // Group events
  GROUP_UPDATE = 'group.update',
  GROUP_PARTICIPANTS_UPDATE = 'group.participants.update',
  
  // Presence events
  PRESENCE_UPDATE = 'presence.update',
  
  // Call events
  CALL = 'call',
  
  // Session events
  SESSION_START = 'session.start',
  SESSION_STOP = 'session.stop',
  SESSION_ERROR = 'session.error',
}

/**
 * Base event data
 */
export interface BaseEventData {
  sessionId: string;
  timestamp: Date;
}

/**
 * Connection event data
 */
export interface ConnectionEventData extends BaseEventData {
  state: ConnectionState;
  qr?: string;
  qrBase64?: string;
  error?: any;
}

/**
 * Message event data
 */
export interface MessageEventData extends BaseEventData {
  message: WAMessage;
  isFromMe?: boolean;
  messageType?: string;
  body?: string;
  from?: string;
  to?: string;
  /** JID to use for replying (handles LID conversion) */
  replyTo?: string;
  /** Extracted phone number if available */
  phoneNumber?: string | null;
  /** Whether the sender is using Linked ID */
  isLid?: boolean;
  /** Participant JID (for groups) */
  participant?: string | null;
}

/**
 * Group participant event data
 */
export interface GroupParticipantEventData extends BaseEventData {
  groupId: string;
  participants: string[];
  action: 'add' | 'remove' | 'promote' | 'demote';
  author?: string;
}

/**
 * Presence event data
 */
export interface PresenceEventData extends BaseEventData {
  jid: string;
  presences: PresenceData;
}

/**
 * Event data union type
 */
export type WacapEventData =
  | ConnectionEventData
  | MessageEventData
  | GroupParticipantEventData
  | PresenceEventData
  | BaseEventData;

/**
 * Event handler function type
 */
export type EventHandler<T = WacapEventData> = (data: T) => void | Promise<void>;

/**
 * Storage adapter interface
 */
export interface IStorageAdapter {
  /** Initialize the storage */
  init(): Promise<void>;
  
  /** Save session credentials */
  saveSession(sessionId: string, creds: any): Promise<void>;
  
  /** Load session credentials */
  loadSession(sessionId: string): Promise<any | null>;
  
  /** Delete session */
  deleteSession(sessionId: string): Promise<void>;
  
  /** Check if session exists */
  hasSession(sessionId: string): Promise<boolean>;
  
  /** Save message */
  saveMessage(sessionId: string, message: WAMessage): Promise<void>;
  
  /** Get messages */
  getMessages(sessionId: string, jid: string, limit?: number): Promise<WAMessage[]>;
  
  /** Save contact */
  saveContact(sessionId: string, contact: Contact): Promise<void>;
  
  /** Get contacts */
  getContacts(sessionId: string): Promise<Contact[]>;
  
  /** Save chat */
  saveChat(sessionId: string, chat: any): Promise<void>;
  
  /** Get chats */
  getChats(sessionId: string): Promise<any[]>;
  
  /** List known session ids (for automatic warmup) */
  listSessions?(): Promise<string[]>;

  /** Close/cleanup storage */
  close(): Promise<void>;
}

/**
 * WhatsApp socket wrapper
 */
export interface IWASocket extends WASocket {
  sessionId: string;
}
