import { describe, expect, it, vi } from 'vitest';
import { createSharedStore } from '../sharedStore';

describe('createSharedStore', () => {
  it('starts on the first reader, once, and stops on the last, putting the state back', () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const store = createSharedStore(0, start);

    const offA = store.subscribe(() => undefined);
    const offB = store.subscribe(() => undefined);
    expect(start).toHaveBeenCalledTimes(1);

    store.set(5);
    offA();
    expect(stop).not.toHaveBeenCalled();
    expect(store.get()).toBe(5);

    offB();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe(0);
  });

  it('tells every reader about a change, and none about an identical value', () => {
    const store = createSharedStore('a', () => () => undefined);
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.set('b');
    store.set('b');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('drops a write that arrives while nobody is reading, so a late answer cannot leak into the next session', () => {
    const store = createSharedStore(0, () => () => undefined);

    store.set(9);

    expect(store.get()).toBe(0);
  });

  it('starts again, from the initial state, for a reader that comes after everyone left', () => {
    const start = vi.fn(() => () => undefined);
    const store = createSharedStore(0, start);

    store.subscribe(() => undefined)();
    store.subscribe(() => undefined);

    expect(start).toHaveBeenCalledTimes(2);
    expect(store.get()).toBe(0);
  });
});
