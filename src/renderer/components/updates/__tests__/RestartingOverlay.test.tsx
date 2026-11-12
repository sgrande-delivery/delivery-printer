import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import spinnerStyles from 'renderer/base/Spinner.module.css';
import symbol from 'renderer/images/brand/simbolo.svg';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.svg';
import RestartingOverlay from '../RestartingOverlay';
import styles from '../RestartingOverlay.module.css';

const mocks = vi.hoisted(() => ({ theme: 'light' }));

vi.mock('renderer/providers/theme', () => ({ useTheme: () => ({ resolved: mocks.theme }) }));

describe('RestartingOverlay', () => {
  beforeEach(() => {
    mocks.theme = 'light';
  });

  it('says the offered version, in a status region with a name of its own', () => {
    render(<RestartingOverlay version="3.1.0" />);

    expect(screen.getByRole('status', { name: 'Instalando a atualização' })).toHaveTextContent(
      'Instalando a versão 3.1.0…'
    );
    // The download bars are named "Download da atualização"; this ring must not collide with them.
    expect(screen.queryByRole('progressbar', { name: 'Download da atualização' })).toBeNull();
  });

  it('does not write "versão null" when there is no offered version', () => {
    render(<RestartingOverlay version={null} />);

    expect(screen.getByText('Instalando a atualização…')).toBeInTheDocument();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('picks the symbol by theme, and keeps the classes of the layout', () => {
    const { container, unmount } = render(<RestartingOverlay version="3.1.0" />);
    const root = screen.getByRole('status');

    expect(root).toHaveClass(styles.root);
    expect(container.querySelector('img')).toHaveAttribute('src', symbol);
    expect(container.querySelector('img')).toHaveClass(styles.symbol);
    expect(screen.getByText('Instalando a versão 3.1.0…')).toHaveClass(styles.text);
    expect(screen.getByRole('progressbar')).toHaveClass(spinnerStyles.overlay);
    expectNoUndefinedClasses(container);
    unmount();

    mocks.theme = 'dark';
    const dark = render(<RestartingOverlay version="3.1.0" />);
    expect(dark.container.querySelector('img')).toHaveAttribute('src', symbolNegative);
  });
});
