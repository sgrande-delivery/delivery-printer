import { describe, expect, it } from 'vitest';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import {
  cardState,
  detailLine,
  draftOf,
  drawerTitle,
  isDirty,
  needsToggle,
  nextStation,
  stationChoices,
  toPayload,
} from '../printerView';

function printer(overrides: Partial<ResolvedPrinter> = {}): ResolvedPrinter {
  return {
    id: 7,
    name: 'Cozinha',
    address: 'Rua A, 1',
    activated: true,
    station: 'kitchen',
    paper_width: 80,
    copies: 2,
    resolvedDevice: 'Cozinha',
    ...overrides,
  };
}

describe('cardState', () => {
  it('is found when a device matched, missing when none did', () => {
    expect(cardState(printer(), true)).toBe('found');
    expect(cardState(printer({ resolvedDevice: null }), true)).toBe('missing');
  });

  it('is unknown, never missing, when no device could be read on this machine', () => {
    expect(cardState(printer({ resolvedDevice: null }), false)).toBe('unknown');
    expect(cardState(printer(), false)).toBe('unknown');
  });
});

describe('detailLine', () => {
  it('writes sector, copies, roll and situation in the order of the design', () => {
    expect(detailLine(printer())).toBe('Cozinha · 2 cópias · bobina 80 mm · ativa');
  });

  it('uses the singular for one copy and says desativada for an inactive printer', () => {
    expect(detailLine(printer({ copies: 1, activated: false }))).toBe('Cozinha · 1 cópia · bobina 80 mm · desativada');
  });

  it('falls back to "Sem setor" and to the raw value of a sector it does not know', () => {
    expect(detailLine(printer({ station: null }))).toMatch(/^Sem setor ·/);
    expect(detailLine(printer({ station: 'teleport' }))).toMatch(/^teleport ·/);
  });

  it('keeps the real width of an unusual roll', () => {
    expect(detailLine(printer({ paper_width: 58 }))).toContain('bobina 58 mm');
  });
});

describe('drawerTitle', () => {
  it('says Corrigir only for a name that matched nothing', () => {
    expect(drawerTitle('missing')).toBe('Corrigir impressora');
    expect(drawerTitle('found')).toBe('Editar impressora');
    expect(drawerTitle('unknown')).toBe('Editar impressora');
  });
});

describe('stationChoices', () => {
  it('offers the seven sectors of the API, in order', () => {
    expect(stationChoices('kitchen').map(choice => choice.value)).toEqual([
      'kitchen',
      'bar',
      'pizza',
      'counter',
      'cashier',
      'dessert',
      'sushi',
    ]);
  });

  it('adds a registered sector that is none of them, as itself', () => {
    const choices = stationChoices('teleport');

    expect(choices).toHaveLength(8);
    expect(choices[7]).toEqual({ value: 'teleport', label: 'teleport' });
  });

  it('adds nothing for a printer without sector', () => {
    expect(stationChoices(null)).toHaveLength(7);
  });
});

describe('nextStation', () => {
  it('picks another sector, and clears the one that is picked again', () => {
    expect(nextStation('kitchen', 'bar')).toBe('bar');
    expect(nextStation(null, 'bar')).toBe('bar');
    expect(nextStation('bar', 'bar')).toBeNull();
  });
});

describe('isDirty', () => {
  it('is false for the draft as it was opened, and true for each field changed', () => {
    const original = draftOf(printer());

    expect(isDirty(original, { ...original })).toBe(false);
    expect(isDirty(original, { ...original, name: 'Outra' })).toBe(true);
    expect(isDirty(original, { ...original, station: 'bar' })).toBe(true);
    expect(isDirty(original, { ...original, copies: 3 })).toBe(true);
    expect(isDirty(original, { ...original, paperWidth: 58 })).toBe(true);
    expect(isDirty(original, { ...original, activated: false })).toBe(true);
  });
});

describe('toPayload', () => {
  it('sends the whole record, the address untouched', () => {
    expect(toPayload(printer(), draftOf(printer()))).toEqual({
      name: 'Cozinha',
      address: 'Rua A, 1',
      activated: true,
      copies: 2,
      paper_width: 80,
      station: 'kitchen',
    });
  });

  it('carries the activation as it was: the toggle has its own route', () => {
    const off = printer({ activated: false });

    expect(toPayload(off, { ...draftOf(off), activated: true }).activated).toBe(false);
  });

  it('sends a cleared sector as null', () => {
    expect(toPayload(printer(), { ...draftOf(printer()), station: null }).station).toBeNull();
  });
});

describe('needsToggle', () => {
  it('is true only when the switch ended up on the other side', () => {
    const on = printer();

    expect(needsToggle(on, draftOf(on))).toBe(false);
    expect(needsToggle(on, { ...draftOf(on), activated: false })).toBe(true);
  });
});
