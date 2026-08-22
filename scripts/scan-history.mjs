#!/usr/bin/env node
/**
 * Scan the full git history for job-pack data — BRIEF.md §9.8.
 *
 * The tree scan (`no-data-scan.mjs`) protects the working tree. This protects
 * the part you cannot fix by deleting a file: once a blob is in history it is
 * in history, and on a public repository it may already be indexed.
 *
 * ## Why this checks less than the tree scan, on purpose
 *
 * The tree scan honours a `no-data-scan: synthetic` pragma, so a fixture file
 * may legitimately contain reference-SHAPED strings. A git-history grep sees
 * raw diff lines with no idea which file they came from or what that file
 * declared, so applying the same job-reference pattern here would flag every
 * synthetic fixture and turn CI permanently red — and a permanently-red
 * guardrail is one nobody reads.
 *
 * So this checks the two things that are unambiguous, that the pragma can
 * never waive, and that genuinely indicate a leak:
 *
 *   1. a spreadsheet or backup file was committed at any point, ever
 *   2. a customer telephone number appears in any commit
 *
 * Job-reference shapes in source and test files are the tree scan's job, where
 * the pragma can be read and reasoned about.
 */
import { execFileSync } from 'node:child_process';

const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const RESET = '\u001b[0m';

const FORBIDDEN_EXT = /\.(xlsx|xls|xlsm|xlsb|csv|ptbak)$/i;

/**
 * The actual personal data. No pragma waives this, in the tree or in history.
 * 11 digits, London 020 range — the format of every circuit in the pack.
 */
const PHONE = /\b020\d{8}\b/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

const problems = [];

// --- 1. Any spreadsheet or backup file, in any commit, ever -----------------
//
// --diff-filter=A catches the commit that added it, which is the one worth
// naming when the history has to be rewritten.
const added = git([
  'log',
  '--all',
  '--diff-filter=A',
  '--name-only',
  '--pretty=format:%H',
]).split('\n');

let currentCommit = '';
for (const line of added) {
  const trimmed = line.trim();
  if (trimmed === '') continue;
  if (/^[0-9a-f]{40}$/.test(trimmed)) {
    currentCommit = trimmed;
    continue;
  }
  if (FORBIDDEN_EXT.test(trimmed)) {
    problems.push(`${currentCommit.slice(0, 10)} added ${trimmed} — a spreadsheet or backup file`);
  }
}

// --- 2. A telephone number in any added line --------------------------------
const patch = git(['log', '-p', '--all', '--unified=0']);
let sawPhone = 0;
for (const line of patch.split('\n')) {
  if (!line.startsWith('+')) continue;
  if (PHONE.test(line)) sawPhone += 1;
}
if (sawPhone > 0) {
  problems.push(`${sawPhone} line(s) in history contain a customer telephone number`);
}

if (problems.length > 0) {
  console.error(`\n${RED}history scan FAILED${RESET}\n`);
  for (const problem of problems) console.error(`    ${problem}`);
  console.error(
    [
      '',
      '  This is not fixable by deleting a file and committing again. The blob is',
      '  in history and, on a public repository, may already be indexed.',
      '',
      '    1. Rewrite history with git filter-repo, then force-push.',
      '    2. Treat the repository as LEAKED, not fixed.',
      '    3. It is personal data, so report it — to Kelly Group and up to Openreach.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`${GREEN}history scan passed${RESET} — no spreadsheet, backup or telephone number in any commit`);
