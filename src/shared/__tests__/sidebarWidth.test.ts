import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../sidebarWidth';

describe('sidebar width range', () => {
  it('keeps the agreed range, with the default inside it and distinct from the minimum', () => {
    expect([SIDEBAR_MIN_WIDTH, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH]).toEqual([180, 216, 360]);
  });

  it.each([
    [180, 180],
    [250, 250],
    [360, 360],
    [4, SIDEBAR_MIN_WIDTH],
    [0, SIDEBAR_MIN_WIDTH],
    [-50, SIDEBAR_MIN_WIDTH],
    [99999, SIDEBAR_MAX_WIDTH],
  ])('clamps the number %s to %s', (value, expected) => {
    expect(clampSidebarWidth(value)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a numeric string', '280'],
    ['an empty string', ''],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['a boolean', true],
    ['an object', {}],
  ])('gives the default for %s', (_name, value) => {
    expect(clampSidebarWidth(value)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});
