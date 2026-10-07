# Wacap Wrapper API Documentation

Comprehensive TypeScript wrapper for Baileys WhatsApp Web API with multi-session support.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [WacapWrapper Class](#wacapwrapper-class)
- [Session Management](#session-management)
- [Sending Messages](#sending-messages)
- [Contact Management](#contact-management)
- [Chat Management](#chat-management)
- [Group Management](#group-management)
- [Profile Management](#profile-management)
- [Presence Management](#presence-management)
- [Event Handling](#event-handling)
- [QR Code Configuration](#qr-code-configuration)
- [Storage Adapters](#storage-adapters)
- [Types Reference](#types-reference)

---

## Installation

```bash
npm install @pakor/wacap-wrapper
```

## Quick Start

```typescript
import { WacapWrapper, WacapEventType } from '@pakor/wacap-wrapper';

const wacap = new WacapWrapper({
  sessionsPath: './sessions',
  qrCode: { format: 'terminal' }
});

await wacap.init();
const session = await wacap.sessions.start('my-session');

session.getEventManager().onMessageReceived((data) => {
  console.log('Message:', data.body);
});
```

---

## Configuration

### WacapConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sessionsPath` | `string` | `'./sessions'` | Directory for session data |
| `storageAdapter` | `'sqlite' \| 'prisma'` | `'sqlite'` | Storage backend |
| `debug` | `boolean` | `false` | Enable debug logging |
| `logger` | `{ level: LogLevel }` | `{ level: 'warn' }` | Logger configuration |
| `prismaClient` | `PrismaClient` | - | Prisma client (required if using prisma adapter) |
| `autoDisplayQR` | `boolean` | `true` | Auto display QR in terminal (deprecated, use qrCode) |
| `qrCode` | `QRConfig` | `{ format: 'terminal' }` | QR code configuration |
| `browser` | `[string, string, string]` | `['Wacap', 'Chrome', '1.0.0']` | Browser identity |
| `connectionTimeout` | `number` | `60000` | Connection timeout (ms) |
| `maxRetries` | `number` | `5` | Max reconnection attempts |

### QRConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `format` | `'terminal' \| 'base64' \| 'raw' \| 'all'` | `'terminal'` | QR output format |
| `width` | `number` | `300` | QR image width (for base64) |
| `margin` | `number` | `2` | QR margin |
| `darkColor` | `string` | `'#000000'` | Dark color |
| `lightColor` | `string` | `'#ffffff'` | Light color |

---

## WacapWrapper Class

### Constructor

```typescript
const wacap = new WacapWrapper(config?: WacapConfig);
```

### Methods

#### `init(): Promise<void>`
Initialize the wrapper and storage adapter.

```typescript
await wacap.init();
```

#### `destroy(): Promise<void>`
Cleanup all sessions and close storage.

```typescript
await wacap.destroy();
```

---

## Session Management

### Stop vs Logout

| Method | Behavior | Use Case |
|--------|----------|----------|
| `stop()` | Disconnect tanpa logout, credentials tersimpan | Server restart, maintenance |
| `logout()` | Logout dari WhatsApp, perlu scan QR lagi | User minta logout |
| `delete()` | Logout + hapus semua data | Hapus session permanen |

### Using Helper API (Recommended)

```typescript
// Start session
const session = await wacap.sessions.start('session-id');

// Stop session (TANPA LOGOUT - credentials tetap tersimpan)
// Saat server restart, session bisa langsung connect tanpa scan QR
await wacap.sessions.stop('session-id');

// Stop all sessions (TANPA LOGOUT)
await wacap.sessions.stopAll();

// Restart all sessions
const sessions = await wacap.sessions.restartAll();

// Start all stored sessions (auto-connect tanpa QR jika credentials valid)
const ids = await wacap.sessions.startAll();

// Start multiple sessions by IDs
const sessions = await wacap.sessions.startByIds(['id1', 'id2', 'id3']);

// List session IDs
const ids = wacap.sessions.list();

// Get session info
const info = wacap.sessions.info('session-id');

// Get session instance
const session = wacap.sessions.get('session-id');
```

### Using Direct Methods

```typescript
// Start session
const session = await wacap.sessionStart('session-id');

// Stop session (TANPA LOGOUT)
await wacap.sessionStop('session-id');

// Logout session (HAPUS CREDENTIALS - perlu scan QR lagi)
await wacap.logoutSession('session-id');

// Delete session (LOGOUT + HAPUS DATA)
await wacap.deleteSession('session-id');

// Find session
const session = wacap.findSession('session-id');

// Get all sessions
const sessions = wacap.getAllSessions(); // Map<string, Session>

// Get session IDs
const ids = wacap.getSessionIds();

// Get session info
const info = wacap.getSessionInfo('session-id');

// Check if session exists
const exists = wacap.hasSession('session-id');

// Delete session (removes all data)
await wacap.deleteSession('session-id');

// Load all stored sessions
const ids = await wacap.loadAllStoredSessions();
```

### SessionInfo Object

```typescript
interface SessionInfo {
  sessionId: string;
  status: 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error';
  isActive: boolean;
  connectionState?: ConnectionState;
  phoneNumber?: string;
  userName?: string;
  createdAt?: Date;
  lastSeenAt?: Date;
  updatedAt?: Date;
  error?: string;
}
```

---

## Sending Messages

### Using Helper API (Recommended)

```typescript
// Send text message (nomor akan di-format otomatis)
await wacap.send.text('session-id', '08123456789', 'Hello!');

// Send text with mentions
await wacap.send.text('session-id', '123456789-1234567890', 'Hello @user!', {
  mentions: ['08123456789']  // Auto-format juga
});

// Send media (image, video, audio, document)
await wacap.send.media('session-id', '08123456789', {
  url: 'https://example.com/image.jpg',
  mimetype: 'image/jpeg',
  caption: 'Check this out!'
});

// Send document
await wacap.send.media('session-id', '08123456789', {
  url: 'https://example.com/doc.pdf',
  mimetype: 'application/pdf',
  fileName: 'document.pdf',
  caption: 'Here is the document'
});

// Send from buffer
await wacap.send.media('session-id', '08123456789', {
  buffer: imageBuffer,
  mimetype: 'image/png',
  caption: 'Image from buffer'
});
```

### Using Direct Methods

```typescript
await wacap.sendMessage('session-id', '08123456789', 'Hello!');
await wacap.sendMedia('session-id', '08123456789', { ... });
```

### Phone Number Format (Auto-format)

Package akan otomatis memformat nomor telepon ke JID WhatsApp:

| Input | Output |
|-------|--------|
| `08123456789` | `628123456789@s.whatsapp.net` |
| `628123456789` | `628123456789@s.whatsapp.net` |
| `+62 812-3456-789` | `628123456789@s.whatsapp.net` |
| `8123456789` | `628123456789@s.whatsapp.net` |
| `123456789-1234567890` | `123456789-1234567890@g.us` (group auto-detect) |

```typescript
// Semua format ini valid:
await wacap.send.text('session', '08123456789', 'Hello!');
await wacap.send.text('session', '628123456789', 'Hello!');
await wacap.send.text('session', '+62 812-3456-789', 'Hello!');

// Untuk group, gunakan group ID
await wacap.send.text('session', '123456789-1234567890', 'Hello group!');
```

### Manual JID Formatting

Jika perlu format manual, gunakan helper `formatJid`:

```typescript
import { formatJid, formatJids } from '@pakor/wacap-wrapper';

formatJid('08123456789');           // '628123456789@s.whatsapp.net'
formatJid('123456789-123', true);   // '123456789-123@g.us' (force group)
formatJids(['08123', '08456']);     // ['62123@s.whatsapp.net', '62456@s.whatsapp.net']
```

### Send Location

```typescript
await wacap.send.location('session-id', '08123456789', -6.2088, 106.8456, {
  name: 'Monas',
  address: 'Jakarta, Indonesia'
});
```

### Send Contact

```typescript
// Single contact
await wacap.send.contact('session-id', '08123456789', {
  name: 'John Doe',
  phone: '+628123456789'
});

// Multiple contacts
await wacap.send.contacts('session-id', '08123456789', [
  { name: 'John Doe', phone: '+628123456789' },
  { name: 'Jane Doe', phone: '+628987654321' }
]);
```

### Send Reaction

```typescript
// Add reaction
await wacap.send.reaction('session-id', '08123456789', 'MESSAGE_ID', '👍');

// Remove reaction
await wacap.send.reaction('session-id', '08123456789', 'MESSAGE_ID', '');
```

### Send Poll

```typescript
await wacap.send.poll('session-id', '08123456789', 'What is your favorite color?', [
  'Red',
  'Blue',
  'Green',
  'Yellow'
], 1); // selectableCount: 1 = single choice
```

### Send Buttons (Deprecated)

```typescript
await wacap.send.buttons('session-id', '08123456789', 'Choose an option:', [
  { id: 'btn1', text: 'Option 1' },
  { id: 'btn2', text: 'Option 2' }
], 'Footer text');
```

### Send List

```typescript
await wacap.send.list('session-id', '08123456789', 'Menu', 'Please select:', 'View Options', [
  {
    title: 'Section 1',
    rows: [
      { id: 'row1', title: 'Item 1', description: 'Description 1' },
      { id: 'row2', title: 'Item 2', description: 'Description 2' }
    ]
  }
], 'Footer');
```

---

## Contact Management

```typescript
// Check if number is on WhatsApp
const result = await wacap.contacts.check('session-id', '08123456789');
console.log(result); // { exists: true, jid: '628123456789@s.whatsapp.net' }

// Check multiple numbers
const results = await wacap.contacts.checkMultiple('session-id', ['08123456789', '08987654321']);
// [{ number: '08123456789', exists: true, jid: '...' }, ...]

// Get profile picture
const ppUrl = await wacap.contacts.getProfilePicture('session-id', '08123456789');

// Get contact info
const info = await wacap.contacts.getInfo('session-id', '08123456789');

// Block contact
await wacap.contacts.block('session-id', '08123456789');

// Unblock contact
await wacap.contacts.unblock('session-id', '08123456789');

// Get business profile
const business = await wacap.contacts.getBusinessProfile('session-id', '08123456789');
```

---

## Chat Management

```typescript
// Mark messages as read
await wacap.chat.markAsRead('session-id', '08123456789', ['MSG_ID_1', 'MSG_ID_2']);

// Archive chat
await wacap.chat.archive('session-id', '08123456789', true);

// Unarchive chat
await wacap.chat.archive('session-id', '08123456789', false);

// Mute chat (timestamp in ms, null to unmute)
await wacap.chat.mute('session-id', '08123456789', Date.now() + 86400000); // 24 hours
await wacap.chat.mute('session-id', '08123456789', null); // Unmute

// Pin chat
await wacap.chat.pin('session-id', '08123456789', true);

// Unpin chat
await wacap.chat.pin('session-id', '08123456789', false);

// Star message
await wacap.chat.starMessage('session-id', '08123456789', 'MSG_ID', true);

// Unstar message
await wacap.chat.starMessage('session-id', '08123456789', 'MSG_ID', false);

// Delete message (for me)
await wacap.chat.deleteMessage('session-id', '08123456789', 'MSG_ID', false);

// Delete message (for everyone)
await wacap.chat.deleteMessage('session-id', '08123456789', 'MSG_ID', true);

// Forward message
await wacap.chat.forwardMessage('session-id', '08987654321', messageObject);
```

---

## Group Management

```typescript
// Create group (nomor akan di-format otomatis)
const group = await wacap.groups.create('session-id', 'Group Name', [
  '08123456789',
  '08987654321'
]);

// Add participants
await wacap.groups.addParticipants('session-id', '123456789-1234567890', [
  '08123456789'
]);

// Remove participants
await wacap.groups.removeParticipants('session-id', '123456789-1234567890', [
  '08123456789'
]);

// Promote to admin
await wacap.groups.promoteParticipants('session-id', '123456789-1234567890', [
  '08123456789'
]);

// Demote from admin
await wacap.groups.demoteParticipants('session-id', '123456789-1234567890', [
  '08123456789'
]);

// Get group info
const groupInfo = await wacap.groups.getInfo('session-id', '123456789-1234567890');
console.log(groupInfo);
// { id, subject, description, owner, creation, participants, announce, restrict }

// Update group name
await wacap.groups.updateSubject('session-id', '123456789-1234567890', 'New Group Name');

// Update group description
await wacap.groups.updateDescription('session-id', '123456789-1234567890', 'New description');

// Update group settings
await wacap.groups.updateSettings('session-id', '123456789-1234567890', 'announcement'); // Only admins can send
await wacap.groups.updateSettings('session-id', '123456789-1234567890', 'not_announcement'); // Everyone can send
await wacap.groups.updateSettings('session-id', '123456789-1234567890', 'locked'); // Only admins can edit info
await wacap.groups.updateSettings('session-id', '123456789-1234567890', 'unlocked'); // Everyone can edit info

// Get invite code
const inviteCode = await wacap.groups.getInviteCode('session-id', '123456789-1234567890');
console.log(`https://chat.whatsapp.com/${inviteCode}`);

// Revoke invite code
const newCode = await wacap.groups.revokeInviteCode('session-id', '123456789-1234567890');

// Join group via invite code
const groupId = await wacap.groups.joinViaCode('session-id', 'INVITE_CODE');
// or with full URL
const groupId2 = await wacap.groups.joinViaCode('session-id', 'https://chat.whatsapp.com/INVITE_CODE');

// Leave group
await wacap.groups.leave('session-id', '123456789-1234567890');
```

---

## Profile Management

```typescript
// Update profile status
await wacap.profile.updateStatus('session-id', '🤖 Bot is online!');

// Update profile name
await wacap.profile.updateName('session-id', 'My Bot Name');
```

---

## Presence Management

```typescript
// Set online status
await wacap.presence.update('session-id', null, 'available');

// Set offline status
await wacap.presence.update('session-id', null, 'unavailable');

// Show typing indicator
await wacap.presence.update('session-id', '08123456789', 'composing');

// Show recording indicator
await wacap.presence.update('session-id', '08123456789', 'recording');

// Stop typing/recording indicator
await wacap.presence.update('session-id', '08123456789', 'paused');
```

---

## Event Handling

### Per-Session Events

```typescript
const session = await wacap.sessions.start('my-session');
const events = session.getEventManager();

// QR Code
events.onQRCode((data) => {
  console.log('QR:', data.qr);
  console.log('QR Base64:', data.qrBase64); // If format is 'base64' or 'all'
});

// Connection events
events.onConnectionUpdate((data) => console.log('State:', data.state));
events.onConnectionOpen((data) => console.log('Connected!'));
events.onConnectionClose((data) => console.log('Disconnected'));

// Message events
events.onMessageReceived((data) => {
  console.log('From:', data.from);
  console.log('Body:', data.body);
  console.log('Type:', data.messageType);
});
events.onMessageSent((data) => console.log('Sent to:', data.to));
events.onMessageUpdate((data) => console.log('Updated'));

// Group events
events.onGroupParticipantsUpdate((data) => {
  console.log('Group:', data.groupId);
  console.log('Action:', data.action); // 'add' | 'remove' | 'promote' | 'demote'
  console.log('Participants:', data.participants);
});

// Presence events
events.onPresenceUpdate((data) => console.log('Presence:', data.jid));

// Using enum
events.on(WacapEventType.MESSAGE_RECEIVED, (data) => { ... });
events.once(WacapEventType.CONNECTION_OPEN, (data) => { ... });
events.off(WacapEventType.MESSAGE_RECEIVED, handler);
events.removeAllListeners(WacapEventType.MESSAGE_RECEIVED);
```

### Global Events (All Sessions)

```typescript
// Listen to events from ALL sessions
wacap.onGlobal(WacapEventType.QR_CODE, (data) => {
  console.log(`QR for session ${data.sessionId}`);
});

wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, (data) => {
  console.log(`[${data.sessionId}] Message: ${data.body}`);
});

wacap.onGlobal(WacapEventType.SESSION_START, (data) => {
  console.log(`Session ${data.sessionId} started`);
});

wacap.onGlobal(WacapEventType.SESSION_ERROR, (data) => {
  console.log(`Session ${data.sessionId} error`);
});

// One-time global event
wacap.onceGlobal(WacapEventType.CONNECTION_OPEN, (data) => { ... });
```

### Event Types

```typescript
enum WacapEventType {
  // Connection
  CONNECTION_UPDATE = 'connection.update',
  CONNECTION_OPEN = 'connection.open',
  CONNECTION_CLOSE = 'connection.close',
  QR_CODE = 'qr.code',
  
  // Messages
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENT = 'message.sent',
  MESSAGE_UPDATE = 'message.update',
  MESSAGE_DELETE = 'message.delete',
  
  // Chat
  CHAT_UPDATE = 'chat.update',
  CHAT_DELETE = 'chat.delete',
  
  // Contact
  CONTACT_UPDATE = 'contact.update',
  
  // Group
  GROUP_UPDATE = 'group.update',
  GROUP_PARTICIPANTS_UPDATE = 'group.participants.update',
  
  // Presence
  PRESENCE_UPDATE = 'presence.update',
  
  // Call
  CALL = 'call',
  
  // Session
  SESSION_START = 'session.start',
  SESSION_STOP = 'session.stop',
  SESSION_ERROR = 'session.error',
}
```

---

## QR Code Configuration

### Terminal Only (Default)

```typescript
const wacap = new WacapWrapper({
  qrCode: { format: 'terminal' }
});
```

### Base64 Only (For API/Web)

```typescript
const wacap = new WacapWrapper({
  qrCode: {
    format: 'base64',
    width: 400,
    margin: 2,
    darkColor: '#000000',
    lightColor: '#ffffff'
  }
});

// Access base64 in event
session.getEventManager().onQRCode((data) => {
  // data.qrBase64 = 'data:image/png;base64,...'
  // Can be used directly in <img src="...">
});
```

### Both Terminal and Base64

```typescript
const wacap = new WacapWrapper({
  qrCode: { format: 'all' }
});
```

### Raw String Only

```typescript
const wacap = new WacapWrapper({
  qrCode: { format: 'raw' }
});
```

---

## Storage Adapters

### SQLite (Default)

```typescript
const wacap = new WacapWrapper({
  storageAdapter: 'sqlite',
  sessionsPath: './sessions'
});
```

### Prisma (MySQL/PostgreSQL)

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const wacap = new WacapWrapper({
  storageAdapter: 'prisma',
  prismaClient: prisma,
  sessionsPath: './sessions' // Still needed for auth files
});
```

---

## Raw Socket Access

For advanced Baileys features:

```typescript
const socket = wacap.getSocket('session-id');

if (socket) {
  // Fetch all groups
  const groups = await socket.groupFetchAllParticipating();
  
  // Get profile picture
  const ppUrl = await socket.profilePictureUrl('628xxx@s.whatsapp.net');
  
  // Update status
  await socket.updateProfileStatus('Hello!');
  
  // Send presence
  await socket.sendPresenceUpdate('composing', '628xxx@s.whatsapp.net');
  await socket.sendPresenceUpdate('available');
  
  // Read messages
  await socket.readMessages([{ remoteJid, id, participant }]);
  
  // Group metadata
  const meta = await socket.groupMetadata('group@g.us');
  
  // Block/unblock
  await socket.updateBlockStatus('628xxx@s.whatsapp.net', 'block');
}
```

---

## Types Reference

### Event Data Types

```typescript
interface ConnectionEventData {
  sessionId: string;
  timestamp: Date;
  state: ConnectionState;
  qr?: string;
  qrBase64?: string;
  error?: any;
}

interface MessageEventData {
  sessionId: string;
  timestamp: Date;
  message: WAMessage;
  isFromMe?: boolean;
  messageType?: string;
  body?: string;
  from?: string;
  to?: string;
}

interface GroupParticipantEventData {
  sessionId: string;
  timestamp: Date;
  groupId: string;
  participants: string[];
  action: 'add' | 'remove' | 'promote' | 'demote';
  author?: string;
}

interface PresenceEventData {
  sessionId: string;
  timestamp: Date;
  jid: string;
  presences: PresenceData;
}
```

### Message Options

```typescript
interface MessageOptions {
  jid: string;
  text?: string;
  media?: {
    url?: string;
    buffer?: Buffer;
    mimetype?: string;
    caption?: string;
    fileName?: string;
  };
  quoted?: WAMessage;
  mentions?: string[];
  options?: any;
}
```

---

## Examples

See the `examples/` directory for complete examples:

- `basic-usage.ts` - Basic usage with SQLite
- `complete-features.ts` - All features demo
- `prisma-usage.ts` - Using Prisma adapter
- `example-ussage.ts` - Full usage guide with HTTP server

---

## License

MIT
