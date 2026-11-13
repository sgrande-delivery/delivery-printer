import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electron = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => electron.userData, getVersion: () => '9.9.9' },
  BrowserWindow: vi.fn(),
}));
vi.mock('../../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const printReceipt = vi.hoisted(() => vi.fn());

vi.mock('../../ipc-events/onRawPrint', () => ({ printReceipt }));

import { onPrintTest } from '../../ipc-events/onPrintTest';
import { onQueueState } from '../../ipc-events/onQueueState';
import { printQueueStore } from '../print-queue-store';
import { writePrinterUsefulWidth } from '../../printerPreferences';

const event = {} as Parameters<typeof onPrintTest>[0];
const request = { printerName: 'Cozinha', stationLabel: 'Cozinha', paperWidth: 80, deviceName: 'EPSON TM-T20' };

describe('test print', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'print-test-'));
    printReceipt.mockReset();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  // A direct print would leave no job: this is what tells the queue path from a shortcut.
  it('goes through the queue as a kind test job and shows as a test when it keeps failing', async () => {
    printReceipt.mockRejectedValue('Print job failed');

    expect(onPrintTest(event, request)).toBe('enqueued');
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalled());

    const jobs = printQueueStore.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: 'test', label: 'a página de teste', status: 'pending' });
    expect(jobs[0].orderUuid).toBeUndefined();
    expect(onQueueState()[0]).toMatchObject({ kind: 'test', label: 'a página de teste', deviceName: 'EPSON TM-T20' });
  });

  it('hands the worker one copy for the resolved device, with the app version on the page', async () => {
    printReceipt.mockResolvedValue(undefined);

    onPrintTest(event, request);
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalled());

    const payload = printReceipt.mock.calls[0][0];
    expect(payload).toMatchObject({ copies: 1, deviceName: 'EPSON TM-T20' });
    expect(payload.content).toContain('9.9.9');
    expect(payload.content).toContain('EPSON TM-T20');
  });

  it('refuses a malformed request instead of queueing it', () => {
    expect(() => onPrintTest(event, { printerName: 3 })).toThrow('invalid test print request');
    expect(printQueueStore.list()).toHaveLength(0);
  });

  it('refuses a purpose it does not know', () => {
    expect(() => onPrintTest(event, { ...request, purpose: 'calibrate' })).toThrow('invalid test print request');
    expect(printQueueStore.list()).toHaveLength(0);
  });

  // Spec 95, RN-11: measuring through a saved width would make the app cut the scale at the number saved.
  it('queues the measuring page over the whole roll, ignoring the useful width saved for the device', async () => {
    writePrinterUsefulWidth('EPSON TM-T20', 72);
    printReceipt.mockResolvedValue(undefined);

    onPrintTest(event, { ...request, purpose: 'measure' });
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalled());

    const payload = printReceipt.mock.calls[0][0];
    expect(payload.measurePaperWidthMm).toBe(80);
    expect(payload.content).toContain('Geometria: medição na bobina de 80 mm');
    expect(payload.content).not.toMatch(/\.frame \{[^}]*max-width/);
    expect(printQueueStore.list()[0]).toMatchObject({ kind: 'test', label: 'a página de medição' });
  });

  it('lays the ordinary test page out in the useful width saved for the device, and does not measure', async () => {
    writePrinterUsefulWidth('EPSON TM-T20', 72);
    printReceipt.mockResolvedValue(undefined);

    // No purpose is what both screens send today (PrinterItem, the /print-test screen); 'check' is the same page.
    onPrintTest(event, request);
    onPrintTest(event, { ...request, purpose: 'check' });
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(2));

    for (const [payload] of printReceipt.mock.calls) {
      expect(payload).not.toHaveProperty('measurePaperWidthMm');
      expect(payload.content).toContain('Geometria: largura útil de 72 mm, desta máquina');
      expect(payload.content).toContain('max-width: calc(72mm - 4mm) !important');
    }
  });

  it('says automatic for a device with nothing saved, and leaves the default printer to the print', async () => {
    printReceipt.mockResolvedValue(undefined);

    onPrintTest(event, request);
    onPrintTest(event, { ...request, deviceName: null });
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(2));

    expect(printReceipt.mock.calls[0][0].content).toContain('Geometria: automática (área do driver)');
    expect(printReceipt.mock.calls[1][0].content).toContain('Geometria: a da impressora padrão do Windows');
  });

  it('measures a 58 mm roll on its own width', async () => {
    printReceipt.mockResolvedValue(undefined);

    onPrintTest(event, { ...request, paperWidth: 58, purpose: 'measure' });
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalled());

    expect(printReceipt.mock.calls[0][0].measurePaperWidthMm).toBe(58);
  });
});
