import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Switch from '../Switch';
import styles from '../Switch.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('Switch', () => {
  it('is a switch with a name and the state in aria-checked', () => {
    const { container, rerender } = render(<Switch label="Ativa" checked={false} onChange={() => undefined} />);

    const toggle = screen.getByRole('switch', { name: 'Ativa' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass(styles.root);
    expect(toggle).not.toHaveClass(styles.on);
    expect(toggle.firstElementChild).toHaveClass(styles.knob);
    expect(toggle.firstElementChild).not.toHaveClass(styles.knobOn);

    rerender(<Switch label="Ativa" checked onChange={() => undefined} />);

    expect(screen.getByRole('switch', { name: 'Ativa' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Ativa' })).toHaveClass(styles.on);
    expect(screen.getByRole('switch', { name: 'Ativa' }).firstElementChild).toHaveClass(styles.knobOn);
    expectNoUndefinedClasses(container);
  });

  it('asks for the opposite of the current state', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch label="Ativa" checked={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch'));
    rerender(<Switch label="Ativa" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
  });

  // A <button> is activated by Space and Enter in the browser; jsdom does not synthesize that click, so this
  // pins what the browser relies on: it is a real, focusable button and not a div with a role.
  it('is a focusable button, which is what Space and Enter act on', () => {
    render(<Switch label="Ativa" checked={false} onChange={() => undefined} />);

    const toggle = screen.getByRole('switch');
    toggle.focus();

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveFocus();
  });

  it('does not fire when disabled', () => {
    const onChange = vi.fn();
    render(<Switch label="Ativa" checked={false} onChange={onChange} disabled />);

    fireEvent.click(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
