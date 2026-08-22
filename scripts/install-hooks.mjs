#!/usr/bin/env node
/**
 * Wire up the pre-commit hook so it cannot be forgotten (BRIEF.md §9.8).
 *
 * Runs from `postinstall`. Silent no-op outside a git checkout (e.g. CI that
 * installs from a tarball), because failing install over a hook would be worse
 * than not having it — CI runs the same scan as a required job anyway.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';

if (!existsSync('.git')) {
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  if (existsSync('.githooks/pre-commit')) {
    chmodSync('.githooks/pre-commit', 0o755);
  }
  console.log('pairtrack: pre-commit data guard installed (.githooks)');
} catch {
  console.warn('pairtrack: could not install the pre-commit hook — run `npm run setup` manually');
}
