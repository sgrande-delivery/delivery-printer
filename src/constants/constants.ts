/**
 * Build-time configuration, injected by electron.vite.config.ts from the .env
 * files. These are compile-time constants rather than runtime lookups, so they
 * work the same in the main and the renderer process.
 */
export default {
  BASE_URL: __API_BASE_URL__,
  WS_BASE_URL: __WS_BASE_URL__,
};
