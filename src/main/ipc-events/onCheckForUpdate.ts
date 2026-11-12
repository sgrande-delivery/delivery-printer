import type { UpdateState } from 'shared/appUpdate';
import { appUpdater } from '../updater';

// Resolves with the state right after the synchronous part of the check; the result arrives as an event.
export function onCheckForUpdate(): UpdateState {
  const updater = appUpdater();
  updater.check();

  return updater.state();
}
