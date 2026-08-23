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
 * Raster images are forbidden outright anywhere under `reference/`.
 *
 * A screenshot of the live tool cannot be content-scanned, so it can only ever
 * be judged by eye — and a §9.8 judgement recorded as "four legible job
 * numbers" turned out, on a file-by-file review, to have missed a named
 * individual in the header of eight images, an internal third-party domain, and
 * four real MDF bar pairs matching a pattern this very file bans in text.
 *
 * Forbidding the file type is the only control a scanner can genuinely enforce.
 * If a diagram is ever needed here, draw it as SVG: it is text, so it gets
 * scanned like everything else.
 */
const FORBIDDEN_IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.avif',
]);
const FORBIDDEN_IMAGE_UNDER = /^reference\//;

/**
 * Paths exempt from *content* scanning — for the waivable patterns only.
 *
 * A `neverExempt` pattern (the telephone number) still runs against every file
 * in this list. Nothing may waive that one; it is the actual personal data.
 *
 * Each entry is named individually rather than by directory. A blanket
 * `^docs/` would silently exempt every file anyone adds there later, which is
 * how a worked example containing a real circuit number would get in.
 */
const CONTENT_EXEMPT = [
  // NOTE: `reference/*.png` used to be exempted here, on the reasoning that
  // content scanning could not see inside a binary anyway. That was true, and
  // it was the hole: on 2026-08-23 those 15 images were found to contain a
  // named individual, a third-party internal domain and four real MDF bar
  // pairs, and no scanner could ever have said so. Images under `reference/`
  // are now forbidden outright — see FORBIDDEN_IMAGE_UNDER below.
  //
  // NOTE: `BRIEF.md` and `reference/(README|SCHEMA).md` used to be exempted here
  // by path. They now carry the `no-data-scan: synthetic` pragma instead. A path
  // exemption is invisible from inside the file, and it is what allowed a real
  // bar pair — written out in prose as "frame 01, block U, pair ####" — and two
  // real job numbers behind fabricated prefixes to sit in BRIEF.md on a public
  // remote. The pragma is at least greppable and has to be claimed on purpose.
  //
  // It is still only as strong as the claim behind it: tests/unit/data.test.ts
  // asserted "All references in this file are fabricated" while carrying two
  // real bar pairs. Read the values, do not trust the header.
  /^docs\/(SECURITY|DATA-MODEL|DECISIONS|FIELD-GUIDE)\.md$/,
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
    // Allows an optional space or hyphen between the groups. The pack stores
    // them unseparated; a human pasting one into a doc will not. Deliberately
    // written without an example, because this file is not exempt from its own
    // never-waivable pattern and should not be.
    re: /\b020[\s-]?\d{4}[\s-]?\d{4}\b/g,
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

    if (FORBIDDEN_IMAGE_UNDER.test(norm) && FORBIDDEN_IMAGE_EXT.has(ext)) {
      violations.push({
        file: norm,
        reason:
          `image under reference/ ("${ext}") — screenshots of the live tool cannot be ` +
          'content-scanned and have carried real identifiers before. Write down what it ' +
          'showed, or draw it as SVG.',
      });
      continue;
    }

    if (!TEXTUAL.has(ext)) continue;
    const exempt = isExemptFromContent(norm);

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
      // A `neverExempt` pattern runs against EVERY file. The path exemption
      // used to be applied before this loop, which meant docs/ and reference/
      // were waved through on the telephone-number check as well — the one
      // check whose whole point is that nothing may waive it. A worked example
      // pasted into a doc would have passed the hook and passed CI.
      if (!neverExempt && (exempt || synthetic)) continue;

      re.lastIndex = 0;
      const m = re.exec(text);
      if (m !== null) {
        const line = text.slice(0, m.index).split('\n').length;
        violations.push({
          file: `${norm}:${line}`,
          reason:
            synthetic || exempt
              ? `looks like ${name} — and nothing may waive this pattern`
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
