import type { UpdateState } from 'shared/appUpdate';
import { appUpdater } from '../updater';

export function onUpdateState(): UpdateState {
  return appUpdater().state();
}
