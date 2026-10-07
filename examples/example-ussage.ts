/**
 * ============================================================
 * WACAP WRAPPER - PANDUAN PENGGUNAAN LENGKAP
 * ============================================================
 * 
 * Package ini adalah wrapper untuk @whiskeysockets/baileys
 * yang mempermudah pengelolaan multi-session WhatsApp.
 * 
 * Fitur Utama:
 * - Multi-session management
 * - Event-driven architecture
 * - Storage adapter (SQLite / Prisma)
 * - Auto-reconnect dengan retry
 * - Global & per-session event listeners
 */

import { 
  WacapWrapper, 
  WacapEventType,
  Session,
  MessageEventData,
  ConnectionEventData,
  GroupParticipantEventData,
  PresenceEventData,
} from '../src';

// ============================================================
// 1. INISIALISASI DASAR
// ============================================================

async function contohInisialisasi() {
  // Buat instance WacapWrapper dengan konfigurasi
  const wacap = new WacapWrapper({
    // Path untuk menyimpan data session (default: './sessions')
    sessionsPath: './sessions',
    
    // Storage adapter: 'sqlite' (default) atau 'prisma'
    storageAdapter: 'sqlite',
    
    // Mode debug untuk logging detail
    debug: false,
    
    // Level logging: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
    logger: { level: 'warn' },
    
    // Identitas browser [nama, browser, versi]
    browser: ['Bot Saya', 'Chrome', '1.0.0'],
    
    // Timeout koneksi dalam milidetik (default: 60000)
    connectionTimeout: 60000,
    
    // Maksimal percobaan reconnect (default: 5)
    maxRetries: 5,
    
    // ============================================================
    // KONFIGURASI QR CODE (BARU!)
    // ============================================================
    // Format QR: 'terminal' | 'base64' | 'raw' | 'all'
    // - 'terminal': Print QR di terminal (default)
    // - 'base64': Generate QR sebagai base64 data URL
    // - 'raw': Hanya kirim raw QR string
    // - 'all': Terminal + base64
    qrCode: {
      format: 'all',      // Gunakan 'all' untuk dapat terminal + base64
      width: 300,         // Lebar gambar QR (untuk base64)
      margin: 2,          // Margin QR code
      darkColor: '#000000',   // Warna gelap
      lightColor: '#ffffff',  // Warna terang
    },
  });

  // Inisialisasi storage adapter
  await wacap.init();
  
  console.log('✅ Wacap berhasil diinisialisasi');
  return wacap;
}

// ============================================================
// 2. MANAJEMEN SESSION
// ============================================================

async function contohManajemenSession() {
  const wacap = await contohInisialisasi();

  // --- Memulai Session Baru ---
  // Cara 1: Menggunakan method langsung
  const session1 = await wacap.sessionStart('session-utama');
  
  // Cara 2: Menggunakan helper API
  const session2 = await wacap.sessions.start('session-kedua');

  // --- Memuat Semua Session Tersimpan ---
  // Berguna untuk restart server / warm-boot
  const loadedIds = await wacap.loadAllStoredSessions();
  console.log('Session yang dimuat:', loadedIds);

  // Atau gunakan alias
  const startedIds = await wacap.sessions.startAll();

  // --- Memulai Beberapa Session Sekaligus ---
  const sessions = await wacap.sessions.startByIds(['session-a', 'session-b', 'session-c']);

  // --- Mendapatkan Informasi Session ---
  const info = wacap.getSessionInfo('session-utama');
  // atau
  const info2 = wacap.sessions.info('session-utama');
  
  if (info) {
    console.log('Session ID:', info.sessionId);
    console.log('Status:', info.status); // 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error'
    console.log('Aktif:', info.isActive);
    console.log('Nomor HP:', info.phoneNumber);
    console.log('Nama:', info.userName);
    console.log('Dibuat:', info.createdAt);
    console.log('Terakhir aktif:', info.lastSeenAt);
    console.log('Error:', info.error);
  }

  // --- Mengecek Session ---
  if (wacap.hasSession('session-utama')) {
    console.log('Session ada');
  }

  // --- Mendapatkan Session ---
  const session = wacap.findSession('session-utama');
  // atau
  const session3 = wacap.sessions.get('session-utama');

  // --- Mendapatkan Semua Session ---
  const allSessions = wacap.getAllSessions(); // Map<string, Session>
  console.log('Total session aktif:', allSessions.size);

  // --- Mendapatkan Daftar ID Session ---
  const sessionIds = wacap.getSessionIds();
  // atau
  const ids = wacap.sessions.list();
  console.log('Session IDs:', ids);

  // --- Menghentikan Session (TANPA LOGOUT) ---
  // Session akan disconnect tapi credentials tetap tersimpan
  // Saat server restart, session bisa langsung connect tanpa scan QR lagi
  await wacap.sessionStop('session-kedua');
  // atau
  await wacap.sessions.stop('session-kedua');

  // --- Menghentikan Semua Session (TANPA LOGOUT) ---
  // Semua session disconnect tapi credentials tetap tersimpan
  await wacap.stopAllSessions();
  // atau
  await wacap.sessions.stopAll();

  // --- Restart Semua Session ---
  const restartedSessions = await wacap.restartAllSessions();
  // atau
  const restarted = await wacap.sessions.restartAll();

  // --- Logout Session (HAPUS CREDENTIALS) ---
  // Session akan logout dari WhatsApp, perlu scan QR lagi
  await wacap.logoutSession('session-utama');

  // --- Menghapus Session (LOGOUT + HAPUS DATA) ---
  // Session akan logout dan semua data dihapus dari storage
  await wacap.deleteSession('session-utama');

  // --- Cleanup & Shutdown (TANPA LOGOUT) ---
  // Semua session disconnect tapi credentials tetap tersimpan
  // Saat server restart, session bisa langsung connect lagi
  await wacap.destroy();
}

