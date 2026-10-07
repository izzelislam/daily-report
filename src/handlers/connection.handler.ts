import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { WacapEventType, QRFormat } from '../types';
import { HandlerContext } from './index';

/**
 * Generate QR code as base64 data URL
 */
async function generateQRBase64(
  qr: string,
  options: { width?: number; margin?: number; darkColor?: string; lightColor?: string }
): Promise<string> {
  try {
    return await QRCode.toDataURL(qr, {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#ffffff',
      },
    });
  } catch (error) {
    console.error('Failed to generate QR base64:', error);
    return '';
  }
}

export function registerConnectionHandlers(
  ctx: HandlerContext,
  persistCreds: () => Promise<void>
): void {
  const {
    socket,
    config,
    sessionId,
    emit,
    touchActivity,
    updateStatus,
    handleReconnect,
    handleLoggedOut,
    resetRetry,
    setSocket,
  } = ctx;

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    emit(WacapEventType.CONNECTION_UPDATE, {
      state: update as any,
      qr,
    });

    if (qr) {
      updateStatus('qr');
      
      // Determine QR format from config
      const qrConfig = config.qrCode || {};
      const format: QRFormat = qrConfig.format || (config.autoDisplayQR !== false ? 'terminal' : 'raw');
      
      // Print to terminal if format includes terminal
      if (format === 'terminal' || format === 'all') {
        console.log(`\n[${sessionId}] Scan this QR code to login:\n`);
        qrcodeTerminal.generate(qr, { small: true });
      }
      
      // Generate base64 if format includes base64
      let qrBase64: string | undefined;
      if (format === 'base64' || format === 'all') {
        qrBase64 = await generateQRBase64(qr, {
          width: qrConfig.width,
          margin: qrConfig.margin,
          darkColor: qrConfig.darkColor,
          lightColor: qrConfig.lightColor,
        });
      }

      emit(WacapEventType.QR_CODE, {
        state: update as any,
        qr,
        qrBase64,
      });
    }

    if (connection === 'open') {
      console.log(`[${sessionId}] Connection opened successfully`);
      resetRetry();
      updateStatus('connected');
      touchActivity();

      emit(WacapEventType.CONNECTION_OPEN, {
        state: update as any,
      });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      setSocket(null);
      updateStatus(isLoggedOut ? 'disconnected' : 'connecting', lastDisconnect?.error);

      console.log(`[${sessionId}] Connection closed. Reconnecting: ${shouldReconnect}`);

      emit(WacapEventType.CONNECTION_CLOSE, {
        state: update as any,
        error: lastDisconnect?.error,
      });

      if (isLoggedOut) {
        await handleLoggedOut(lastDisconnect?.error);
        return;
      }

      if (shouldReconnect) {
        await handleReconnect(lastDisconnect?.error);
      }
    }
  });

  socket.ev.on('creds.update', persistCreds);
}
