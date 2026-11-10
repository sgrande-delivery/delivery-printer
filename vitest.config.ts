import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases as alias, buildTimeConstants } from './build-config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  // Tests never reach the network, but the injected constants still have to
  // exist; the development values serve for that.
  define: buildTimeConstants('development'),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Really process the .module.css files. Without this, a misspelled CSS Modules
    // key does NOT resolve to undefined: Vitest hands back a hashed name for the
    // class that does not exist, so expectNoUndefinedClasses() can never fail
    // (measured 2026-10-28). With it, the key is undefined and the net works.
    css: { include: [/\.module\.css$/] },
  },
});
