import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PrinterPreferences } from 'shared/printerGeometry';
import { usePrinterPreferences } from '../usePrinterPreferences';

describe('usePrinterPreferences', () => {
  beforeEach(() => {
    vi.mocked(window.electron.printerPreferences).mockReset().mockResolvedValue({});
    vi.mocked(window.electron.setPrinterUsefulWidth).mockClear();
    vi.mocked(window.electron.log).mockClear();
  });

  it('reads what is saved on this machine when it mounts', async () => {
    vi.mocked(window.electron.printerPreferences).mockResolvedValue({ 'EPSON TM-T20': { usefulWidthMm: 72 } });

    const { result } = renderHook(() => usePrinterPreferences());

    await waitFor(() => expect(result.current.preferences).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } }));
  });

  it('stays automatic and logs when the read fails, like the print would', async () => {
    vi.mocked(window.electron.printerPreferences).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => usePrinterPreferences());

    await waitFor(() =>
      expect(window.electron.log).toHaveBeenCalledWith('error', 'read printer preferences failed', expect.anything())
    );
    expect(result.current.preferences).toEqual({});
  });

  // The first read is older than a write that answered before it: landing late, it must not undo the write.
  it('keeps a write that lands before the first read', async () => {
    let answerRead: (value: PrinterPreferences) => void = () => undefined;
    vi.mocked(window.electron.printerPreferences).mockReturnValue(
      new Promise(resolve => {
        answerRead = resolve;
      })
    );

    const { result } = renderHook(() => usePrinterPreferences());

    await act(() => result.current.setUsefulWidth('EPSON TM-T20', 70));
    await act(async () => answerRead({ 'EPSON TM-T20': { usefulWidthMm: 64 } }));

    expect(result.current.preferences).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 70 } });
  });

  it('rejects when the write fails, so the screen can say it, and keeps what it had', async () => {
    vi.mocked(window.electron.printerPreferences).mockResolvedValue({ 'EPSON TM-T20': { usefulWidthMm: 72 } });
    const { result } = renderHook(() => usePrinterPreferences());
    await waitFor(() => expect(result.current.preferences).not.toEqual({}));

    await expect(act(() => result.current.setUsefulWidth('EPSON TM-T20', 90))).rejects.toThrow();

    expect(result.current.preferences).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } });
  });
});
