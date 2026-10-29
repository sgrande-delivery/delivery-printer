import { currentTheme } from '../theme';
import type { UiThemeState } from 'shared/uiTheme';

export function onUiTheme(): UiThemeState {
  return currentTheme();
}
