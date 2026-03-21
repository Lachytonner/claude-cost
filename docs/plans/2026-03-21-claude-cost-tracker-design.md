# claude-cost-tracker Design

**Date:** 2026-03-21

## Overview

An npm CLI package that wraps the `claude` CLI transparently using `node-pty`, intercepts output to accumulate API cost across a session, and prints the total on exit.

## Goals

- Zero behavioural difference from running `claude` directly
- All args forwarded transparently (`claude-cost --resume` == `claude --resume`)
- Parse cost lines matching `/Cost:\s*\$([0-9.]+)/i` and accumulate a session total
- On exit, print `💰 Session cost: $X.XXXX` on a clean line
- Publishable to npm with the `claude-cost` bin command

## Non-Goals

- Cost persistence across sessions
- Multiple cost format variants
- Config files or flags of its own

## Architecture

Single file: `src/index.js` (CommonJS, `#!/usr/bin/env node` shebang).

### Components

1. **Arg forwarding** — `process.argv.slice(2)` passed directly to `node-pty` spawn
2. **PTY spawn** — `node-pty` spawns `claude` with forwarded args and current terminal dimensions (`process.stdout.columns`, `process.stdout.rows`)
3. **Output interceptor** — each data chunk is written to `process.stdout` unchanged; simultaneously scanned with `/Cost:\s*\$([0-9.]+)/i` to accumulate `sessionTotal`
4. **Terminal resize forwarding** — `process.stdout` `resize` event updates pty dimensions via `pty.resize()`
5. **Exit handler** — on pty `exit` event, write `\n💰 Session cost: $X.XXXX\n` then call `process.exit(code)` with the child's exit code
6. **Signal forwarding** — `SIGINT` and `SIGTERM` forwarded to the pty process so Claude handles them naturally; cost summary still prints

### Data Flow

```
user stdin → pty.write()
pty data   → process.stdout.write() + regex scan → sessionTotal
pty exit   → print summary → process.exit(code)
```

## Package

```json
{
  "name": "claude-cost-tracker",
  "bin": { "claude-cost": "src/index.js" },
  "dependencies": { "node-pty": "^1.0.0" }
}
```

## Dependencies

- `node-pty` ^1.0.0 — native PTY implementation, required for true terminal transparency

## README Sections

1. Install (`npm install -g claude-cost-tracker`)
2. Usage (replace `claude` with `claude-cost`, all args work identically)
3. Demo output snippet showing cost summary line
4. How it works (one paragraph)
5. Requirements (Node 18+, `claude` CLI in PATH)
