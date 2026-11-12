import type { UpdateState } from 'shared/appUpdate';
import { appUpdater } from '../updater';

// The renderer is untyped at runtime: anything that is not a boolean is refused, not coerced.
export function onSetAutoDownloadUpdates(_event: unknown, value: unknown): UpdateState {
  if (typeof value !== 'boolean') {
    throw new TypeError('setAutoDownloadUpdates expects a boolean');
  }

  const updater = appUpdater();
  updater.setAutoDownload(value);

  return updater.state();
}
