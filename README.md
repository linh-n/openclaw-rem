# openclaw-rem

Periodic memory consolidation for [OpenClaw](https://github.com/openclaw/openclaw) agent sessions. Sweeps idle sessions and prompts the agent to write important context to workspace memory files.

## Install

```bash
openclaw plugins install openclaw-rem
```

Or clone locally:

```bash
git clone https://github.com/linh-n/openclaw-rem ~/.openclaw/extensions/openclaw-rem
openclaw gateway restart
```

## How it works

1. Tracks sessions via lifecycle hooks (`message_received`, `agent_end`)
2. On a timer, identifies sessions that have been idle for a configurable cooldown period
3. Triggers a heartbeat on each eligible session
4. Injects a memory-flush prompt via `before_prompt_build`
5. The agent writes important context to `memory/YYYY-MM-DD.md`, then replies `NO_REPLY`

Sessions are only swept when:
- They had new activity since the last sweep
- They've been idle longer than the cooldown (default: 10m)
- They're not direct/DM sessions (those already have heartbeats)
- They're not heartbeat or cron sessions
- It's not during quiet hours

## Configure

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["openclaw-rem"],
    "entries": {
      "openclaw-rem": {
        "enabled": true,
        "config": {
          "intervalMs": 1800000,
          "idleCooldownMs": 600000,
          "maxSessionsPerTick": 3,
          "reflection": false,
          "quietHours": { "start": "23:00", "end": "07:00" }
        }
      }
    }
  }
}
```

### Config options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `intervalMs` | number | `1800000` | Sweep interval in ms (default: 30m, min: 5m) |
| `activeWindowMs` | number | `7200000` | Only sweep sessions active within this window (default: 2h) |
| `idleCooldownMs` | number | `300000` | Session must be idle this long before sweeping (default: 5m, min: 1m) |
| `maxSessionsPerTick` | number | `10` | Max sessions to sweep per interval |
| `memoryPath` | string | `"memory"` | Directory for memory files, relative to workspace |
| `journalPath` | string | `"journal"` | Directory for journal files, relative to workspace |
| `reflection` | boolean | `false` | Also prompt for journal/reflection entries alongside facts |
| `skipOwnHeartbeats` | boolean | `true` | Don't sweep heartbeat or cron sessions |
| `quietHours` | object | `{ start: "23:00", end: "07:00" }` | Skip sweeps during these hours |

### Reflection mode

When `reflection: true`, the sweep prompt also asks the agent to write brief reflections to `journal/YYYY-MM-DD.md` — how the session felt, what surprised the agent, what shifted their thinking. Disabled by default.

## Commands

- `/rem` — show sweep status (tracked sessions, pending sweeps, config)

## Requirements

- OpenClaw 2026.3.x or later
- `api.runtime.system.requestHeartbeatNow()` support (used to trigger sweeps)

## License

MIT
