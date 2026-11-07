// The width range of the sidebar, in `shared/` because both ends clamp: the main process what it read
// from the (hand-editable) preferences file, the renderer the drag. Typed twice, the ranges would drift.
// Pure on purpose: this file is in the include of both tsconfigs, so no node: and no DOM here.
export const SIDEBAR_DEFAULT_WIDTH = 216;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 360;

// Anything that is not a finite number is the default, not the minimum. A string is NOT coerced: the
// file is editable by hand, and Number('') is 0, which passes Number.isFinite and would land on the
// minimum instead of the default (the same trap the delivery-admin helper records). Out-of-range
// numbers are clamped.
export function clampSidebarWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}
