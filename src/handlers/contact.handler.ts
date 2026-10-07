import { WacapEventType } from '../types';
import { HandlerContext } from './index';

export function registerContactHandlers(ctx: HandlerContext): void {
  const { socket, storageAdapter, sessionId, emit, touchActivity } = ctx;

  socket.ev.on('contacts.update', async (updates) => {
    for (const contact of updates) {
      if (contact.id) {
        await storageAdapter.saveContact(sessionId, contact as any);
      }
    }

    touchActivity();
    emit(WacapEventType.CONTACT_UPDATE, {});
  });
}
