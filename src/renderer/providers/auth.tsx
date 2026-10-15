import React, { ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { User } from 'renderer/types/user';
import { Restaurant } from 'renderer/types/restaurant';
import { api } from 'renderer/services/api';

interface AuthContextData {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  authenticated: boolean;
  checkEmail(email: string): Promise<User>;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  // The session always sets these two together, so they live here instead of in
  // a separate store.
  const [user, setUser] = useState<User>({} as User);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    api
      .get('/users/me')
      .then(response => {
        setRestaurant(response.data.restaurant);
        setUser(response.data);
        setAuthenticated(true);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    try {
      const response = await api.post('/login', { email, password });
      setRestaurant(response.data.data.restaurant);
      setUser(response.data.data.user);
      setAuthenticated(true);
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
    setAuthenticated(false);
    setRestaurant(null);
    setUser({} as User);
  }, []);

  const me = useCallback(async () => {
    await api.get('/users/me');
  }, []);

  const setRestaurantIsOpen = useCallback((isOpen: boolean) => {
    setRestaurant(state => (state ? { ...state, is_open: isOpen } : null));
  }, []);

  const value = useMemo(
    () => ({
      login,
      logout,
      authenticated,
      checkEmail,
      loading,
      me,
      user,
      restaurant,
      setRestaurantIsOpen,
    }),
    [login, logout, authenticated, checkEmail, loading, me, user, restaurant, setRestaurantIsOpen]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
