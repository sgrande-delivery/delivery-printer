import log from 'electron-log/main';

// One place configures the log for the whole app. Importing this module must be
// the first line of main.ts: anything logged before it runs would use the
// library defaults (and the updater used to be the one that configured them).
//
// The file lives in app.getPath('userData')/logs/main.log on Windows. One
// rotation is kept (main.old.log), so the disk use is bounded by twice maxSize
// (RN-04). A failed write is swallowed by the transport (RN-05).
log.transports.file.level = 'info';
log.transports.file.maxSize = 2 * 1024 * 1024;
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}';
// One line per entry: support reads this file in Notepad.
log.transports.file.inspectOptions = { depth: 5, breakLength: Infinity };

// showDialog off: a modal box on a PDV in the middle of service helps nobody,
// and the entry in the file is what the support needs.
log.errorHandler.startCatching({ showDialog: false });

export const logger = log;