// ============================================================
// 3. EVENT HANDLING
// ============================================================

async function contohEventHandling() {
  const wacap = await contohInisialisasi();
  const session = await wacap.sessions.start('event-demo');
  
  // Dapatkan event manager dari session
  const events = session.getEventManager();

  // --- Event QR Code ---
  events.onQRCode((data: ConnectionEventData) => {
    console.log('📱 QR Code diterima!');
    console.log('Session:', data.sessionId);
    console.log('QR String:', data.qr);
    // Kirim QR ke frontend atau webhook
  });

  // --- Event Koneksi ---
  events.onConnectionUpdate((data: ConnectionEventData) => {
    console.log('🔄 Status koneksi berubah:', data.state);
  });

  events.onConnectionOpen((data: ConnectionEventData) => {
    console.log('✅ Terhubung ke WhatsApp!');
    console.log('Session:', data.sessionId);
  });

  events.onConnectionClose((data: ConnectionEventData) => {
    console.log('❌ Koneksi terputus');
    if (data.error) {
      console.error('Error:', data.error);
    }
  });

  // --- Event Pesan ---
  events.onMessageReceived((data: MessageEventData) => {
    console.log('📨 Pesan masuk:');
    console.log('  Dari:', data.from);
    console.log('  Isi:', data.body);
    console.log('  Tipe:', data.messageType);
    console.log('  Waktu:', data.timestamp);
    console.log('  Dari saya:', data.isFromMe);
  });

  events.onMessageSent((data: MessageEventData) => {
    console.log('📤 Pesan terkirim ke:', data.to);
  });

  events.onMessageUpdate((data: MessageEventData) => {
    console.log('🔄 Pesan diupdate');
  });

  // --- Event Grup ---
  events.onGroupParticipantsUpdate((data: GroupParticipantEventData) => {
    console.log('👥 Update peserta grup:');
    console.log('  Grup:', data.groupId);
    console.log('  Aksi:', data.action); // 'add' | 'remove' | 'promote' | 'demote'
    console.log('  Peserta:', data.participants);
    console.log('  Oleh:', data.author);
  });

  // --- Event Presence (Online/Typing) ---
  events.onPresenceUpdate((data: PresenceEventData) => {
    console.log('👤 Status presence:', data.jid);
    console.log('  Data:', data.presences);
  });

  // --- Event Menggunakan Enum ---
  events.on(WacapEventType.MESSAGE_RECEIVED, (data) => {
    console.log('Pesan diterima via enum');
  });

  events.on(WacapEventType.CALL, (data) => {
    console.log('📞 Panggilan masuk!');
  });

  // --- One-time Event ---
  events.once(WacapEventType.CONNECTION_OPEN, (data) => {
    console.log('Koneksi pertama kali terbuka');
  });

  // --- Menghapus Event Handler ---
  const handler = (data: any) => console.log(data);
  events.on(WacapEventType.MESSAGE_RECEIVED, handler);
  events.off(WacapEventType.MESSAGE_RECEIVED, handler);

  // --- Menghapus Semua Handler ---
  events.removeAllListeners(WacapEventType.MESSAGE_RECEIVED);
  events.removeAllListeners(); // Semua event
}

// ============================================================
// 4. GLOBAL EVENT LISTENER
// ============================================================

async function contohGlobalEvent() {
  const wacap = await contohInisialisasi();

  // Global listener menerima event dari SEMUA session
  wacap.onGlobal(WacapEventType.QR_CODE, (data) => {
    console.log(`[GLOBAL] QR untuk session: ${data.sessionId}`);
  });

  wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, (data) => {
    console.log(`[GLOBAL] Pesan dari session ${data.sessionId}:`, (data as MessageEventData).body);
  });

  wacap.onGlobal(WacapEventType.CONNECTION_OPEN, (data) => {
    console.log(`[GLOBAL] Session ${data.sessionId} terhubung`);
  });

  wacap.onGlobal(WacapEventType.SESSION_START, (data) => {
    console.log(`[GLOBAL] Session ${data.sessionId} dimulai`);
  });

  wacap.onGlobal(WacapEventType.SESSION_STOP, (data) => {
    console.log(`[GLOBAL] Session ${data.sessionId} dihentikan`);
  });

  wacap.onGlobal(WacapEventType.SESSION_ERROR, (data) => {
    console.log(`[GLOBAL] Error pada session ${data.sessionId}`);
  });

  // One-time global event
  wacap.onceGlobal(WacapEventType.CONNECTION_OPEN, (data) => {
    console.log('Session pertama terhubung!');
  });

  // Mulai beberapa session
  await wacap.sessions.start('session-1');
  await wacap.sessions.start('session-2');
}

// ============================================================
// 5. MENGIRIM PESAN
// ============================================================

