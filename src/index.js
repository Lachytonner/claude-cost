#!/usr/bin/env node
'use strict';

const pty = require('node-pty');

function resolveWindowsShell() {
  const { spawnSync } = require('child_process');
  for (const name of ['claude.exe', 'claude.cmd']) {
    if (spawnSync('where.exe', [name], { stdio: 'pipe' }).status === 0) {
      return name;
    }
  }
  return 'claude.cmd'; // fallback
}
const shell = process.platform === 'win32' ? resolveWindowsShell() : 'claude';
const args = process.argv.slice(2);

const ptyProcess = pty.spawn(shell, args, {
  name: process.env.TERM || 'xterm-256color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  cwd: process.cwd(),
  env: process.env,
});

let sessionTotal = 0;
const COST_RE = /Cost:\s*\$([0-9.]+)/i;
// Strip ANSI escape codes before matching — the claude CLI colorizes output
const ANSI_RE = /\x1b\[[0-9;]*m/g;

let lineBuffer = '';

function extractCost(line) {
  const match = COST_RE.exec(line.replace(ANSI_RE, ''));
  if (match) {
    const value = parseFloat(match[1]);
    if (Number.isFinite(value)) {
      sessionTotal += value;
    }
  }
}

ptyProcess.onData((data) => {
  process.stdout.write(data);
  lineBuffer += data;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop(); // keep incomplete tail
  for (const line of lines) {
    extractCost(line);
  }
});

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => ptyProcess.write(data.toString()));

process.stdout.on('resize', () => {
  ptyProcess.resize(
    process.stdout.columns || 80,
    process.stdout.rows || 24
  );
});

ptyProcess.onExit(({ exitCode }) => {
  // Flush any incomplete line remaining in the buffer
  if (lineBuffer) {
    extractCost(lineBuffer);
  }
  process.stdout.write(`\n💰 Session cost: $${sessionTotal.toFixed(4)}\n`);
  process.exit(exitCode);
});

process.on('SIGINT', () => ptyProcess.write('\x03'));   // Ctrl-C
process.on('SIGTERM', () => {
  if (process.platform === 'win32') {
    ptyProcess.kill();
  } else {
    ptyProcess.kill('SIGTERM');
  }
});
