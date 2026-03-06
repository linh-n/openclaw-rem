/**
 * openclaw-rem type definitions
 */

// ── Plugin config ───────────────────────────────────────────────────────────

export type QuietHours = {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
};

export type RemConfig = {
  enabled: boolean;
  intervalMs: number;
  activeWindowMs: number;
  idleCooldownMs: number;
  maxSessionsPerTick: number;
  memoryPath: string;
  journalPath: string;
  reflection: boolean;
  skipOwnHeartbeats: boolean;
  quietHours?: QuietHours;
};

export const DEFAULT_CONFIG: RemConfig = {
  enabled: true,
  intervalMs: 30 * 60 * 1000,         // 30 minutes
  activeWindowMs: 2 * 60 * 60 * 1000, // 2 hours
  idleCooldownMs: 5 * 60 * 1000,      // 5 minutes — must be idle before sweep
  maxSessionsPerTick: 10,
  memoryPath: 'memory',
  journalPath: 'journal',
  reflection: false,
  skipOwnHeartbeats: true,
  quietHours: { start: '23:00', end: '07:00' },
};

// ── Session tracking ────────────────────────────────────────────────────────

export type TrackedSession = {
  sessionKey: string;
  lastSeenAt: number;     // timestamp of last activity
  lastSweptAt: number;    // timestamp of last successful sweep
  messageCount: number;   // messages since last sweep
  isHeartbeat: boolean;   // is this a heartbeat session?
};

// ── Sweep state ─────────────────────────────────────────────────────────────

export type SweepState = {
  sessions: Map<string, TrackedSession>;
  pendingSweep: Set<string>;  // sessions marked for sweep (awaiting heartbeat)
  lastTickAt: number;
};