async function contohKirimPesan() {
  const wacap = await contohInisialisasi();
  const session = await wacap.sessions.start('sender');
  
  // Tunggu koneksi terbuka
  await new Promise<void>((resolve) => {
    session.getEventManager().onConnectionOpen(() => resolve());
  });

  // ============================================================
  // FORMAT NOMOR OTOMATIS!
  // Package akan auto-format nomor ke JID WhatsApp:
  // - '08123456789' -> '628123456789@s.whatsapp.net'
  // - '628123456789' -> '628123456789@s.whatsapp.net'
  // - '+62 812-3456-789' -> '628123456789@s.whatsapp.net'
  // - '123456789-1234567890' -> '123456789-1234567890@g.us' (group)
  // ============================================================

  const targetNomor = '08123456789'; // Cukup nomor biasa!
  const groupId = '123456789-1234567890'; // Group ID (auto-detect)

  // --- Kirim Pesan Teks ---
  // Cara 1: Method langsung
  await wacap.sendMessage('sender', targetNomor, 'Halo! 👋');
  
  // Cara 2: Helper API
  await wacap.send.text('sender', targetNomor, 'Pesan dari helper API');

  // --- Kirim Pesan dengan Mention ---
  await wacap.send.text(
    'sender',
    groupId,
    'Halo @08123456789! Apa kabar?',
    { mentions: ['08123456789'] } // Nomor biasa, auto-format!
  );

  // --- Kirim Media (Gambar) ---
  // Dari URL
  await wacap.send.media('sender', targetNomor, {
    url: 'https://picsum.photos/800/600',
    mimetype: 'image/jpeg',
    caption: 'Ini gambar dari URL 🖼️',
  });

  // Dari Buffer
  const imageBuffer = Buffer.from('...'); // Buffer gambar
  await wacap.send.media('sender', targetNomor, {
    buffer: imageBuffer,
    mimetype: 'image/png',
    caption: 'Gambar dari buffer',
  });

  // --- Kirim Dokumen ---
  await wacap.send.media('sender', targetNomor, {
    url: 'https://example.com/document.pdf',
    mimetype: 'application/pdf',
    fileName: 'dokumen-penting.pdf',
    caption: 'Silakan cek dokumen ini 📄',
  });

  // --- Kirim Video ---
  await wacap.send.media('sender', targetNomor, {
    url: 'https://example.com/video.mp4',
    mimetype: 'video/mp4',
    caption: 'Video keren! 🎬',
  });

  // --- Kirim Audio ---
  await wacap.send.media('sender', targetNomor, {
    url: 'https://example.com/audio.mp3',
    mimetype: 'audio/mp3',
  });
}

// ============================================================
// 6. MANAJEMEN GRUP
// ============================================================

async function contohManajemenGrup() {
  const wacap = await contohInisialisasi();
  await wacap.sessions.start('grup-manager');

  // --- Buat Grup Baru ---
  // Nomor peserta akan di-format otomatis!
  const newGroup = await wacap.groups.create(
    'grup-manager',
    'Nama Grup Baru',
    ['08123456789', '08987654321'] // Cukup nomor biasa
  );
  console.log('Grup dibuat:', newGroup);

  const groupId = '123456789-1234567890'; // Group ID (auto-format ke @g.us)

  // --- Tambah Peserta ---
  await wacap.groups.addParticipants(
    'grup-manager',
    groupId,
    ['08111111111'] // Nomor biasa
  );

  // --- Hapus Peserta ---
  await wacap.groups.removeParticipants(
    'grup-manager',
    groupId,
    ['08111111111']
  );

  // --- Jadikan Admin ---
  await wacap.groups.promoteParticipants(
    'grup-manager',
    groupId,
    ['08123456789']
  );

  // --- Hapus dari Admin ---
  await wacap.groups.demoteParticipants(
    'grup-manager',
    groupId,
    ['08123456789']
  );
}

// ============================================================
// 7. AKSES SOCKET BAILEYS LANGSUNG
// ============================================================

async function contohSocketLangsung() {
  const wacap = await contohInisialisasi();
  const session = await wacap.sessions.start('advanced');

  await new Promise<void>((resolve) => {
    session.getEventManager().onConnectionOpen(() => resolve());
  });

  // Dapatkan socket Baileys untuk fitur lanjutan
  const socket = wacap.getSocket('advanced');

  if (socket) {
    // --- Ambil Semua Grup ---
    const groups = await socket.groupFetchAllParticipating();
    console.log('Jumlah grup:', Object.keys(groups).length);
    
    for (const [id, metadata] of Object.entries(groups)) {
      console.log(`- ${metadata.subject} (${metadata.participants.length} anggota)`);
    }

    // --- Ambil Foto Profil ---
    try {
      const ppUrl = await socket.profilePictureUrl('6281234567890@s.whatsapp.net', 'image');
      console.log('URL foto profil:', ppUrl);
    } catch (error) {
      console.log('Tidak ada foto profil');
    }

    // --- Update Status Profil ---
    await socket.updateProfileStatus('🤖 Bot aktif!');

    // --- Kirim Presence (Typing/Online) ---
    const jid = '6281234567890@s.whatsapp.net';
    
    // Tampilkan "sedang mengetik"
    await socket.sendPresenceUpdate('composing', jid);
    
    // Tunggu 2 detik
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Berhenti mengetik
    await socket.sendPresenceUpdate('paused', jid);
    
    // Status online/offline
    await socket.sendPresenceUpdate('available'); // Online
    await socket.sendPresenceUpdate('unavailable'); // Offline

    // --- Tandai Pesan Sudah Dibaca ---
    await socket.readMessages([
      {
        remoteJid: '6281234567890@s.whatsapp.net',
        id: 'MESSAGE_ID_HERE',
        participant: undefined,
      },
    ]);

    // --- Metadata Grup ---
    const groupMetadata = await socket.groupMetadata('123456789@g.us');
    console.log('Nama grup:', groupMetadata.subject);
    console.log('Deskripsi:', groupMetadata.desc);
    console.log('Peserta:', groupMetadata.participants.length);

    // --- Update Grup ---
    await socket.groupUpdateSubject('123456789@g.us', 'Nama Grup Baru');
    await socket.groupUpdateDescription('123456789@g.us', 'Deskripsi baru');

    // --- Keluar dari Grup ---
    // await socket.groupLeave('123456789@g.us');

    // --- Block/Unblock Kontak ---
    await socket.updateBlockStatus('6281234567890@s.whatsapp.net', 'block');
    await socket.updateBlockStatus('6281234567890@s.whatsapp.net', 'unblock');
  }
}

// ============================================================
// 8. INTEGRASI WEBHOOK
// ============================================================

