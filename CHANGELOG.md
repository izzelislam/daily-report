# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2024-12-17

### Added

#### Phone Number Auto-Format
- Automatic JID formatting from phone numbers
- Support for various formats: `08xxx`, `628xxx`, `+62 812-xxx`
- Auto-detect group IDs (format: `123-456`)
- Export `formatJid()` and `formatJids()` helper functions
- Support for LID (Linked ID) format `@lid`

#### QR Code Configuration
- New `qrCode` config option with multiple formats
- `format`: `'terminal'` | `'base64'` | `'raw'` | `'all'`
- Customizable QR image: `width`, `margin`, `darkColor`, `lightColor`
- `qrBase64` field in QR_CODE event data
- Direct PNG image endpoint `/qr/:id/image`

#### Rich Message Types
- `send.location()` - Send location with coordinates
- `send.contact()` - Send single vCard contact
- `send.contacts()` - Send multiple contacts
- `send.reaction()` - Add/remove emoji reactions
- `send.poll()` - Create polls with options
- `send.buttons()` - Button messages (deprecated by WhatsApp)
- `send.list()` - List/menu messages

#### Contact Management API (`wacap.contacts.*`)
- `check()` - Check if number is registered on WhatsApp
- `checkMultiple()` - Bulk number checking
- `getProfilePicture()` - Get profile picture URL
- `getInfo()` - Get contact information
- `block()` / `unblock()` - Block/unblock contacts
- `getBusinessProfile()` - Get business profile info

#### Chat Management API (`wacap.chat.*`)
- `markAsRead()` - Mark messages as read
- `archive()` / unarchive - Archive chats
- `mute()` / unmute - Mute chats with duration
- `pin()` / unpin - Pin chats
- `starMessage()` - Star/unstar messages
- `deleteMessage()` - Delete for me or everyone
- `forwardMessage()` - Forward messages

#### Extended Group Management (`wacap.groups.*`)
- `getInfo()` - Get full group metadata
- `updateSubject()` - Change group name
- `updateDescription()` - Change group description
- `updateSettings()` - Change group settings (announcement/locked)
- `leave()` - Leave a group
- `getInviteCode()` - Get group invite code
- `revokeInviteCode()` - Revoke and get new invite code
- `joinViaCode()` - Join group via invite code/link

#### Profile Management API (`wacap.profile.*`)
- `updateStatus()` - Update profile status/about
- `updateName()` - Update profile display name

#### Presence Management API (`wacap.presence.*`)
- `update()` - Send presence updates
- Support: `available`, `unavailable`, `composing`, `recording`, `paused`

#### Session Persistence
- Sessions now survive server restarts without re-login
- `stop()` disconnects without logout (credentials preserved)
- `logout()` new method for actual WhatsApp logout
- `logoutSession()` wrapper method added

#### HTTP Server Example
- Complete REST API server in `examples/example-ussage.ts`
- Auto-reply bot with commands (`!ping`, `!help`, `!info`, etc.)
- Auto-start saved sessions on server boot
- Full API documentation in `examples/API-ENDPOINTS.md`

#### Message Handler Improvements
- Support for more message types in `getMessageBody()`
- Button response, list response, interactive messages
- Edited message content extraction

### Changed

- `stop()` no longer logs out from WhatsApp (breaking change for logout behavior)
- `deleteSession()` now properly logs out before deleting
- `destroy()` preserves credentials for all sessions
- Improved error handling in auto-reply

### Fixed

- LID (Linked ID) format support in `formatJid()`
- Message body extraction for various message types
- Session reconnection after server restart

### Documentation

- Updated README.md with all new features
- New API.md with comprehensive API documentation
- New examples/API-ENDPOINTS.md for HTTP server
- Added CHANGELOG.md

---

## [1.0.3-alpha.2] - 2024-12-15

### Added
- Initial multi-session support
- SQLite and Prisma storage adapters
- Basic event handling system
- Global event bus
- Session registry

### Features
- `sessions.start()`, `stop()`, `startAll()`
- `send.text()`, `send.media()`
- `groups.create()`, `addParticipants()`, etc.
- Event manager with convenience methods

---

## [1.0.0] - 2024-12-01

### Added
- Initial release
- Basic WhatsApp session management
- Message sending capabilities
- Event handling
- SQLite storage

---

## Migration Guide

### From 1.0.3 to 1.0.4

#### Session Stop Behavior Change

**Before (1.0.3):**
```typescript
await wacap.sessions.stop('my-session'); // Logged out from WhatsApp
```

**After (1.0.4):**
```typescript
await wacap.sessions.stop('my-session'); // Only disconnects, credentials preserved
await wacap.logoutSession('my-session'); // Use this to actually logout
```

#### New QR Code Configuration

**Before:**
```typescript
const wacap = new WacapWrapper({
  autoDisplayQR: true, // Deprecated
});
```

**After:**
```typescript
const wacap = new WacapWrapper({
  qrCode: {
    format: 'terminal', // or 'base64', 'raw', 'all'
  }
});
```

#### Phone Number Format

**Before:**
```typescript
await wacap.send.text('session', '628123456789@s.whatsapp.net', 'Hello');
```

**After:**
```typescript
// All these work now:
await wacap.send.text('session', '08123456789', 'Hello');
await wacap.send.text('session', '628123456789', 'Hello');
await wacap.send.text('session', '+62 812-3456-789', 'Hello');
```
