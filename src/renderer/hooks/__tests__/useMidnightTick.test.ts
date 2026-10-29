import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIDNIGHT_CHECK_MS, useMidnightTick } from '../useMidnightTick';

describe('useMidnightTick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-renders the caller after midnight without anything else moving', () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useMidnightTick();
    });
    const before = renders;

    act(() => {
      vi.advanceTimersByTime(MIDNIGHT_CHECK_MS);
    });

    expect(renders).toBeGreaterThan(before);
  });

  it('checks every minute, not every second', () => {
    const { result } = renderHook(() => useMidnightTick());
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(MIDNIGHT_CHECK_MS - 1);
    });
    expect(result.current).toBe(first);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current - first).toBe(MIDNIGHT_CHECK_MS);
  });

  it('stops its timers on unmount', () => {
    const { unmount } = renderHook(() => useMidnightTick());
    act(() => {
      vi.advanceTimersByTime(0);
    });
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
