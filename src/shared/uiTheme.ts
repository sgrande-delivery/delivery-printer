export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export interface UiThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

const THEME_ARG = '--ui-theme=';

/** The command-line argument that hands the resolved theme to the renderer before its first paint. */
export function themeArgument(resolved: ResolvedTheme): string {
  return `${THEME_ARG}${resolved}`;
}

/** Reads {@link themeArgument} back from a process.argv; null when absent or not a known theme. */
export function themeFromArgv(argv: readonly string[]): ResolvedTheme | null {
  const value = argv.find(arg => arg.startsWith(THEME_ARG))?.slice(THEME_ARG.length);

  return value === 'light' || value === 'dark' ? value : null;
}
