// Token Radar main entry point (Node 22, standard library only).
//
// Architecture overview:
// 1. Input: a sealed snapshot.json (from /input or --input) is parsed and validated against the model's schema.
// 2. Model: lib/model.ts scores every pre-token protocol—watchlist first, then EARLY_ROWS below the floor by TVL.
//    Implied value = TVL * base_multiple * growth_multiplier * maturity_multiplier with house constants.
// 3. Gate: boardIssue() verifies coverage (all watchlist present), rank order (1..n descending by implied value),
//    no duplicate implied values, and valid farm steps (3..12 steps, 20..600 chars each).
// 4. Output: board.json, data.js (window.RADAR), and dashboard/ are written to MAKEFUN_OUTPUT_DIR.
// 5. Dossier: vendor/makefun-board.ts rebuilds a summary JSON from /output for the judge to score.
// 6. Screenshots: three pre-rendered images (board, detail, filtered) are copied and validated for names/sizes.
// 7. Zero dependencies: Node standard library only; the vendored make.fun library is checked into vendor/.
//
// Reads a sealed snapshot from --input (file or directory containing snapshot.json),
// scores every pre-token protocol using the model in lib/model.ts, and writes the
// ranked board plus dashboard assets to MAKEFUN_OUTPUT_DIR (or /output).
//
// Outputs:
//   board.json      - ranked protocols with implied values and farm plans
//   data.js         - compact dashboard dataset (window.RADAR)
//   dashboard/      - static HTML/CSS/JS (copied from repo)
//   screenshots/    - three images (board, detail, filtered views)
//   dossier.json    - summary the judge reads, built with vendored make.fun library

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// Gate constants (reference/gate.json): text cap shapes the bytes, the rest refuse.
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// Parse --name <value> or --name=value from argv, returning fallback if absent.
function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

// Resolve input path: if it ends with .json use as-is, otherwise append snapshot.json.
const inputArg = getArg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}

// Output directory: --output, then MAKEFUN_OUTPUT_DIR, then /output.
const outDir = getArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Load and validate snapshot, then build the ranked board and radar dataset.
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// Verify the board passes gate constraints before writing.
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// Ensure output directory exists.
mkdirSync(outDir, { recursive: true });

// Write core artifacts.
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

// Copy a directory's regular files (non-hidden) into target.
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    copied.push(name);
  }
  return copied;
}

// Copy dashboard (3 files: index.html, app.css, app.js) and screenshots.
copyFiles(join(HERE, 'dashboard'), join(outDir, 'dashboard'));
const screenshots = copyFiles(join(HERE, 'screenshots'), join(outDir, 'screenshots'));

// Validate screenshots: need exactly 3 images with valid names.
if (screenshots.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${screenshots.length} image${screenshots.length === 1 ? '' : 's'}: ` +
    `hand in 3, the board, a detail view and a filtered view\n`
  );
  process.exit(1);
}
for (const name of screenshots) {
  if (!IMAGE_NAME_PATTERN.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// Write dossier last: the scorer rebuilds it from /output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  })
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
  `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
  `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
  `${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${screenshots.length} images) ` +
  `and ${join(outDir, 'dossier.json')}\n`
);