import { WacapWrapper, WacapEventType } from 'wacap-wrapper';

/**
 * Quick Start Example
 * This is the simplest way to get started with Wacap Wrapper
 */
async function quickStart() {
  console.log('🚀 Starting Wacap Wrapper...\n');

  // Create wrapper instance
  const wacap = new WacapWrapper({
    sessionsPath: './sessions',
    autoDisplayQR: true,
    debug: false,
  });

  // Initialize
  await wacap.init();
  console.log('✅ Wrapper initialized\n');

  // Start a session
  console.log('📱 Starting session...');
  const session = await wacap.sessionStart('my-first-session');

  // Listen for QR code
  session.getEventManager().onQRCode((data) => {
    console.log('\n📲 QR Code received! Scan it with WhatsApp mobile app\n');
  });

  // Listen for successful connection
  session.getEventManager().onConnectionOpen((data) => {
    console.log('\n✅ Connected successfully!');
    console.log('📱 Your WhatsApp is now connected!\n');
  });

  // Listen for connection close
  session.getEventManager().onConnectionClose((data) => {
    console.log('\n❌ Connection closed');
  });

  // Listen for incoming messages
  session.getEventManager().onMessageReceived(async (data) => {
    console.log('\n📨 New message received:');
    console.log('   From:', data.from);
    console.log('   Message:', data.body);
    console.log('   Type:', data.messageType);

    // Simple auto-reply example
    if (data.body?.toLowerCase() === 'ping' && data.from) {
      console.log('   → Auto-replying with "Pong!"');
      await wacap.sendMessage('my-first-session', data.from, 'Pong! 🏓');
    }

    // Help command
    if (data.body?.toLowerCase() === 'help' && data.from) {
      const helpText = `
🤖 Available Commands:
• ping - Test bot response
• help - Show this help message
• info - Get bot information
      `.trim();
      
      await wacap.sendMessage('my-first-session', data.from, helpText);
    }

    // Info command
    if (data.body?.toLowerCase() === 'info' && data.from) {
      const info = session.getInfo();
      const infoText = `
ℹ️ Bot Information:
• Session ID: ${info.sessionId}
• Status: ${info.isActive ? 'Active' : 'Inactive'}
• Phone: ${info.phoneNumber || 'N/A'}
      `.trim();
      
      await wacap.sendMessage('my-first-session', data.from, infoText);
    }
  });

  // Listen for sent messages
  session.getEventManager().onMessageSent((data) => {
    console.log('\n📤 Message sent');
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await wacap.destroy();
    console.log('👋 Goodbye!\n');
    process.exit(0);
  });

  console.log('\n💡 Waiting for WhatsApp connection...');
  console.log('💡 Press Ctrl+C to stop\n');
}

// Run the example
quickStart().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
