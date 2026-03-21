# claude-cost-tracker

A transparent wrapper around the `claude` CLI that tracks and displays your API session cost.

## Install

```sh
npm install -g claude-cost-tracker
```

## Usage

Replace `claude` with `claude-cost`. Every argument is forwarded identically:

```sh
claude-cost                    # same as: claude
claude-cost --resume           # same as: claude --resume
claude-cost --model sonnet     # same as: claude --model sonnet
```

## Demo

```
$ claude-cost
> Tell me a joke

...Claude responds...

💰 Session cost: $0.0043
```

The cost summary prints automatically when you exit (`/exit`, Ctrl-C, or Ctrl-D).

## How it works

`claude-cost` spawns the `claude` binary inside a pseudo-terminal (PTY) so Claude sees a real terminal and all interactive features work identically. Output is buffered line-by-line to match lines like `Cost: $0.0043`, accumulate a running total, then forwarded to your terminal unchanged. When the session ends, the total is printed and the process exits with Claude's exit code.

## Requirements

- Node.js 18+
- `claude` CLI installed and available in `PATH`
