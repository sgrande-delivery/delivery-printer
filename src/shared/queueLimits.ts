// The two limits the queue enforces, in `shared/` because the main process applies them and the
// queue screen explains them: the text of the screen derives from these, never from a number typed twice.

// Attempts before a job becomes failed.
export const MAX_ATTEMPTS = 5;

// How many of the most recent printed jobs keep the receipt HTML on disk, so the history can reprint
// them. The rest of the printed records stay as the deduplication ledger, without the (heavy, and
// customer-bearing) HTML.
export const KEEP_PRINTED_HTML = 20;

// A job older than this is dropped from the file, whatever its status.
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
