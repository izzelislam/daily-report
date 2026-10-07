import { WacapWrapper } from '../src';
import { PrismaClient } from '@prisma/client';

/**
 * Example using Prisma with MySQL/PostgreSQL
 * 
 * Prerequisites:
 * 1. Install Prisma: npm install @prisma/client
 * 2. Setup Prisma: npx prisma init
 * 3. Copy the schema from prisma-schema.example to prisma/schema.prisma
 * 4. Configure DATABASE_URL in .env
 * 5. Run migrations: npx prisma migrate dev
 */
async function prismaExample() {
  // Create Prisma client
  const prisma = new PrismaClient();

  // Create Wacap wrapper with Prisma storage
  const wacap = new WacapWrapper({
    storageAdapter: 'prisma',
    prismaClient: prisma,
    sessionsPath: './sessions', // Still needed for auth files
    autoDisplayQR: true,
  });

  // Initialize
  await wacap.init();

  // Start session - data will be stored in MySQL/PostgreSQL
  const session = await wacap.sessionStart('prisma-session-1');

  session.getEventManager().onConnectionOpen(async (data) => {
    console.log('Connected with Prisma storage!');
    
    // Send a test message
    await wacap.sendMessage(
      'prisma-session-1',
      '6281234567890@s.whatsapp.net',
      'Hello from Wacap with Prisma!'
    );
  });

  session.getEventManager().onMessageReceived(async (data) => {
    console.log('Message saved to database:', data.body);
    
    // Messages are automatically saved to MySQL/PostgreSQL
    // You can query them directly using Prisma
    const messages = await prisma.message.findMany({
      where: {
        sessionId: 'prisma-session-1',
      },
      take: 10,
      orderBy: {
        timestamp: 'desc',
      },
    });

    console.log('Recent messages from DB:', messages.length);
  });

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await wacap.destroy();
    await prisma.$disconnect();
    process.exit(0);
  });
}

if (require.main === module) {
  prismaExample().catch(console.error);
}
