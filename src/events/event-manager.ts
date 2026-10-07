import EventEmitter from 'eventemitter3';
import {
  WacapEventType,
  EventHandler,
  WacapEventData,
  ConnectionEventData,
  MessageEventData,
  GroupParticipantEventData,
  PresenceEventData,
} from '../types';

/**
 * Event manager for handling WhatsApp events
 * Provides a simple interface for webhook integration
 */
export class EventManager {
  private emitter: EventEmitter;
  private sessionId: string;

  constructor(sessionId: string) {
    this.emitter = new EventEmitter();
    this.sessionId = sessionId;
  }

  /**
   * Register an event handler
   */
  on(event: WacapEventType, handler: EventHandler): void {
    this.emitter.on(event, handler);
  }

  /**
   * Register a one-time event handler
   */
  once(event: WacapEventType, handler: EventHandler): void {
    this.emitter.once(event, handler);
  }

  /**
   * Remove an event handler
   */
  off(event: WacapEventType, handler: EventHandler): void {
    this.emitter.off(event, handler);
  }

  /**
   * Remove all event handlers
   */
  removeAllListeners(event?: WacapEventType): void {
    this.emitter.removeAllListeners(event);
  }

  /**
   * Emit an event
   */
  emit(event: WacapEventType, data: WacapEventData): void {
    this.emitter.emit(event, data);
  }

  /**
   * Convenience method: Listen for connection updates
   */
  onConnectionUpdate(handler: EventHandler<ConnectionEventData>): void {
    this.on(WacapEventType.CONNECTION_UPDATE, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for connection open
   */
  onConnectionOpen(handler: EventHandler<ConnectionEventData>): void {
    this.on(WacapEventType.CONNECTION_OPEN, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for connection close
   */
  onConnectionClose(handler: EventHandler<ConnectionEventData>): void {
    this.on(WacapEventType.CONNECTION_CLOSE, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for QR code
   */
  onQRCode(handler: EventHandler<ConnectionEventData>): void {
    this.on(WacapEventType.QR_CODE, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for received messages
   */
  onMessageReceived(handler: EventHandler<MessageEventData>): void {
    this.on(WacapEventType.MESSAGE_RECEIVED, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for sent messages
   */
  onMessageSent(handler: EventHandler<MessageEventData>): void {
    this.on(WacapEventType.MESSAGE_SENT, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for message updates
   */
  onMessageUpdate(handler: EventHandler<MessageEventData>): void {
    this.on(WacapEventType.MESSAGE_UPDATE, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for group participant updates
   */
  onGroupParticipantsUpdate(handler: EventHandler<GroupParticipantEventData>): void {
    this.on(WacapEventType.GROUP_PARTICIPANTS_UPDATE, handler as EventHandler);
  }

  /**
   * Convenience method: Listen for presence updates
   */
  onPresenceUpdate(handler: EventHandler<PresenceEventData>): void {
    this.on(WacapEventType.PRESENCE_UPDATE, handler as EventHandler);
  }

  /**
   * Get the underlying EventEmitter for advanced usage
   */
  getEmitter(): EventEmitter {
    return this.emitter;
  }
}
