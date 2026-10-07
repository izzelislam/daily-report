import { WacapWrapper, WacapEventType } from '../src';

/**
 * Basic usage example with SQLite (default)
 */
async function basicExample() {
  // Create wrapper instance with SQLite storage (default)
  const wacap = new WacapWrapper({
    sessionsPath: './sessions',
    autoDisplayQR: true,
    debug: false,
  });

  // Initialize
  await wacap.init();
  // Restore and start any sessions found in storage automatically
  await wacap.loadAllStoredSessions();

  // Global listener (receives QR from any session)
  wacap.onGlobal(WacapEventType.QR_CODE, (data) => {
    console.log('[GLOBAL] QR for session', data.sessionId);
  });

  // Start a session
  const session = await wacap.sessions.start('my-session-1');

  // Listen for QR code
  session.getEventManager().onQRCode((data) => {
    console.log('QR Code received!');
    // You can send this QR to a webhook or display it in your app
  });

  // Listen for connection open
  session.getEventManager().onConnectionOpen((data) => {
    console.log('Connected successfully!');
    console.log('Phone:', data.state);
  });

  // Listen for incoming messages
  session.getEventManager().onMessageReceived(async (data) => {
    console.log('New message:', data.body);
    console.log('From:', data.from);
    
    // Auto-reply example
    if (data.body === '!ping' && data.from) {
      await wacap.send.text('my-session-1', data.from, 'Pong! 🏓');
    }
  });

  // Listen for all events (useful for webhooks)
  session.getEventManager().on(WacapEventType.MESSAGE_RECEIVED, async (data: any) => {
    // Send to your webhook
    // await fetch('https://your-webhook.com/whatsapp', {
    //   method: 'POST',
    //   body: JSON.stringify(data)
    // });
  });
}

/**
 * Multi-session example
 */
async function multiSessionExample() {
  const wacap = new WacapWrapper();
  await wacap.init();

  // Global example: log every incoming message from all sessions
  wacap.onGlobal(WacapEventType.MESSAGE_RECEIVED, (data) => {
    console.log(`[GLOBAL] [${data.sessionId}] ${data.body}`);
  });

  // Start multiple sessions
  const session1 = await wacap.sessions.start('session-1');
  const session2 = await wacap.sessions.start('session-2');
  const session3 = await wacap.sessions.start('session-3');

  // Each session is independent
  session1.getEventManager().onMessageReceived((data) => {
    console.log('[Session 1] Message:', data.body);
  });

  session2.getEventManager().onMessageReceived((data) => {
    console.log('[Session 2] Message:', data.body);
  });

  // Find a specific session
  const foundSession = wacap.findSession('session-1');
  if (foundSession) {
    console.log('Found session:', foundSession.getInfo());
  }

  // Get all active sessions
  const allSessions = wacap.getAllSessions();
  console.log('Active sessions:', allSessions.size);

  // Stop a session
  await wacap.sessions.stop('session-2');

  // Delete session data
  await wacap.deleteSession('session-3');
}

/**
 * Sending messages example
 */
async function sendingMessagesExample() {
  const wacap = new WacapWrapper();
  await wacap.init();
  
  const session = await wacap.sessions.start('sender-session');

  // Wait for connection
  await new Promise((resolve) => {
    session.getEventManager().onConnectionOpen(resolve);
  });

  // Send text message
  await wacap.send.text('sender-session', '6281234567890@s.whatsapp.net', 'Hello from Wacap! 👋');

  // Send message with mentions
  await wacap.send.text('sender-session', '6281234567890@s.whatsapp.net', 'Hello @6281234567890!', {
    mentions: ['6281234567890@s.whatsapp.net'],
  });

  // Send image
  await wacap.send.media('sender-session', '6281234567890@s.whatsapp.net', {
    url: 'https://example.com/image.jpg',
    mimetype: 'image/jpeg',
    caption: 'Check this out!',
  });

  // Send document
  await wacap.send.media('sender-session', '6281234567890@s.whatsapp.net', {
    url: 'https://example.com/document.pdf',
    mimetype: 'application/pdf',
    fileName: 'document.pdf',
    caption: 'Here is the document',
  });

  // Send video
  await wacap.send.media('sender-session', '6281234567890@s.whatsapp.net', {
    buffer: Buffer.from('...'), // video buffer
    mimetype: 'video/mp4',
    caption: 'Video caption',
  });
}

/**
 * Advanced usage with raw socket
 */
async function advancedExample() {
  const wacap = new WacapWrapper();
  await wacap.init();
  
  const session = await wacap.sessionStart('advanced-session');

  // Wait for connection
  await new Promise((resolve) => {
    session.getEventManager().onConnectionOpen(resolve);
  });

  // Get raw Baileys socket for advanced features
  const socket = wacap.getSocket('advanced-session');
  
  if (socket) {
    // Use any Baileys methods directly
    const groups = await socket.groupFetchAllParticipating();
    console.log('Groups:', Object.keys(groups).length);

    // Get profile picture
    const ppUrl = await socket.profilePictureUrl('6281234567890@s.whatsapp.net');
    console.log('Profile picture:', ppUrl);

    // Update profile status
    await socket.updateProfileStatus('Hello from Wacap!');

    // Read messages
    await socket.readMessages([
      {
        remoteJid: '6281234567890@s.whatsapp.net',
        id: 'message-id',
        participant: undefined,
      },
    ]);

    // Send presence update
    await socket.sendPresenceUpdate('available', '6281234567890@s.whatsapp.net');
  }
}

/**
 * Webhook integration example
 */
async function webhookExample() {
  const wacap = new WacapWrapper();
  await wacap.init();
  
  const session = await wacap.sessionStart('webhook-session');

  // Simple webhook forwarder
  const webhookUrl = 'https://your-webhook.com/whatsapp';

  const sendToWebhook = async (eventType: string, data: any) => {
    try {
      // Using fetch (Node 18+) or use axios/node-fetch
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: eventType,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Webhook error:', error);
    }
  };

  // Forward all events to webhook
  session.getEventManager().onConnectionUpdate((data) => {
    sendToWebhook('connection.update', data);
  });

  session.getEventManager().onMessageReceived((data) => {
    sendToWebhook('message.received', data);
  });

  session.getEventManager().onMessageSent((data) => {
    sendToWebhook('message.sent', data);
  });

  session.getEventManager().onGroupParticipantsUpdate((data) => {
    sendToWebhook('group.participants.update', data);
  });
}

// Run examples
if (require.main === module) {
  // Choose which example to run
  basicExample().catch(console.error);
  // multiSessionExample().catch(console.error);
  // sendingMessagesExample().catch(console.error);
  // advancedExample().catch(console.error);
  // webhookExample().catch(console.error);
}
