import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ProtectedRoute from '../ProtectedRoute';
import type { SessionStatus } from 'renderer/providers/auth';

const auth = vi.hoisted(() => ({
  sessionStatus: 'loading',
  retrySession: vi.fn(),
  restaurant: { uuid: 'r-1', is_open: true },
  user: { id: 1, name: 'Maria', email: 'maria@example.com' },
  logout: vi.fn(),
}));

vi.mock('renderer/providers/auth', () => ({ useAuth: () => auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: vi.fn() }) }));
vi.mock('renderer/providers/theme', () => ({ useTheme: () => ({ resolved: 'light' }) }));
// The shell mounts the socket and printing hooks; they have their own suites and need a server.
vi.mock('renderer/hooks/useAdminSocketEvents', () => ({ useAdminSocketEvents: vi.fn() }));
vi.mock('renderer/hooks/useAdminSocket', () => ({ useAdminSocket: () => ({ isConnected: true }) }));
vi.mock('renderer/hooks/usePrintingOrder', () => ({ usePrintingOrder: vi.fn() }));
vi.mock('renderer/hooks/usePrintingBoard', () => ({ usePrintingBoard: vi.fn() }));
vi.mock('renderer/hooks/usePrinters', () => ({
  usePrinters: () => ({ printers: [], devicesRead: true, refresh: vi.fn() }),
}));

function renderRoute(status: SessionStatus) {
  auth.sessionStatus = status;

  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>tela de login</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>conteúdo protegido</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => auth.retrySession.mockClear());

  it('redirects to /login when the session was refused', () => {
    renderRoute('unauthenticated');

    expect(screen.getByText('tela de login')).toBeInTheDocument();
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  it('shows the no-connection screen without redirecting when the server is unreachable', () => {
    renderRoute('unreachable');

    expect(screen.getByText('Sem conexão com o servidor')).toBeInTheDocument();
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(auth.retrySession).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state while the session is being checked', () => {
    renderRoute('loading');

    expect(screen.getByText('Conectando ao servidor…')).toBeInTheDocument();
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
  });

  it('renders the content inside the layout when authenticated', () => {
    const { container } = renderRoute('authenticated');

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
    expect(container.querySelector('#app-content')).toContainElement(screen.getByText('conteúdo protegido'));
  });
});
