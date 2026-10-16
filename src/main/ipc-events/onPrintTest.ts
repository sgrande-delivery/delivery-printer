import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { EnqueueResult, TestPrintRequest } from 'shared/printQueue';
import { printQueueWorker } from '../queue/print-queue';
import { buildTestPrintPage, TEST_PRINT_LABEL } from '../testPrintPage';

function isTestPrintRequest(value: unknown): value is TestPrintRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return (
    typeof request.printerName === 'string' &&
    typeof request.stationLabel === 'string' &&
    typeof request.paperWidth === 'number' &&
    (request.deviceName === null || typeof request.deviceName === 'string')
  );
}

// The test goes through the queue like any other work, so it gets the retry, the
// attempt limit and the failure on the status screen. It has no orderUuid: nothing
// to deduplicate, and nothing for the renderer to mark in the API.
export function onPrintTest(event: IpcMainInvokeEvent, request: unknown): EnqueueResult {
  if (!isTestPrintRequest(request)) {
    throw new Error('invalid test print request');
  }

  const id = randomUUID();
  const content = buildTestPrintPage(request, app.getVersion(), new Date());

  return printQueueWorker.enqueue({
    kind: 'test',
    source: 'event',
    label: TEST_PRINT_LABEL,
    items: [{ id, payload: { content, copies: 1, deviceName: request.deviceName, id } }],
  });
}
