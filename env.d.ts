/// <reference types="vite/client" />

/**
 * Injected at build time by electron.vite.config.ts from the .env files.
 * See `buildTimeConstants` there; consume them through
 * `src/constants/constants.ts` rather than directly.
 */
declare const __API_BASE_URL__: string;
declare const __WS_BASE_URL__: string;

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}
