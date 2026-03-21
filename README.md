# claude-cost-tracker

CLI tool that reads your most recent Claude Code session and displays a cost summary.

## Install

```sh
npm install -g claude-cost-tracker
```

## Usage

After a Claude Code session ends, run:

```sh
claude-cost
```

It finds the most recently modified `.jsonl` session file in `~/.claude/projects/`, parses all assistant messages, and prints a cost breakdown.

## Example Output

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

## Supported Models

- Claude Opus 4.6 / 4.5
- Claude Sonnet 4.6 / 4.5
- Claude Haiku 4.5

Unknown models fall back to Sonnet-tier pricing.

## How It Works

1. Recursively scans `~/.claude/projects/` for `.jsonl` files
2. Picks the most recently modified file (your latest session)
3. Parses each assistant message's `usage` object for token counts
4. Calculates cost using current Anthropic API pricing
5. Prints a formatted summary box

## Requirements

- Node.js 16+
- Claude Code (must have at least one session in `~/.claude/projects/`)

## License

MIT
