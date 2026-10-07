import type { AnyMessageContent } from '@whiskeysockets/baileys';
import { SessionRegistry } from '../core/session-registry';
import { MessageOptions } from '../types';
import { Session } from '../core/session';

type MediaPayload = {
  url?: string;
  buffer?: Buffer;
  mimetype?: string;
  caption?: string;
  fileName?: string;
};

/**
 * Format nomor telepon atau group ID ke JID WhatsApp
 * 
 * Sangat fleksibel - menerima berbagai format input:
 * 
 * PHONE NUMBERS:
 * - '08123456789' -> '628123456789@s.whatsapp.net'
 * - '628123456789' -> '628123456789@s.whatsapp.net'
 * - '+62 812-3456-789' -> '628123456789@s.whatsapp.net'
 * - '628123456789@s.whatsapp.net' -> unchanged
 * 
 * GROUPS:
 * - '123456789-1234567890' -> '123456789-1234567890@g.us' (auto-detect)
 * - '120363xxx@g.us' -> unchanged
 * - formatJid('123456789', true) -> '123456789@g.us'
 * 
 * LINKED ID (LID):
 * - '188630735790116@lid' -> unchanged
 * - '188630735790116' with isLid=true -> '188630735790116@lid'
 * 
 * BROADCAST:
 * - 'status@broadcast' -> unchanged
 * 
 * @param input - Nomor telepon, group ID, LID, atau JID lengkap
 * @param isGroup - Force sebagai group (default: auto-detect)
 * @param isLid - Force sebagai LID (default: false)
 * @returns JID yang sudah diformat
 */
export function formatJid(input: string, isGroup?: boolean, isLid?: boolean): string {
  if (!input) {
    throw new Error('JID/nomor tidak boleh kosong');
  }

  // Trim whitespace
  let cleaned = input.trim();

  // === PRIORITY 1: Already has WhatsApp suffix - return as-is ===
  if (cleaned.endsWith('@s.whatsapp.net')) return cleaned;
  if (cleaned.endsWith('@g.us')) return cleaned;
  if (cleaned.endsWith('@lid')) return cleaned;
  if (cleaned.endsWith('@broadcast')) return cleaned;

  // === PRIORITY 2: Explicit type specified ===
  
  // Force as LID
  if (isLid === true) {
    // Remove any non-digit characters for LID
    const lidId = cleaned.replace(/\D/g, '');
    return `${lidId}@lid`;
  }

  // Force as group
  if (isGroup === true) {
    return `${cleaned}@g.us`;
  }

  // === PRIORITY 3: Auto-detect by pattern ===

  // Auto-detect group: contains '-' in middle (format: 123456789-1234567890)
  if (/^\d+-\d+$/.test(cleaned)) {
    return `${cleaned}@g.us`;
  }

  // Auto-detect group: very long number (18+ digits) that starts with 120363
  // Group IDs typically start with 120363
  if (/^120363\d{12,}$/.test(cleaned)) {
    return `${cleaned}@g.us`;
  }

  // === PRIORITY 4: Format as phone number ===
  
  // Remove all non-digit characters
  cleaned = cleaned.replace(/\D/g, '');

  // Handle format Indonesia
  if (cleaned.startsWith('0')) {
    // 08xxx -> 628xxx
    cleaned = '62' + cleaned.substring(1);
  } else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13) {
    // 8xxx -> 628xxx (asumsi Indonesia jika 9-13 digit dimulai dengan 8)
    cleaned = '62' + cleaned;
  }

  // Validate phone number length (10-15 digits per E.164)
  if (cleaned.length < 10 || cleaned.length > 15) {
    // If it's a very long number (15+ digits) and not a valid phone, 
    // it might be a LID or group ID - return as-is with @s.whatsapp.net
    // The API will handle the error if it's invalid
    console.warn(`[formatJid] Unusual number length: ${cleaned.length} digits`);
  }

  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Smart format JID - tries to determine the best format automatically
 * Use this when you're not sure what type of JID you have
 */
export function smartFormatJid(input: string): string {
  if (!input) {
    throw new Error('JID/nomor tidak boleh kosong');
  }

  const cleaned = input.trim();

  // Already formatted
  if (cleaned.includes('@')) {
    return cleaned;
  }

  // Contains hyphen - likely group
  if (cleaned.includes('-')) {
    return formatJid(cleaned, true);
  }

  // Very long number starting with 120363 - likely group
  if (/^120363\d{12,}$/.test(cleaned)) {
    return formatJid(cleaned, true);
  }

  // 15-18 digit number not starting with country code - might be LID
  // But we can't be sure, so format as phone and let API handle it
  
  // Default: format as phone number
  return formatJid(cleaned);
}

/**
 * Format array of JIDs
 */
