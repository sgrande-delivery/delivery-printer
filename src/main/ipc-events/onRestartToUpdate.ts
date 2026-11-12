import type { UpdateState } from 'shared/appUpdate';
import { appUpdater } from '../updater';

// Resolves with the state right after the request: 'restarting' when nothing was pending, the scheduled
// 'ready' when the queue still has work, or the state untouched when the update is not ready.
export function onRestartToUpdate(): UpdateState {
  return appUpdater().requestRestart();
}
