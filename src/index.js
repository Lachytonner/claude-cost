#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Pricing per million tokens (as of March 2026)
const PRICING = {
  'claude-opus-4-6':   { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-5-20250620': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5-20250514': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
};

// Fallback pricing for unknown models
const DEFAULT_PRICING = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

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
        } catch { /* skip unreadable files */ }
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

    if (!sessionId && obj.sessionId) {
      sessionId = obj.sessionId;
    }

    if (obj.type === 'assistant' && obj.message?.usage) {
      const usage = obj.message.usage;
      if (!model && obj.message.model) {
        model = obj.message.model;
      }
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
  const inputCost = (session.totalInputTokens / 1_000_000) * pricing.input;
  const outputCost = (session.totalOutputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = (session.totalCacheReadTokens / 1_000_000) * pricing.cacheRead;
  const cacheWriteCost = (session.totalCacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function printSummary(session, filePath) {
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
    `  Input tokens:    ${formatNumber(session.totalInputTokens)}   ($${((session.totalInputTokens / 1_000_000) * pricing.input).toFixed(4)})`,
    `  Output tokens:   ${formatNumber(session.totalOutputTokens)}   ($${((session.totalOutputTokens / 1_000_000) * pricing.output).toFixed(4)})`,
    `  Cache read:      ${formatNumber(session.totalCacheReadTokens)}   ($${((session.totalCacheReadTokens / 1_000_000) * pricing.cacheRead).toFixed(4)})`,
    `  Cache write:     ${formatNumber(session.totalCacheWriteTokens)}   ($${((session.totalCacheWriteTokens / 1_000_000) * pricing.cacheWrite).toFixed(4)})`,
    `  Total tokens:    ${formatNumber(totalTokens)}`,
  ];

  const maxLen = Math.max(...lines.map(l => l.length));
  const width = maxLen + 2;
  const top = '╔' + '═'.repeat(width) + '╗';
  const bot = '╚' + '═'.repeat(width) + '╝';
  const title = '  Claude Session Cost Summary';
  const titleLine = '║' + title.padEnd(width) + '║';
  const sep = '╟' + '─'.repeat(width) + '╢';

  console.log();
  console.log(top);
  console.log(titleLine);
  console.log(sep);
  for (const line of lines) {
    console.log('║' + line.padEnd(width) + '║');
  }
  console.log(bot);
  console.log();
}

function main() {
  const projectsDir = getProjectsDir();

  if (!fs.existsSync(projectsDir)) {
    console.error('Error: Claude projects directory not found at ~/.claude/projects/');
    console.error('Make sure you have used Claude Code at least once.');
    process.exit(1);
  }

  const filePath = findMostRecentJsonl(projectsDir);
  if (!filePath) {
    console.error('Error: No session files (.jsonl) found in ~/.claude/projects/');
    process.exit(1);
  }

  const session = parseSession(filePath);

  if (session.messageCount === 0) {
    console.error('No assistant messages found in the most recent session.');
    console.error('File:', filePath);
    process.exit(1);
  }

  printSummary(session, filePath);
}

main();