export function formatJids(inputs: string[], isGroup?: boolean, isLid?: boolean): string[] {
  return inputs.map(input => formatJid(input, isGroup, isLid));
}

/**
 * Resolve a session from registry or throw descriptive error.
 */
export function getSessionOrThrow(registry: SessionRegistry, sessionId: string): Session {
  const session = registry.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }
  return session;
}

/**
 * Resolve socket from session or throw.
 */
export function getSocketOrThrow(session: Session): any {
  const socket = session.getSocket();
  if (!socket) {
    throw new Error(`Session ${session.getInfo().sessionId} is not connected`);
  }
  return socket;
}

/**
 * Send text via registry
 * @param jid - Nomor telepon atau JID (akan di-format otomatis)
 */
export async function sendText(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  text: string,
  options?: Partial<MessageOptions>
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);
  
  // Auto-format JID
  const formattedJid = formatJid(jid);

  const message: AnyMessageContent = { text };

  if (options?.quoted) {
    return socket.sendMessage(formattedJid, message, { quoted: options.quoted });
  }

  if (options?.mentions) {
    // Format mentions juga
    const formattedMentions = formatJids(options.mentions);
    return socket.sendMessage(formattedJid, { text, mentions: formattedMentions });
  }

  return socket.sendMessage(formattedJid, message);
}

/**
 * Build media content block based on mimetype
 */
function buildMediaContent(media: MediaPayload): Record<string, any> {
  const content: Record<string, any> = {};
  const mimetype = media.mimetype || '';

  if (mimetype.startsWith('image/')) {
    content.image = media.url ? { url: media.url } : media.buffer;
    content.mimetype = mimetype;
    if (media.caption) content.caption = media.caption;
  } else if (mimetype.startsWith('video/')) {
    content.video = media.url ? { url: media.url } : media.buffer;
    content.mimetype = mimetype;
    if (media.caption) content.caption = media.caption;
  } else if (mimetype.startsWith('audio/')) {
    content.audio = media.url ? { url: media.url } : media.buffer;
    content.mimetype = mimetype;
  } else {
    content.document = media.url ? { url: media.url } : media.buffer;
    content.mimetype = mimetype;
    if (media.fileName) content.fileName = media.fileName;
    if (media.caption) content.caption = media.caption;
  }

  return content;
}

/**
 * Send media via registry
 * @param jid - Nomor telepon atau JID (akan di-format otomatis)
 */
export async function sendMedia(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  media: MediaPayload
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);
  
  // Auto-format JID
  const formattedJid = formatJid(jid);
  
  const content = buildMediaContent(media);
  return socket.sendMessage(formattedJid, content);
}

/**
 * Create a new WhatsApp group
 * @param participantJids - Array nomor telepon atau JID (akan di-format otomatis)
 */
export async function createGroup(
  registry: SessionRegistry,
  sessionId: string,
  subject: string,
  participantJids: string[]
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);
  
  // Auto-format participant JIDs
  const formattedParticipants = formatJids(participantJids);
  
  return socket.groupCreate(subject, formattedParticipants);
}

type GroupAction = 'add' | 'remove' | 'promote' | 'demote';

/**
 * Update participants of an existing group
 * @param groupJid - Group ID atau JID (akan di-format otomatis)
 * @param participantJids - Array nomor telepon atau JID (akan di-format otomatis)
 */
export async function updateGroupParticipants(
  registry: SessionRegistry,
  sessionId: string,
  groupJid: string,
  participantJids: string[],
  action: GroupAction
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);
  
  // Auto-format JIDs
  const formattedGroupJid = formatJid(groupJid, true);
  const formattedParticipants = formatJids(participantJids);
  
  return socket.groupParticipantsUpdate(formattedGroupJid, formattedParticipants, action);
}


// ============================================================
// FITUR TAMBAHAN (WAHA-like features)
// ============================================================

/**
 * Check if a phone number is registered on WhatsApp
 */
export async function checkNumberStatus(
  registry: SessionRegistry,
  sessionId: string,
  phoneNumber: string
): Promise<{ exists: boolean; jid: string }> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(phoneNumber);
  const [result] = await socket.onWhatsApp(formattedJid.replace('@s.whatsapp.net', ''));

  return {
    exists: !!result?.exists,
    jid: result?.jid || formattedJid,
  };
}

/**
 * Check multiple numbers at once
 */
export async function checkNumbersStatus(
  registry: SessionRegistry,
  sessionId: string,
  phoneNumbers: string[]
): Promise<Array<{ number: string; exists: boolean; jid: string }>> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const numbers = phoneNumbers.map((n) => formatJid(n).replace('@s.whatsapp.net', ''));
  const results = await socket.onWhatsApp(...numbers);

  return phoneNumbers.map((number, index) => ({
    number,
    exists: !!results[index]?.exists,
    jid: results[index]?.jid || formatJid(number),
  }));
}

