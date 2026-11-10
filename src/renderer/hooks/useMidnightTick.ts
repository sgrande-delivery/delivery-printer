import { useNow } from './useNow';

export const MIDNIGHT_CHECK_MS = 60_000;

// Re-renders the caller once a minute so a "hoje" computed in render crosses midnight on its own: on a
// quiet night nothing else moves the screen. An interval, never a timeout to the next midnight: a PDV that
// suspends overnight wakes a seven-hour timeout late, while the interval is at most a minute late.
// The caller keeps reading the clock itself (`new Date()`); the returned value only exists to be a change.
export function useMidnightTick(): number {
  return useNow(() => true, MIDNIGHT_CHECK_MS);
}
