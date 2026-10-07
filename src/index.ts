// Main exports
export { WacapWrapper } from './core/wacap-wrapper';
export { Session } from './core/session';

// Event management
export { EventManager } from './events/event-manager';
export { EventBus } from './events/event-bus';
export { SessionRegistry } from './core/session-registry';

// Storage adapters
export { SQLiteStorageAdapter, PrismaStorageAdapter } from './storage';

// Utilities
export { formatJid, formatJids, smartFormatJid } from './handlers/wrapper.helpers';

// Types
export * from './types';

// Re-export Baileys types for convenience
export type {
  WASocket,
  proto,
  Contact,
  GroupMetadata,
  WAMessage,
  ConnectionState,
  AnyMessageContent,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
