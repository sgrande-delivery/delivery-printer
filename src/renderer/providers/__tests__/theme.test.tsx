import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import ThemeProvider, { useTheme } from '../theme';

type Emit = (resolved: 'light' | 'dark') => void;

const electron = window.electron as unknown as {
  uiTheme: ReturnType<typeof vi.fn>;
  setUiTheme: ReturnType<typeof vi.fn>;
  onUiThemeChanged: ReturnType<typeof vi.fn>;
};

const Probe: React.FC = () => {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <button type="button" onClick={() => void setPreference('dark')}>
      {preference}/{resolved}
    </button>
  );
};

describe('ThemeProvider', () => {
  let emit: Emit;
  const cancel = vi.fn();

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    cancel.mockClear();
    electron.uiTheme.mockResolvedValue({ preference: 'system', resolved: 'light' });
    electron.setUiTheme.mockResolvedValue('dark');
    electron.onUiThemeChanged.mockImplementation((listener: Emit) => {
      emit = listener;
      return cancel;
    });
  });

  it('writes data-theme="dark" for a dark theme', async () => {
    electron.uiTheme.mockResolvedValue({ preference: 'dark', resolved: 'dark' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  });

  it('removes the attribute for a light theme', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    electron.uiTheme.mockResolvedValue({ preference: 'light', resolved: 'light' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false));
  });

  it('follows ui:theme-changed without remounting', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    await screen.findByText('system/light');

    act(() => emit('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByText('system/dark')).toBeInTheDocument();

    act(() => emit('light'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('cancels the subscription on unmount', async () => {
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    await screen.findByText('system/light');

    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('setPreference sends the value and reflects the resolved one from the main', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    const button = await screen.findByText('system/light');

    await act(async () => button.click());

    expect(electron.setUiTheme).toHaveBeenCalledWith('dark');
    expect(screen.getByText('dark/dark')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
