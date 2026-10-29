import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from '../useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks once a second while active', () => {
    const { result } = renderHook(() => useNow(() => true));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current - first).toBe(3000);
  });

  it('ticks at the interval it is given', () => {
    const { result } = renderHook(() => useNow(() => true, 5000));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current).toBe(first);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current - first).toBe(5000);
  });

  it('does not tick, and sets no timer, while inactive', () => {
    const { result } = renderHook(() => useNow(() => false));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current).toBe(first);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when it stops being active or unmounts', () => {
    const { rerender, unmount } = renderHook(({ active }) => useNow(() => active), { initialProps: { active: true } });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(vi.getTimerCount()).toBe(1);

    rerender({ active: false });
    expect(vi.getTimerCount()).toBe(0);

    rerender({ active: true });
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
