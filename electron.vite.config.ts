import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { aliases as alias, buildTimeConstants } from './build-config';

export default defineConfig(({ mode }) => {
  const sourcemap = mode !== 'production';
  const define = buildTimeConstants(mode);

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias },
      define,
      build: {
        outDir: 'out/main',
        sourcemap,
        lib: { entry: resolve(__dirname, 'src/main/main.ts') },
      },
    },

    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias },
      define,
      build: {
        outDir: 'out/preload',
        sourcemap,
        lib: { entry: resolve(__dirname, 'src/main/preload.ts') },
      },
    },

    renderer: {
      root: resolve(__dirname, 'src/renderer'),
      plugins: [react()],
      resolve: { alias },
      define,
      build: {
        outDir: resolve(__dirname, 'out/renderer'),
        emptyOutDir: true,
        sourcemap,
        rollupOptions: {
          input: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  };
});
