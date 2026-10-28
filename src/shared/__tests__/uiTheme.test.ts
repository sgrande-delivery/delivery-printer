import { describe, expect, it } from 'vitest';
import { themeArgument, themeFromArgv } from '../uiTheme';

describe('the theme handed to the renderer through argv', () => {
  it('round-trips both themes', () => {
    expect(themeFromArgv(['electron', themeArgument('dark')])).toBe('dark');
    expect(themeFromArgv([themeArgument('light'), '--other'])).toBe('light');
  });

  it('is null when absent or not a known theme, so the renderer falls back to light', () => {
    expect(themeFromArgv(['electron', '--flag'])).toBeNull();
    expect(themeFromArgv(['--ui-theme=purple'])).toBeNull();
    expect(themeFromArgv(['--ui-theme='])).toBeNull();
  });
});
