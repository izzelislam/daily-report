import { IStorageAdapter } from '../types';
import type { WAMessage, Contact } from '@whiskeysockets/baileys';

/**
 * Prisma storage adapter for session data
 * Requires @prisma/client to be installed and configured by the user
 */
export class PrismaStorageAdapter implements IStorageAdapter {
  private prisma: any;

  constructor(prismaClient: any) {
    if (!prismaClient) {
      throw new Error(
        'PrismaClient instance is required. Please provide it in the config.'
      );
    }
    this.prisma = prismaClient;
  }

  async init(): Promise<void> {
    // Prisma schema should be managed by the user
    // This assumes the user has created appropriate models
    // Example schema models needed:
    // - Session (id, sessionId, creds, createdAt, updatedAt)
    // - Message (id, sessionId, jid, message, timestamp, fromMe)
    // - Contact (id, sessionId, jid, name, notify, data)
    // - Chat (id, sessionId, jid, data, timestamp)
  }

  async saveSession(sessionId: string, creds: any): Promise<void> {
    await this.prisma.session.upsert({
      where: { sessionId },
      update: {
        creds: JSON.stringify(creds),
        updatedAt: new Date(),
      },
      create: {
        sessionId,
        creds: JSON.stringify(creds),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async loadSession(sessionId: string): Promise<any | null> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId },
    });

    return session ? JSON.parse(session.creds) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.session.delete({
      where: { sessionId },
    });
  }

  async hasSession(sessionId: string): Promise<boolean> {
    const count = await this.prisma.session.count({
      where: { sessionId },
    });

    return count > 0;
  }

  async saveMessage(sessionId: string, message: WAMessage): Promise<void> {
    const messageId = message.key.id!;
    const jid = message.key.remoteJid!;
    const timestamp = message.messageTimestamp as number;
    const fromMe = message.key.fromMe || false;

    await this.prisma.message.upsert({
      where: { id: messageId },
      update: {
        message: JSON.stringify(message),
        timestamp: new Date(timestamp * 1000),
      },
      create: {
        id: messageId,
        sessionId,
        jid,
        message: JSON.stringify(message),
        timestamp: new Date(timestamp * 1000),
        fromMe,
      },
    });
  }

  async getMessages(
    sessionId: string,
    jid: string,
    limit: number = 50
  ): Promise<WAMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        sessionId,
        jid,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });

    return messages.map((msg: any) => JSON.parse(msg.message));
  }

  async saveContact(sessionId: string, contact: Contact): Promise<void> {
    const id = `${sessionId}:${contact.id}`;

    await this.prisma.contact.upsert({
      where: { id },
      update: {
        name: contact.name || null,
        notify: contact.notify || null,
        data: JSON.stringify(contact),
      },
      create: {
        id,
        sessionId,
        jid: contact.id,
        name: contact.name || null,
        notify: contact.notify || null,
        data: JSON.stringify(contact),
      },
    });
  }

  async getContacts(sessionId: string): Promise<Contact[]> {
    const contacts = await this.prisma.contact.findMany({
      where: { sessionId },
    });

    return contacts.map((contact: any) => JSON.parse(contact.data));
  }

  async saveChat(sessionId: string, chat: any): Promise<void> {
    const jid = chat.id;
    const id = `${sessionId}:${jid}`;

    await this.prisma.chat.upsert({
      where: { id },
      update: {
        data: JSON.stringify(chat),
        timestamp: new Date(),
      },
      create: {
        id,
        sessionId,
        jid,
        data: JSON.stringify(chat),
        timestamp: new Date(),
      },
    });
  }

  async getChats(sessionId: string): Promise<any[]> {
    const chats = await this.prisma.chat.findMany({
      where: { sessionId },
      orderBy: {
        timestamp: 'desc',
      },
    });

    return chats.map((chat: any) => JSON.parse(chat.data));
  }

  async listSessions(): Promise<string[]> {
    const sessions = await this.prisma.session.findMany({
      select: { sessionId: true },
    });

    return sessions.map((s: any) => s.sessionId);
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
