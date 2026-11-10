import fs from 'node:fs';
import { shell } from 'electron';
import { logger } from '../logger';

let pathLogged = false;

function hasRecords(file: string): boolean {
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

// Resolves the path from the log module at call time instead of hard-coding it:
// the library is the one that knows where the file really is. The first call
// records the resolved path, which is the measurement support docs need.
export function onRevealLogs(): boolean {
  // getFile() CREATES an empty file (electron-log runs a write test), so existence
  // says nothing: "no record yet" means size 0.
  const file = logger.transports.file.getFile().path;

  // Must be read BEFORE the logger.info below: that line writes to this same file,
  // so measuring after it would make a fresh install look like it has records.
  const withRecords = hasRecords(file);

  if (!pathLogged) {
    pathLogged = true;
    logger.info(`log file resolved to ${file}`);
  }

  if (!withRecords) {
    return false;
  }

  shell.showItemInFolder(file);

  return true;
}
