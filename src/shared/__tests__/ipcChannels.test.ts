import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS } from '../ipcChannels';

const read = (file: string): string => readFileSync(resolve(__dirname, '../../main', file), 'utf8');

// The sources are read as text on purpose: no other test imports the preload or main.ts (the setup
// replaces window.electron whole), so this is the only thing that would notice a channel declared on one
// side and never used on the other.
const preload = read('preload.ts');
const mainSide = [read('main.ts'), read('queue/print-queue.ts'), read('app-events/onBeforeQuit.ts')].join('\n');

describe('ipcChannels', () => {
  it('has no two channels with the same wire name', () => {
    const names = [
      ...Object.values(INVOKE_CHANNELS),
      ...Object.values(SEND_CHANNELS),
      ...Object.values(EVENT_CHANNELS),
    ];

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(Object.keys(INVOKE_CHANNELS))('invoke channel %s is used by the preload and registered in main.ts', key => {
    expect(preload).toContain(`INVOKE_CHANNELS.${key}`);
    expect(mainSide).toContain(`INVOKE_CHANNELS.${key}`);
  });

  it.each(Object.keys(SEND_CHANNELS))(
    'send channel %s is used by the preload and listened to in the main process',
    key => {
      expect(preload).toContain(`SEND_CHANNELS.${key}`);
      expect(mainSide).toContain(`SEND_CHANNELS.${key}`);
    }
  );

  it.each(Object.keys(EVENT_CHANNELS))(
    'event channel %s is listened to by the preload and sent by the main process',
    key => {
      expect(preload).toContain(`EVENT_CHANNELS.${key}`);
      expect(mainSide).toContain(`EVENT_CHANNELS.${key}`);
    }
  );

  it('keeps raw channel names out of the preload and main.ts', () => {
    expect(preload).not.toMatch(/ipcRenderer\.\w+\(\s*'/);
    expect(read('main.ts')).not.toMatch(/ipcMain\.\w+\(\s*'/);
  });
});
