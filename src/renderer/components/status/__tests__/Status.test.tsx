import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Status from '../Status';
import AuthProvider from 'renderer/providers/auth';
import MessagingProvider from 'renderer/providers/messaging';
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
