import React, { useEffect, useRef } from 'react';
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth } from 'shared/sidebarWidth';
import styles from './SidebarResizeHandle.module.css';

const SIDEBAR_WIDTH_VAR = '--sidebar-width';
const KEYBOARD_STEP = 16;
const RESIZING_BODY_ATTRIBUTE = 'resizing';

interface SidebarResizeHandleProps {
  // The committed width (the one saved), not the one being dragged.
  width: number;
  onCommit: (width: number) => void;
}

// The drag writes a CSS var on the document, never React state (RN-04): the AppShell owns the socket and
// printing hooks, and a setState per pointermove would re-render it at 60 Hz while the store is printing.
// React only hears about the width once, in onCommit.
export function applySidebarWidth(width: number): void {
  document.documentElement.style.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
}

const SidebarResizeHandle: React.FC<SidebarResizeHandleProps> = ({ width, onCommit }) => {
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const latestWidthRef = useRef(width);
  const pointerIdRef = useRef(0);
  const isDraggingRef = useRef(false);
  const escapeListenerRef = useRef<AbortController | null>(null);

  // Escape is heard on the window: during the drag the pointer is captured but the focus can be anywhere,
  // so a keydown on the handle itself would never fire.
  const handleWindowKeyDown = useRef((event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    escapeListenerRef.current?.abort();
    delete document.body.dataset[RESIZING_BODY_ATTRIBUTE];
    applySidebarWidth(startWidthRef.current);

    const element = handleRef.current;
    if (element?.hasPointerCapture(pointerIdRef.current)) {
      element.releasePointerCapture(pointerIdRef.current);
    }
  }).current;

  // The handle can unmount mid-drag (logout): the attribute left on the body would keep col-resize and
  // no text selection on the whole page, and the var would stay on the dragged width while the committed
  // one is the old. Empty deps on purpose: with `width` the cleanup would run at every commit and rewrite
  // the var after the commit that already applied it.
  useEffect(() => {
    return () => {
      escapeListenerRef.current?.abort();
      if (isDraggingRef.current) {
        applySidebarWidth(startWidthRef.current);
      }
      delete document.body.dataset[RESIZING_BODY_ATTRIBUTE];
    };
  }, []);

  function commit(next: number): void {
    if (next !== width) {
      onCommit(next);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    // Left button only: with the right one the context menu sits between pointerdown and pointerup.
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    latestWidthRef.current = width;
    pointerIdRef.current = event.pointerId;
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    // preventDefault cancels the compatibility mousedown, and with it the focus by click.
    event.currentTarget.focus();
    document.body.dataset[RESIZING_BODY_ATTRIBUTE] = 'true';
    // A second pointerdown (another pointer) would keep the listener bound to the old signal, which
    // nobody reaches anymore: abort the previous controller first.
    escapeListenerRef.current?.abort();
    escapeListenerRef.current = new AbortController();
    window.addEventListener('keydown', handleWindowKeyDown, { signal: escapeListenerRef.current.signal });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!isDraggingRef.current) {
      return;
    }

    const next = clampSidebarWidth(startWidthRef.current + (event.clientX - startXRef.current));
    latestWidthRef.current = next;
    applySidebarWidth(next);
  }

  function finishDrag(): void {
    // lostpointercapture arrives together with pointerup: without the guard a drag would commit twice.
    // Escape also comes through here, via releasePointerCapture, with the drag already marked as over.
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    escapeListenerRef.current?.abort();
    delete document.body.dataset[RESIZING_BODY_ATTRIBUTE];
    commit(latestWidthRef.current);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    // Same guard the Escape path has: a key pressed with the pointer still down would save an
    // intermediate width that pointerup overwrites anyway -- one disk write for nothing.
    if (isDraggingRef.current) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commit(clampSidebarWidth(width - KEYBOARD_STEP));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      commit(clampSidebarWidth(width + KEYBOARD_STEP));
    }
  }

  return (
    // The class carries `-webkit-app-region: no-drag`: the top of the sidebar is a window drag region, and
    // an element inside it receives no mouse (RN-05). jsdom cannot see it — deleting it survives the suite.
    <div
      ref={handleRef}
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura do menu"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => commit(SIDEBAR_DEFAULT_WIDTH)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
    />
  );
};

export default SidebarResizeHandle;
