#!/usr/bin/env node
// check-gate.mjs - verify board.json against gate constraints

import { readFileSync } from 'fs';
import { join } from 'path';

const outDir = process.argv[2] || 'out';
const boardPath = join(outDir, 'board.json');
const snapshotPath = join('input', 'snapshot.json');

let board, snapshot;
try {
  board = JSON.parse(readFileSync(boardPath, 'utf8')).rows;
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
} catch (e) {
  console.error('Failed to read files:', e.message);
  process.exit(1);
}

const watchlist = new Set(snapshot.watchlist);
const protocolSlugs = new Set(snapshot.protocols.map(p => p.slug));

let errors = [];
let warnings = [];

// 1. Ranks 1..N unique and sequential
const ranks = board.map(r => r.rank).sort((a, b) => a - b);
for (let i = 0; i < ranks.length; i++) {
  if (ranks[i] !== i + 1) {
    errors.push(`Rank check failed: expected ${i + 1}, got ${ranks[i]}`);
  }
}

// 2. Non-increasing implied_value (each row <= previous row)
for (let i = 1; i < board.length; i++) {
  if (board[i].implied_value_usd > board[i - 1].implied_value_usd) {
    errors.push(`Row ${i + 1} (${board[i].slug}) implied_value ${board[i].implied_value_usd} > row ${i} (${board[i - 1].slug}) ${board[i - 1].implied_value_usd}`);
  }
}

// 3. All implied_value_usd distinct (strictly decreasing since non-increasing + distinct)
const impliedValues = new Set(board.map(r => r.implied_value_usd));
if (impliedValues.size !== board.length) {
  errors.push(`Implied values not all distinct: ${impliedValues.size} unique out of ${board.length} rows`);
}

// 4. All board slugs exist in snapshot protocols
for (const row of board) {
  if (!protocolSlugs.has(row.slug)) {
    errors.push(`Slug ${row.slug} not found in snapshot protocols`);
  }
}

// 5. Row count in range 100-4000
if (board.length < 100 || board.length > 4000) {
  errors.push(`Board size ${board.length} not in range 100-4000`);
}

// 6. Watchlist fully covered (100% coverage required)
const boardSlugs = new Set(board.map(r => r.slug));
let missingWatchlist = [];
for (const slug of watchlist) {
  if (!boardSlugs.has(slug)) {
    missingWatchlist.push(slug);
    errors.push(`Watchlist slug ${slug} missing from board`);
  }
}
const coveragePercent = ((watchlist.size - missingWatchlist.length) / watchlist.size * 100).toFixed(1);
if (coveragePercent !== '100.0') {
  errors.push(`Watchlist coverage ${coveragePercent}% (${watchlist.size - missingWatchlist.length}/${watchlist.size}), must be 100%`);
}

// 7. Farm steps: 3-12 strings, each 20-600 chars, mentions cost and time
for (const row of board) {
  const steps = row.farm_steps;
  if (!Array.isArray(steps)) {
    errors.push(`${row.slug}: farm_steps is not an array`);
    continue;
  }
  if (steps.length < 3 || steps.length > 12) {
    errors.push(`${row.slug}: farm_steps count ${steps.length} not in 3-12`);
  }
  for (const step of steps) {
    if (typeof step !== 'string') {
      errors.push(`${row.slug}: farm step is not a string`);
      continue;
    }
    if (step.length < 20 || step.length > 600) {
      errors.push(`${row.slug}: farm step length ${step.length} not in 20-600`);
    }
    if (!/Cost:/i.test(step)) {
      errors.push(`${row.slug}: farm step missing cost mention`);
    }
    if (!/Time:/i.test(step)) {
      errors.push(`${row.slug}: farm step missing time mention`);
    }
  }
}

// 8. token_status is 'pre-token' for all
for (const row of board) {
  if (row.token_status !== 'pre-token') {
    errors.push(`${row.slug}: token_status is ${row.token_status}, expected 'pre-token'`);
  }
}

// 9. implied_value_usd is positive integer
for (const row of board) {
  if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
    errors.push(`${row.slug}: implied_value_usd ${row.implied_value_usd} not a positive integer`);
  }
}

// 10. model object present with required fields
for (const row of board) {
  if (!row.model || typeof row.model !== 'object') {
    errors.push(`${row.slug}: missing model object`);
    continue;
  }
  const required = ['base_multiple', 'growth_pct', 'growth_multiplier', 'maturity_multiplier', 'age_days'];
  for (const field of required) {
    if (!(field in row.model)) {
      errors.push(`${row.slug}: model missing ${field}`);
    }
  }
}

// 11. No duplicate slugs in board
const slugCounts = new Map();
for (const row of board) {
  slugCounts.set(row.slug, (slugCounts.get(row.slug) || 0) + 1);
}
for (const [slug, count] of slugCounts) {
  if (count > 1) {
    errors.push(`Duplicate slug in board: ${slug} appears ${count} times`);
  }
}

// 12. Implied value spread: top value should be meaningfully higher than bottom
if (board.length >= 2) {
  const top = board[0].implied_value_usd;
  const bottom = board[board.length - 1].implied_value_usd;
  if (top === bottom) {
    errors.push(`All ${board.length} rows share the same implied value $${top}: a board that ranks nothing by value is not a ranking`);
  } else if (top / bottom < 1.5) {
    warnings.push(`Implied value spread is narrow: top $${top} / bottom $${bottom} = ${(top / bottom).toFixed(2)}x`);
  }
}

// 13. Farm steps should reference the protocol (sanity check)
for (const row of board) {
  const steps = row.farm_steps || [];
  const hasProtocolRef = steps.some(s => s.toLowerCase().includes(row.name.toLowerCase()) || s.toLowerCase().includes(row.slug.toLowerCase()));
  if (!hasProtocolRef && steps.length > 0) {
    warnings.push(`${row.slug}: farm steps may not reference the protocol name or slug`);
  }
}

// 14. All watchlist protocols should be ranked in top portion (they're the floor)
const watchlistRanks = board
  .filter(r => watchlist.has(r.slug))
  .map(r => r.rank)
  .sort((a, b) => a - b);
if (watchlistRanks.length > 0) {
  const worstWatchlistRank = watchlistRanks[watchlistRanks.length - 1];
  if (worstWatchlistRank > board.length * 0.8) {
    warnings.push(`Watchlist protocols ranked as low as #${worstWatchlistRank} (of ${board.length}); expected in upper portion`);
  }
}

if (errors.length > 0) {
  console.error('GATE CHECK FAILED:');
  errors.forEach(e => console.error('  - ' + e));
  if (warnings.length > 0) {
    console.error('\nWarnings:');
    warnings.forEach(w => console.error('  ! ' + w));
  }
  process.exit(1);
} else {
  console.log('GATE CHECK PASSED');
  console.log(`  Rows: ${board.length}`);
  console.log(`  Watchlist covered: ${watchlist.size - missingWatchlist.length}/${watchlist.size} (${coveragePercent}%)`);
  console.log(`  Implied value range: $${board[board.length - 1].implied_value_usd} - $${board[0].implied_value_usd} (${(board[0].implied_value_usd / board[board.length - 1].implied_value_usd).toFixed(2)}x spread)`);
  console.log(`  Farm steps per row: ${board[0].farm_steps.length} (all rows)`);
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.forEach(w => console.log('  ! ' + w));
  }
  process.exit(0);
}