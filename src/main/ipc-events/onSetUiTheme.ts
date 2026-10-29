import { describeError } from 'shared/describeError';
import { logger } from '../logger';
import { setPreference } from '../theme';
import { isThemePreference } from 'shared/uiTheme';
import type { ResolvedTheme } from 'shared/uiTheme';

// The renderer is untyped at runtime, so the value is checked here.
export function onSetUiTheme(_event: unknown, preference: unknown): ResolvedTheme {
  if (!isThemePreference(preference)) {
    // Reaches the operator as a toast, but a bad value is a renderer bug: it has to
    // leave a trace in the log file too, or support never sees it.
    logger.warn('theme: the renderer asked for an unknown preference', { preference: String(preference) });
    throw new Error('invalid theme preference');
  }

  try {
    return setPreference(preference);
  } catch (err: unknown) {
    logger.error('theme: could not save the preference', describeError(err));
    throw err;
  }
}
