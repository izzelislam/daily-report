import { SessionStatus, WacapConfig, IStorageAdapter, WacapEventType } from '../types';
import type { WASocket } from '@whiskeysockets/baileys';

export interface HandlerContext {
  sessionId: string;
  socket: WASocket & { sessionId: string };
  config: Required<WacapConfig>;
  storageAdapter: IStorageAdapter;
  emit: (event: WacapEventType, data: Record<string, any>) => void;
  touchActivity: () => void;
  updateStatus: (status: SessionStatus, error?: unknown) => void;
  handleReconnect: (error?: unknown) => Promise<void>;
  handleLoggedOut: (error?: unknown) => Promise<void>;
  resetRetry: () => void;
  setSocket: (socket: (WASocket & { sessionId: string }) | null) => void;
}

export {
  registerConnectionHandlers,
} from './connection.handler';
export { registerMessageHandlers } from './message.handler';
export { registerGroupHandlers } from './group.handler';
export { registerTypingHandlers } from './typing.handler';
export { registerContactHandlers } from './contact.handler';
export { registerProfileHandlers } from './profile.handler';
export { registerCallHandlers } from './call.handler';
