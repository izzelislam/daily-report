# Wacap Wrapper - HTTP API Endpoints

Dokumentasi endpoint HTTP server untuk testing (`example-ussage.ts`).

**Base URL:** `http://localhost:3000`

---

## Quick Start

```bash
# Jalankan server
npx ts-node examples/example-ussage.ts

# Test health check
curl http://localhost:3000/health
```

---

## Endpoints

### General

#### `GET /`
Menampilkan dokumentasi API.

**Response:**
```json
{
  "name": "Wacap Wrapper API",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

---

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### Session Management

#### `GET /sessions`
List semua session aktif.

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "my-session",
      "status": "connected",
      "isActive": true,
      "phoneNumber": "628123456789",
      "userName": "John Doe",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastSeenAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

#### `POST /sessions`
Buat session baru.

**Request Body:**
```json
{
  "sessionId": "my-session"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | No | ID session (auto-generate jika kosong) |

**Response (201):**
```json
{
  "message": "Session dibuat",
  "sessionId": "my-session",
  "qrUrl": "/qr/my-session"
}
```

**Error (400):**
```json
{
  "error": "Session sudah ada"
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session"}'
```

---

#### `GET /sessions/:id`
Info session tertentu.

**Response:**
```json
{
  "sessionId": "my-session",
  "status": "qr",
  "isActive": true,
  "connectionState": { "connection": "close" },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "lastSeenAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Status Values:**
- `disconnected` - Session tidak aktif
- `connecting` - Sedang menghubungkan
- `qr` - Menunggu scan QR
- `connected` - Terhubung
- `error` - Error

**cURL:**
```bash
curl http://localhost:3000/sessions/my-session
```

---

#### `DELETE /sessions/:id`
Hapus session (termasuk semua data).

**Response:**
```json
{
  "message": "Session dihapus",
  "sessionId": "my-session"
}
```

**cURL:**
```bash
curl -X DELETE http://localhost:3000/sessions/my-session
```

---

### QR Code

#### `GET /qr/:sessionId`
Dapatkan QR code untuk login.

**Response:**
```json
{
  "sessionId": "my-session",
  "qr": "2@abc123...",
  "base64": "data:image/png;base64,iVBORw0KGgo...",
  "html": "<img src=\"data:image/png;base64,...\" alt=\"QR Code\" />"
}
```

| Field | Description |
|-------|-------------|
| `qr` | Raw QR string |
| `base64` | Base64 data URL (untuk `<img src="...">`) |
| `html` | HTML snippet siap pakai |

**Error (404):**
```json
{
  "error": "QR tidak tersedia",
  "hint": "Session mungkin sudah terhubung atau belum dimulai"
}
```

**cURL:**
```bash
curl http://localhost:3000/qr/my-session
```

---

#### `GET /qr/:sessionId/image`
Render QR sebagai gambar PNG langsung.

**Response:** `image/png`

**Usage di Browser:**
```html
<img src="http://localhost:3000/qr/my-session/image" alt="QR Code" />
```

**cURL (save to file):**
```bash
curl http://localhost:3000/qr/my-session/image -o qr.png
```

---

### Messaging

#### `POST /send/text`k
Kirim pesan teks.

**Request Body:**
```json
{
  "sessionId": "my-session",
  "to": "628123456789@s.whatsapp.net",
  "text": "Hello World!",
  "mentions": ["628123456789@s.whatsapp.net"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | ID session |
| `to` | string | Yes | JID tujuan |
| `text` | string | Yes | Isi pesan |
| `mentions` | string[] | No | List JID untuk mention |

**Format Nomor (Auto-format oleh package):**

| Input | Output |
|-------|--------|
| `08123456789` | `628123456789@s.whatsapp.net` |
| `628123456789` | `628123456789@s.whatsapp.net` |
| `+62 812-3456-789` | `628123456789@s.whatsapp.net` |
| `8123456789` | `628123456789@s.whatsapp.net` |
| `123456789-1234567890` | `123456789-1234567890@g.us` (group) |

> **Note:** Package akan otomatis mendeteksi dan memformat nomor telepon ke JID WhatsApp. Tidak perlu menambahkan `@s.whatsapp.net` atau `@g.us` secara manual.

**Response:**
```json
{
  "message": "Pesan terkirim",
  "result": { ... }
}
```

**cURL:**
```bash
# Menggunakan nomor biasa (auto-format)
curl -X POST http://localhost:3000/send/text \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "to": "08123456789",
    "text": "Hello from API!"
  }'

# Atau dengan format lengkap
curl -X POST http://localhost:3000/send/text \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "to": "628123456789@s.whatsapp.net",
    "text": "Hello from API!"
  }'
```

---

#### `POST /send/media`
Kirim media (gambar, video, audio, dokumen).

**Request Body:**
```json
{
  "sessionId": "my-session",
  "to": "628123456789@s.whatsapp.net",
  "url": "https://example.com/image.jpg",
  "mimetype": "image/jpeg",
  "caption": "Check this out!",
  "fileName": "photo.jpg"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | ID session |
| `to` | string | Yes | JID tujuan |
| `url` | string | Yes | URL media |
| `mimetype` | string | No | MIME type |
| `caption` | string | No | Caption |
| `fileName` | string | No | Nama file (untuk dokumen) |

**Supported MIME Types:**
- Image: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Video: `video/mp4`
- Audio: `audio/mp3`, `audio/ogg`, `audio/wav`
- Document: `application/pdf`, `application/msword`, etc.

**Response:**
```json
{
  "message": "Media terkirim",
  "result": { ... }
}
```

**cURL - Send Image:**
```bash
curl -X POST http://localhost:3000/send/media \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "to": "08123456789",
    "url": "https://picsum.photos/800/600",
    "mimetype": "image/jpeg",
    "caption": "Random image!"
  }'
```

**cURL - Send Document:**
```bash
curl -X POST http://localhost:3000/send/media \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "to": "08123456789",
    "url": "https://example.com/document.pdf",
    "mimetype": "application/pdf",
    "fileName": "document.pdf",
    "caption": "Here is the document"
  }'
```

---

### Group Management

#### `GET /groups/:sessionId`
List semua grup yang diikuti.

**Response:**
```json
{
  "groups": [
    {
      "id": "123456789@g.us",
      "subject": "My Group",
      "participants": 25,
      "owner": "628123456789@s.whatsapp.net"
    }
  ]
}
```

**cURL:**
```bash
curl http://localhost:3000/groups/my-session
```

---

#### `POST /groups/create`
Buat grup baru.

**Request Body:**
```json
{
  "sessionId": "my-session",
  "subject": "New Group Name",
  "participants": [
    "628123456789@s.whatsapp.net",
    "628987654321@s.whatsapp.net"
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | ID session |
| `subject` | string | Yes | Nama grup |
| `participants` | string[] | Yes | List JID peserta |

**Response:**
```json
{
  "message": "Grup dibuat",
  "result": { ... }
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/groups/create \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "subject": "Test Group",
    "participants": ["08123456789", "08987654321"]
  }'
```

---

#### `POST /groups/participants`
Kelola peserta grup (add/remove/promote/demote).

**Request Body:**
```json
{
  "sessionId": "my-session",
  "groupId": "123456789@g.us",
  "participants": ["628123456789@s.whatsapp.net"],
  "action": "add"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | ID session |
| `groupId` | string | Yes | ID grup |
| `participants` | string[] | Yes | List JID peserta |
| `action` | string | Yes | Action: `add`, `remove`, `promote`, `demote` |

**Actions:**
- `add` - Tambah peserta ke grup
- `remove` - Hapus peserta dari grup
- `promote` - Jadikan admin
- `demote` - Hapus dari admin

**Response:**
```json
{
  "message": "Peserta add berhasil",
  "result": { ... }
}
```

**cURL - Add Participant:**
```bash
curl -X POST http://localhost:3000/groups/participants \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "groupId": "123456789-1234567890",
    "participants": ["08123456789"],
    "action": "add"
  }'
```

**cURL - Promote to Admin:**
```bash
curl -X POST http://localhost:3000/groups/participants \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "groupId": "123456789-1234567890",
    "participants": ["08123456789"],
    "action": "promote"
  }'
```

---

### Presence

#### `POST /typing`
Kirim status typing indicator.

**Request Body:**
```json
{
  "sessionId": "my-session",
  "to": "628123456789@s.whatsapp.net",
  "duration": 3000
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `sessionId` | string | Yes | - | ID session |
| `to` | string | Yes | - | JID tujuan |
| `duration` | number | No | 3000 | Durasi typing (ms) |

**Response:**
```json
{
  "message": "Typing indicator dikirim",
  "duration": 3000
}
```

**cURL:**
```bash
curl -X POST http://localhost:3000/typing \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "my-session",
    "to": "08123456789",
    "duration": 5000
  }'
```

---

## Error Responses

Semua error menggunakan format yang sama:

```json
{
  "error": "Error message here"
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (missing/invalid parameters)
- `404` - Not Found (session/resource tidak ditemukan)
- `500` - Internal Server Error

---

## Flow Example

### 1. Buat Session Baru

```bash
# Buat session
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "bot-1"}'

# Response:
# {"message":"Session dibuat","sessionId":"bot-1","qrUrl":"/qr/bot-1"}
```

### 2. Dapatkan QR Code

```bash
# Get QR as JSON
curl http://localhost:3000/qr/bot-1

# Atau tampilkan di browser
open http://localhost:3000/qr/bot-1/image
```

### 3. Scan QR dengan WhatsApp

Buka WhatsApp > Linked Devices > Link a Device > Scan QR

### 4. Cek Status Session

```bash
curl http://localhost:3000/sessions/bot-1

# Response (setelah scan):
# {"sessionId":"bot-1","status":"connected","isActive":true,"phoneNumber":"628xxx",...}
```

### 5. Kirim Pesan

```bash
# Cukup gunakan nomor biasa - package akan auto-format!
curl -X POST http://localhost:3000/send/text \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "bot-1",
    "to": "08123456789",
    "text": "Hello from Wacap API! 🚀"
  }'
```

---

## Notes

- Session akan otomatis dimuat saat server restart
- QR code akan dihapus setelah session terhubung
- Gunakan format JID yang benar (`@s.whatsapp.net` untuk personal, `@g.us` untuk grup)
- Server berjalan di port 3000 secara default
