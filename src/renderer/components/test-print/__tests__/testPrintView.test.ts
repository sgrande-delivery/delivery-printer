import { describe, expect, it } from 'vitest';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { buttonLabel, isMissing, paperPixels, selectedPrinter, statusMessage, toRequest } from '../testPrintView';

const printer: ResolvedPrinter = {
  id: 1,
  name: 'EPSON',
  address: '',
  activated: true,
  station: 'counter',
  paper_width: 58,
  copies: 1,
  resolvedDevice: 'EPSON TM',
};

describe('statusMessage', () => {
  it('is empty and muted when nothing was sent', () => {
    expect(statusMessage({ phase: 'idle' }, 'EPSON')).toEqual({ text: '', icon: null, tone: 'muted' });
  });

  it('names the printer while sending', () => {
    expect(statusMessage({ phase: 'sending' }, 'EPSON')).toEqual({
      text: 'Enviando para EPSON…',
      icon: 'progress_activity',
      tone: 'working',
    });
  });

  it('says sent, with the time, and asks to check the paper', () => {
    expect(statusMessage({ phase: 'done', at: '15:42' }, 'EPSON')).toEqual({
      text: 'Enviado às 15:42. Confira se a página saiu.',
      icon: 'check_circle',
      tone: 'ok',
    });
  });

  it('carries the cause of a failure', () => {
    expect(statusMessage({ phase: 'failed', reason: 'disco cheio' }, 'EPSON')).toEqual({
      text: 'Não foi possível enviar: disco cheio.',
      icon: 'error',
      tone: 'err',
    });
  });
});

describe('buttonLabel', () => {
  it('changes only while sending', () => {
    expect(buttonLabel({ phase: 'sending' })).toBe('Imprimindo…');
    expect(buttonLabel({ phase: 'idle' })).toBe('Imprimir página de teste');
    expect(buttonLabel({ phase: 'done', at: '1' })).toBe('Imprimir página de teste');
    expect(buttonLabel({ phase: 'failed', reason: 'x' })).toBe('Imprimir página de teste');
  });
});

describe('selectedPrinter', () => {
  const other = { ...printer, id: 2 };

  it('is the chosen one, the first when none is chosen or it left the list, null for an empty list', () => {
    expect(selectedPrinter([printer, other], 2)).toBe(other);
    expect(selectedPrinter([printer, other], null)).toBe(printer);
    expect(selectedPrinter([printer, other], 9)).toBe(printer);
    expect(selectedPrinter([], 1)).toBeNull();
  });
});

describe('isMissing', () => {
  it('accuses only when the computer printers were read and none matches', () => {
    expect(isMissing({ ...printer, resolvedDevice: null }, true)).toBe(true);
    expect(isMissing({ ...printer, resolvedDevice: null }, false)).toBe(false);
    expect(isMissing(printer, true)).toBe(false);
  });
});

describe('toRequest', () => {
  it('translates the sector and carries roll and device', () => {
    expect(toRequest(printer)).toEqual({
      printerName: 'EPSON',
      stationLabel: 'Balcão',
      paperWidth: 58,
      deviceName: 'EPSON TM',
    });
    expect(toRequest({ ...printer, station: null, resolvedDevice: null })).toEqual(
      expect.objectContaining({ stationLabel: 'Sem setor', deviceName: null })
    );
  });
});

describe('paperPixels', () => {
  it('is 240 for the wide roll and proportional for the narrow one', () => {
    expect(paperPixels(80)).toBe(240);
    expect(paperPixels(58)).toBe(174);
  });
});
