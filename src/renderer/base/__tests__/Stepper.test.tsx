import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Stepper from '../Stepper';
import styles from '../Stepper.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

function renderStepper(props: Partial<React.ComponentProps<typeof Stepper>> = {}): {
  onChange: ReturnType<typeof vi.fn>;
  container: HTMLElement;
} {
  const onChange = vi.fn();
  const { container } = render(<Stepper label="Cópias" value={2} min={1} max={3} onChange={onChange} {...props} />);

  return { onChange, container };
}

describe('Stepper', () => {
  it('names the group and both buttons, and shows the value', () => {
    const { container } = renderStepper();

    expect(screen.getByRole('group', { name: 'Cópias' })).toHaveClass(styles.root);
    expect(screen.getByRole('button', { name: 'Diminuir Cópias' })).toHaveClass(styles.button);
    expect(screen.getByRole('button', { name: 'Aumentar Cópias' })).toHaveClass(styles.button);
    expect(screen.getByText('2')).toHaveClass(styles.value);
    expectNoUndefinedClasses(container);
  });

  it('steps by one and by the step it is given', () => {
    const { onChange } = renderStepper({ value: 14, min: 12, max: 24, step: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Cópias' }));
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir Cópias' }));

    expect(onChange).toHaveBeenNthCalledWith(1, 16);
    expect(onChange).toHaveBeenNthCalledWith(2, 12);
  });

  it('does not go below the minimum nor above the maximum: the button is off', () => {
    const { onChange } = renderStepper({ value: 1 });

    expect(screen.getByRole('button', { name: 'Diminuir Cópias' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir Cópias' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not go above the maximum', () => {
    const { onChange } = renderStepper({ value: 3 });

    expect(screen.getByRole('button', { name: 'Aumentar Cópias' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Cópias' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never steps past the limit even when the step overshoots it', () => {
    const { onChange } = renderStepper({ value: 23, min: 12, max: 24, step: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Cópias' }));

    expect(onChange).toHaveBeenCalledWith(24);
  });

  it('walks a value that is already out of range back into it', () => {
    const { onChange } = renderStepper({ value: 5, min: 1, max: 3 });

    expect(screen.getByRole('button', { name: 'Aumentar Cópias' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir Cópias' }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('answers the arrow keys from the group, up and down', () => {
    const { onChange } = renderStepper();
    const minus = screen.getByRole('button', { name: 'Diminuir Cópias' });

    fireEvent.keyDown(minus, { key: 'ArrowUp' });
    fireEvent.keyDown(minus, { key: 'ArrowDown' });
    fireEvent.keyDown(minus, { key: 'Enter' });

    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('shows the display text instead of the number, and takes the width of the cell', () => {
    renderStepper({ display: '0px', valueWidth: 64 });

    expect(screen.getByText('0px')).toHaveStyle({ width: '64px' });
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('disabled turns both buttons off, ignores the keys and dims the control', () => {
    const { onChange } = renderStepper({ disabled: true });

    expect(screen.getByRole('button', { name: 'Diminuir Cópias' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aumentar Cópias' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('group')).toHaveClass(styles.disabled);
  });
});
