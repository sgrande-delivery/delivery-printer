import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { describeError } from 'shared/describeError';
import { writeFileAtomic } from './atomicFile';
import { logger } from './logger';

export const START_MINIMIZED_ARG = '--start-minimized';

const MARK_FILE = 'autostart.json';

type MarkState = 'missing' | 'present' | 'unreadable';

function markPath(): string {
  return path.join(app.getPath('userData'), MARK_FILE);
}

function readMark(): MarkState {
  const file = markPath();

  if (!fs.existsSync(file)) {
    return 'missing';
  }

  try {
    const content: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

    if (typeof content === 'object' && content !== null && 'configured' in content && content.configured === true) {
      return 'present';
    }

    return 'unreadable';
  } catch {
    return 'unreadable';
  }
}

function writeMark(): void {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileAtomic(markPath(), JSON.stringify({ configured: true }));
  } catch (err: unknown) {
    logger.error('autostart: could not write the configured mark', describeError(err));
  }
}

// Turns "start with Windows" on once per machine. After that the current value
// is whoever changed it later, so it is never touched again. A mark that exists
// but cannot be read is treated as already configured: re-enabling against a
// user's choice is worse than not enabling.
export function registerAutostart(): void {
  if (!app.isPackaged) {
    return;
  }

  try {
    const mark = readMark();

    if (mark === 'unreadable') {
      logger.error('autostart: the mark file is unreadable, leaving the current login item untouched');
      return;
    }

    if (mark === 'present') {
      return;
    }

    if (!app.getLoginItemSettings().openAtLogin) {
      // openAsHidden is macOS only; on Windows the app reads the argument
      // in window.ts to start minimized.
      app.setLoginItemSettings({ openAtLogin: true, args: [START_MINIMIZED_ARG] });
    }

    writeMark();
  } catch (err: unknown) {
    logger.error('autostart: registration failed', describeError(err));
  }
}
