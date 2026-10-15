import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrintJob } from 'shared/printQueue';

const electron = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('../../logger', () => ({ logger: log }));

import { MAX_AGE_MS, MAX_JOBS, printQueueStore } from '../print-queue-store';

const NOW = new Date('2026-10-15T12:00:00Z').getTime();

function job(id: string, overrides: Partial<PrintJob> = {}): PrintJob {
  return {
    id,
    kind: 'order-created',
    payload: { content: `<html>${id}</html>`, copies: 1, deviceName: 'Cozinha', id },
    orderUuid: `order-${id}`,
    attempts: 0,
    status: 'pending',
    createdAt: NOW,
    lastError: null,
    ...overrides,
  };
}

const file = (): string => path.join(electron.userData, 'print-queue.ndjson');

describe('printQueueStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'print-queue-'));
    log.info.mockClear();
    log.warn.mockClear();
    log.error.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('returns what was enqueued, unchanged', () => {
    const first = job('a');
    const second = job('b', { kind: 'board', orderUuid: undefined });

    printQueueStore.enqueue(first);
    printQueueStore.enqueue(second);

    expect(printQueueStore.list()).toEqual([first, second]);
  });

  it('ignores a second job with the same id', () => {
    printQueueStore.enqueue(job('a'));

    expect(printQueueStore.enqueue(job('a', { kind: 'board' }))).toBe(false);
    expect(printQueueStore.list()).toHaveLength(1);
  });

  it('returns an empty list, without throwing, when the file does not exist', () => {
    expect(printQueueStore.list()).toEqual([]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('markPrinted takes the job out of the pending list and drops the receipt HTML', () => {
    printQueueStore.enqueue(job('a'));
    printQueueStore.enqueue(job('b'));

    printQueueStore.markPrinted('a');

    expect(printQueueStore.list('pending').map(j => j.id)).toEqual(['b']);
    const printed = printQueueStore.list('printed');

    expect(printed).toHaveLength(1);
    expect(printed[0].payload.content).toBe('');
    expect(printed[0].orderUuid).toBe('order-a');
  });

  it('markFailed keeps the job with the reason', () => {
    printQueueStore.enqueue(job('a'));

    printQueueStore.markFailed('a', 'Print job failed');

    const [failed] = printQueueStore.list('failed');

    expect(failed.lastError).toBe('Print job failed');
    expect(failed.payload.content).toBe('<html>a</html>');
  });

  it('resetFailed puts failed jobs back to pending with a fresh count, only the one asked for', () => {
    printQueueStore.enqueue(job('a'));
    printQueueStore.enqueue(job('b'));
    printQueueStore.incrementAttempt('a');
    printQueueStore.markFailed('a', 'Print job failed');
    printQueueStore.markFailed('b', 'Print job failed');

    expect(printQueueStore.resetFailed('a')).toBe(1);

    expect(printQueueStore.list('pending')).toEqual([job('a')]);
    expect(printQueueStore.list('failed').map(j => j.id)).toEqual(['b']);
    expect(printQueueStore.resetFailed()).toBe(1);
    expect(printQueueStore.resetFailed()).toBe(0);
  });

  it('incrementAttempt counts', () => {
    printQueueStore.enqueue(job('a'));

    printQueueStore.incrementAttempt('a');
    printQueueStore.incrementAttempt('a');

    expect(printQueueStore.list()[0].attempts).toBe(2);
  });

  it('survives a restart: a fresh read of the file gets the same jobs', async () => {
    printQueueStore.enqueue(job('a'));
    vi.resetModules();

    const fresh = await import('../print-queue-store');

    expect(fresh.printQueueStore.list().map(j => j.id)).toEqual(['a']);
  });

  it('discards a corrupted line in the middle, keeps the others and logs it', () => {
    const lines = [JSON.stringify(job('a')), '{"id": "trunc', JSON.stringify(job('c'))];
    const raw = `${lines.join('\n')}\n`;

    fs.writeFileSync(file(), raw);

    expect(printQueueStore.list().map(j => j.id)).toEqual(['a', 'c']);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('line 2'));
    // reading does not destroy what it could not read: that is compact()
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
  });

  it('reading never writes, not even to drop an unreadable line', () => {
    printQueueStore.enqueue(job('a'));
    fs.appendFileSync(file(), '{"id": "trunc\n');
    const open = vi.spyOn(fs, 'openSync');
    const write = vi.spyOn(fs, 'writeFileSync');
    const rename = vi.spyOn(fs, 'renameSync');

    printQueueStore.list();

    expect(open.mock.calls.map(call => call[0])).not.toContain(`${file()}.tmp`);
    expect(write.mock.calls.map(call => call[0])).not.toContain(file());
    expect(rename).not.toHaveBeenCalled();
  });

  it('compact drops the unreadable lines from the file, and only then they stop being reported', () => {
    const lines = [JSON.stringify(job('a')), '{"id": "trunc', JSON.stringify(job('c'))];

    fs.writeFileSync(file(), `${lines.join('\n')}\n`);

    expect(printQueueStore.compact()).toBe(1);

    log.warn.mockClear();
    expect(printQueueStore.list().map(j => j.id)).toEqual(['a', 'c']);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('compact leaves the file alone when every line is readable', () => {
    printQueueStore.enqueue(job('a'));
    const rename = vi.spyOn(fs, 'renameSync');

    expect(printQueueStore.compact()).toBe(0);
    expect(rename).not.toHaveBeenCalled();
  });

  it('discards a line that is JSON but not a job', () => {
    fs.writeFileSync(file(), `${JSON.stringify({ id: 'x' })}\n${JSON.stringify(job('b'))}\n`);

    expect(printQueueStore.list().map(j => j.id)).toEqual(['b']);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not a print job'));
  });

  // The discarded line is a receipt with the customer's data, so only its number
  // is logged. Both branches are covered on purpose: the line that is valid JSON
  // with the wrong shape is the one that carries a whole payload.
  it('never puts the receipt content in the log, in either discard branch', () => {
    const brokenJson = '{"payload":{"content":"<html>CLIENTE SECRETO</html>"';
    const wrongShape = JSON.stringify({ id: 'x', payload: { content: '<html>OUTRO SEGREDO</html>' } });

    fs.writeFileSync(file(), `${brokenJson}\n${wrongShape}\n`);

    printQueueStore.list();

    const logged = JSON.stringify([...log.warn.mock.calls, ...log.error.mock.calls, ...log.info.mock.calls]);

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not a print job'));
    expect(logged).not.toContain('SECRETO');
    expect(logged).not.toContain('SEGREDO');
  });

  it('pruneOlderThan drops what is older than the limit, whatever the status, and logs why', () => {
    printQueueStore.enqueue(job('old', { createdAt: NOW - MAX_AGE_MS - 1 }));
    printQueueStore.enqueue(job('edge', { createdAt: NOW - MAX_AGE_MS }));
    printQueueStore.enqueue(job('new'));
    printQueueStore.markFailed('old', 'x');

    expect(printQueueStore.pruneOlderThan(MAX_AGE_MS)).toBe(1);

    expect(printQueueStore.list().map(j => j.id)).toEqual(['edge', 'new']);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('older than'));
  });

  it('holds at most MAX_JOBS, dropping printed first, then failed, then the oldest pending, and logs', () => {
    // The file starts full, the way it comes back after a restart. Reaching the
    // limit through MAX_JOBS enqueues would mean as many atomic rewrites with
    // fsync: ~0.8 s here and enough to hit the 5 s timeout on the Windows runner.
    const full = Array.from({ length: MAX_JOBS }, (_, i) => job(`j${i}`));

    full[1] = job('j1', { status: 'failed', lastError: 'x' });
    full[5] = job('j5', { status: 'printed', payload: { content: '', copies: 1, deviceName: 'Cozinha', id: 'j5' } });
    fs.writeFileSync(file(), full.map(j => `${JSON.stringify(j)}\n`).join(''));

    printQueueStore.enqueue(job('n1'));
    expect(printQueueStore.list().map(j => j.id)).not.toContain('j5');

    printQueueStore.enqueue(job('n2'));
    expect(printQueueStore.list().map(j => j.id)).not.toContain('j1');

    printQueueStore.enqueue(job('n3'));
    const ids = printQueueStore.list().map(j => j.id);

    expect(ids).toHaveLength(MAX_JOBS);
    expect(ids).not.toContain('j0');
    expect(ids).toContain('n3');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('queue limit'));
  });

  describe('atomic write', () => {
    it('never opens the final file for writing: temp file, then rename', () => {
      const open = vi.spyOn(fs, 'openSync');
      const write = vi.spyOn(fs, 'writeFileSync');
      const rename = vi.spyOn(fs, 'renameSync');

      printQueueStore.enqueue(job('a'));

      expect(open).toHaveBeenCalledWith(`${file()}.tmp`, 'w');
      expect(open.mock.calls.map(call => call[0])).not.toContain(file());
      expect(write.mock.calls.map(call => call[0])).not.toContain(file());
      expect(rename).toHaveBeenCalledWith(`${file()}.tmp`, file());
      expect(fs.existsSync(`${file()}.tmp`)).toBe(false);
    });

    it('leaves the previous file intact when the write is interrupted', () => {
      printQueueStore.enqueue(job('a'));
      const before = fs.readFileSync(file(), 'utf8');

      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('power cut');
      });

      expect(() => printQueueStore.enqueue(job('b'))).toThrow('power cut');

      vi.restoreAllMocks();
      expect(fs.readFileSync(file(), 'utf8')).toBe(before);
      expect(fs.existsSync(`${file()}.tmp`)).toBe(false);
    });
  });
});
