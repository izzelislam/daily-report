# Wacap Wrapper - Quick Usage Guide

## Installation

```bash
npm install
npm run build
```

## Quick Start

### 1. Basic Usage (SQLite - Default)

```typescript
import { WacapWrapper } from './src';

const wacap = new WacapWrapper();
await wacap.init();

// Start session
const session = await wacap.sessionStart('my-session');

// Listen for QR
session.getEventManager().onQRCode((data) => {
  console.log('Scan QR:', data.qr);
});

// Listen for messages
session.getEventManager().onMessageReceived(async (data) => {
  console.log('Message:', data.body);
  
  // Reply
  if (data.from) {
    await wacap.sendMessage('my-session', data.from, 'Hello!');
  }
});
```

### 2. Multi-Session Support

```typescript
// Start multiple sessions
const session1 = await wacap.sessionStart('session-1');
const session2 = await wacap.sessionStart('session-2');

// Each session has independent events
session1.getEventManager().onMessageReceived((data) => {
  console.log('[Session 1]:', data.body);
});

session2.getEventManager().onMessageReceived((data) => {
  console.log('[Session 2]:', data.body);
});

// Manage sessions
const allSessions = wacap.getAllSessions();
const session = wacap.findSession('session-1');
await wacap.sessionStop('session-2');
```

### 3. Using Prisma Storage (MySQL/PostgreSQL)

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const wacap = new WacapWrapper({
  storageAdapter: 'prisma',
  prismaClient: prisma,
});

await wacap.init();
```

**Setup Prisma:**
1. Copy `prisma-schema.example` to `prisma/schema.prisma`
2. Configure `DATABASE_URL` in `.env`
3. Run: `npx prisma migrate dev`

### 4. Sending Messages

```typescript
// Text message
await wacap.sendMessage(sessionId, jid, 'Hello World!');

// With mentions
await wacap.sendMessage(sessionId, jid, 'Hello @user', {
  mentions: ['6281234567890@s.whatsapp.net']
});

// Image
await wacap.sendMedia(sessionId, jid, {
  url: 'https://example.com/image.jpg',
  mimetype: 'image/jpeg',
  caption: 'Check this!'
});

// Document
await wacap.sendMedia(sessionId, jid, {
  buffer: fileBuffer,
  mimetype: 'application/pdf',
  fileName: 'document.pdf'
});
```

### 5. Event Handling

```typescript
const eventManager = session.getEventManager();

// Connection events
eventManager.onConnectionOpen((data) => {
  console.log('Connected!');
});

eventManager.onConnectionClose((data) => {
  console.log('Disconnected');
});

eventManager.onQRCode((data) => {
  console.log('QR:', data.qr);
});

// Message events
eventManager.onMessageReceived((data) => {
  console.log('Received:', data.body);
});

eventManager.onMessageSent((data) => {
  console.log('Sent');
});

// Group events
eventManager.onGroupParticipantsUpdate((data) => {
  console.log('Group update:', data.action);
});

// Generic event listener
eventManager.on(WacapEventType.MESSAGE_RECEIVED, (data) => {
  // Handle event
});
```

### 6. Webhook Integration

```typescript
const webhookUrl = 'https://your-webhook.com/whatsapp';

session.getEventManager().onMessageReceived(async (data) => {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'message.received',
      data: data,
      timestamp: new Date()
    })
  });
});
```

### 7. Advanced Baileys Features

```typescript
const socket = wacap.getSocket(sessionId);

if (socket) {
  // Fetch groups
  const groups = await socket.groupFetchAllParticipating();
  
  // Profile picture
  const ppUrl = await socket.profilePictureUrl(jid);
  
  // Update status
  await socket.updateProfileStatus('Hello!');
  
  // Read messages
  await socket.readMessages([messageKey]);
  
  // Send presence
  await socket.sendPresenceUpdate('composing', jid);
  
  // And all other Baileys features...
}
```

## Running Examples

```bash
# Quick start example
npx ts-node examples/quick-start.ts

# Complete features demo
npx ts-node examples/complete-features.ts

