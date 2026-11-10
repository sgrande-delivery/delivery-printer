import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import type { PaperWidth, UpdatePrinterPayload } from 'renderer/services/printers';
import { stations } from './stations';

// The two rolls of the design (printer-v2.dc.html:420-421), and the only two the API accepts:
// UpdatePrinterRequest.php:29 validates against PrinterPaperWidthEnum and the table has
// `CHECK (paper_width IN (58, 80))`. There is no third width to offer.
export const PAPER_WIDTHS: readonly PaperWidth[] = [58, 80];

// `Printer.paper_width` is `number`, which is honest for a read. The CHECK makes anything else
// impossible, so this branch never runs against a real server — it exists so a value the type
// allows cannot reach a payload the API would refuse with a 422.
export function toPaperWidth(width: number): PaperWidth {
  return width === 58 ? 58 : 80;
}

// The delivery-api's `copies` rule is min 1, max 3: offering a fourth is a guaranteed 422.
export const MIN_COPIES = 1;
export const MAX_COPIES = 3;

// 'unknown' is "this screen has not measured it": no device could be read on this computer.
export type CardState = 'found' | 'missing' | 'unknown';

export function cardState(printer: ResolvedPrinter, devicesRead: boolean): CardState {
  if (!devicesRead) {
    return 'unknown';
  }

  return printer.resolvedDevice ? 'found' : 'missing';
}

export function stationLabel(station: string | null): string {
  return station ? (stations[station] ?? station) : 'Sem setor';
}

export function detailLine(printer: ResolvedPrinter): string {
  const copies = `${printer.copies} ${printer.copies === 1 ? 'cópia' : 'cópias'}`;

  return [
    stationLabel(printer.station),
    copies,
    `bobina ${printer.paper_width} mm`,
    printer.activated ? 'ativa' : 'desativada',
  ].join(' · ');
}

export function drawerTitle(state: CardState): string {
  return state === 'missing' ? 'Corrigir impressora' : 'Editar impressora';
}

export interface PrinterDraft {
  name: string;
  station: string | null;
  copies: number;
  paperWidth: PaperWidth;
  activated: boolean;
}

export function draftOf(printer: ResolvedPrinter): PrinterDraft {
  return {
    name: printer.name,
    station: printer.station,
    copies: printer.copies,
    paperWidth: toPaperWidth(printer.paper_width),
    activated: printer.activated,
  };
}

export function isDirty(original: PrinterDraft, draft: PrinterDraft): boolean {
  return (
    original.name !== draft.name ||
    original.station !== draft.station ||
    original.copies !== draft.copies ||
    original.paperWidth !== draft.paperWidth ||
    original.activated !== draft.activated
  );
}

export interface StationChoice {
  value: string;
  label: string;
}

// The seven the API knows, plus the registered one when it is none of them: dropping it would rewrite it
// on the next save without anyone having touched it (the same rule as the paper width).
export function stationChoices(registered: string | null): StationChoice[] {
  const known = Object.entries(stations).map(([value, label]) => ({ value, label }));

  return registered && !(registered in stations) ? [...known, { value: registered, label: registered }] : known;
}

// A chip that is already selected clears the sector: "Sem setor" is a valid registration, and
// without a chip of its own this is the way back to it.
export function nextStation(current: string | null, picked: string): string | null {
  return current === picked ? null : picked;
}

// `activated` goes back as it was: the PUT would flip it, but this screen flips it by its own route
// (see UpdatePrinterPayload), so the two writes stay separate and a failed one is named.
export function toPayload(printer: ResolvedPrinter, draft: PrinterDraft): UpdatePrinterPayload {
  return {
    name: draft.name,
    address: printer.address,
    activated: printer.activated,
    copies: draft.copies,
    paper_width: draft.paperWidth,
    station: draft.station,
  };
}

export function needsToggle(printer: ResolvedPrinter, draft: PrinterDraft): boolean {
  return printer.activated !== draft.activated;
}
