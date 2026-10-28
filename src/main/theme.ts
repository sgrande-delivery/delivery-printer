import { app, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { describeError } from 'shared/describeError';
import { isThemePreference } from 'shared/uiTheme';
import type { ResolvedTheme, ThemePreference, UiThemeState } from 'shared/uiTheme';
import { writeFileAtomic } from './atomicFile';
import { logger } from './logger';

export type { ResolvedTheme, ThemePreference };

// An object, not the bare string: it is the first UI preference file, and the next
// preference should not need a second one.
const PREFERENCES_FILE = 'ui-preferences.json';

function preferencesPath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILE);
}

// Never throws: a preferences file that cannot be read must not stop the app from
// opening, and a read must not rewrite what it could not understand.
export function readPreference(): ThemePreference {
  let raw: string;

  try {
    raw = fs.readFileSync(preferencesPath(), 'utf8');
  } catch (err: unknown) {
    const absent = typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';

    if (!absent) {
      logger.warn('theme: could not read the preferences file', describeError(err));
    }

    return 'system';
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const theme = typeof parsed === 'object' && parsed !== null ? (parsed as { theme?: unknown }).theme : undefined;

    if (isThemePreference(theme)) {
      return theme;
    }

    logger.warn('theme: the preferences file has no valid theme, using the system one');
  } catch (err: unknown) {
    logger.warn('theme: the preferences file is not valid JSON', describeError(err));
  }

  return 'system';
}

export function writePreference(preference: ThemePreference): void {
  writeFileAtomic(preferencesPath(), `${JSON.stringify({ theme: preference })}\n`);
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
