import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import OptionCardGroup, { OptionCard } from '../OptionCardGroup';
import styles from '../OptionCardGroup.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

type Letter = 'a' | 'b' | 'c';

const OPTIONS: readonly OptionCard<Letter>[] = [
  {
    value: 'a',
    name: 'Alfa',
    description: 'Primeira',
    nameStyle: { fontFamily: "'Fonte A', sans-serif", fontWeight: 500 },
  },
  { value: 'b', name: 'Beta', description: 'Segunda' },
  { value: 'c', name: 'Gama', description: 'Terceira' },
];

function setup(value: Letter = 'b', children?: React.ReactNode) {
  const onChange = vi.fn();
  const utils = render(
    <OptionCardGroup label="Letra" labelId="letters" value={value} options={OPTIONS} onChange={onChange}>
      {children}
    </OptionCardGroup>
  );

  return { onChange, ...utils };
}

describe('OptionCardGroup', () => {
  it('renders one radio per option inside a radiogroup named by the label', () => {
    setup();

    expect(screen.getByRole('radiogroup', { name: 'Letra' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Alfa/ })).toHaveTextContent('Primeira');
    expect(screen.getByRole('radio', { name: /Gama/ })).toHaveTextContent('Terceira');
  });

  // The accessible name is the option's name ALONE. Without the explicit one it would be the glued
  // contents ("AlfaPrimeira"), and the glyph's ligature text would be in there too.
  it('names each radio by the option alone, with the description as its description', () => {
    setup();

    expect(screen.getByRole('radio', { name: 'Alfa' })).toHaveAccessibleDescription('Primeira');
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAccessibleDescription('Segunda');
  });

  it('marks the option in force with the filled glyph, so selection is not colour alone', () => {
    setup('b');
    const [a, b] = screen.getAllByRole('radio');

    expect(a).toHaveTextContent('radio_button_unchecked');
    expect(b).toHaveTextContent('radio_button_checked');
  });

  it('checks and makes tabbable only the option in force', () => {
    setup('b');
    const [a, b, c] = screen.getAllByRole('radio');

    expect(a).toHaveAttribute('aria-checked', 'false');
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(c).toHaveAttribute('aria-checked', 'false');
    expect(a).toHaveAttribute('tabindex', '-1');
    expect(b).toHaveAttribute('tabindex', '0');
    expect(c).toHaveAttribute('tabindex', '-1');
  });

  it('calls onChange with the clicked value, including the one already selected', () => {
    const { onChange } = setup('b');

    fireEvent.click(screen.getByRole('radio', { name: /Gama/ }));
    expect(onChange).toHaveBeenLastCalledWith('c');

    fireEvent.click(screen.getByRole('radio', { name: /Beta/ }));
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['ArrowRight', 'b', 'c'],
    ['ArrowDown', 'b', 'c'],
    ['ArrowLeft', 'b', 'a'],
    ['ArrowUp', 'b', 'a'],
    ['ArrowRight', 'c', 'a'],
    ['ArrowDown', 'c', 'a'],
    ['ArrowLeft', 'a', 'c'],
    ['ArrowUp', 'a', 'c'],
  ] as const)('%s from %s asks for %s (circular)', (key, from, to) => {
    const { onChange } = setup(from);

    fireEvent.keyDown(screen.getByRole('radio', { checked: true }), { key });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(to);
  });

  it('moves the focus to the item that became selected', () => {
    function Stateful(): React.ReactElement {
      const [value, setValue] = useState<Letter>('c');

      return <OptionCardGroup label="Letra" labelId="letters" value={value} options={OPTIONS} onChange={setValue} />;
    }

    render(<Stateful />);
    screen.getByRole('radio', { checked: true }).focus();

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);
    expect(document.activeElement).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[2]);
  });

  it('ignores other keys without preventing default', () => {
    const { onChange } = setup('b');
    const radio = screen.getByRole('radio', { checked: true });

    const other = createEvent.keyDown(radio, { key: 'a' });
    fireEvent(radio, other);
    const arrow = createEvent.keyDown(radio, { key: 'ArrowRight' });
    fireEvent(radio, arrow);

    expect(other.defaultPrevented).toBe(false);
    expect(arrow.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies nameStyle to the name element only', () => {
    setup();

    expect(screen.getByText('Alfa')).toHaveStyle({ fontFamily: "'Fonte A', sans-serif", fontWeight: '500' });
    expect(screen.getByText('Beta')).not.toHaveAttribute('style');
  });

  it('shows children below the cards only when given', () => {
    const { container, unmount } = setup('b', <p>Apoio</p>);
    expect(screen.getByText('Apoio')).toBeInTheDocument();
    expect(container.firstElementChild?.lastElementChild).toContainElement(screen.getByText('Apoio'));
    unmount();

    setup('b');
    expect(screen.queryByText('Apoio')).not.toBeInTheDocument();
  });

  it('carries the layout classes, including the selected state', () => {
    const { container } = setup('b');
    const [a, b] = screen.getAllByRole('radio');

    expect(container.firstElementChild).toHaveClass(styles.root);
    expect(screen.getByText('Letra')).toHaveClass(styles.label);
    expect(screen.getByRole('radiogroup')).toHaveClass(styles.grid);
    expect(a).toHaveClass(styles.card);
    expect(a).not.toHaveClass(styles.selected);
    expect(b).toHaveClass(styles.card);
    expect(b).toHaveClass(styles.selected);
    expect(screen.getByText('Beta')).toHaveClass(styles.name);
    expect(screen.getByText('Beta').parentElement).toHaveClass(styles.head);
    expect(screen.getByText('Segunda')).toHaveClass(styles.description);
    expect(within(b).getByText('radio_button_checked')).toHaveClass(styles.radioOn);
    expect(within(a).getByText('radio_button_unchecked')).toHaveClass(styles.radioOff);
    expect(styles.selected).toBeTruthy();
    expectNoUndefinedClasses(container);
  });
});