/**
 * Get profile picture URL
 */
export async function getProfilePicture(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  highRes: boolean = true
): Promise<string | null> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  try {
    const url = await socket.profilePictureUrl(formattedJid, highRes ? 'image' : 'preview');
    return url || null;
  } catch {
    return null;
  }
}

/**
 * Get contact info
 */
export async function getContactInfo(
  registry: SessionRegistry,
  sessionId: string,
  jid: string
): Promise<{
  jid: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  imgUrl?: string;
}> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  // Get status
  let status: string | undefined;
  try {
    const statusResult = await socket.fetchStatus(formattedJid);
    status = statusResult?.status;
  } catch {
    // Status not available
  }

  // Get profile picture
  let imgUrl: string | undefined;
  try {
    imgUrl = await socket.profilePictureUrl(formattedJid, 'image');
  } catch {
    // No profile picture
  }

  return {
    jid: formattedJid,
    status,
    imgUrl,
  };
}

/**
 * Send location message
 */
export async function sendLocation(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  latitude: number,
  longitude: number,
  options?: { name?: string; address?: string }
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  return socket.sendMessage(formattedJid, {
    location: {
      degreesLatitude: latitude,
      degreesLongitude: longitude,
      name: options?.name,
      address: options?.address,
    },
  });
}

/**
 * Send contact/vCard
 */
