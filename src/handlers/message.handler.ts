import { WacapEventType } from '../types';
import { HandlerContext } from './index';

/**
 * Extract the best JID to use for replying to a message
 * Handles LID (Linked ID) by trying to get the actual phone number
 */
function getReplyJid(message: any): { from: string; replyTo: string; phoneNumber: string | null } {
  const remoteJid = message.key.remoteJid || '';
  const participant = message.key.participant || null;
  
  // Default values
  let from = remoteJid;
  let replyTo = remoteJid;
  let phoneNumber: string | null = null;

  // Check if it's a LID (Linked ID)
  const isLid = remoteJid.endsWith('@lid');
  
  // Check if it's a group
  const isGroup = remoteJid.endsWith('@g.us');

  if (isLid) {
    // For LID messages, try to find the actual phone number
    // Option 1: Check if there's a participant field (sometimes contains phone)
    if (participant && !participant.endsWith('@lid')) {
      replyTo = participant;
    }
    // Option 2: Check verifiedBizName or other fields in message
    // Option 3: Use the LID as-is (some WhatsApp versions support sending to LID)
    
    // Extract phone from replyTo if it's a valid phone JID
    if (replyTo.endsWith('@s.whatsapp.net')) {
      phoneNumber = replyTo.replace('@s.whatsapp.net', '');
    }
  } else if (isGroup) {
    // For groups, from is the group JID, participant is the sender
    replyTo = remoteJid; // Reply to group
    if (participant) {
      // Extract phone from participant
      if (participant.endsWith('@s.whatsapp.net')) {
        phoneNumber = participant.replace('@s.whatsapp.net', '');
      } else if (participant.endsWith('@lid')) {
        // Participant is also LID, can't extract phone
        phoneNumber = null;
      }
    }
  } else if (remoteJid.endsWith('@s.whatsapp.net')) {
    // Regular user message
    phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
    replyTo = remoteJid;
  }

  return { from, replyTo, phoneNumber };
}

export function registerMessageHandlers(ctx: HandlerContext): void {
  const { socket, storageAdapter, sessionId, emit, touchActivity } = ctx;

  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      touchActivity();
      await storageAdapter.saveMessage(sessionId, message);

      // Get reply information with LID handling
      const { from, replyTo, phoneNumber } = getReplyJid(message);

      const eventData = {
        message,
        isFromMe: message.key.fromMe,
        messageType: Object.keys(message.message || {})[0],
        body: getMessageBody(message),
        from,
        // New fields for proper reply handling
        replyTo,
        phoneNumber,
        isLid: from.endsWith('@lid'),
        participant: message.key.participant || null,
      };

      if (message.key.fromMe) {
        emit(WacapEventType.MESSAGE_SENT, eventData);
      } else {
        emit(WacapEventType.MESSAGE_RECEIVED, eventData);
      }
    }
  });

  socket.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      touchActivity();
      emit(WacapEventType.MESSAGE_UPDATE, {
        message: update as any,
      });
    }
  });

  socket.ev.on('messages.delete', async () => {
    touchActivity();
    emit(WacapEventType.MESSAGE_DELETE, {});
  });

  socket.ev.on('chats.upsert', async (chats) => {
    for (const chat of chats) {
      await storageAdapter.saveChat(sessionId, chat);
    }
    touchActivity();
    emit(WacapEventType.CHAT_UPDATE, {});
  });
}

function getMessageBody(message: any): string | undefined {
  const messageContent = message.message;
  if (!messageContent) return undefined;

  return (
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentMessage?.caption ||
    messageContent.buttonsResponseMessage?.selectedButtonId ||
    messageContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
    messageContent.templateButtonReplyMessage?.selectedId ||
    messageContent.interactiveResponseMessage?.body?.text ||
    messageContent.editedMessage?.message?.protocolMessage?.editedMessage?.conversation ||
    messageContent.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text ||
    undefined
  );
}