async function contohWebhook() {
  const wacap = await contohInisialisasi();
  const session = await wacap.sessions.start('webhook-session');

  const WEBHOOK_URL = 'https://your-server.com/webhook/whatsapp';

  // Fungsi helper untuk kirim ke webhook
  const kirimKeWebhook = async (event: string, data: any) => {
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'your-secret-key',
        },
        body: JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
      console.log(`✅ Webhook terkirim: ${event}`);
    } catch (error) {
      console.error('❌ Webhook gagal:', error);
    }
  };

  const events = session.getEventManager();

  // Forward semua event ke webhook
  events.onConnectionUpdate((data) => {
    kirimKeWebhook('connection.update', data);
  });

  events.onQRCode((data) => {
    kirimKeWebhook('qr.code', { sessionId: data.sessionId, qr: data.qr });
  });

  events.onMessageReceived((data) => {
    kirimKeWebhook('message.received', {
      sessionId: data.sessionId,
      from: data.from,
      body: data.body,
      messageType: data.messageType,
      timestamp: data.timestamp,
    });
  });

  events.onMessageSent((data) => {
    kirimKeWebhook('message.sent', data);
  });

  events.onGroupParticipantsUpdate((data) => {
    kirimKeWebhook('group.participants.update', data);
  });

  // Atau gunakan global listener untuk semua session
  wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, (data) => {
    kirimKeWebhook('global.message.received', data);
  });
}

// ============================================================
// 9. BOT AUTO-REPLY
// ============================================================

async function contohBotAutoReply() {
  const wacap = await contohInisialisasi();
  const session = await wacap.sessions.start('bot');

  session.getEventManager().onMessageReceived(async (data) => {
    // Abaikan pesan dari diri sendiri
    if (data.isFromMe) return;
    if (!data.from || !data.body) return;

    const pesan = data.body.toLowerCase();
    const pengirim = data.from;

    // Command handler sederhana
    switch (pesan) {
      case '!ping':
        await wacap.send.text('bot', pengirim, 'Pong! 🏓');
        break;

      case '!help':
        await wacap.send.text('bot', pengirim, 
          '📋 *Daftar Perintah:*\n\n' +
          '!ping - Cek bot aktif\n' +
          '!help - Tampilkan bantuan\n' +
          '!info - Info session\n' +
          '!waktu - Waktu sekarang'
        );
        break;

      case '!info':
        const info = wacap.sessions.info('bot');
        await wacap.send.text('bot', pengirim,
          `📱 *Info Session:*\n\n` +
          `ID: ${info?.sessionId}\n` +
          `Status: ${info?.status}\n` +
          `Nomor: ${info?.phoneNumber}\n` +
          `Nama: ${info?.userName}`
        );
        break;

      case '!waktu':
        const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        await wacap.send.text('bot', pengirim, `🕐 Waktu sekarang: ${waktu}`);
        break;

      default:
        // Keyword matching
        if (pesan.includes('halo') || pesan.includes('hai')) {
          await wacap.send.text('bot', pengirim, 'Halo juga! 👋 Ada yang bisa dibantu?');
        }
    }
  });

  console.log('🤖 Bot auto-reply aktif!');
}

// ============================================================
// 10. HTTP SERVER UNTUK TESTING
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';

// Store QR codes untuk diakses via API (raw string dan base64)
const qrCodes: Map<string, string> = new Map();
const qrBase64: Map<string, string> = new Map();