export async function sendContact(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  contact: { name: string; phone: string }
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${contact.name}
TEL;type=CELL;type=VOICE;waid=${contact.phone.replace(/\D/g, '')}:${contact.phone}
END:VCARD`;

  return socket.sendMessage(formattedJid, {
    contacts: {
      displayName: contact.name,
      contacts: [{ vcard }],
    },
  });
}

/**
 * Send multiple contacts
 */
export async function sendContacts(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  contacts: Array<{ name: string; phone: string }>
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  const vcards = contacts.map(
    (c) => `BEGIN:VCARD
VERSION:3.0
FN:${c.name}
TEL;type=CELL;type=VOICE;waid=${c.phone.replace(/\D/g, '')}:${c.phone}
END:VCARD`
  );

  return socket.sendMessage(formattedJid, {
    contacts: {
      displayName: contacts.length === 1 ? contacts[0].name : `${contacts.length} contacts`,
      contacts: vcards.map((vcard) => ({ vcard })),
    },
  });
}

/**
 * Send reaction to a message
 */
export async function sendReaction(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  messageId: string,
  emoji: string
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  return socket.sendMessage(formattedJid, {
    react: {
      text: emoji,
      key: {
        remoteJid: formattedJid,
        id: messageId,
      },
    },
  });
}

/**
 * Remove reaction from a message
 */
export async function removeReaction(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  messageId: string
): Promise<any> {
  return sendReaction(registry, sessionId, jid, messageId, '');
}

/**
 * Send poll
 */
export async function sendPoll(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  name: string,
  options: string[],
  selectableCount: number = 1
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  return socket.sendMessage(formattedJid, {
    poll: {
      name,
      values: options,
      selectableCount,
    },
  });
}

/**
 * Send button message (deprecated in WhatsApp, may not work)
 */
export async function sendButtons(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  text: string,
  buttons: Array<{ id: string; text: string }>,
  footer?: string
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  return socket.sendMessage(formattedJid, {
    text,
    footer,
    buttons: buttons.map((b) => ({
      buttonId: b.id,
      buttonText: { displayText: b.text },
      type: 1,
    })),
  });
}

/**
 * Send list message
 */
export async function sendList(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  title: string,
  text: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
  footer?: string
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  return socket.sendMessage(formattedJid, {
    text,
    footer,
    title,
    buttonText,
    sections,
  });
}

/**
 * Mark message as read
 */
export async function markAsRead(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  messageIds: string[]
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  await socket.readMessages(
    messageIds.map((id) => ({
      remoteJid: formattedJid,
      id,
    }))
  );
}

/**
 * Send presence update (typing, recording, online, offline)
 */
export async function sendPresence(
  registry: SessionRegistry,
  sessionId: string,
  jid: string | null,
  presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = jid ? formatJid(jid) : undefined;
  await socket.sendPresenceUpdate(presence, formattedJid);
}

/**
 * Get group metadata
 */
export async function getGroupInfo(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string
): Promise<{
  id: string;
  subject: string;
  description?: string;
  owner?: string;
  creation?: number;
  participants: Array<{
    id: string;
    admin?: 'admin' | 'superadmin';
  }>;
  announce?: boolean;
  restrict?: boolean;
}> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  const metadata = await socket.groupMetadata(formattedJid);

  return {
    id: metadata.id,
    subject: metadata.subject,
    description: metadata.desc,
    owner: metadata.owner,
    creation: metadata.creation,
    participants: metadata.participants.map((p: any) => ({
      id: p.id,
      admin: p.admin,
    })),
    announce: metadata.announce,
    restrict: metadata.restrict,
  };
}

/**
 * Update group subject (name)
 */
export async function updateGroupSubject(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string,
  subject: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  await socket.groupUpdateSubject(formattedJid, subject);
}

/**
 * Update group description
 */
export async function updateGroupDescription(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string,
  description: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  await socket.groupUpdateDescription(formattedJid, description);
}

/**
 * Update group settings
 */
export async function updateGroupSettings(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string,
  setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  await socket.groupSettingUpdate(formattedJid, setting);
}

/**
 * Leave a group
 */
export async function leaveGroup(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  await socket.groupLeave(formattedJid);
}

/**
 * Get group invite code
 */
export async function getGroupInviteCode(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string
): Promise<string> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  return socket.groupInviteCode(formattedJid);
}

/**
 * Revoke group invite code
 */
export async function revokeGroupInviteCode(
  registry: SessionRegistry,
  sessionId: string,
  groupId: string
): Promise<string> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(groupId, true);
  return socket.groupRevokeInvite(formattedJid);
}

/**
 * Join group via invite code
 */
export async function joinGroupViaCode(
  registry: SessionRegistry,
  sessionId: string,
  inviteCode: string
): Promise<string> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  // Remove URL prefix if present
  const code = inviteCode.replace('https://chat.whatsapp.com/', '');
  return socket.groupAcceptInvite(code);
}

/**
 * Block a contact
 */
export async function blockContact(
  registry: SessionRegistry,
  sessionId: string,
  jid: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  await socket.updateBlockStatus(formattedJid, 'block');
}

/**
 * Unblock a contact
 */
export async function unblockContact(
  registry: SessionRegistry,
  sessionId: string,
  jid: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  await socket.updateBlockStatus(formattedJid, 'unblock');
}

/**
 * Update profile status
 */
export async function updateProfileStatus(
  registry: SessionRegistry,
  sessionId: string,
  status: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  await socket.updateProfileStatus(status);
}

/**
 * Update profile name
 */
export async function updateProfileName(
  registry: SessionRegistry,
  sessionId: string,
  name: string
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  await socket.updateProfileName(name);
}

/**
 * Get all chats
 */
export async function getChats(
  registry: SessionRegistry,
  sessionId: string
): Promise<any[]> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  // Baileys stores chats in memory after sync
  const store = (socket as any).store;
  if (store?.chats) {
    return Array.from(store.chats.all());
  }
  return [];
}

/**
 * Archive a chat
 */
export async function archiveChat(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  archive: boolean = true
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  await socket.chatModify({ archive }, formattedJid);
}

/**
 * Mute a chat
 */
export async function muteChat(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  muteEndTime: number | null
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  await socket.chatModify({ mute: muteEndTime }, formattedJid);
}

/**
 * Pin a chat
 */
export async function pinChat(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  pin: boolean = true
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  await socket.chatModify({ pin }, formattedJid);
}

/**
 * Star a message
 */
export async function starMessage(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  messageId: string,
  star: boolean = true
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);
  await socket.chatModify(
    {
      star: {
        messages: [{ id: messageId, fromMe: false }],
        star,
      },
    },
    formattedJid
  );
}

/**
 * Delete message for me
 */
export async function deleteMessage(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  messageId: string,
  forEveryone: boolean = false
): Promise<void> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  if (forEveryone) {
    await socket.sendMessage(formattedJid, {
      delete: {
        remoteJid: formattedJid,
        id: messageId,
        participant: undefined,
      },
    });
  } else {
    await socket.chatModify(
      {
        clear: { messages: [{ id: messageId, fromMe: false, timestamp: Date.now() }] },
      },
      formattedJid
    );
  }
}

/**
 * Forward a message
 */
export async function forwardMessage(
  registry: SessionRegistry,
  sessionId: string,
  jid: string,
  message: any,
  forceForward: boolean = false
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  return socket.sendMessage(formattedJid, {
    forward: message,
    force: forceForward,
  });
}

/**
 * Get business profile
 */
export async function getBusinessProfile(
  registry: SessionRegistry,
  sessionId: string,
  jid: string
): Promise<any> {
  const session = getSessionOrThrow(registry, sessionId);
  const socket = getSocketOrThrow(session);

  const formattedJid = formatJid(jid);

  try {
    return await socket.getBusinessProfile(formattedJid);
  } catch {
    return null;
  }
}