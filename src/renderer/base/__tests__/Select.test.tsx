import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Select from '../Select';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('Select', () => {
  it('ties the label to the select and reports the chosen value', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select label="Cópias" value="1" onChange={onChange}>
        <option value="1">1</option>
        <option value="2">2</option>
      </Select>
    );

    fireEvent.change(screen.getByLabelText('Cópias'), { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox')).toHaveValue('1');
    expectNoUndefinedClasses(container);
  });

  it('puts the select before the label, which the focus selector depends on', () => {
    render(
      <Select label="Papel" value="80" onChange={() => undefined}>
        <option value="80">80 mm</option>
      </Select>
    );

    const select = screen.getByRole('combobox');

    expect(select.nextElementSibling).toBe(screen.getByText('Papel'));
  });

  it('passes disabled through to the select', () => {
    render(
      <Select label="Setor" disabled onChange={() => undefined}>
        <option value="">Sem setor</option>
      </Select>
    );

    expect(screen.getByLabelText('Setor')).toBeDisabled();
  });
});
