import EventEmitter from 'eventemitter3';
import { WacapEventType, WacapEventData, EventHandler } from '../types';

/**
 * Global EventBus for broadcasting events across all sessions.
 * Allows consumers to subscribe once to e.g. QR codes from any session.
 */
export class EventBus {
  private emitter: EventEmitter = new EventEmitter();

  on(event: WacapEventType, handler: EventHandler): void {
    this.emitter.on(event, handler);
  }

  once(event: WacapEventType, handler: EventHandler): void {
    this.emitter.once(event, handler);
  }

  off(event: WacapEventType, handler: EventHandler): void {
    this.emitter.off(event, handler);
  }

  emit(event: WacapEventType, data: WacapEventData): void {
    this.emitter.emit(event, data);
  }

  removeAll(event?: WacapEventType): void {
    this.emitter.removeAllListeners(event);
  }
}
