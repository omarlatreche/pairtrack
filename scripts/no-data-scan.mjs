#!/usr/bin/env node
/**
 * no-data scan — BRIEF.md §9.8 / §10.3
 *
 * Fails loudly if anything that looks like real job-pack data has landed in the
 * tree. Runs in CI over the whole repo, and from the pre-commit hook over the
 * staged files only.
 *
 * This is load-bearing, not hygiene: with a public repo (BRIEF §8 option A) an
 * accidental commit of the pack is the highest-likelihood failure mode in the
 * project, and the pack is personal data.
 *
 * Usage:
 *   node scripts/no-data-scan.mjs                 # scan whole tree (CI)
 *   node scripts/no-data-scan.mjs file [file...]  # scan given files (hook)
 */
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, relative, sep } from 'node:path';

const ROOT = process.cwd();

const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const RESET = '\u001b[0m';

/** File extensions that must never appear in the repo at all. */
const FORBIDDEN_EXT = new Set(['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.ptbak']);

/**
 * Paths exempt from *content* scanning.
 *
 * - reference/*.png: phone screenshots of the existing tool. Four real job
 *   numbers are legible in them; no telephone numbers, bar pairs, ties or
 *   equipment refs appear anywhere in reference/. Declared exception, BRIEF
 *   §9.8 — and they are binary, so content scanning would not see them anyway.
 * - BRIEF.md, reference/*.md, docs/: these describe the patterns in order to
 *   ban them, so they necessarily contain example patterns. No real values.
 * - the scanner and the hook: they contain the patterns by definition.
 */
const CONTENT_EXEMPT = [
  /^reference\//,
  /^BRIEF\.md$/,
  /^docs\//,
  /^scripts\/no-data-scan\.mjs$/,
  /^\.githooks\/pre-commit$/,
];

/**
 * Content patterns that indicate real pack data.
 * Each is deliberately specific enough not to fire on ordinary source code.
 *
 * `neverExempt` marks the patterns that the SYNTHETIC_PRAGMA below cannot wave
 * through. A telephone number is the actual personal data in this pack, so no
 * file may contain one, whatever the author asserts about it.
 */
const PATTERNS = [
  {
    // BRIEF §9.8 names this exact pattern. Real prefixes are ZSF / ZSG / ZSD.
    name: 'job reference (AAA###/#)',
    re: /\b[A-Z]{2,4}\d{3,4}\/\d\b/g,
    neverExempt: false,
  },
  {
    name: 'UK London telephone number (customer circuit)',
    re: /\b020\d{8}\b/g,
    neverExempt: true,
  },
  {
    name: 'MDF bar pair (##/A###)',
    re: /\b0[19]\/(?:[A-W]|INTL)\d{2,4}\b/g,
    neverExempt: false,
  },
  {
    name: 'E-side tie reference',
    re: /\b\d{2}-E-\d{3}-U\d{2}-\d{3}\b/g,
    neverExempt: false,
  },
  {
    name: 'D-side tie reference',
    re: /\b\d-D-\d{3}-U\d{2}-\d{3}\b/g,
    neverExempt: false,
  },
  {
    name: 'LLU tie reference',
    re: /\bLLUA\d{6}\b/g,
    neverExempt: false,
  },
];

/**
 * Deliberate, greppable opt-out for files that must contain reference-SHAPED
 * strings to do their job: the synthetic fixture generator, its tests, and the
 * doc comments that explain the formats.
 *
 * A blanket exemption for `tests/` would be easier and much worse — that is
 * exactly where someone would paste a row of the real pack "just to check
 * something". Requiring the author to type this line makes the exemption a
 * conscious act, and `grep -rn` finds every file that claimed it.
 *
 * It never waives the telephone-number pattern (see `neverExempt` above).
 */
const SYNTHETIC_PRAGMA = 'no-data-scan: synthetic';

/** The pragma only counts near the top of the file, where a reviewer sees it. */
function claimsSynthetic(text) {
  return text.split('\n', 40).some((line) => line.includes(SYNTHETIC_PRAGMA));
}

/** Text-ish files worth reading. Anything else is skipped. */
const TEXTUAL = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.html', '.css',
  '.yml', '.yaml', '.txt', '.svg', '.webmanifest', '.sh', '.toml', '',
]);

function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', cwd: ROOT });
  return out.split('\0').filter(Boolean);
}

function isExemptFromContent(rel) {
  return CONTENT_EXEMPT.some((re) => re.test(rel));
}

function scan(files) {
  const violations = [];

  for (const rel of files) {
    const norm = rel.split(sep).join('/');
    const ext = extname(norm).toLowerCase();

    if (FORBIDDEN_EXT.has(ext)) {
      violations.push({
        file: norm,
        reason: `forbidden file type "${ext}" — job data must never be committed`,
      });
      continue;
    }

    if (isExemptFromContent(norm)) continue;
    if (!TEXTUAL.has(ext)) continue;

    let stat;
    try {
      stat = statSync(norm);
    } catch {
      continue; // deleted in this commit
    }
    if (!stat.isFile() || stat.size > 2_000_000) continue;

    let text;
    try {
      text = readFileSync(norm, 'utf8');
    } catch {
      continue;
    }

    const synthetic = claimsSynthetic(text);

    for (const { name, re, neverExempt } of PATTERNS) {
      if (synthetic && !neverExempt) continue;

      re.lastIndex = 0;
      const m = re.exec(text);
      if (m !== null) {
        const line = text.slice(0, m.index).split('\n').length;
        violations.push({
          file: `${norm}:${line}`,
          reason: synthetic
            ? `looks like ${name} — and "${SYNTHETIC_PRAGMA}" does not cover this pattern`
            : `looks like ${name}`,
        });
      }
    }
  }

  return violations;
}

const argFiles = process.argv.slice(2);
const files =
  argFiles.length > 0 ? argFiles.map((f) => relative(ROOT, f) || f) : listTrackedFiles();

const violations = scan(files);

if (violations.length > 0) {
  console.error(`\n${RED}no-data scan FAILED${RESET}`);
  console.error('  Job-pack data (or something shaped like it) was found:\n');
  for (const v of violations) console.error(`    ${v.file}\n      ${v.reason}`);
  console.error(
    [
      '',
      '  The job pack is personal data — 442 customer telephone numbers.',
      '  Do NOT just delete the file and commit again: if this already reached a',
      '  remote, rewrite history with git filter-repo and treat the repo as leaked.',
      '  See README.md, "If job data is ever committed".',
      '',
      `  If — and only if — every reference in the file is fabricated, put the`,
      `  line "${SYNTHETIC_PRAGMA}" in its first 40 lines. That never waives the`,
      '  telephone-number check.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(
  `${GREEN}no-data scan passed${RESET} (${files.length} file${files.length === 1 ? '' : 's'} checked)`,
);
