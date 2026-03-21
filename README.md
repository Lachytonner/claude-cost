# claude-cost-tracker

PTY wrapper for Claude Code that transparently proxies the TUI and displays a session cost summary on exit.

## Install

```sh
npm install -g claude-cost-tracker
```

## Usage

Use `claude-cost` anywhere you'd normally use `claude`. All arguments are forwarded:

```sh
claude-cost
claude-cost -p "explain this repo"
claude-cost --model claude-opus-4-6
```

When the session ends, a cost summary is printed automatically:

```
╔═══════════════════════════════════════════════════════════╗
║  Claude Session Cost Summary                              ║
╟───────────────────────────────────────────────────────────╢
║  Session Cost:    $0.1234                                 ║
║  Model:           claude-sonnet-4-6                       ║
║  Messages:        12                                      ║
║                                                           ║
║  Input tokens:    5,000   ($0.0150)                       ║
║  Output tokens:   2,000   ($0.0300)                       ║
║  Cache read:      10,000   ($0.0030)                      ║
║  Cache write:     3,000   ($0.0113)                       ║
║  Total tokens:    20,000                                  ║
╚═══════════════════════════════════════════════════════════╝
```

## How It Works

1. Spawns the real `claude` binary via node-pty, forwarding all args, terminal dimensions, and resize events
2. All stdin/stdout pass through unchanged — Claude Code's TUI works identically
3. On exit, finds the most recently modified `.jsonl` in `~/.claude/projects/`
4. Parses all assistant message usage objects and calculates cost
5. Prints a formatted cost summary box

## Supported Models & Pricing

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| Claude Opus 4.6 / 4.5 | $5/M | $25/M | $1.25/M | $0.50/M |
| Claude Sonnet 4.6 / 4.5 | $3/M | $15/M | $3.75/M | $0.30/M |
| Claude Haiku 4.5 | $0.80/M | $4/M | $1/M | $0.08/M |

Unknown models fall back to Sonnet-tier pricing.

## Platform Support

- **Windows**: Detects `claude.cmd` / `claude.exe`, uses ConPTY
- **macOS / Linux**: Standard PTY

## Requirements

- Node.js 16+
- Claude Code installed and on PATH

## License

MIT
