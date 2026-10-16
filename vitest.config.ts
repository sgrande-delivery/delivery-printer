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
  },
});
