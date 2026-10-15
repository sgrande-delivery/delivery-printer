// Types only, so both processes can import them without pulling code across:
// the main owns the queue, and the renderer will show its state.

export type PrintJobKind = 'order-created' | 'order-dispatched' | 'board' | 'board-billing' | 'test';

export type PrintJobStatus = 'pending' | 'printed' | 'failed';

// Same shape as the rawPrint channel argument: the worker hands it over as is.
export type PrintPayload = {
  content: string;
  copies: number;
  deviceName: string | null;
  id: string;
};

export type PrintJob = {
  id: string;
  kind: PrintJobKind;
  payload: PrintPayload;
  orderUuid?: string;
  // What the operator reads in a notice ("o pedido #42"); not part of the identity.
  label?: string;
  attempts: number;
  status: PrintJobStatus;
  createdAt: number;
  lastError: string | null;
};

// What crosses the IPC to show the queue and to warn about a failure. The receipt
// HTML (payload.content) stays in the main process: the type alone guarantees
// nothing, the test on the channel payload does.
export type PrintJobSummary = Omit<PrintJob, 'payload'> & { deviceName: string | null };

// Where the request came from. 'event' is something the operator or the panel
// asked for (printOrder, printShipment, the board events): it is never held back
// for having been printed before. 'scan' is the GET /orders/print/list sweep on
// every reconnection, which only asks "is anything still missing?".
export type EnqueueSource = 'event' | 'scan';

// One response of the delivery-api, whole: one item per printer. The renderer
// does not choose status, attempts or time: the main process does.
export type EnqueueRequest = {
  kind: PrintJob['kind'];
  orderUuid?: string;
  label?: string;
  source: EnqueueSource;
  items: Array<Pick<PrintJob, 'id' | 'payload'>>;
};

// One answer for the whole response. 'already-printed' is not an error: it tells the renderer that the receipt came
// out before, so only the API mark may be missing.
export type EnqueueResult = 'enqueued' | 'duplicate' | 'already-printed';

// What the printers screen sends to ask for a test page. The page itself is built in
// the main process; the renderer only says which registered printer it is for.
export type TestPrintRequest = {
  // The registered name (the "Cadastro" line of the page).
  printerName: string;
  // Already in Portuguese: the screen owns that translation table.
  stationLabel: string;
  paperWidth: number;
  // The Windows device the screen resolved for this printer.
  deviceName: string | null;
};
