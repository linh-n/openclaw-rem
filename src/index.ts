/**
 * openclaw-rem — REM sleep for AI agents
 *
 * Periodically sweeps active sessions and prompts them to consolidate
 * important context into workspace memory files. Like REM sleep —
 * replays the day and decides what to keep.
 *
 * Architecture:
 *   1. Track sessions via lifecycle hooks (message_received, agent_end)
 *   2. On timer tick, identify sessions with new activity since last sweep
 *   3. Mark them as pendingSweep and trigger heartbeat via requestHeartbeatNow
 *   4. In before_prompt_build, detect pending sweeps and inject memory prompt
 *   5. Agent writes to memory/journal files, replies NO_REPLY
 *
 * Based on architecture advice from Krill (OpenClaw maintainer).
 */

import type { RemConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { createSessionTracker, type SessionTracker } from './session-tracker.js';
import { getSweepPrompt } from './prompts.js';
import { isQuietHours, isHeartbeatSession } from './utils.js';

// ── Minimal plugin API type stubs ─────────────────────────────────────────

type PluginLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
};

type AnyCtx = Record<string, unknown>;

type PluginApi = {
  id: string;
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  resolvePath: (input: string) => string;
  registerService: (service: {
    id: string;
    start: () => void | Promise<void>;
    stop: () => void | Promise<void>;
  }) => void;
  registerCommand: (command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: AnyCtx) => { text: string } | Promise<{ text: string }>;
  }) => void;
  on: (
    hookName: string,
    handler: (event: AnyCtx, ctx: AnyCtx) => unknown,
    opts?: { priority?: number },
  ) => void;
  runtime?: {
    system?: {
      requestHeartbeatNow?: (opts: { sessionKey?: string; reason?: string }) => void;
    };
  };
};

// ── Plugin entry ──────────────────────────────────────────────────────────

