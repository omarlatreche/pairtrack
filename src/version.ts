/** Bumped on release. Shown in Settings so a bug report can name a version. */
export const APP_VERSION = 'v1.0.0';

declare const __BUILD_COMMIT__: string;

/**
 * The commit this bundle was built from, injected by Vite.
 *
 * `APP_VERSION` alone cannot answer "is the fix on my phone?" — it is bumped by
 * hand on release, so it reads the same for every build in between. A PWA keeps
 * serving its cached copy until the update is taken, so that question comes up
 * every time a fix ships.
 */
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev';
