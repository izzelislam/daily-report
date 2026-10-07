import { WacapEventType } from '../types';
import { HandlerContext } from './index';

export function registerTypingHandlers(ctx: HandlerContext): void {
  const { socket, emit, touchActivity } = ctx;

  socket.ev.on('presence.update', async (update) => {
    touchActivity();
    emit(WacapEventType.PRESENCE_UPDATE, {
      jid: update.id,
      presences: update.presences as any,
    });
  });
}
