#!/usr/bin/env node
/**
 * Bundle external-origin check — BRIEF.md §3.2 / §9.7
 *
 * "No network requests at runtime." After install the app must work in
 * aeroplane mode forever. This check fails the build if the *output* bundle
 * references any origin other than the app's own.
 *
 * It reads dist/ rather than source, so a dependency that quietly pulls in a
 * CDN URL is caught too.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = process.argv[2] ?? 'dist';

const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const RESET = '\u001b[0m';

/** Extensions worth scanning. Images and fonts cannot contain a fetch. */
const SCAN_EXT = new Set(['.js', '.mjs', '.css', '.html', '.webmanifest', '.json', '.map']);

/**
 * Allowed literal strings that contain "://" but are not runtime requests.
 * Keep this list short and justified — every entry is a hole in the check.
 */
const ALLOWED = [
  // XML/SVG/OOXML namespace URIs. Never fetched; they are identifiers.
  /^https?:\/\/www\.w3\.org\//,
  /^https?:\/\/schemas\.openxmlformats\.org\//,
  /^https?:\/\/schemas\.microsoft\.com\//,
  /^https?:\/\/purl\.org\//,
  /^https?:\/\/uri\.etsi\.org\//,
  /^https?:\/\/docs\.oasis-open\.org\//,
  /^https?:\/\/www\.openoffice\.org\//,
  /^https?:\/\/openoffice\.org\//,
  /^https?:\/\/relaxng\.org\//,
  // SheetJS ODS/OpenDocument namespaces.
  /^https?:\/\/[a-z.]*sheetjs\.com\/?$/,
  // Licence and source pointers inside dependency banners.
  /^https?:\/\/(www\.)?(opensource|apache)\.org\//,
  /^https?:\/\/github\.com\//,
  /^https?:\/\/unlicense\.org\//,
];

const URL_RE = /(?:https?:)?\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/:?#][^\s'"`)\\]*)?/g;

/** Origins we actively refuse regardless: the usual runtime-fetch suspects. */
const HARD_BANS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdn\.jsdelivr\.net/,
  /unpkg\.com/,
  /cdnjs\.cloudflare\.com/,
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /sentry\.io/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`${RED}external-origin check FAILED${RESET}: "${DIST}" not found. Run the build first.`);
  process.exit(1);
}

const violations = [];

for (const file of files) {
  if (!SCAN_EXT.has(extname(file).toLowerCase())) continue;
  const text = readFileSync(file, 'utf8');

  for (const ban of HARD_BANS) {
    if (ban.test(text)) violations.push({ file, url: String(ban), why: 'banned origin' });
  }

  URL_RE.lastIndex = 0;
  const seen = new Set();
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    const url = m[0];
    if (seen.has(url)) continue;
    seen.add(url);
    const normalised = url.startsWith('//') ? `https:${url}` : url;
    if (ALLOWED.some((re) => re.test(normalised))) continue;
    violations.push({ file, url, why: 'external origin in bundle output' });
  }
}

if (violations.length > 0) {
  console.error(`\n${RED}external-origin check FAILED${RESET}`);
  console.error('  The bundle references origins outside the app. This breaks the');
  console.error('  aeroplane-mode guarantee (BRIEF §3.2) and the CSP (§9.7).\n');
  for (const v of violations) console.error(`    ${v.file}\n      ${v.url}  (${v.why})`);
  console.error('');
  process.exit(1);
}

console.log(`${GREEN}external-origin check passed${RESET} (${files.length} bundle files scanned)`);