# Prisma example
npx ts-node examples/prisma-usage.ts
```

## Available Scripts

```bash
npm run build        # Build TypeScript to JavaScript
npm run dev          # Watch mode for development
npm test             # Run tests (when implemented)
```

## Key Features

✅ **Easy API** - `sessionStart()`, `findSession()`, `sendMessage()`, etc.
✅ **Multi-Session** - Manage multiple WhatsApp connections
✅ **Flexible Storage** - SQLite (default) or Prisma (MySQL/PostgreSQL)
✅ **Event Wrapper** - Simple event handling for webhooks
✅ **TypeScript** - Full type safety
✅ **Complete Baileys Access** - All Baileys features available
✅ **Auto-Reconnect** - Automatic reconnection with retry logic
✅ **QR Auto-Display** - Automatic QR code display in terminal

## Storage Options

### SQLite (Default)
- Zero configuration
- File-based storage
- Perfect for small/medium apps
- Automatic setup

### Prisma (Optional)
- Scalable for large apps
- MySQL, PostgreSQL, SQL Server
- Advanced querying
- Database migrations

## Session Management

```typescript
// Start
const session = await wacap.sessionStart('session-id');

// Check existence
if (wacap.hasSession('session-id')) { }

// Get info
const info = wacap.getSessionInfo('session-id');

// Find
const session = wacap.findSession('session-id');

// Stop (keeps data)
await wacap.sessionStop('session-id');

// Delete (removes data)
await wacap.deleteSession('session-id');

// Get all
const sessions = wacap.getAllSessions();
```

## Configuration Options

```typescript
{
  sessionsPath: './sessions',        // Session storage path
  storageAdapter: 'sqlite',          // 'sqlite' or 'prisma'
  debug: false,                      // Enable debug mode
  logger: { level: 'warn' },         // Log level
  prismaClient: prismaInstance,      // Required for Prisma
  autoDisplayQR: true,               // Auto-show QR code
  browser: ['App', 'Chrome', '1.0'], // Browser info
  connectionTimeout: 60000,          // Connection timeout (ms)
  maxRetries: 5,                     // Max reconnect attempts
}
```

## Helper Utilities

```typescript
import { 
  formatPhoneNumber,
  formatGroupJid,
  extractPhoneNumber,
  isGroup,
  isStatus,
  sleep,
  retryWithBackoff,
  isValidSessionId
} from './src/utils';

// Format phone to JID
const jid = formatPhoneNumber('6281234567890');
// Returns: '6281234567890@s.whatsapp.net'

// Check if group
if (isGroup(jid)) { }

// Sleep
await sleep(1000);

// Retry with backoff
await retryWithBackoff(async () => {
  // Your async function
}, 3, 1000);
```

## Event Types

```
CONNECTION_UPDATE
CONNECTION_OPEN
CONNECTION_CLOSE
QR_CODE
MESSAGE_RECEIVED
MESSAGE_SENT
MESSAGE_UPDATE
MESSAGE_DELETE
CHAT_UPDATE
CHAT_DELETE
CONTACT_UPDATE
GROUP_UPDATE
GROUP_PARTICIPANTS_UPDATE
PRESENCE_UPDATE
CALL
SESSION_START
SESSION_STOP
SESSION_ERROR
```

## Tips

1. **Always initialize**: Call `await wacap.init()` before using
2. **Graceful shutdown**: Use `await wacap.destroy()` to cleanup
3. **Session IDs**: Use alphanumeric characters, hyphens, underscores
4. **JID Format**: Phone numbers need `@s.whatsapp.net` suffix
5. **Groups**: Group JIDs end with `@g.us`
6. **Error Handling**: Wrap operations in try-catch blocks
7. **Storage**: SQLite for simple apps, Prisma for production
8. **Events**: Use event manager for webhooks and custom logic

## Troubleshooting

**QR Code not showing?**
- Ensure `autoDisplayQR: true` in config
- Listen for `onQRCode` event to handle manually

**Connection keeps closing?**
- Check internet connection
- Verify session credentials are valid
- Check `maxRetries` configuration

**Storage errors?**
- SQLite: Ensure write permissions in `sessionsPath`
- Prisma: Verify database connection and migrations

**TypeScript errors?**
- Run `npm run build` to check compilation
- Ensure all dependencies are installed

## Need Help?

Check the examples in `examples/` directory:
- `quick-start.ts` - Minimal setup
- `basic-usage.ts` - Common use cases
- `complete-features.ts` - All features demo
- `prisma-usage.ts` - Prisma integration

## License

MIT License - Free to use in your projects!