async function startHttpServer() {
  const wacap = await contohInisialisasi();
  const PORT = 3000;

  // Global event listener untuk menyimpan QR
  // Sekarang qrBase64 sudah otomatis di-generate oleh package jika qrCode.format = 'base64' atau 'all'
  wacap.onGlobal(WacapEventType.QR_CODE, (data) => {
    const eventData = data as ConnectionEventData;
    qrCodes.set(data.sessionId, eventData.qr || '');
    
    // Base64 sudah di-generate otomatis oleh package!
    if (eventData.qrBase64) {
      qrBase64.set(data.sessionId, eventData.qrBase64);
    }
    
    console.log(`📱 QR Code untuk session ${data.sessionId} tersedia di /qr/${data.sessionId}`);
  });

  // Global message listener dengan AUTO REPLY
  wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, async (data) => {
    const msg = data as MessageEventData;
    const sessionId = data.sessionId;
    const from = msg.from;
    const body = msg.body?.toLowerCase() || '';
    
    console.log(`📨 [${sessionId}] Pesan dari ${from}: "${msg.body}" (isFromMe: ${msg.isFromMe})`);

    // Skip jika pesan dari diri sendiri atau tidak ada pengirim
    if (msg.isFromMe) {
      console.log(`   ⏭️ Skip: pesan dari diri sendiri`);
      return;
    }
    if (!from) {
      console.log(`   ⏭️ Skip: tidak ada pengirim`);
      return;
    }
    if (!body) {
      console.log(`   ⏭️ Skip: body kosong (mungkin media tanpa caption)`);
      return;
    }

    console.log(`   🤖 Processing auto-reply untuk: "${body}"`);

    // ============================================================
    // AUTO REPLY COMMANDS
    // ============================================================
    try {
      // Command: !ping
      if (body === '!ping') {
        console.log(`   📤 Mengirim reply untuk: !ping`);
        const result = await wacap.send.text(sessionId, from, 'Pong! 🏓');
        console.log(`   ✅ Reply terkirim:`, result?.key?.id);
        return;
      }

      // Command: !help
      if (body === '!help') {
        await wacap.send.text(sessionId, from, 
          `🤖 *Wacap Bot Commands*\n\n` +
          `!ping - Cek bot aktif\n` +
          `!help - Tampilkan bantuan\n` +
          `!info - Info session\n` +
          `!time - Waktu sekarang\n` +
          `!sticker - Kirim gambar untuk dijadikan sticker\n` +
          `!poll - Contoh poll\n` +
          `!location - Contoh lokasi\n` +
          `!contact - Contoh kirim kontak\n` +
          `!menu - Menu interaktif`
        );
        return;
      }

      // Command: !info
      if (body === '!info') {
        const info = wacap.sessions.info(sessionId);
        await wacap.send.text(sessionId, from,
          `📱 *Session Info*\n\n` +
          `ID: ${info?.sessionId}\n` +
          `Status: ${info?.status}\n` +
          `Phone: ${info?.phoneNumber || 'N/A'}\n` +
          `Name: ${info?.userName || 'N/A'}\n` +
          `Active: ${info?.isActive ? 'Yes' : 'No'}`
        );
        return;
      }

      // Command: !time
      if (body === '!time') {
        const now = new Date();
        const timeStr = now.toLocaleString('id-ID', { 
          timeZone: 'Asia/Jakarta',
          dateStyle: 'full',
          timeStyle: 'long'
        });
        await wacap.send.text(sessionId, from, `🕐 ${timeStr}`);
        return;
      }

      // Command: !poll
      if (body === '!poll') {
        await wacap.send.poll(sessionId, from, 
          '🗳️ Pilih warna favorit kamu:',
          ['🔴 Merah', '🔵 Biru', '🟢 Hijau', '🟡 Kuning'],
          1
        );
        return;
      }

      // Command: !location
      if (body === '!location') {
        await wacap.send.location(sessionId, from, -6.2088, 106.8456, {
          name: 'Monas',
          address: 'Jakarta Pusat, Indonesia'
        });
        return;
      }

      // Command: !contact
      if (body === '!contact') {
        await wacap.send.contact(sessionId, from, {
          name: 'Wacap Bot Support',
          phone: '+628123456789'
        });
        return;
      }

      // Command: !menu (list message)
      if (body === '!menu') {
        await wacap.send.list(sessionId, from,
          '📋 Menu Utama',
          'Silakan pilih menu yang tersedia:',
          'Lihat Menu',
          [
            {
              title: '🛒 Produk',
              rows: [
                { id: 'prod_1', title: 'Produk A', description: 'Harga: Rp 100.000' },
                { id: 'prod_2', title: 'Produk B', description: 'Harga: Rp 200.000' },
              ]
            },
            {
              title: '📞 Layanan',
              rows: [
                { id: 'svc_1', title: 'Customer Service', description: 'Hubungi CS kami' },
                { id: 'svc_2', title: 'FAQ', description: 'Pertanyaan umum' },
              ]
            }
          ],
          'Powered by Wacap'
        );
        return;
      }

      // Command: !react (react to replied message)
      if (body.startsWith('!react ')) {
        const emoji = body.replace('!react ', '').trim();
        const quotedMsg = (msg.message as any)?.extendedTextMessage?.contextInfo;
        if (quotedMsg?.stanzaId) {
          await wacap.send.reaction(sessionId, from, quotedMsg.stanzaId, emoji);
        } else {
          await wacap.send.text(sessionId, from, 'Reply ke pesan yang ingin diberi reaksi dengan format: !react 👍');
        }
        return;
      }

      // Keyword: halo/hai/hi
      if (['halo', 'hai', 'hi', 'hello'].some(k => body.includes(k))) {
        console.log(`   📤 Mengirim reply untuk keyword: "${body}"`);
        const result = await wacap.send.text(sessionId, from, 
          `Halo! 👋\n\nSaya adalah Wacap Bot.\nKetik *!help* untuk melihat daftar perintah.`
        );
        console.log(`   ✅ Reply terkirim:`, result?.key?.id);
        return;
      }

      // Keyword: terima kasih
      if (body.includes('terima kasih') || body.includes('makasih') || body.includes('thanks')) {
        await wacap.send.text(sessionId, from, 'Sama-sama! 😊');
        return;
      }

      // Default: tidak ada command yang cocok
      console.log(`   ℹ️ Tidak ada command yang cocok untuk: "${body}"`);

    } catch (error: any) {
      console.error(`❌ Auto-reply error:`, error?.message || error);
    }
  });

  // Global connection listener
  wacap.onGlobal(WacapEventType.CONNECTION_OPEN, (data) => {
    console.log(`✅ Session ${data.sessionId} terhubung!`);
    // Hapus QR karena sudah tidak diperlukan
    qrCodes.delete(data.sessionId);
    qrBase64.delete(data.sessionId);
  });

  // ============================================================
  // AUTO START SESSION YANG TERSIMPAN
  // ============================================================
  console.log('\n🔄 Memuat session yang tersimpan...');
  const loadedSessions = await wacap.sessions.startAll();
  
  if (loadedSessions.length > 0) {
    console.log(`✅ ${loadedSessions.length} session dimuat: ${loadedSessions.join(', ')}`);
  } else {
    console.log('ℹ️  Tidak ada session tersimpan. Buat session baru via POST /sessions');
  }

  // Helper untuk parse JSON body
  const parseBody = (req: IncomingMessage): Promise<any> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
  };

  // Helper untuk response JSON
  const jsonResponse = (res: ServerResponse, data: any, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  };

  // HTTP Server
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    console.log(`${method} ${path}`);

    try {
      // ============================================================
      // GET /health - Health check
      // ============================================================
      if (method === 'GET' && path === '/health') {
        return jsonResponse(res, { status: 'ok', timestamp: new Date().toISOString() });
      }

      // ============================================================
      // GET /sessions - List semua session
      // ============================================================
      if (method === 'GET' && path === '/sessions') {
        const sessions = wacap.sessions.list();
        const sessionInfos = sessions.map(id => wacap.sessions.info(id));
        return jsonResponse(res, { sessions: sessionInfos });
      }

      // ============================================================
      // POST /sessions - Buat session baru
      // Body: { "sessionId": "my-session" }
      // ============================================================
      if (method === 'POST' && path === '/sessions') {
        const body = await parseBody(req);
        const sessionId = body.sessionId || `session-${Date.now()}`;
        
        if (wacap.hasSession(sessionId)) {
          return jsonResponse(res, { error: 'Session sudah ada' }, 400);
        }

        await wacap.sessions.start(sessionId);
        return jsonResponse(res, { 
          message: 'Session dibuat',
          sessionId,
          qrUrl: `/qr/${sessionId}`
        }, 201);
      }

      // ============================================================
      // GET /sessions/:id - Info session tertentu
      // ============================================================
      if (method === 'GET' && path.match(/^\/sessions\/[\w-]+$/)) {
        const sessionId = path.split('/')[2];
        const info = wacap.sessions.info(sessionId);
        
        if (!info) {
          return jsonResponse(res, { error: 'Session tidak ditemukan' }, 404);
        }
        return jsonResponse(res, info);
      }

      // ============================================================
      // DELETE /sessions/:id - Hapus session
      // ============================================================
      if (method === 'DELETE' && path.match(/^\/sessions\/[\w-]+$/)) {
        const sessionId = path.split('/')[2];
        
        if (!wacap.hasSession(sessionId)) {
          return jsonResponse(res, { error: 'Session tidak ditemukan' }, 404);
        }

        await wacap.deleteSession(sessionId);
        qrCodes.delete(sessionId);
        qrBase64.delete(sessionId);
        return jsonResponse(res, { message: 'Session dihapus', sessionId });
      }

      // ============================================================
      // GET /qr/:sessionId - Dapatkan QR code (base64 image)
      // ============================================================
      if (method === 'GET' && path.match(/^\/qr\/[\w-]+$/)) {
        const sessionId = path.split('/')[2];
        const qr = qrCodes.get(sessionId);
        const base64 = qrBase64.get(sessionId);
        
        if (!qr) {
          return jsonResponse(res, { 
            error: 'QR tidak tersedia',
            hint: 'Session mungkin sudah terhubung atau belum dimulai'
          }, 404);
        }
        return jsonResponse(res, { 
          sessionId, 
          qr,           // Raw QR string
          base64,       // Base64 data URL (dapat langsung dipakai di <img src="...">)
          html: `<img src="${base64}" alt="QR Code" />`  // HTML snippet
        });
      }

      // ============================================================
      // GET /qr/:sessionId/image - Render QR sebagai gambar langsung
      // ============================================================
      if (method === 'GET' && path.match(/^\/qr\/[\w-]+\/image$/)) {
        const sessionId = path.split('/')[2];
        const base64 = qrBase64.get(sessionId);
        
        if (!base64) {
          return jsonResponse(res, { error: 'QR tidak tersedia' }, 404);
        }

        // Decode base64 dan kirim sebagai image
        const base64Data = base64.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        res.writeHead(200, { 
          'Content-Type': 'image/png',
          'Content-Length': imgBuffer.length
        });
        return res.end(imgBuffer);
      }

      // ============================================================
      // POST /send/text - Kirim pesan teks
      // Body: { "sessionId": "xxx", "to": "628xxx@s.whatsapp.net", "text": "Hello" }
      // ============================================================
      if (method === 'POST' && path === '/send/text') {
        const body = await parseBody(req);
        const { sessionId, to, text, mentions } = body;

        if (!sessionId || !to || !text) {
          return jsonResponse(res, { error: 'sessionId, to, dan text wajib diisi' }, 400);
        }

        if (!wacap.hasSession(sessionId)) {
          return jsonResponse(res, { error: 'Session tidak ditemukan' }, 404);
        }

        const result = await wacap.send.text(sessionId, to, text, { mentions });
        return jsonResponse(res, { message: 'Pesan terkirim', result });
      }

      // ============================================================
      // POST /send/media - Kirim media
      // Body: { "sessionId": "xxx", "to": "628xxx", "url": "https://...", "mimetype": "image/jpeg", "caption": "..." }
      // ============================================================
      if (method === 'POST' && path === '/send/media') {
        const body = await parseBody(req);
        const { sessionId, to, url, mimetype, caption, fileName } = body;

        if (!sessionId || !to || !url) {
          return jsonResponse(res, { error: 'sessionId, to, dan url wajib diisi' }, 400);
        }

        if (!wacap.hasSession(sessionId)) {
          return jsonResponse(res, { error: 'Session tidak ditemukan' }, 404);
        }

        const result = await wacap.send.media(sessionId, to, { url, mimetype, caption, fileName });
        return jsonResponse(res, { message: 'Media terkirim', result });
      }

      // ============================================================
      // POST /groups/create - Buat grup baru
      // Body: { "sessionId": "xxx", "subject": "Nama Grup", "participants": ["628xxx@s.whatsapp.net"] }
      // ============================================================
      if (method === 'POST' && path === '/groups/create') {
        const body = await parseBody(req);
        const { sessionId, subject, participants } = body;

        if (!sessionId || !subject || !participants?.length) {
          return jsonResponse(res, { error: 'sessionId, subject, dan participants wajib diisi' }, 400);
        }

        const result = await wacap.groups.create(sessionId, subject, participants);
        return jsonResponse(res, { message: 'Grup dibuat', result });
      }

      // ============================================================
      // GET /groups/:sessionId - List semua grup
      // ============================================================
      if (method === 'GET' && path.match(/^\/groups\/[\w-]+$/)) {
        const sessionId = path.split('/')[2];
        const socket = wacap.getSocket(sessionId);

        if (!socket) {
          return jsonResponse(res, { error: 'Session tidak ditemukan atau belum terhubung' }, 404);
        }

        const groups = await socket.groupFetchAllParticipating();
        const groupList = Object.entries(groups).map(([id, meta]) => ({
          id,
          subject: meta.subject,
          participants: meta.participants.length,
          owner: meta.owner,
        }));

        return jsonResponse(res, { groups: groupList });
      }

      // ============================================================
      // POST /groups/participants - Kelola peserta grup
      // Body: { "sessionId": "xxx", "groupId": "xxx@g.us", "participants": ["628xxx"], "action": "add|remove|promote|demote" }
      // ============================================================
      if (method === 'POST' && path === '/groups/participants') {
        const body = await parseBody(req);
        const { sessionId, groupId, participants, action } = body;

        if (!sessionId || !groupId || !participants?.length || !action) {
          return jsonResponse(res, { error: 'sessionId, groupId, participants, dan action wajib diisi' }, 400);
        }

        let result;
        switch (action) {
          case 'add':
            result = await wacap.groups.addParticipants(sessionId, groupId, participants);
            break;
          case 'remove':
            result = await wacap.groups.removeParticipants(sessionId, groupId, participants);
            break;
          case 'promote':
            result = await wacap.groups.promoteParticipants(sessionId, groupId, participants);
            break;
          case 'demote':
            result = await wacap.groups.demoteParticipants(sessionId, groupId, participants);
            break;
          default:
            return jsonResponse(res, { error: 'Action tidak valid. Gunakan: add, remove, promote, demote' }, 400);
        }

        return jsonResponse(res, { message: `Peserta ${action} berhasil`, result });
      }

      // ============================================================
      // POST /typing - Kirim status typing
      // ============================================================
      if (method === 'POST' && path === '/typing') {
        const body = await parseBody(req);
        const { sessionId, to, duration = 3000 } = body;

        await wacap.presence.update(sessionId, to, 'composing');
        setTimeout(async () => {
          await wacap.presence.update(sessionId, to, 'paused');
        }, duration);

        return jsonResponse(res, { message: 'Typing indicator dikirim', duration });
      }

      // ============================================================
      // POST /contacts/check - Cek nomor terdaftar di WhatsApp
      // ============================================================
      if (method === 'POST' && path === '/contacts/check') {
        const body = await parseBody(req);
        const { sessionId, phoneNumber, phoneNumbers } = body;

        if (!sessionId) {
          return jsonResponse(res, { error: 'sessionId wajib diisi' }, 400);
        }

        if (phoneNumbers && Array.isArray(phoneNumbers)) {
          const results = await wacap.contacts.checkMultiple(sessionId, phoneNumbers);
          return jsonResponse(res, { results });
        }

        if (!phoneNumber) {
          return jsonResponse(res, { error: 'phoneNumber atau phoneNumbers wajib diisi' }, 400);
        }

        const result = await wacap.contacts.check(sessionId, phoneNumber);
        return jsonResponse(res, result);
      }

      // ============================================================
      // POST /send/location - Kirim lokasi
      // ============================================================
      if (method === 'POST' && path === '/send/location') {
        const body = await parseBody(req);
        const { sessionId, to, latitude, longitude, name, address } = body;

        if (!sessionId || !to || latitude === undefined || longitude === undefined) {
          return jsonResponse(res, { error: 'sessionId, to, latitude, longitude wajib diisi' }, 400);
        }

        const result = await wacap.send.location(sessionId, to, latitude, longitude, { name, address });
        return jsonResponse(res, { message: 'Lokasi terkirim', result });
      }

      // ============================================================
      // POST /send/contact - Kirim kontak
      // ============================================================
      if (method === 'POST' && path === '/send/contact') {
        const body = await parseBody(req);
        const { sessionId, to, contact, contacts } = body;

        if (!sessionId || !to) {
          return jsonResponse(res, { error: 'sessionId dan to wajib diisi' }, 400);
        }

        if (contacts && Array.isArray(contacts)) {
          const result = await wacap.send.contacts(sessionId, to, contacts);
          return jsonResponse(res, { message: 'Kontak terkirim', result });
        }

        if (!contact?.name || !contact?.phone) {
          return jsonResponse(res, { error: 'contact.name dan contact.phone wajib diisi' }, 400);
        }

        const result = await wacap.send.contact(sessionId, to, contact);
        return jsonResponse(res, { message: 'Kontak terkirim', result });
      }

      // ============================================================
      // POST /send/reaction - Kirim reaksi
      // ============================================================
      if (method === 'POST' && path === '/send/reaction') {
        const body = await parseBody(req);
        const { sessionId, to, messageId, emoji } = body;

        if (!sessionId || !to || !messageId) {
          return jsonResponse(res, { error: 'sessionId, to, messageId wajib diisi' }, 400);
        }

        const result = await wacap.send.reaction(sessionId, to, messageId, emoji || '');
        return jsonResponse(res, { message: emoji ? 'Reaksi terkirim' : 'Reaksi dihapus', result });
      }

      // ============================================================
      // POST /send/poll - Kirim poll
      // ============================================================
      if (method === 'POST' && path === '/send/poll') {
        const body = await parseBody(req);
        const { sessionId, to, name, options, selectableCount = 1 } = body;

        if (!sessionId || !to || !name || !options?.length) {
          return jsonResponse(res, { error: 'sessionId, to, name, options wajib diisi' }, 400);
        }

        const result = await wacap.send.poll(sessionId, to, name, options, selectableCount);
        return jsonResponse(res, { message: 'Poll terkirim', result });
      }

      // ============================================================
      // POST /chat/read - Tandai pesan sudah dibaca
      // ============================================================
      if (method === 'POST' && path === '/chat/read') {
        const body = await parseBody(req);
        const { sessionId, jid, messageIds } = body;

        if (!sessionId || !jid || !messageIds?.length) {
          return jsonResponse(res, { error: 'sessionId, jid, messageIds wajib diisi' }, 400);
        }

        await wacap.chat.markAsRead(sessionId, jid, messageIds);
        return jsonResponse(res, { message: 'Pesan ditandai sudah dibaca' });
      }

      // ============================================================
      // POST /contacts/block - Block/unblock kontak
      // ============================================================
      if (method === 'POST' && path === '/contacts/block') {
        const body = await parseBody(req);
        const { sessionId, jid, block = true } = body;

        if (!sessionId || !jid) {
          return jsonResponse(res, { error: 'sessionId dan jid wajib diisi' }, 400);
        }

        if (block) {
          await wacap.contacts.block(sessionId, jid);
        } else {
          await wacap.contacts.unblock(sessionId, jid);
        }

        return jsonResponse(res, { message: block ? 'Kontak diblokir' : 'Kontak di-unblock' });
      }

      // ============================================================
      // POST /profile/status - Update status profil
      // ============================================================
      if (method === 'POST' && path === '/profile/status') {
        const body = await parseBody(req);
        const { sessionId, status } = body;

        if (!sessionId || !status) {
          return jsonResponse(res, { error: 'sessionId dan status wajib diisi' }, 400);
        }

        await wacap.profile.updateStatus(sessionId, status);
        return jsonResponse(res, { message: 'Status profil diupdate' });
      }

      // ============================================================
      // GET /contacts/picture/:sessionId/:jid - Get profile picture
      // ============================================================
      if (method === 'GET' && path.match(/^\/contacts\/picture\/[\w-]+\/.+$/)) {
        const parts = path.split('/');
        const sessionId = parts[3];
        const jid = parts.slice(4).join('/');

        const url = await wacap.contacts.getProfilePicture(sessionId, jid);
        return jsonResponse(res, { url });
      }

      // ============================================================
      // GET / - API Documentation
      // ============================================================
      if (method === 'GET' && path === '/') {
        return jsonResponse(res, {
          name: 'Wacap Wrapper API',
          version: '1.0.0',
          endpoints: {
            'GET /health': 'Health check',
            'GET /sessions': 'List semua session',
            'POST /sessions': 'Buat session baru { sessionId }',
            'GET /sessions/:id': 'Info session',
            'DELETE /sessions/:id': 'Hapus session',
            'GET /qr/:sessionId': 'Dapatkan QR code',
            'POST /send/text': 'Kirim teks { sessionId, to, text, mentions? }',
            'POST /send/media': 'Kirim media { sessionId, to, url, mimetype?, caption?, fileName? }',
            'POST /send/location': 'Kirim lokasi { sessionId, to, latitude, longitude, name?, address? }',
            'POST /send/contact': 'Kirim kontak { sessionId, to, contact | contacts }',
            'POST /send/reaction': 'Kirim reaksi { sessionId, to, messageId, emoji }',
            'POST /send/poll': 'Kirim poll { sessionId, to, name, options, selectableCount? }',
            'GET /groups/:sessionId': 'List grup',
            'POST /groups/create': 'Buat grup { sessionId, subject, participants }',
            'POST /groups/participants': 'Kelola peserta { sessionId, groupId, participants, action }',
            'POST /contacts/check': 'Cek nomor WA { sessionId, phoneNumber | phoneNumbers }',
            'POST /contacts/block': 'Block/unblock { sessionId, jid, block? }',
            'GET /contacts/picture/:sessionId/:jid': 'Get profile picture',
            'POST /chat/read': 'Mark as read { sessionId, jid, messageIds }',
            'POST /profile/status': 'Update status { sessionId, status }',
            'POST /typing': 'Kirim typing { sessionId, to, duration? }',
          }
        });
      }

      // 404 Not Found
      return jsonResponse(res, { error: 'Endpoint tidak ditemukan' }, 404);

    } catch (error: any) {
      console.error('❌ Error:', error);
      return jsonResponse(res, { error: error.message || 'Internal server error' }, 500);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🚀 HTTP Server berjalan di http://localhost:${PORT}`);
    console.log('\n📋 Endpoint tersedia:');
    console.log('   GET  /                  - API Documentation');
    console.log('   GET  /health            - Health check');
    console.log('   GET  /sessions          - List sessions');
    console.log('   POST /sessions          - Buat session');
    console.log('   GET  /sessions/:id      - Info session');
    console.log('   DELETE /sessions/:id    - Hapus session');
    console.log('   GET  /qr/:id            - QR code');
    console.log('   POST /send/text         - Kirim teks');
    console.log('   POST /send/media        - Kirim media');
    console.log('   POST /send/location     - Kirim lokasi');
    console.log('   POST /send/contact      - Kirim kontak');
    console.log('   POST /send/reaction     - Kirim reaksi');
    console.log('   POST /send/poll         - Kirim poll');
    console.log('   GET  /groups/:id        - List grup');
    console.log('   POST /groups/create     - Buat grup');
    console.log('   POST /groups/participants - Kelola peserta');
    console.log('   POST /contacts/check    - Cek nomor WA');
    console.log('   POST /contacts/block    - Block/unblock');
    console.log('   GET  /contacts/picture  - Profile picture');
    console.log('   POST /chat/read         - Mark as read');
    console.log('   POST /profile/status    - Update status');
    console.log('   POST /typing            - Typing indicator');
    console.log('\n💡 Contoh: curl http://localhost:3000/sessions');
    console.log('💡 Buat session: curl -X POST http://localhost:3000/sessions -H "Content-Type: application/json" -d \'{"sessionId":"test"}\'');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    server.close();
    await wacap.destroy();
    console.log('👋 Bye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ============================================================
// MAIN
// ============================================================

startHttpServer().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});