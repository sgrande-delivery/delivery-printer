import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from 'shared/sidebarWidth';
import SidebarResizeHandle from '../SidebarResizeHandle';
import styles from '../SidebarResizeHandle.module.css';

const VAR = '--sidebar-width';
const POINTER = 7;

function widthVar(): string {
  return document.documentElement.style.getPropertyValue(VAR);
}

function setup(width = 216) {
  const onCommit = vi.fn();
  const view = render(<SidebarResizeHandle width={width} onCommit={onCommit} />);
  const handle = screen.getByRole('separator');

  // jsdom has no pointer capture API. These stubs are not decoration: the component calls them on
  // pointerdown and on Escape, and without them the first drag throws. hasPointerCapture says true so
  // the Escape path also exercises releasePointerCapture.
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn().mockReturnValue(true);
  handle.releasePointerCapture = vi.fn();

  return { onCommit, handle, ...view };
}

function down(handle: HTMLElement, clientX = 100): void {
  fireEvent.pointerDown(handle, { button: 0, clientX, pointerId: POINTER });
}

function move(handle: HTMLElement, clientX: number): void {
  fireEvent.pointerMove(handle, { clientX, pointerId: POINTER });
}

function up(handle: HTMLElement): void {
  fireEvent.pointerUp(handle, { pointerId: POINTER });
}

describe('SidebarResizeHandle', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty(VAR);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty(VAR);
    delete document.body.dataset.resizing;
  });

  it('writes the CSS var while dragging and does not commit yet', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    move(handle, 140);

    expect(widthVar()).toBe('256px');
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.body.dataset.resizing).toBe('true');
  });

  it('does not commit on each move, only once on pointerup, with the final width', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    move(handle, 110);
    move(handle, 120);
    move(handle, 130);
    up(handle);
    // lostpointercapture arrives together with pointerup in a browser
    fireEvent.lostPointerCapture(handle, { pointerId: POINTER });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(246);
    expect(document.body.dataset.resizing).toBeUndefined();
  });

  it('clamps above the maximum and below the minimum, in the var and in the commit', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    move(handle, 5000);
    expect(widthVar()).toBe(`${SIDEBAR_MAX_WIDTH}px`);
    up(handle);
    expect(onCommit).toHaveBeenLastCalledWith(SIDEBAR_MAX_WIDTH);

    down(handle);
    move(handle, -5000);
    expect(widthVar()).toBe(`${SIDEBAR_MIN_WIDTH}px`);
    up(handle);
    expect(onCommit).toHaveBeenLastCalledWith(SIDEBAR_MIN_WIDTH);
  });

  it('Escape in the middle of a drag restores the var and commits nothing', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    move(handle, 160);
    expect(widthVar()).toBe('276px');
    fireEvent.keyDown(window, { key: 'Escape' });
    // what the browser does after releasePointerCapture
    fireEvent.lostPointerCapture(handle, { pointerId: POINTER });
    up(handle);

    expect(widthVar()).toBe('216px');
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(POINTER);
    expect(document.body.dataset.resizing).toBeUndefined();
  });

  it('an arrow in the middle of a drag commits nothing, since pointerup decides', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    move(handle, 130);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(widthVar()).toBe('246px');

    up(handle);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(246);
  });

  it('any other key in the middle of a drag leaves the drag alone', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    move(handle, 130);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(widthVar()).toBe('246px');
    up(handle);

    expect(onCommit).toHaveBeenCalledWith(246);
  });

  it('Escape without a drag does nothing', () => {
    const { handle, onCommit } = setup(216);

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(handle, { key: 'Escape' });

    expect(widthVar()).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ignores a pointerdown that is not the left button', () => {
    const { handle } = setup(216);

    fireEvent.pointerDown(handle, { button: 2, clientX: 100, pointerId: POINTER });
    move(handle, 150);

    expect(widthVar()).toBe('');
    expect(document.body.dataset.resizing).toBeUndefined();
  });

  it('does not commit a click that did not move', () => {
    const { handle, onCommit } = setup(216);

    down(handle);
    up(handle);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits the default on double click', () => {
    const { handle, onCommit } = setup(300);

    fireEvent.doubleClick(handle);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(SIDEBAR_DEFAULT_WIDTH);
  });

  it('moves 16 px per arrow, clamped, and ignores any other key', () => {
    const { handle, onCommit } = setup(216);

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(232);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith(200);
    onCommit.mockClear();

    for (const key of ['Home', 'End', 'Enter', 'a', 'ArrowUp', 'ArrowDown']) {
      fireEvent.keyDown(handle, { key });
    }
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit an arrow that the range already holds', () => {
    const { handle, onCommit } = setup(SIDEBAR_MAX_WIDTH);

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenCalledWith(SIDEBAR_MAX_WIDTH - 16);
  });

  it('is a focusable vertical separator that follows the width', () => {
    const { handle, rerender, onCommit } = setup(216);

    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-label', 'Largura do menu');
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(handle).toHaveAttribute('aria-valuemin', String(SIDEBAR_MIN_WIDTH));
    expect(handle).toHaveAttribute('aria-valuemax', String(SIDEBAR_MAX_WIDTH));
    expect(handle).toHaveAttribute('aria-valuenow', '216');

    rerender(<SidebarResizeHandle width={250} onCommit={onCommit} />);
    expect(handle).toHaveAttribute('aria-valuenow', '250');
  });

  it('unmounting mid-drag clears the body attribute and gives the var back', () => {
    const { handle, unmount } = setup(216);

    down(handle);
    move(handle, 150);
    expect(widthVar()).toBe('266px');
    unmount();

    expect(document.body.dataset.resizing).toBeUndefined();
    expect(widthVar()).toBe('216px');
  });

  it('unmounting without a drag leaves the var alone', () => {
    document.documentElement.style.setProperty(VAR, '300px');
    const { unmount } = setup(300);

    unmount();

    expect(widthVar()).toBe('300px');
  });

  // Presence by element against styles.<key>: expectNoUndefinedClasses cannot see a wrong key here.
  it('carries the handle class', () => {
    const { handle, container } = setup(216);

    expect(handle).toHaveClass(styles.handle);
    expect(styles.handle).toBeTruthy();
    expectNoUndefinedClasses(container);
  });
});
