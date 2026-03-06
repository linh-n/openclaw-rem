/**
 * Session tracker — maintains an in-memory index of active sessions
 * via lifecycle hooks. Persists to disk for crash recovery.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { TrackedSession, SweepState, RemConfig } from './types.js';

export function createSessionTracker(stateDir: string, config: RemConfig) {
  const statePath = join(stateDir, 'sessions.json');
  
  const state: SweepState = {
    sessions: new Map(),
    pendingSweep: new Set(),
    lastTickAt: 0,
  };

  // ── Persistence ─────────────────────────────────────────────────────────

  function load(): void {
    try {
      const raw = readFileSync(statePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.sessions && typeof data.sessions === 'object') {
        for (const [key, val] of Object.entries(data.sessions)) {
          state.sessions.set(key, val as TrackedSession);
        }
      }
      state.lastTickAt = data.lastTickAt ?? 0;
    } catch {
      // First run or corrupt file — start fresh
    }
  }

  function save(): void {
    try {
      mkdirSync(dirname(statePath), { recursive: true });
      const data = {
        sessions: Object.fromEntries(state.sessions),
        lastTickAt: state.lastTickAt,
      };
      writeFileSync(statePath, JSON.stringify(data, null, 2));
    } catch {
      // Best effort — don't crash the plugin
    }
  }

  // ── Session tracking ──────────────────────────────────────────────────────

  function onActivity(sessionKey: string, isHeartbeat: boolean = false): void {
    const existing = state.sessions.get(sessionKey);
    if (existing) {
      existing.lastSeenAt = Date.now();
      existing.messageCount++;
      existing.isHeartbeat = existing.isHeartbeat || isHeartbeat;
    } else {
      state.sessions.set(sessionKey, {
        sessionKey,
        lastSeenAt: Date.now(),
        lastSweptAt: 0,
        messageCount: 0,
        isHeartbeat,
      });
    }
  }

  function markSwept(sessionKey: string): void {
    const session = state.sessions.get(sessionKey);
    if (session) {
      session.lastSweptAt = Date.now();
      session.messageCount = 0;
    }
    state.pendingSweep.delete(sessionKey);
    save();
  }

  // ── Sweep selection ───────────────────────────────────────────────────────

  function getSessionsToSweep(): TrackedSession[] {
    const now = Date.now();
    const cutoff = now - config.activeWindowMs;

    const idleSince = now - config.idleCooldownMs;
    const candidates: TrackedSession[] = [];

    for (const session of state.sessions.values()) {
      // Skip if no activity within active window
      if (session.lastSeenAt < cutoff) continue;
      
      // Skip if no new activity since last sweep
      if (session.lastSeenAt <= session.lastSweptAt) continue;

      // Skip if session is still active (not idle long enough)
      if (session.lastSeenAt > idleSince) continue;

      // Skip if no messages since last sweep
      if (session.messageCount <= 0) continue;

      // Direct/DM sessions are now included — they need memory sweeps too

      // Skip heartbeat sessions if configured
      if (config.skipOwnHeartbeats && session.isHeartbeat) continue;

      // Skip if already pending
      if (state.pendingSweep.has(session.sessionKey)) continue;

      candidates.push(session);
    }

    // Sort by most recent activity first, cap at max
    candidates.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return candidates.slice(0, config.maxSessionsPerTick);
  }

  function markPending(sessionKey: string): void {
    state.pendingSweep.add(sessionKey);
  }

  function isPending(sessionKey: string): boolean {
    return state.pendingSweep.has(sessionKey);
  }

  // ── Cleanup stale sessions ────────────────────────────────────────────────

  function pruneStale(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24h
    for (const [key, session] of state.sessions) {
      if (session.lastSeenAt < cutoff) {
        state.sessions.delete(key);
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  load();

  return {
    onActivity,
    markSwept,
    markPending,
    isPending,
    getSessionsToSweep,
    pruneStale,
    save,
    get pendingSweep() { return state.pendingSweep; },
    get sessionCount() { return state.sessions.size; },
  };
}

export type SessionTracker = ReturnType<typeof createSessionTracker>;
