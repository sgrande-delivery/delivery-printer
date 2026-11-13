import { app, nativeTheme } from 'electron';
import path from 'node:path';
import { clampSidebarWidth } from 'shared/sidebarWidth';
import { isThemePreference } from 'shared/uiTheme';
import type { ResolvedTheme, ThemePreference, UiThemeState } from 'shared/uiTheme';
import { writeFileAtomic } from './atomicFile';
import { readJsonObject, type JsonObject } from './jsonObjectFile';
import { logger } from './logger';

export type { ResolvedTheme, ThemePreference };

// An object, not the bare string: it is the UI preference file, and each new preference must not need
// another one. Because it is one object, every write is read-modify-write (see writeFields).
const PREFERENCES_FILE = 'ui-preferences.json';

function preferencesPath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILE);
}

type Stored = JsonObject;

function readStored(): Stored | null {
  return readJsonObject(preferencesPath(), 'preferences');
}

export function readPreference(): ThemePreference {
  const theme = readStored()?.theme;

  if (isThemePreference(theme)) {
    return theme;
  }

  if (theme !== undefined) {
    logger.warn('preferences: the file has an invalid theme, using the system one');
  }

  return 'system';
}

export function readSidebarWidth(): number {
  const width = readStored()?.sidebarWidth;

  if (width !== undefined && clampSidebarWidth(width) !== width) {
    // Warns for a wrong type and for an out-of-range number alike; the value that comes out is
    // clamped, and the disk is left as it was.
    logger.warn('preferences: the sidebar width is out of range or not a number, adjusting it', { width });
  }

  return clampSidebarWidth(width);
}

// Read-modify-write (RN-01): the object on disk is the source of truth for every key this module does
// not own, so saving one preference never erases another, nor a key a future version added. A file
// that cannot be read starts over from {}: the write is the only way out of it.
function writeFields(fields: Stored): void {
  writeFileAtomic(preferencesPath(), `${JSON.stringify({ ...readStored(), ...fields })}\n`);
}

export function writePreference(preference: ThemePreference): void {
  writeFields({ theme: preference });
}

// Resolves to the width that now applies (clamped), which is what the screen has to adopt.
export function writeSidebarWidth(width: unknown): number {
  const applied = clampSidebarWidth(width);

  if (applied !== width) {
    // Same condition the read uses. Without this line a NaN from the drag arithmetic saves the
    // default, the sidebar snaps back, and the log says nothing: "it resizes itself sometimes".
    logger.warn('preferences: the sidebar width asked for is out of range or not a number', { width, applied });
  }

  writeFields({ sidebarWidth: applied });

  return applied;
}

// true is the behavior from before the preference existed, and the one that serves a PDV nobody operates.
export function readAutoDownloadUpdates(): boolean {
  const value = readStored()?.autoDownloadUpdates;

  if (typeof value === 'boolean') {
    return value;
  }

  if (value !== undefined) {
    logger.warn('preferences: autoDownloadUpdates is not a boolean, using the default');
  }

  return true;
}

export function writeAutoDownloadUpdates(value: boolean): void {
  writeFields({ autoDownloadUpdates: value });
}

export function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }

  return preference;
}

export function currentTheme(): UiThemeState {
  const preference = readPreference();

  return { preference, resolved: resolve(preference) };
}

// Same height as the header of the design (56 px). The colors are the header's
// background (--bg) and --text of each theme; the header has no fill of its own.
// Lowercase on purpose, so they match the app.css spelling and a grep by value
// finds both places. The main process has no CSS variables: these two tokens are
// necessarily duplicated here, and app.css says so next to their definition.
export function titleBarOverlayFor(theme: ResolvedTheme): { color: string; symbolColor: string; height: number } {
  if (theme === 'dark') {
    return { color: '#2b2725', symbolColor: '#faf7f5', height: 56 };
  }

  return { color: '#faf7f5', symbolColor: '#2b2725', height: 56 };
}

type Listener = (resolved: ResolvedTheme) => void;

const listeners = new Set<Listener>();
let last: ResolvedTheme | null = null;
let subscribed = false;

// Called by the system 'updated' event and after a preference is saved. The system
// event also fires for things other than light/dark (accent color, high contrast),
// and telling the renderer for those makes the screen flicker for nothing.
export function refreshResolved(): void {
  const resolved = resolve(readPreference());

  if (resolved === last) {
    return;
  }

  last = resolved;
  listeners.forEach(listener => listener(resolved));
}

export function onResolvedChange(listener: Listener): () => void {
  if (last === null) {
    last = resolve(readPreference());
  }

  listeners.add(listener);

  if (!subscribed) {
    subscribed = true;
    nativeTheme.on('updated', refreshResolved);
  }

  return () => {
    listeners.delete(listener);
  };
}

export function setPreference(preference: ThemePreference): ResolvedTheme {
  writePreference(preference);
  refreshResolved();

  return resolve(preference);
}
