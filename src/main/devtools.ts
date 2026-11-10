import { BrowserWindow, Menu } from 'electron';

const isDevelopment = !!process.env.ELECTRON_RENDERER_URL || process.env.NODE_ENV === 'development';

/**
 * Replaces electron-debug and the boilerplate MenuBuilder: toggles the devtools
 * on F12, reloads on Ctrl+R and adds a right-click "Inspect element", all only
 * while running in development. Scoped to the window instead of using
 * globalShortcut, so it does not capture the keys system wide.
 */
export function registerDevtools(window: BrowserWindow) {
  if (!isDevelopment) {
    return;
  }

  window.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }

    if (input.key === 'F12') {
      window.webContents.toggleDevTools();
      return;
    }

    if (input.key.toLowerCase() === 'r' && (input.control || input.meta)) {
      window.webContents.reload();
    }
  });

  window.webContents.on('context-menu', (_event, props) => {
    Menu.buildFromTemplate([
      {
        label: 'Inspect element',
        click: () => window.webContents.inspectElement(props.x, props.y),
      },
    ]).popup({ window });
  });
}
