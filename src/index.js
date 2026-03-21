#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

// ---------------------------------------------------------------------------
// Pricing per 1M tokens (current Anthropic pricing)
// ---------------------------------------------------------------------------
const PRICING = {
  'claude-opus-4-6':              { input: 5,    output: 25, cacheRead: 0.50, cacheWrite: 1.25 },
  'claude-opus-4-5-20250620':     { input: 5,    output: 25, cacheRead: 0.50, cacheWrite: 1.25 },
  'claude-sonnet-4-6':            { input: 3,    output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-5-20250514':   { input: 3,    output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001':    { input: 0.80, output: 4,  cacheRead: 0.08, cacheWrite: 1    },
};
const DEFAULT_PRICING = { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 };

// ---------------------------------------------------------------------------
// Resolve the real `claude` binary
// ---------------------------------------------------------------------------
function findClaude() {
  const isWin = process.platform === 'win32';
  const envPath = process.env.PATH || '';
  const dirs = envPath.split(isWin ? ';' : ':');
  const names = isWin ? ['claude.cmd', 'claude.exe'] : ['claude'];

  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      } catch { /* not here */ }
    }
  }

  // Fallback – let the OS resolve it (works if claude is on PATH)
  return isWin ? 'claude.cmd' : 'claude';
}

// ---------------------------------------------------------------------------
// Session parsing & cost calculation (unchanged logic)
// ---------------------------------------------------------------------------
function getProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function findMostRecentJsonl(dir) {
  let newest = null;
  let newestMtime = 0;

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
            newest = full;
          }
        } catch { /* skip */ }
      }
    }
  }

  walk(dir);
  return newest;
}

function parseSession(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let model = null;
  let messageCount = 0;
  let sessionId = null;

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (!sessionId && obj.sessionId) sessionId = obj.sessionId;

    if (obj.type === 'assistant' && obj.message?.usage) {
      const usage = obj.message.usage;
      if (!model && obj.message.model) model = obj.message.model;
      totalInputTokens += usage.input_tokens || 0;
      totalOutputTokens += usage.output_tokens || 0;
      totalCacheReadTokens += usage.cache_read_input_tokens || 0;
      totalCacheWriteTokens += usage.cache_creation_input_tokens || 0;
      messageCount++;
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    model,
    messageCount,
    sessionId,
  };
}

function calculateCost(session) {
  const pricing = PRICING[session.model] || DEFAULT_PRICING;
  return (session.totalInputTokens / 1e6) * pricing.input
       + (session.totalOutputTokens / 1e6) * pricing.output
       + (session.totalCacheReadTokens / 1e6) * pricing.cacheRead
       + (session.totalCacheWriteTokens / 1e6) * pricing.cacheWrite;
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function printSummary(session) {
  const cost = calculateCost(session);
  const totalTokens = session.totalInputTokens + session.totalOutputTokens
    + session.totalCacheReadTokens + session.totalCacheWriteTokens;
  const pricing = PRICING[session.model] || DEFAULT_PRICING;
  const modelLabel = session.model || 'unknown';
  const knownModel = PRICING[session.model] ? '' : ' (using default pricing)';

  const lines = [
    `  Session Cost:    $${cost.toFixed(4)}`,
    `  Model:           ${modelLabel}${knownModel}`,
    `  Messages:        ${session.messageCount}`,
    ``,
    `  Input tokens:    ${formatNumber(session.totalInputTokens)}   ($${((session.totalInputTokens / 1e6) * pricing.input).toFixed(4)})`,
    `  Output tokens:   ${formatNumber(session.totalOutputTokens)}   ($${((session.totalOutputTokens / 1e6) * pricing.output).toFixed(4)})`,
    `  Cache read:      ${formatNumber(session.totalCacheReadTokens)}   ($${((session.totalCacheReadTokens / 1e6) * pricing.cacheRead).toFixed(4)})`,
    `  Cache write:     ${formatNumber(session.totalCacheWriteTokens)}   ($${((session.totalCacheWriteTokens / 1e6) * pricing.cacheWrite).toFixed(4)})`,
    `  Total tokens:    ${formatNumber(totalTokens)}`,
  ];

  const maxLen = Math.max(...lines.map(l => l.length));
  const width = maxLen + 2;
  const top = '\u2554' + '\u2550'.repeat(width) + '\u2557';
  const bot = '\u255A' + '\u2550'.repeat(width) + '\u255D';
  const title = '  Claude Session Cost Summary';
  const titleLine = '\u2551' + title.padEnd(width) + '\u2551';
  const sep = '\u2553' + '\u2500'.repeat(width) + '\u2556';

  console.log();
  console.log(top);
  console.log(titleLine);
  console.log(sep);
  for (const line of lines) {
    console.log('\u2551' + line.padEnd(width) + '\u2551');
  }
  console.log(bot);
  console.log();
}

// ---------------------------------------------------------------------------
// PTY wrapper – spawn claude, relay I/O, print cost on exit
// ---------------------------------------------------------------------------
function main() {
  const claudeBin = findClaude();
  const args = process.argv.slice(2);
  const isWin = process.platform === 'win32';

  // Use shell on Windows for .cmd files, direct exec otherwise
  const shell = isWin && claudeBin.endsWith('.cmd') ? claudeBin : claudeBin;

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  const ptyProcess = pty.spawn(shell, args, {
    name: process.env.TERM || 'xterm-256color',
    cols: cols,
    rows: rows,
    cwd: process.cwd(),
    env: process.env,
    useConpty: isWin,
  });

  // Pipe pty output → stdout
  ptyProcess.onData(function (data) {
    process.stdout.write(data);
  });

  // Pipe stdin → pty
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', function (data) {
    ptyProcess.write(data);
  });

  // Forward terminal resize
  process.stdout.on('resize', function () {
    ptyProcess.resize(
      process.stdout.columns || 80,
      process.stdout.rows || 24
    );
  });

  // On exit, restore terminal and print cost
  ptyProcess.onExit(function (e) {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

    // Print cost summary
    try {
      const projectsDir = getProjectsDir();
      if (fs.existsSync(projectsDir)) {
        const filePath = findMostRecentJsonl(projectsDir);
        if (filePath) {
          const session = parseSession(filePath);
          if (session.messageCount > 0) {
            printSummary(session);
          }
        }
      }
    } catch { /* don't crash on cost parsing errors */ }

    process.exit(e.exitCode);
  });
}

main();
