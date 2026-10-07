import { WacapEventType } from '../types';
import { HandlerContext } from './index';

export function registerGroupHandlers(ctx: HandlerContext): void {
  const { socket, emit, touchActivity } = ctx;

  socket.ev.on('groups.update', async () => {
    touchActivity();
    emit(WacapEventType.GROUP_UPDATE, {});
  });

  socket.ev.on('group-participants.update', async (update) => {
    touchActivity();
    emit(WacapEventType.GROUP_PARTICIPANTS_UPDATE, {
      groupId: update.id,
      participants: update.participants.map((p: any) =>
        typeof p === 'string' ? p : p.id
      ),
      action: update.action as any,
      author: update.author,
    });
  });
}
