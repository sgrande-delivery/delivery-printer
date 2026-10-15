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
  attempts: number;
  status: PrintJobStatus;
  createdAt: number;
  lastError: string | null;
};
