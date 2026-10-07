import { WacapWrapper, WacapEventType } from '../src';

/**
 * Complete Features Example
 * Demonstrates all major features of Wacap Wrapper
 */
async function completeExample() {
  console.log('🚀 Wacap Wrapper - Complete Features Demo\n');

  // ==========================================
  // 1. INITIALIZATION
  // ==========================================
  const wacap = new WacapWrapper({
    sessionsPath: './sessions',
    storageAdapter: 'sqlite', // or 'prisma'
    autoDisplayQR: true,
    debug: false,
    logger: { level: 'warn' },
    browser: ['Wacap Bot', 'Chrome', '1.0.0'],
    connectionTimeout: 60000,
    maxRetries: 5,
  });

  await wacap.init();
  console.log('✅ Initialized\n');

  // ==========================================
  // 2. SESSION MANAGEMENT
  // ==========================================
  console.log('📱 Starting session...');
  const session = await wacap.sessionStart('demo-session');

  // Check if session exists
  if (wacap.hasSession('demo-session')) {
    console.log('✅ Session exists\n');
  }

  // Get session info
  const info = wacap.getSessionInfo('demo-session');
  console.log('Session Info:', info);

  // Get all sessions
  const allSessions = wacap.getAllSessions();
  console.log('Total sessions:', allSessions.size);

  // ==========================================
  // 3. EVENT HANDLERS
  // ==========================================
  const eventManager = session.getEventManager();

  // QR Code
  eventManager.onQRCode((data) => {
    console.log('\n📲 QR Code received at:', data.timestamp);
  });

  // Connection Events
  eventManager.onConnectionOpen((data) => {
    console.log('\n✅ Connected!');
    console.log('Session:', data.sessionId);
  });

  eventManager.onConnectionClose((data) => {
    console.log('\n❌ Disconnected');
    if (data.error) {
      console.error('Error:', data.error);
    }
  });

  // Message Events
  eventManager.onMessageReceived(async (data) => {
    console.log('\n📨 Message Received:');
    console.log('  From:', data.from);
    console.log('  Body:', data.body);
    console.log('  Type:', data.messageType);
    console.log('  Time:', data.timestamp);

    if (!data.from) return;

    // ==========================================
    // 4. SENDING MESSAGES
    // ==========================================

    // Text message
    if (data.body === '!hello') {
      await wacap.sendMessage('demo-session', data.from, 'Hello! 👋');
    }

    // Message with mentions
    if (data.body === '!mention') {
      await wacap.sendMessage(
        'demo-session',
        data.from,
        `Hello @${data.from.split('@')[0]}! 👋`,
        { mentions: [data.from] }
      );
    }

    // Send image
    if (data.body === '!image') {
      await wacap.sendMedia('demo-session', data.from, {
        url: 'https://picsum.photos/800/600',
        mimetype: 'image/jpeg',
        caption: 'Here is a random image! 🖼️',
      });
    }

    // Send document
    if (data.body === '!doc') {
      await wacap.sendMedia('demo-session', data.from, {
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        mimetype: 'application/pdf',
        fileName: 'sample.pdf',
        caption: 'Sample PDF document 📄',
      });
    }

    // ==========================================
    // 5. ADVANCED BAILEYS FEATURES
    // ==========================================
    const socket = wacap.getSocket('demo-session');

    if (socket) {
      // Fetch groups
      if (data.body === '!groups') {
        const groups = await socket.groupFetchAllParticipating();
        const groupList = Object.values(groups)
          .map((g: any) => `• ${g.subject}`)
          .join('\n');
        
        await wacap.sendMessage(
          'demo-session',
          data.from,
          `📱 Your Groups:\n\n${groupList}`
        );
      }

      // Get profile picture
      if (data.body === '!pp') {
        try {
          const ppUrl = await socket.profilePictureUrl(data.from, 'image');
          if (ppUrl) {
            await wacap.sendMedia('demo-session', data.from, {
              url: ppUrl,
              mimetype: 'image/jpeg',
              caption: 'Your profile picture! 📷',
            });
          }
        } catch (error) {
          await wacap.sendMessage('demo-session', data.from, 'No profile picture found');
        }
      }

      // Read message
      if (data.message.key.id) {
        await socket.readMessages([data.message.key]);
      }

      // Send presence (typing, recording, etc.)
      if (data.body === '!typing') {
        await socket.sendPresenceUpdate('composing', data.from);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await socket.sendPresenceUpdate('paused', data.from);
        await wacap.sendMessage('demo-session', data.from, 'I was typing! ⌨️');
      }

      // Update status
      if (data.body === '!status') {
        await socket.updateProfileStatus('🤖 Bot is online!');
        await wacap.sendMessage('demo-session', data.from, 'Status updated! ✅');
      }
    }
  });

  eventManager.onMessageSent((data) => {
    console.log('📤 Message sent');
  });

  // Group Events
  eventManager.onGroupParticipantsUpdate((data) => {
    console.log('\n👥 Group participants update:');
    console.log('  Group:', data.groupId);
    console.log('  Action:', data.action);
    console.log('  Participants:', data.participants);
  });

  // Presence Updates
  eventManager.onPresenceUpdate((data) => {
    console.log('\n👤 Presence update:', data.jid);
  });

  // ==========================================
  // 6. WEBHOOK INTEGRATION
  // ==========================================
  const webhookUrl = 'https://your-webhook.com/whatsapp';

  const forwardToWebhook = async (event: string, data: any) => {
    try {
      // Uncomment to enable webhook
      // await fetch(webhookUrl, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ event, data, timestamp: new Date() })
      // });
      console.log(`🔗 Would send to webhook: ${event}`);
    } catch (error) {
      console.error('Webhook error:', error);
    }
  };

  // Forward all message events to webhook
  eventManager.on(WacapEventType.MESSAGE_RECEIVED, (data) => {
    forwardToWebhook('message.received', data);
  });

  eventManager.on(WacapEventType.MESSAGE_SENT, (data) => {
    forwardToWebhook('message.sent', data);
  });

  // ==========================================
  // 7. MULTI-SESSION EXAMPLE
  // ==========================================
  
  // You can start multiple sessions
  // const session2 = await wacap.sessionStart('session-2');
  // const session3 = await wacap.sessionStart('session-3');
  
  // Each session operates independently with its own events

  // ==========================================
  // 8. SESSION LIFECYCLE
  // ==========================================

  // Stop a session (keeps data)
  // await wacap.sessionStop('demo-session');

  // Delete session (removes all data)
  // await wacap.deleteSession('demo-session');

  // ==========================================
  // 9. GRACEFUL SHUTDOWN
  // ==========================================
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    
    // Stop all sessions and cleanup
    await wacap.destroy();
    
    console.log('👋 Goodbye!\n');
    process.exit(0);
  });

  console.log('\n💡 Demo is running...');
  console.log('💡 Send messages to test features:');
  console.log('   • !hello - Simple greeting');
  console.log('   • !mention - Mention example');
  console.log('   • !image - Send image');
  console.log('   • !doc - Send document');
  console.log('   • !groups - List your groups');
  console.log('   • !pp - Get your profile picture');
  console.log('   • !typing - Simulate typing');
  console.log('   • !status - Update bot status');
  console.log('\n💡 Press Ctrl+C to stop\n');
}

// Run the demo
completeExample().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
