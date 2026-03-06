/**
 * Utility functions for openclaw-rem
 */

/**
 * Check if current time is within quiet hours.
 */
export function isQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same day range (e.g., 09:00 - 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g., 23:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Detect if a session key looks like a heartbeat session.
 */
export function isHeartbeatSession(sessionKey: string): boolean {
  return sessionKey.includes(':heartbeat') || sessionKey.includes(':cron:');
}

