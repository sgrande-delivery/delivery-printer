// The width range of the sidebar, in `shared/` because both ends clamp: the main process what it read
// from the (hand-editable) preferences file, the renderer the drag. Typed twice, the ranges would drift.
// Pure on purpose: this file is in the include of both tsconfigs, so no node: and no DOM here.
export const SIDEBAR_DEFAULT_WIDTH = 216;
// The minimum is what the update card's button needs. The label "Reiniciar e atualizar" at 13 px/600 is
// ~122 px (Arial Bold, the widest of the font stack; Segoe UI is narrower); the 34 px button adds
// padding 0 14px (28) and the outlined 1 px border (2): 152. Around it, the card's padding 12+12 (24)
// and the footer's 10+10 (20): 152 + 44 = 196, rounded up to the next multiple of 4 for slack: 200.
// The design's 216 leaves 172 inside the card, so 200 stays under it.
export const SIDEBAR_MIN_WIDTH = 200;
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
