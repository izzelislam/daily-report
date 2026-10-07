# Wacap Wrapper

Comprehensive TypeScript wrapper for [Baileys WhatsApp Web API](https://github.com/WhiskeySockets/Baileys) with multi-session support, flexible storage options, and easy-to-use event handling.

[<img src="https://www.owlstown.com/assets/icons/bmc-yellow-button-941f96a1.png" alt="Buy Me A Coffee" width="150" />](https://www.buymeacoffee.com/pakor)

## 🐳 Docker Image Available!

For production deployment with REST API, WebSocket, and n8n integration:

**Docker Hub:** [bangfkr/wacap](https://hub.docker.com/repository/docker/bangfkr/wacap/general)

```bash
docker pull bangfkr/wacap:latest
```

Quick start with Docker Compose:
```yaml
version: '3.8'
services:
  wacap:
    image: bangfkr/wacap:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - JWT_SECRET=your-secret-key
```

See [docker-image/](./docker-image/) folder for full documentation.

---

## Features

✨ **Easy to Use** - Simple, intuitive API for sends, groups, and lifecycle  
🔄 **Multi-Session Support** - Manage hundreds of WhatsApp connections simultaneously  
💾 **Flexible Storage** - SQLite (default, WAL) or Prisma (MySQL/PostgreSQL)  
📡 **Event Wrapper** - Global + per-session events with normalized payloads  
🔒 **Type-Safe** - Full TypeScript support with comprehensive type definitions  
🛡️ **SaaS Ready** - Auto-reconnect with backoff, status tracking, and session loader  
� **QR Caode Options** - Terminal, Base64, or both for flexible integration  
📍 **Rich Messages** - Location, contacts, polls, reactions, and more  
👥 **Full Group Management** - Create, update, invite codes, settings  
🔐 **Session Persistence** - Sessions survive server restarts without re-login  
📦 **Auto Phone Format** - Automatic JID formatting from phone numbers

## Installation

```bash
npm i @pakor/wacap-wrapper
```

### Dependencies

```bash
npm install @whiskeysockets/baileys pino better-sqlite3 qrcode-terminal qrcode eventemitter3
```

### Optional: For Prisma Storage

```bash
npm install @prisma/client prisma
```

## Quick Start

```typescript
import { WacapWrapper, WacapEventType } from '@pakor/wacap-wrapper';

const wacap = new WacapWrapper({
  sessionsPath: './sessions',
  qrCode: { format: 'all' }, // terminal + base64
});

await wacap.init();

// Auto-load saved sessions (no re-scan QR needed!)
await wacap.sessions.startAll();

// Or start a new session
const session = await wacap.sessions.start('my-session');

// Listen for QR code
session.getEventManager().onQRCode((data) => {
  console.log('QR String:', data.qr);
  console.log('QR Base64:', data.qrBase64); // For web display
});

// Listen for messages
session.getEventManager().onMessageReceived(async (data) => {
  console.log('From:', data.from);
  console.log('Message:', data.body);
  
  // Auto-reply (phone number auto-formatted!)
  if (data.body === '!ping') {
    await wacap.send.text('my-session', data.from, 'Pong! 🏓');
  }
});
```

## Phone Number Auto-Format

No need to manually format JIDs! The package handles it automatically:

```typescript
// All these work the same:
await wacap.send.text('session', '08123456789', 'Hello!');
await wacap.send.text('session', '628123456789', 'Hello!');
await wacap.send.text('session', '+62 812-3456-789', 'Hello!');

// Groups are auto-detected:
await wacap.send.text('session', '123456789-1234567890', 'Hello group!');

// Manual formatting if needed:
import { formatJid } from '@pakor/wacap-wrapper';
formatJid('08123456789'); // '628123456789@s.whatsapp.net'
```

## QR Code Configuration

```typescript
const wacap = new WacapWrapper({
  qrCode: {
    format: 'all',        // 'terminal' | 'base64' | 'raw' | 'all'
    width: 300,           // Base64 image width
    margin: 2,
    darkColor: '#000000',
    lightColor: '#ffffff',
  }
});

// Access QR in event
session.getEventManager().onQRCode((data) => {
  console.log(data.qr);       // Raw QR string
  console.log(data.qrBase64); // data:image/png;base64,...
});
```

## Session Management

### Stop vs Logout

| Method | Behavior | Use Case |
|--------|----------|----------|
| `stop()` | Disconnect, keep credentials | Server restart |
| `logout()` | Logout from WhatsApp | User logout |
| `delete()` | Logout + delete all data | Remove session |

```typescript
// Stop (credentials preserved - no QR needed on restart)
await wacap.sessions.stop('my-session');

// Logout (need to scan QR again)
await wacap.logoutSession('my-session');

// Delete completely
await wacap.deleteSession('my-session');

// Graceful shutdown (all sessions preserved)
await wacap.destroy();
```

## Sending Messages

### Text Messages
```typescript
await wacap.send.text('session', '08123456789', 'Hello!');

// With mentions
await wacap.send.text('session', 'group-id', 'Hello @user!', {
  mentions: ['08123456789']
});
```

### Media Messages
```typescript
// Image
await wacap.send.media('session', '08123456789', {
  url: 'https://example.com/image.jpg',
  mimetype: 'image/jpeg',
  caption: 'Check this out!'
});

// Document
await wacap.send.media('session', '08123456789', {
  url: 'https://example.com/doc.pdf',
  mimetype: 'application/pdf',
  fileName: 'document.pdf'
});
```

### Location
```typescript
await wacap.send.location('session', '08123456789', -6.2088, 106.8456, {
  name: 'Monas',
  address: 'Jakarta, Indonesia'
});
```

### Contacts
```typescript
// Single contact
await wacap.send.contact('session', '08123456789', {
  name: 'John Doe',
  phone: '+628123456789'
});

// Multiple contacts
await wacap.send.contacts('session', '08123456789', [
  { name: 'John', phone: '+628111' },
  { name: 'Jane', phone: '+628222' }
]);
```

### Reactions
```typescript
await wacap.send.reaction('session', '08123456789', 'MESSAGE_ID', '👍');
```

### Polls
```typescript
await wacap.send.poll('session', '08123456789', 'Favorite color?', [
  'Red', 'Blue', 'Green'
], 1); // single choice
```

## Contact Management

```typescript
// Check if number is on WhatsApp
const result = await wacap.contacts.check('session', '08123456789');
// { exists: true, jid: '628123456789@s.whatsapp.net' }

// Check multiple numbers
const results = await wacap.contacts.checkMultiple('session', ['08111', '08222']);

// Get profile picture
const url = await wacap.contacts.getProfilePicture('session', '08123456789');

// Block/unblock
await wacap.contacts.block('session', '08123456789');
await wacap.contacts.unblock('session', '08123456789');
```

## Chat Management

```typescript
// Mark as read
await wacap.chat.markAsRead('session', '08123456789', ['MSG_ID_1', 'MSG_ID_2']);

// Archive/unarchive
await wacap.chat.archive('session', '08123456789', true);

// Mute (timestamp in ms, null to unmute)
await wacap.chat.mute('session', '08123456789', Date.now() + 86400000);

// Pin/unpin
await wacap.chat.pin('session', '08123456789', true);

// Delete message
await wacap.chat.deleteMessage('session', '08123456789', 'MSG_ID', true); // for everyone
```

## Group Management

```typescript
// Create group
const group = await wacap.groups.create('session', 'Group Name', [
  '08123456789', '08987654321'
]);

// Manage participants
await wacap.groups.addParticipants('session', 'group-id', ['08111']);
await wacap.groups.removeParticipants('session', 'group-id', ['08111']);
await wacap.groups.promoteParticipants('session', 'group-id', ['08111']);
await wacap.groups.demoteParticipants('session', 'group-id', ['08111']);

// Get group info
const info = await wacap.groups.getInfo('session', 'group-id');

// Update group
await wacap.groups.updateSubject('session', 'group-id', 'New Name');
await wacap.groups.updateDescription('session', 'group-id', 'New description');

// Group settings
await wacap.groups.updateSettings('session', 'group-id', 'announcement'); // only admins send
await wacap.groups.updateSettings('session', 'group-id', 'not_announcement'); // everyone sends

// Invite codes
const code = await wacap.groups.getInviteCode('session', 'group-id');
await wacap.groups.revokeInviteCode('session', 'group-id');
await wacap.groups.joinViaCode('session', 'INVITE_CODE');

// Leave group
await wacap.groups.leave('session', 'group-id');
```

## Profile Management

```typescript
await wacap.profile.updateStatus('session', '🤖 Bot is online!');
await wacap.profile.updateName('session', 'My Bot');
```

## Presence Management

```typescript
// Online/offline
await wacap.presence.update('session', null, 'available');
await wacap.presence.update('session', null, 'unavailable');

// Typing indicator
await wacap.presence.update('session', '08123456789', 'composing');
await wacap.presence.update('session', '08123456789', 'paused');

// Recording indicator
await wacap.presence.update('session', '08123456789', 'recording');
```

## Global Events

```typescript
// Listen to ALL sessions at once
wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, (data) => {
  console.log(`[${data.sessionId}] ${data.body}`);
});

wacap.onGlobal(WacapEventType.QR_CODE, (data) => {
  console.log(`QR for ${data.sessionId}:`, data.qrBase64);
});

wacap.onGlobal(WacapEventType.CONNECTION_OPEN, (data) => {
  console.log(`${data.sessionId} connected!`);
});
```

## Event Types

```typescript
enum WacapEventType {
  // Connection
  CONNECTION_UPDATE, CONNECTION_OPEN, CONNECTION_CLOSE, QR_CODE,
  
  // Messages
  MESSAGE_RECEIVED, MESSAGE_SENT, MESSAGE_UPDATE, MESSAGE_DELETE,
  
  // Chats
  CHAT_UPDATE, CHAT_DELETE,
  
  // Contacts & Groups
  CONTACT_UPDATE, GROUP_UPDATE, GROUP_PARTICIPANTS_UPDATE,
  
  // Others
  PRESENCE_UPDATE, CALL,
  
  // Session lifecycle
  SESSION_START, SESSION_STOP, SESSION_ERROR,
}
```

## HTTP Server Example

The package includes a complete HTTP server example with REST API:

```bash
npx ts-node examples/example-ussage.ts
```

**Endpoints:**
- `POST /sessions` - Create session
- `GET /sessions` - List sessions
- `GET /qr/:id` - Get QR code (JSON with base64)
- `GET /qr/:id/image` - Get QR as PNG image
- `POST /send/text` - Send text message
- `POST /send/media` - Send media
- `POST /send/location` - Send location
- `POST /send/contact` - Send contact
- `POST /send/poll` - Send poll
- `POST /contacts/check` - Check WhatsApp number
- And more...

See `examples/API-ENDPOINTS.md` for full documentation.

## Storage Options

### SQLite (Default)
- Zero configuration
- File-based, perfect for small-medium deployments
- WAL mode for better performance

### Prisma (MySQL/PostgreSQL)
```typescript
import { PrismaClient } from '@prisma/client';

const wacap = new WacapWrapper({
  storageAdapter: 'prisma',
  prismaClient: new PrismaClient(),
});
```

## Configuration

```typescript
interface WacapConfig {
  sessionsPath?: string;              // './sessions'
  storageAdapter?: 'sqlite' | 'prisma';
  debug?: boolean;
  logger?: { level: string };
  prismaClient?: any;
  qrCode?: {
    format?: 'terminal' | 'base64' | 'raw' | 'all';
    width?: number;
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  };
  browser?: [string, string, string];
  connectionTimeout?: number;         // 60000
  maxRetries?: number;                // 5
}
```

## Examples

- `examples/basic-usage.ts` - Basic usage
- `examples/complete-features.ts` - All features demo
- `examples/prisma-usage.ts` - Prisma storage
- `examples/example-ussage.ts` - HTTP server with auto-reply bot

## Documentation

- [API.md](./API.md) - Full API documentation
- [examples/API-ENDPOINTS.md](./examples/API-ENDPOINTS.md) - HTTP endpoints

## Related Projects

- **Docker Image**: [bangfkr/wacap](https://hub.docker.com/repository/docker/bangfkr/wacap/general) - Production-ready REST API with WebSocket support
- **n8n Integration**: See `n8n-workflow/` folder for n8n nodes

## License

MIT License

## Credits

Built on [Baileys](https://github.com/WhiskeySockets/Baileys).

## Disclaimer

Not affiliated with WhatsApp or Meta. Use responsibly.
