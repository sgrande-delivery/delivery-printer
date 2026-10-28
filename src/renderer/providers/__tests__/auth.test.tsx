import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';

import AuthProvider, { SessionStatus, useAuth } from '../auth';
import ProtectedRoute from 'renderer/routes/ProtectedRoute';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('renderer/services/api', () => ({ api: http }));
// The authenticated shell mounts the socket and printing hooks and the sidebar's printers badge;
// none of them is under test here and they would reach for a server.
vi.mock('renderer/hooks/useAdminSocketEvents', () => ({ useAdminSocketEvents: vi.fn() }));
vi.mock('renderer/hooks/useAdminSocket', () => ({ useAdminSocket: () => ({ isConnected: true }) }));
vi.mock('renderer/hooks/usePrintingOrder', () => ({ usePrintingOrder: vi.fn() }));
vi.mock('renderer/hooks/usePrintingBoard', () => ({ usePrintingBoard: vi.fn() }));
vi.mock('renderer/hooks/usePrinters', () => ({
  usePrinters: () => ({ printers: [], devicesRead: true, refresh: vi.fn() }),
}));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: vi.fn() }) }));

function httpError(status: number): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  });
}

function sessionBody(name = 'Ana') {
  return { id: 1, name, restaurant: { id: 7, name: 'Pizzaria', is_open: true } };
}

function renderProvider() {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  return result;
}

async function settle(auth: ReturnType<typeof renderProvider>, expected: SessionStatus) {
  await waitFor(() => expect(auth.current.sessionStatus).toBe(expected));
}

describe('AuthProvider session status', () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('becomes authenticated with user and restaurant when /users/me answers 200', async () => {
    http.get.mockResolvedValue({ data: sessionBody() });

    const auth = renderProvider();
    expect(auth.current.sessionStatus).toBe('loading');
    await settle(auth, 'authenticated');

    expect(auth.current.authenticated).toBe(true);
    expect(auth.current.loading).toBe(false);
    expect(auth.current.user.name).toBe('Ana');
    expect(auth.current.restaurant).toEqual(sessionBody().restaurant);
  });

  it('becomes unauthenticated and not unreachable on 401', async () => {
    http.get.mockRejectedValue(httpError(401));

    const auth = renderProvider();
    await settle(auth, 'unauthenticated');

    expect(auth.current.authenticated).toBe(false);
  });

  it.each([500, 502, 403, 404])('becomes unreachable on a %i answer', async code => {
    http.get.mockRejectedValue(httpError(code));

    const auth = renderProvider();
    await settle(auth, 'unreachable');
  });

  it('becomes unreachable when the AxiosError has no response', async () => {
    http.get.mockRejectedValue(new AxiosError('Network Error', AxiosError.ERR_NETWORK));

    const auth = renderProvider();
    await settle(auth, 'unreachable');
  });

  it('becomes unreachable and never unauthenticated when the error is not an AxiosError', async () => {
    http.get.mockRejectedValue(new TypeError('boom'));

    const auth = renderProvider();
    await settle(auth, 'unreachable');
  });

  it('retrySession goes through loading and reaches authenticated when the second call succeeds', async () => {
    http.get.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({ data: sessionBody() });

    const auth = renderProvider();
    await settle(auth, 'unreachable');

    act(() => auth.current.retrySession());
    expect(auth.current.sessionStatus).toBe('loading');
    await settle(auth, 'authenticated');

    expect(auth.current.restaurant).toEqual(sessionBody().restaurant);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('retrySession returns to unreachable when it fails again instead of staying in loading', async () => {
    http.get.mockRejectedValue(httpError(500));

    const auth = renderProvider();
    await settle(auth, 'unreachable');

    act(() => auth.current.retrySession());
    expect(auth.current.sessionStatus).toBe('loading');
    await settle(auth, 'unreachable');
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('me adopts a valid session when the provider was unauthenticated', async () => {
    http.get.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce({ data: sessionBody() });

    const auth = renderProvider();
    await settle(auth, 'unauthenticated');

    await act(async () => {
      await auth.current.me();
    });

    expect(auth.current.sessionStatus).toBe('authenticated');
    expect(auth.current.restaurant).toEqual(sessionBody().restaurant);
  });

  it('me does not reapply the session when the provider is already authenticated', async () => {
    http.get.mockResolvedValueOnce({ data: sessionBody('Ana') }).mockResolvedValueOnce({ data: sessionBody('Bia') });

    const auth = renderProvider();
    await settle(auth, 'authenticated');
    const before = auth.current.user;

    await act(async () => {
      await auth.current.me();
    });

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(auth.current.sessionStatus).toBe('authenticated');
    expect(auth.current.user).toBe(before);
    expect(auth.current.user.name).toBe('Ana');
  });

  it('logout moves to unauthenticated and clears the session', async () => {
    http.get.mockResolvedValue({ data: sessionBody() });
    http.post.mockResolvedValue({});

    const auth = renderProvider();
    await settle(auth, 'authenticated');

    await act(async () => {
      await auth.current.logout();
    });

    expect(http.post).toHaveBeenCalledWith('/logout');
    expect(auth.current.sessionStatus).toBe('unauthenticated');
    expect(auth.current.restaurant).toBeNull();
    expect(auth.current.user).toEqual({});
  });

  it('login authenticates on 200', async () => {
    http.get.mockRejectedValue(httpError(401));
    http.post.mockResolvedValue({ data: { data: { user: sessionBody(), restaurant: sessionBody().restaurant } } });

    const auth = renderProvider();
    await settle(auth, 'unauthenticated');

    await act(async () => {
      await auth.current.login('a@b.c', 'senha-falsa');
    });

    expect(http.post).toHaveBeenCalledWith('/login', { email: 'a@b.c', password: 'senha-falsa' });
    expect(auth.current.sessionStatus).toBe('authenticated');
    expect(auth.current.restaurant).toEqual(sessionBody().restaurant);
  });

  it('login with 401 throws the wrong credentials message and does not turn unreachable', async () => {
    http.get.mockRejectedValue(httpError(401));
    http.post.mockRejectedValue(httpError(401));

    const auth = renderProvider();
    await settle(auth, 'unauthenticated');

    await act(async () => {
      await expect(auth.current.login('a@b.c', 'errada')).rejects.toThrow('Usuário ou senha incorretos');
    });

    expect(auth.current.sessionStatus).toBe('unauthenticated');
  });

  it('asks /users/me exactly once on boot', async () => {
    http.get.mockResolvedValue({ data: sessionBody() });

    const auth = renderProvider();
    await settle(auth, 'authenticated');

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('/users/me');
  });
});

describe('AuthProvider inside ProtectedRoute', () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderApp() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/login" element={<div>tela de login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<div>conteúdo protegido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
  }

  it('shows the no-connection screen and never navigates to /login on a 500', async () => {
    http.get.mockRejectedValue(httpError(500));

    renderApp();

    expect(await screen.findByText('Sem conexão com o servidor')).toBeInTheDocument();
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
  });

  it('recovers to the content when Tentar novamente finds the server back', async () => {
    http.get.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({ data: sessionBody() });

    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('redirects to /login on a 401', async () => {
    http.get.mockRejectedValue(httpError(401));

    renderApp();

    expect(await screen.findByText('tela de login')).toBeInTheDocument();
    expect(screen.queryByText('Sem conexão com o servidor')).not.toBeInTheDocument();
  });
});
