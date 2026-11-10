import '@testing-library/jest-dom/vitest';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { shell } from './shellMocks';
import AppShell from '../AppShell';

// RN-07: the shell owns the socket and printing hooks, and its remount runs their cleanup (the store
// disconnects, the restaurant stops printing). The hooks below record mount, unmount and render.
const probe = vi.hoisted(() => ({ mounts: 0, unmounts: 0, renders: 0, queueRenders: 0 }));

vi.mock('renderer/providers/auth', () => ({ useAuth: () => shell.auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/hooks/useAdminSocketEvents', () => ({ useAdminSocketEvents: vi.fn() }));
vi.mock('renderer/hooks/useAdminSocket', () => ({ useAdminSocket: () => ({ isConnected: true }) }));
vi.mock('renderer/hooks/usePrintingBoard', () => ({ usePrintingBoard: vi.fn() }));
vi.mock('renderer/hooks/usePrintingOrder', () => ({
  usePrintingOrder: () => {
    probe.renders += 1;
    useEffect(() => {
      probe.mounts += 1;

      return () => {
        probe.unmounts += 1;
      };
    }, []);
  },
}));
vi.mock('renderer/hooks/usePrintQueue', () => ({
  usePrintQueue: () => {
    probe.queueRenders += 1;

    return shell.queue;
  },
}));
vi.mock('renderer/hooks/usePrinters', () => ({ usePrinters: () => shell.printers }));

describe('resizing the sidebar', () => {
  beforeEach(() => {
    Object.assign(probe, { mounts: 0, unmounts: 0, renders: 0, queueRenders: 0 });
    document.documentElement.style.removeProperty('--sidebar-width');
    vi.mocked(window.electron.uiSidebarWidth).mockResolvedValue(216);
  });

  it('never remounts the shell, and renders nothing per pointermove', async () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>conteúdo</p>
        </AppShell>
      </MemoryRouter>
    );
    await waitFor(() => expect(window.electron.uiSidebarWidth).toHaveBeenCalled());
    // let the width read settle: it re-renders the sidebar once, which is not the drag
    await waitFor(() => expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '216'));
    const handle = screen.getByRole('separator');
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn().mockReturnValue(false);
    handle.releasePointerCapture = vi.fn();
    const shellRenders = probe.renders;
    const sidebarRenders = probe.queueRenders;

    fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
    for (let x = 1; x <= 60; x += 1) {
      fireEvent.pointerMove(handle, { clientX: x, pointerId: 1 });
    }

    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('276px');
    // A setState per pointermove would add 60 renders of the sidebar here.
    expect(probe.queueRenders).toBe(sidebarRenders);
    expect(probe.renders).toBe(shellRenders);

    fireEvent.pointerUp(handle, { pointerId: 1 });
    await waitFor(() => expect(window.electron.setUiSidebarWidth).toHaveBeenCalledWith(276));
    await waitFor(() => expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '276'));

    expect(probe.mounts).toBe(1);
    expect(probe.unmounts).toBe(0);
    expect(probe.renders).toBe(shellRenders);
    // The state changes at the commit, and only the sidebar renders for it.
    expect(probe.queueRenders - sidebarRenders).toBeLessThanOrEqual(3);
  });
});
