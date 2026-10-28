import React, { useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { ResolvedTheme, ThemePreference } from 'shared/uiTheme';
import { log } from 'renderer/services/log';

interface ThemeContextData {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(preference: ThemePreference): Promise<void>;
}

const ThemeContext = React.createContext({} as ThemeContextData);

// Only 'dark' is written: in light the attribute is removed so :root applies by itself.
function applyTheme(resolved: ResolvedTheme): void {
  if (resolved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    return;
  }

  document.documentElement.removeAttribute('data-theme');
}

const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    let active = true;

    window.electron
      .uiTheme()
      .then(state => {
        if (!active) {
          return;
        }

        setPreferenceState(state.preference);
        setResolved(state.resolved);
        applyTheme(state.resolved);
      })
      .catch((err: unknown) => log.error('theme: could not read the theme', err));

    const cancel = window.electron.onUiThemeChanged(next => {
      setResolved(next);
      applyTheme(next);
    });

    return () => {
      active = false;
      cancel();
    };
  }, []);

  const setPreference = useCallback(async (next: ThemePreference): Promise<void> => {
    const nextResolved = await window.electron.setUiTheme(next);

    setPreferenceState(next);
    setResolved(nextResolved);
    applyTheme(nextResolved);
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextData {
  return useContext(ThemeContext);
}

export default ThemeProvider;
