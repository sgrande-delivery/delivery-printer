import { useEffect, useState } from 'react';

// A clock that ticks once a second, and only while `needsClock(now)` holds: a screen with nothing
// counting down does not re-render for nothing. The predicate reads the clock's own last value, so
// the render never calls Date.now().
export function useNow(needsClock: (now: number) => boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const active = needsClock(now);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const tick = (): void => setNow(Date.now());
    // The first tick is immediate: the value held from before it went active may be minutes old.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);

  return now;
}
