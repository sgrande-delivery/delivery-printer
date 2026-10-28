import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppearanceSection from '../AppearanceSection';
import styles from '../AppearanceSection.module.css';
import ThemeProvider from 'renderer/providers/theme';
import MessagingProvider from 'renderer/providers/messaging';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

const electron = window.electron as unknown as {
  uiTheme: ReturnType<typeof vi.fn>;
  setUiTheme: ReturnType<typeof vi.fn>;
};

function renderSection(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <MessagingProvider>
        <AppearanceSection />
      </MessagingProvider>
    </ThemeProvider>
  );
}

describe('AppearanceSection', () => {
  // The preload stub is shared by the whole file: a test that leaves uiTheme resolving
  // to 'dark' makes the next one click a radio that is already checked, which fires no
  // change event. Each test starts from the stub's default.
  beforeEach(() => {
    electron.uiTheme.mockResolvedValue({ preference: 'system', resolved: 'light' });
    electron.setUiTheme.mockResolvedValue('light');
  });

  it('says the choice is local and has valid classes', async () => {
    const { container } = renderSection();

    expect(screen.getByText(/vale só neste computador/i)).toBeInTheDocument();
    expect(container.querySelector('section')?.className).toContain(styles.root);
    // Against styles.<key>, because a wrong key makes React omit the attribute: there is
    // no class="undefined" for expectNoUndefinedClasses to find (plan.md, learnings).
    expect(container.querySelector('[role="radiogroup"]')?.className).toContain(styles.options);
    expect(container.querySelector('label')?.className).toContain(styles.option);
    expectNoUndefinedClasses(container);
    await waitFor(() => expect(electron.uiTheme).toHaveBeenCalled());
  });

  it('marks the saved preference when the screen opens', async () => {
    electron.uiTheme.mockResolvedValue({ preference: 'dark', resolved: 'dark' });
    renderSection();

    expect(await screen.findByLabelText('Escuro')).toBeChecked();
    expect(screen.getByLabelText('Claro')).not.toBeChecked();
  });

  it('saves the chosen option', async () => {
    electron.setUiTheme.mockResolvedValue('dark');
    renderSection();

    fireEvent.click(screen.getByLabelText('Escuro'));

    await waitFor(() => expect(electron.setUiTheme).toHaveBeenCalledWith('dark'));
  });

  it('tells the operator when saving fails', async () => {
    electron.setUiTheme.mockRejectedValue(new Error('disk'));
    renderSection();

    fireEvent.click(screen.getByLabelText('Claro'));

    expect(await screen.findByText(/não foi possível salvar a aparência/i)).toBeInTheDocument();
  });
});
