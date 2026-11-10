import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { cardState, stationLabel, toPaperWidth } from 'renderer/components/printers/printerView';
import type { TestPrintRequest } from 'shared/printQueue';
import {
  TEST_PRINT_COLUMNS,
  TEST_PRINT_NOTE,
  TEST_PRINT_TITLE,
  testPrintDataLines,
  testPrintWidthRuler,
} from 'shared/testPrintContent';

export type TestStatus =
  { phase: 'idle' } | { phase: 'sending' } | { phase: 'done'; at: string } | { phase: 'failed'; reason: string };

export type MessageTone = 'muted' | 'working' | 'ok' | 'err';

export interface StatusMessage {
  text: string;
  icon: 'progress_activity' | 'check_circle' | 'error' | null;
  tone: MessageTone;
}

// printer-v2.dc.html:681. "Enviado", never "impresso": printTest resolves when the page is queued, and
// only the paper confirms the rest.
export function statusMessage(status: TestStatus, printerName: string): StatusMessage {
  switch (status.phase) {
    case 'idle':
      return { text: '', icon: null, tone: 'muted' };
    case 'sending':
      return { text: `Enviando para ${printerName}…`, icon: 'progress_activity', tone: 'working' };
    case 'done':
      return { text: `Enviado às ${status.at}. Confira se a página saiu.`, icon: 'check_circle', tone: 'ok' };
    case 'failed':
      return { text: `Não foi possível enviar: ${status.reason}.`, icon: 'error', tone: 'err' };
  }
}

export function buttonLabel(status: TestStatus): string {
  return status.phase === 'sending' ? 'Imprimindo…' : 'Imprimir página de teste';
}

// The id may name a printer that left the list in a refresh: then the first one is the choice,
// which is also what the screen opens with.
export function selectedPrinter(printers: ResolvedPrinter[], selectedId: number | null): ResolvedPrinter | null {
  return printers.find(printer => printer.id === selectedId) ?? printers[0] ?? null;
}

// A registration that matches no device is still testable: testing is how the operator finds out. What
// the screen owes is saying where the page will really come out, in the card's own words.
export function isMissing(printer: ResolvedPrinter, devicesRead: boolean): boolean {
  return cardState(printer, devicesRead) === 'missing';
}

export function toRequest(printer: ResolvedPrinter): TestPrintRequest {
  return {
    printerName: printer.name,
    stationLabel: stationLabel(printer.station),
    paperWidth: printer.paper_width,
    deviceName: printer.resolvedDevice,
  };
}

export interface PreviewPage {
  title: string;
  lines: string[];
  rulers: string[];
  note: string;
  paperWidth: 58 | 80;
}

// The same words as the page the main process prints (shared/testPrintContent), in the same order.
export function buildPreview(printer: ResolvedPrinter, appVersion: string, now: Date): PreviewPage {
  const request = toRequest(printer);
  const paperWidth = toPaperWidth(request.paperWidth);

  return {
    title: TEST_PRINT_TITLE,
    lines: testPrintDataLines({
      printerName: request.printerName,
      stationLabel: request.stationLabel,
      deviceName: request.deviceName,
      paperWidth,
      when: now.toLocaleString('pt-BR'),
      appVersion,
    }),
    rulers: [testPrintWidthRuler(paperWidth), TEST_PRINT_COLUMNS],
    note: TEST_PRINT_NOTE,
    paperWidth,
  };
}

// 240 px is the 80 mm roll of the design (:368); the narrow roll keeps the proportion.
export function paperPixels(paperWidth: 58 | 80): number {
  return Math.round((240 * paperWidth) / 80);
}