export default function register(api: PluginApi): void {
  // ── Config ────────────────────────────────────────────────────────────

  const cfg: RemConfig = { ...DEFAULT_CONFIG, ...(api.pluginConfig ?? {}) } as RemConfig;

  if (!cfg.enabled) {
    api.logger.info('[REM] Plugin disabled via config.');
    return;
  }

  // ── State directory for persistence ───────────────────────────────────

  const stateDir = api.resolvePath('~/.openclaw/state/plugins/openclaw-rem');
  const tracker: SessionTracker = createSessionTracker(stateDir, cfg);

  api.logger.info(
    `[REM] Plugin active — interval: ${cfg.intervalMs / 1000}s, ` +
    `window: ${cfg.activeWindowMs / 1000}s, idle: ${cfg.idleCooldownMs / 1000}s, ` +
    `max/tick: ${cfg.maxSessionsPerTick}, reflection: ${cfg.reflection}`
  );

  // ── Lifecycle hooks — track session activity ──────────────────────────

  api.on('message_received', (_event: AnyCtx, ctx: AnyCtx) => {
    const sessionKey = ctx['sessionKey'] as string | undefined;
    if (!sessionKey) return;
    const isHb = isHeartbeatSession(sessionKey);
    tracker.onActivity(sessionKey, isHb);
  });

  api.on('agent_end', (_event: AnyCtx, ctx: AnyCtx) => {
    const sessionKey = ctx['sessionKey'] as string | undefined;
    if (!sessionKey) return;
    const isHb = isHeartbeatSession(sessionKey);
    tracker.onActivity(sessionKey, isHb);
    tracker.save();
  });

  // ── Prompt injection — intercept heartbeats for pending sweeps ────────

  api.on('before_prompt_build', (_event: AnyCtx, ctx: AnyCtx) => {
    const sessionKey = ctx['sessionKey'] as string | undefined;
    if (!sessionKey) return;

    // Only intercept if this session is pending a sweep
    if (!tracker.isPending(sessionKey)) return;

    // Only intercept heartbeat-triggered turns, not user messages
    const trigger = ctx['trigger'] as string | undefined;
    if (trigger !== 'heartbeat') {
      // User is actively chatting — defer the sweep
      return;
    }

    // Build the sweep prompt — replaces the heartbeat prompt entirely
    const prompt = getSweepPrompt(cfg.reflection, cfg.memoryPath, cfg.journalPath);
    
    // Mark as swept
    tracker.markSwept(sessionKey);

    api.logger.info(`[REM] Sweep injected for session: ${sessionKey.slice(0, 30)}...`);

    return {
      replacePrompt: prompt,
      prependContext: prompt,
    };
  }, { priority: 10 }); // Higher priority to run before other hooks

  // ── Background service — periodic sweep timer ─────────────────────────

  let sweepInterval: NodeJS.Timeout | null = null;

  api.registerService({
    id: 'rem-sweep',

    start() {
      api.logger.info(`[REM] Sweep service started (every ${cfg.intervalMs / 1000}s)`);
      
      sweepInterval = setInterval(() => {
        try {
          runSweepTick();
        } catch (err) {
          api.logger.error(`[REM] Sweep tick error: ${err}`);
        }
      }, cfg.intervalMs);

      // Don't keep the process alive just for this timer
      sweepInterval.unref?.();
    },

    stop() {
      if (sweepInterval) {
        clearInterval(sweepInterval);
        sweepInterval = null;
      }
      tracker.save();
      api.logger.info('[REM] Sweep service stopped');
    },
  });

  // ── Sweep tick logic ──────────────────────────────────────────────────

  function runSweepTick(): void {
    // Check quiet hours
    if (cfg.quietHours && isQuietHours(cfg.quietHours.start, cfg.quietHours.end)) {
      api.logger.debug?.('[REM] Quiet hours — skipping sweep');
      return;
    }

    // Prune sessions older than 24h
    tracker.pruneStale();

    // Find sessions that need sweeping
    const toSweep = tracker.getSessionsToSweep();
    
    if (toSweep.length === 0) {
      api.logger.debug?.('[REM] No sessions to sweep');
      return;
    }

    api.logger.info(`[REM] Sweep tick — ${toSweep.length} session(s) to sweep`);

    // Check if we have the heartbeat API
    const requestHeartbeat = api.runtime?.system?.requestHeartbeatNow;
    
    if (!requestHeartbeat) {
      api.logger.warn(
        '[REM] api.runtime.system.requestHeartbeatNow not available — ' +
        'cannot trigger sweeps. Is this OpenClaw version supported?'
      );
      return;
    }

    for (const session of toSweep) {
      tracker.markPending(session.sessionKey);
      
      try {
        requestHeartbeat({
          sessionKey: session.sessionKey,
          reason: 'rem:sweep',
        });
        api.logger.info(
          `[REM] Triggered sweep for: ${session.sessionKey.slice(0, 30)}... ` +
          `(${session.messageCount} msgs since last sweep)`
        );
      } catch (err) {
        api.logger.error(`[REM] Failed to trigger heartbeat for ${session.sessionKey}: ${err}`);
        tracker.pendingSweep.delete(session.sessionKey);
      }
    }
  }

  // ── Status command ────────────────────────────────────────────────────

  api.registerCommand({
    name: 'rem',
    description: 'Show REM memory sweep status',
    acceptsArgs: true,
    handler: () => {
      const sessions = tracker.getSessionsToSweep();
      const pending = tracker.pendingSweep.size;
      
      return {
        text: [
          `**REM Memory Sweep**`,
          `Tracked sessions: ${tracker.sessionCount}`,
          `Pending sweeps: ${pending}`,
          `Eligible for sweep: ${sessions.length}`,
          `Interval: ${cfg.intervalMs / 1000}s`,
          `Active window: ${cfg.activeWindowMs / 1000}s`,
          `Idle cooldown: ${cfg.idleCooldownMs / 1000}s`,
          `Reflection mode: ${cfg.reflection ? 'ON' : 'OFF'}`,
          cfg.quietHours ? `Quiet hours: ${cfg.quietHours.start}–${cfg.quietHours.end}` : '',
        ].filter(Boolean).join('\n'),
      };
    },
  });
}
