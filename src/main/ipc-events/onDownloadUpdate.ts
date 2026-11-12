import type { UpdateState } from 'shared/appUpdate';
import { appUpdater } from '../updater';

// Resolves with the state right after the download starts ('downloading'); progress arrives as events.
export function onDownloadUpdate(): UpdateState {
  const updater = appUpdater();
  updater.download();

  return updater.state();
}
