import { describeError } from 'shared/describeError';
import { logger } from '../logger';
import { writeSidebarWidth } from '../uiPreferences';

// The renderer is untyped at runtime. Unlike the theme, a bad value is not refused: the writer clamps
// it, and the renderer adopts the width that comes back.
export function onSetUiSidebarWidth(_event: unknown, width: unknown): number {
  try {
    return writeSidebarWidth(width);
  } catch (err: unknown) {
    logger.error('preferences: could not save the sidebar width', describeError(err));
    throw err;
  }
}
