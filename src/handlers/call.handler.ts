import { WacapEventType } from '../types';
import { HandlerContext } from './index';

export function registerCallHandlers(ctx: HandlerContext): void {
  const { socket, emit, touchActivity } = ctx;

  socket.ev.on('call', async () => {
    touchActivity();
    emit(WacapEventType.CALL, {});
  });
}
