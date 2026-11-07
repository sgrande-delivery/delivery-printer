import { currentTheme } from '../uiPreferences';
import type { UiThemeState } from 'shared/uiTheme';

export function onUiTheme(): UiThemeState {
  return currentTheme();
}
