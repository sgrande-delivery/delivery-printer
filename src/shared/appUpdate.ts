// The state the main process keeps and the renderer draws. It lives in memory in main: unlike the queue,
// there is no file, which is why the event carries the whole state in its payload (spec 79, RN-03).

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  /** The app is quitting to install. Only task #82 produces it; it is here so the type does not change twice. */
  | 'restarting';

export type UpdateState = {
  status: UpdateStatus;
  /** This app's version, from package.json. */
  currentVersion: string;
  /** The offered version; null when there is none. */
  targetVersion: string | null;
  /** 0 to 100. Only meaningful in 'downloading' and 'ready'. */
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  /** From 'download-progress'; 0 when electron-updater does not report it. Without it there is no estimate (fidelity 5). */
  bytesPerSecond: number;
  /** Epoch ms of the last COMPLETED check (with or without news). null before the first one. */
  lastCheckedAt: number | null;
  /**
   * Diagnostic (log, maybe a tooltip); only in 'error'. NOT the card text: the user-facing wording lives in
   * the screen's state table (the view), so do not render this field as the product message.
   */
  error: string | null;
  autoDownload: boolean;
  /** The operator asked for a restart and the queue has not drained yet (task #82). */
  restartScheduled: boolean;
  /** How many prints are still pending before the scheduled restart. 0 outside that state. */
  pendingJobs: number;
  /** TEXT lines extracted from the release body. Never HTML (RN-04). */
  releaseNotes: string[];
};

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MAX_RELEASE_NOTE_LINES = 12;
