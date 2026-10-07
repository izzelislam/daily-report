/**
 * Utility helper functions
 */

/**
 * Format phone number to JID format
 * @param phoneNumber - Phone number with country code (e.g., "6281234567890")
 * @returns JID string (e.g., "6281234567890@s.whatsapp.net")
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Add WhatsApp suffix
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Format group JID
 * @param groupId - Group ID
 * @returns Group JID string
 */
export function formatGroupJid(groupId: string): string {
  if (groupId.includes('@g.us')) {
    return groupId;
  }
  return `${groupId}@g.us`;
}

/**
 * Extract phone number from JID
 * @param jid - JID string
 * @returns Phone number
 */
export function extractPhoneNumber(jid: string): string {
  return jid.split('@')[0];
}

/**
 * Check if JID is a group
 * @param jid - JID string
 * @returns true if group, false otherwise
 */
export function isGroup(jid: string): boolean {
  return jid.includes('@g.us');
}

/**
 * Check if JID is a status/broadcast
 * @param jid - JID string
 * @returns true if status, false otherwise
 */
export function isStatus(jid: string): boolean {
  return jid === 'status@broadcast';
}

/**
 * Delay/sleep function
 * @param ms - Milliseconds to delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in milliseconds
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Validate session ID
 * @param sessionId - Session ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSessionId(sessionId: string): boolean {
  // Session ID should be alphanumeric and can include hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(sessionId);
}
