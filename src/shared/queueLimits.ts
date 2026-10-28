// The two limits the queue enforces, in `shared/` because the main process applies them and the
// queue screen explains them: the text of the screen derives from these, never from a number typed twice.

// Attempts before a job becomes failed.
export const MAX_ATTEMPTS = 5;

// A job older than this is dropped from the file, whatever its status.
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
