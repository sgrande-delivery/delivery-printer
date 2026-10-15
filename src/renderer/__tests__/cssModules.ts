import { expect } from 'vitest';

/**
 * A misspelled CSS Modules key resolves to undefined and lands in the DOM as
 * class="undefined", silently losing the styling. This asserts it never does.
 */
export function expectNoUndefinedClasses(container: HTMLElement): void {
  const broken = Array.from(container.querySelectorAll('*')).filter(el =>
    el.className?.toString().split(/\s+/).includes('undefined')
  );

  expect(broken.map(el => `${el.tagName}: ${el.className}`)).toEqual([]);
}
