import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import SettingsRow from '../SettingsRow';
import styles from '../SettingsRow.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('SettingsRow', () => {
  it('shows label, hint and the control, with the row classes', () => {
    const { container } = render(
      <SettingsRow label="Margem" hint="Em pixels">
        <button type="button">controle</button>
      </SettingsRow>
    );

    expect(screen.getByText('Margem')).toBeInTheDocument();
    expect(screen.getByText('Em pixels').className).toContain(styles.hint);
    expect(screen.getByText('Margem').parentElement?.className).toContain(styles.text);
    expect(container.firstElementChild?.className).toContain(styles.row);
    expect(container.firstElementChild?.className).not.toContain(styles.last);
    expect(screen.getByRole('button', { name: 'controle' })).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('drops the divider on the last row', () => {
    const { container } = render(
      <SettingsRow label="Sem margem" hint="x" last>
        <span />
      </SettingsRow>
    );

    expect(container.firstElementChild?.className).toContain(styles.last);
  });
});
