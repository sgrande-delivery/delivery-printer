import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TextField from '../TextField';
import styles from '../TextField.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('TextField floating (default)', () => {
  it('keeps the input before the label and the blank placeholder', () => {
    const { container } = render(<TextField label="Nome" endAdornment={<i>x</i>} />);
    const input = screen.getByLabelText('Nome');
    const label = container.querySelector('label');

    // The label reacts to :focus and :placeholder-shown through the sibling selector.
    expect(input.nextElementSibling).toBe(label);
    expect(input).toHaveAttribute('placeholder', ' ');
    expect(input).toHaveClass(styles.input);
    expect(label).toHaveClass(styles.label);
    expect(container.firstElementChild).toHaveClass(styles.root);
    expect(input.parentElement).toHaveClass(styles.inputWrapper);
    expect(container.querySelector('i')?.parentElement).toHaveClass(styles.adornment);
    expectNoUndefinedClasses(container);
  });

  it('keeps a given placeholder', () => {
    render(<TextField label="Nome" placeholder="Digite" />);

    expect(screen.getByLabelText('Nome')).toHaveAttribute('placeholder', 'Digite');
  });
});

describe('TextField boxed', () => {
  it('puts the label above the box and does not depend on :placeholder-shown', () => {
    const { container } = render(<TextField variant="boxed" label="E-mail" endAdornment={<i>x</i>} />);
    const input = screen.getByLabelText('E-mail');
    const label = container.querySelector('label');

    expect(label?.nextElementSibling).toBe(input.parentElement);
    expect(input).not.toHaveAttribute('placeholder');
    expect(input).toHaveClass(styles.boxedInput);
    expect(input.parentElement).toHaveClass(styles.box);
    expect(input.nextElementSibling?.tagName).toBe('I');
    expect(label).toHaveClass(styles.boxedLabel);
    expect(container.firstElementChild).toHaveClass(styles.boxedRoot);
    expectNoUndefinedClasses(container);
  });

  it('forwards fullWidth and className', () => {
    const { container } = render(<TextField variant="boxed" label="E-mail" fullWidth className="extra" />);

    expect(container.firstElementChild).toHaveClass(styles.fullWidth, 'extra');
  });
});
