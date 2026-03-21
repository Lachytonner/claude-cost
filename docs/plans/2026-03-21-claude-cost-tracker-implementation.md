# claude-cost-tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish-ready npm CLI package `claude-cost-tracker` that wraps `claude` transparently via node-pty and prints a session cost total on exit.

**Architecture:** Single file `src/index.js` (CommonJS) spawns `claude` in a node-pty pseudo-terminal, forwards all args/stdin/resize events, intercepts stdout chunks to regex-match cost lines, and prints the accumulated total when the process exits.

**Tech Stack:** Node.js (CommonJS), node-pty ^1.0.0, no test framework (PTY is integration-only; cost parser tested inline with a manual smoke test script)

---

### Task 1: Initialize package.json

**Files:**
- Create: `package.json`

**Step 1: Create package.json**

```json
{
  "name": "claude-cost-tracker",
  "version": "0.1.0",
  "description": "Transparent claude CLI wrapper that tracks and displays session API cost",
  "main": "src/index.js",
  "bin": {
    "claude-cost": "src/index.js"
  },
  "scripts": {
    "start": "node src/index.js"
  },
  "keywords": ["claude", "anthropic", "cost", "cli", "wrapper"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "node-pty": "^1.0.0"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "src/",
    "README.md"
  ]
}
```

**Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, node-pty native addon compiled with no errors.

If compilation fails on Windows, ensure `windows-build-tools` or Visual Studio Build Tools are installed.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: initialize package with node-pty dependency"
```

---

### Task 2: Write src/index.js — shebang, imports, arg forwarding skeleton

**Files:**
- Create: `src/index.js`

**Step 1: Create the file with shebang and skeleton**

```js
#!/usr/bin/env node
'use strict';

const os = require('os');
const pty = require('node-pty');

const shell = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const args = process.argv.slice(2);

const ptyProcess = pty.spawn(shell, args, {
  name: process.env.TERM || 'xterm-256color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  cwd: process.cwd(),
  env: process.env,
});
```

Note: On Windows, npm bin scripts are `.cmd` wrappers. Using `claude.cmd` ensures the bin is found. On Unix, `claude` is sufficient.

**Step 2: Verify the file exists and has correct shebang**

Run: `head -3 src/index.js`
Expected: First line is `#!/usr/bin/env node`

**Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: scaffold PTY spawn with arg forwarding"
```

---

### Task 3: Wire stdin → pty and output interception

**Files:**
- Modify: `src/index.js`

**Step 1: Add cost accumulator and output interception**

Append to `src/index.js` after the `ptyProcess` declaration:

```js
let sessionTotal = 0;
const COST_RE = /Cost:\s*\$([0-9.]+)/i;

ptyProcess.onData((data) => {
  process.stdout.write(data);
  const match = COST_RE.exec(data);
  if (match) {
    sessionTotal += parseFloat(match[1]);
  }
});
```

**Step 2: Wire raw stdin to pty**

```js
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => ptyProcess.write(data));
```

**Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: wire stdin to pty and intercept cost output"
```

---

### Task 4: Handle terminal resize and exit

**Files:**
- Modify: `src/index.js`

**Step 1: Forward terminal resize events**

Append to `src/index.js`:

```js
process.stdout.on('resize', () => {
  ptyProcess.resize(
    process.stdout.columns || 80,
    process.stdout.rows || 24
  );
});
```

**Step 2: Add exit handler that prints session total**

```js
ptyProcess.onExit(({ exitCode }) => {
  process.stdout.write(`\n💰 Session cost: $${sessionTotal.toFixed(4)}\n`);
  process.exit(exitCode);
});
```

**Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: forward resize events and print session cost on exit"
```

---

### Task 5: Forward SIGINT/SIGTERM to pty

**Files:**
- Modify: `src/index.js`

**Step 1: Add signal forwarding**

Append to `src/index.js`:

```js
process.on('SIGINT', () => ptyProcess.write('\x03'));   // Ctrl-C
process.on('SIGTERM', () => ptyProcess.kill('SIGTERM'));
```

Note: We do NOT call `process.exit()` here — we let the signal reach the pty child, which will exit naturally, triggering `ptyProcess.onExit` and the cost summary print.

**Step 2: Make the file executable (Unix only)**

Run on Unix: `chmod +x src/index.js`
On Windows this is not needed — npm handles it via the `.cmd` wrapper.

**Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: forward SIGINT/SIGTERM to pty child process"
```

---

### Task 6: Write README.md

**Files:**
- Create: `README.md`

**Step 1: Write README**

```markdown
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

`claude-cost` spawns the `claude` binary inside a pseudo-terminal (PTY) so Claude sees a real terminal and all interactive features work identically. Output is intercepted in-stream to match lines like `Cost: $0.0043`, accumulate a running total, then forward the output to your terminal unchanged. When the session ends, the total is printed and the process exits with Claude's exit code.

## Requirements

- Node.js 18+
- `claude` CLI installed and available in `PATH`
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, usage, and demo"
```

---

### Task 7: Smoke test and verify npm pack

**Step 1: Link the package locally**

Run: `npm link`
Expected: `claude-cost` command is now available globally in the current shell.

**Step 2: Smoke test**

Run: `claude-cost --version`
Expected: Outputs Claude's version string, then `💰 Session cost: $0.0000` (no cost for a version flag).

If `claude` is not installed, verify the binary name with `which claude` / `where claude`. On Windows the bin may be `claude.cmd` — the spawn logic already handles this.

**Step 3: Verify npm pack output**

Run: `npm pack --dry-run`
Expected output includes:
```
src/index.js
README.md
package.json
```
Confirm `node_modules/` is NOT listed.

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: ready for npm publish"
```

---

## Publishing (when ready)

```sh
npm login
npm publish
```

The package will be published as `claude-cost-tracker` with the `claude-cost` bin command.
