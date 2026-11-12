import type { UpdateState } from 'shared/appUpdate';
import { appUpdater } from '../updater';

export function onCancelRestart(): UpdateState {
  return appUpdater().cancelRestart();
}
