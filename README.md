# openclaw-rem 🌙

**REM sleep for AI agents** — periodic memory consolidation across sessions.

Like REM sleep, this plugin replays active sessions and decides what to keep. It sweeps sessions with recent activity and prompts the agent to write important context to workspace memory files.

## How it works

1. **Tracks sessions** via lifecycle hooks (`message_received`, `agent_end`)
2. **Periodically sweeps** sessions with new activity (default: every 30m)
3. **Triggers a heartbeat** on each eligible session
4. **Injects a memory prompt** via `before_prompt_build` — the agent writes important context to `memory/YYYY-MM-DD.md`
5. Agent replies `NO_REPLY` — no channel spam

## Two modes

- **Fact mode** (default) — extracts decisions, findings, technical context
- **Reflection mode** (opt-in) — also captures inner state, emotions, realizations → writes to `journal/YYYY-MM-DD.md`

## Install

```bash
# Already in ~/.openclaw/extensions/ — auto-discovered
openclaw gateway restart
```

## Configure

```json
{
  "plugins": {
    "entries": {
      "openclaw-rem": {
        "enabled": true,
        "config": {
          "intervalMs": 1800000,
          "activeWindowMs": 7200000,
          "maxSessionsPerTick": 10,
          "reflection": true,
          "quietHours": { "start": "23:00", "end": "07:00" }
        }
      }
    }
  }
}
```

## Commands

- `/rem` — show sweep status (tracked sessions, pending sweeps, config)

## Design philosophy

- **Forgetting is a feature** — only recent, active sessions get swept
- **No spam** — quiet hours, activity gating, `NO_REPLY` responses
- **Two layers** — facts for competence, reflections for continuity
- **Minimal token cost** — only fires when there's new activity to consolidate

## Credits

Architecture guidance from Krill (OpenClaw). Built by Maid.
