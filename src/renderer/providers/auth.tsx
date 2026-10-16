import React, { ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { User } from 'renderer/types/user';
import { Restaurant } from 'renderer/types/restaurant';
import { api } from 'renderer/services/api';
import { log } from 'renderer/services/log';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unreachable';

/**
 * Only a 401 is the server stating that the session itself is not valid, and a
 * 401 that gets here already went through the refresh attempt in
 * apiErrorInterceptor. A 403 is an authenticated user without permission, and a
 * 404 or a 5xx is the server failing to answer the question at all: treating any
 * of those as "logged out" would send every PDV to a login screen where the same
 * credentials fail the same way (RN-04).
 */
function isSessionRefused(err: unknown): boolean {
  if (!(err instanceof AxiosError)) {
    return false;
  }

  return err.response?.status === 401;
}

interface AuthContextData {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  authenticated: boolean;
  checkEmail(email: string): Promise<User>;
  loading: boolean;
  sessionStatus: SessionStatus;
  retrySession(): void;
  me(): Promise<void>;
  user: User;
  restaurant: Restaurant | null;
  setRestaurantIsOpen(isOpen: boolean): void;
}

const AuthContext = React.createContext({} as AuthContextData);

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const sessionStatusRef = useRef(sessionStatus);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  // The session always sets these two together, so they live here instead of in
  // a separate store.
  const [user, setUser] = useState<User>({} as User);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  const applySession = useCallback((data: User & { restaurant: Restaurant }): void => {
    setRestaurant(data.restaurant);
    setUser(data);
    setSessionStatus('authenticated');
  }, []);

  const failSession = useCallback((err: unknown): void => {
    log.error('session check failed', err);
    setSessionStatus(isSessionRefused(err) ? 'unauthenticated' : 'unreachable');
  }, []);

  const requestSession = useCallback((): void => {
    api
      .get('/users/me')
      .then(response => applySession(response.data))
      .catch(failSession);
  }, [applySession, failSession]);

  useEffect(() => {
    requestSession();
  }, [requestSession]);

  const retrySession = useCallback((): void => {
    setSessionStatus('loading');
    requestSession();
  }, [requestSession]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    try {
      const response = await api.post('/login', { email, password });
      setRestaurant(response.data.data.restaurant);
      setUser(response.data.data.user);
      setSessionStatus('authenticated');
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        throw new Error('Usuário ou senha incorretos', { cause: err });
      }

      throw new Error('Não foi possível fazer o login', { cause: err });
    }
  }, []);

  const checkEmail = useCallback(async (email: string): Promise<User> => {
    try {
      const response = await api.get(`/user/show/${email}`);
      return response.data.data;
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        throw new Error('E-mail não encontrado', { cause: err });
      }

      throw err;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await api.post('/logout');
    setSessionStatus('unauthenticated');
    setRestaurant(null);
    setUser({} as User);
  }, []);

  // Login calls this on mount; when the session turns out valid while the provider
  // thought otherwise, adopt it so ProtectedRoute does not bounce back to /login.
  const me = useCallback(async () => {
    const response = await api.get('/users/me');

    if (sessionStatusRef.current !== 'authenticated') {
      applySession(response.data);
    }
  }, [applySession]);

  const setRestaurantIsOpen = useCallback((isOpen: boolean) => {
    setRestaurant(state => (state ? { ...state, is_open: isOpen } : null));
  }, []);

  const value = useMemo(
    () => ({
      login,
      logout,
      authenticated: sessionStatus === 'authenticated',
      checkEmail,
      loading: sessionStatus === 'loading',
      sessionStatus,
      retrySession,
      me,
      user,
      restaurant,
      setRestaurantIsOpen,
    }),
    [login, logout, sessionStatus, retrySession, checkEmail, me, user, restaurant, setRestaurantIsOpen]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
