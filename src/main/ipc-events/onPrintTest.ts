import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { EnqueueResult, TestPrintRequest } from 'shared/printQueue';
import type { TestPrintGeometry } from 'shared/testPrintContent';
import { printerPreferenceFor } from '../printerPreferences';
import { printQueueWorker } from '../queue/print-queue';
import { buildTestPrintPage, normalizePaperWidth, TEST_MEASURE_LABEL, TEST_PRINT_LABEL } from '../testPrintPage';

function isTestPrintRequest(value: unknown): value is TestPrintRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return (
    typeof request.printerName === 'string' &&
    typeof request.stationLabel === 'string' &&
    typeof request.paperWidth === 'number' &&
    (request.deviceName === null || typeof request.deviceName === 'string') &&
    (request.purpose === undefined || request.purpose === 'check' || request.purpose === 'measure')
  );
}

// What the page will say about its own geometry. It mirrors what printReceipt decides for the same device: the
// measuring page ignores the saved width; otherwise the saved width of the device, if any. With no device the
// page goes to the system default, and only printReceipt knows which one that is.
function testPageGeometry(request: TestPrintRequest, paperWidthMm: 58 | 80): TestPrintGeometry {
  if (request.purpose === 'measure') {
    return { kind: 'measure', paperWidthMm };
  }

  if (request.deviceName === null) {
    return { kind: 'default-printer' };
  }

  const preference = printerPreferenceFor(request.deviceName);

  return preference ? { kind: 'useful-width', widthMm: preference.usefulWidthMm } : { kind: 'auto' };
}

// The test goes through the queue like any other work, so it gets the retry, the
// attempt limit and the failure on the status screen. It has no orderUuid: nothing
// to deduplicate, and nothing for the renderer to mark in the API.
export function onPrintTest(event: IpcMainInvokeEvent, request: unknown): EnqueueResult {
  if (!isTestPrintRequest(request)) {
    throw new Error('invalid test print request');
  }

  const id = randomUUID();
  const measure = request.purpose === 'measure';
  const paperWidthMm = normalizePaperWidth(request.paperWidth);
  const content = buildTestPrintPage(request, app.getVersion(), new Date(), testPageGeometry(request, paperWidthMm));

  return printQueueWorker.enqueue({
    kind: 'test',
    source: 'event',
    label: measure ? TEST_MEASURE_LABEL : TEST_PRINT_LABEL,
    items: [
      {
        id,
        payload: {
          content,
          copies: 1,
          deviceName: request.deviceName,
          id,
          ...(measure && { measurePaperWidthMm: paperWidthMm }),
        },
      },
    ],
  });
}
