import { resolve } from 'node:path';
import { loadEnv } from 'vite';

/**
 * Shared by electron.vite.config.ts and vitest.config.ts so the two never drift.
 *
 * The aliases are regex-based on purpose: a plain `constants` prefix alias would
 * shadow Node's built-in `constants` module. Matching `constants/` only keeps
 * the project paths working without touching bare specifiers. Mirrors the
 * `paths` entries in tsconfig.json.
 */
export const aliases = [
  { find: /^renderer\//, replacement: `${resolve(__dirname, 'src/renderer')}/` },
  { find: /^constants\//, replacement: `${resolve(__dirname, 'src/constants')}/` },
  { find: /^main\//, replacement: `${resolve(__dirname, 'src/main')}/` },
];

const REQUIRED_ENV = ['APP_API_BASE_URL', 'APP_WS_BASE_URL'] as const;

/**
 * src/constants/constants.ts is imported by both the main and the renderer side.
 * electron-vite's own env handling uses a different prefix per process
 * (MAIN_VITE_, RENDERER_VITE_), which would force two names for one value, so
 * the values are injected as compile-time constants instead.
 *
 * They are inlined into the bundles and ship inside the installer, which is
 * extractable: this is build configuration, never a place for secrets.
 */
export function buildTimeConstants(mode: string): Record<string, string> {
  const env = loadEnv(mode, process.cwd(), 'APP_');

  const missing = REQUIRED_ENV.filter(key => !env[key]);

  if (missing.length) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${missing.join(', ')}. ` +
        `Defina-as em .env.${mode} ou .env.local (veja .env.example).`
    );
  }

  return {
    __API_BASE_URL__: JSON.stringify(env.APP_API_BASE_URL),
    __WS_BASE_URL__: JSON.stringify(env.APP_WS_BASE_URL),
  };
}
