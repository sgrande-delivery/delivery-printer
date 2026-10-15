import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Status from '../Status';
import AuthProvider from 'renderer/providers/auth';
import MessagingProvider from 'renderer/providers/messaging';
import type { PrintJobSummary } from 'shared/printQueue';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

function renderStatus() {
  return render(
    <AuthProvider>
      <MessagingProvider>
        <Status wsConnected handleLogout={() => undefined} />
      </MessagingProvider>
    </AuthProvider>
  );
}

describe('Status log link', () => {
  beforeEach(() => {
    // The preload stub lives in the shared setup file, so its call history carries over.
    vi.mocked(window.electron.revealLogs).mockClear();
  });

  it('calls the revealLogs channel on click', () => {
    vi.mocked(window.electron.revealLogs).mockResolvedValueOnce(true);
    const { container } = renderStatus();

    fireEvent.click(screen.getByRole('button', { name: 'abrir logs' }));

    expect(window.electron.revealLogs).toHaveBeenCalledTimes(1);
    expectNoUndefinedClasses(container);
  });

  it('tells the operator there is no log yet when the channel answers false', async () => {
    vi.mocked(window.electron.revealLogs).mockResolvedValueOnce(false);
    renderStatus();

    fireEvent.click(screen.getByRole('button', { name: 'abrir logs' }));

    await waitFor(() => expect(screen.getByText('Ainda não há registros para exportar.')).toBeInTheDocument());
  });
});

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 0,
    status: 'pending',
    createdAt: 0,
    lastError: null,
    deviceName: 'Cozinha',
    ...overrides,
  };
}

describe('Status print queue', () => {
  beforeEach(() => {
    vi.mocked(window.electron.queueState).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.retryFailed).mockReset().mockResolvedValue(1);
  });

  it('shows nothing at all when the queue is empty', async () => {
    const { container } = renderStatus();
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalled());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/aguardando impressão/)).not.toBeInTheDocument();
    expect(screen.queryByText(/tentar/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the pending counter as information, not as an alert', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([job({ id: 'a' }), job({ id: 'b' })]);
    const { container } = renderStatus();

    expect(await screen.findByText('2 comprovantes aguardando impressão')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the failed job with order and printer, and the button retries that job', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([job({ id: 'f-1', status: 'failed' })]);
    const { container } = renderStatus();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('o pedido #42');
    expect(alert).toHaveTextContent('Cozinha');

    fireEvent.click(screen.getByRole('button', { name: 'tentar de novo' }));

    expect(window.electron.retryFailed).toHaveBeenCalledWith('f-1');
    expectNoUndefinedClasses(container);
  });
});

describe('Status printers link', () => {
  it('is a button that navigates to the printers screen', () => {
    renderStatus();

    fireEvent.click(screen.getByRole('button', { name: 'impressoras' }));

    expect(window.location.hash).toBe('#/printers');
  });
});
