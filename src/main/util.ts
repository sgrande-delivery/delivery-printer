import { BrowserWindow } from 'electron';
import path from 'node:path';

/**
 * In development electron-vite serves the renderer and exposes its URL through
 * ELECTRON_RENDERER_URL. In production the renderer bundle sits next to the
 * main bundle, so the same relative path works packaged and unpackaged.
 */
export function loadRenderer(window: BrowserWindow): Promise<void> {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    return window.loadURL(devServerUrl);
  }

  return window.loadFile(path.join(__dirname, '../renderer/index.html'));
}
