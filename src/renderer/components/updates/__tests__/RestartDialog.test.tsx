import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import RestartDialog from '../RestartDialog';
import styles from '../RestartDialog.module.css';

function renderDialog(pendingJobs: number, onCancel = vi.fn(), onConfirm = vi.fn()) {
  const view = render(
    <RestartDialog version="3.1.0" pendingJobs={pendingJobs} onCancel={onCancel} onConfirm={onConfirm} />
  );

  return { ...view, onCancel, onConfirm };
}

describe('RestartDialog', () => {
  it('is a modal dialog named by its title', () => {
    renderDialog(0);

    const dialog = screen.getByRole('dialog', { name: 'Reiniciar para atualizar?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('O Delivery Printer fecha e abre de novo na versão 3.1.0.');
    expect(dialog).toHaveFocus();
  });

  it('with an empty queue: no warning, and the button installs', () => {
    renderDialog(0);

    expect(screen.queryByText(/na fila/)).toBeNull();
    expect(screen.queryByText('stacks')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reiniciar e atualizar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reiniciar após a fila' })).toBeNull();
  });

  it('with one pending print: the singular, and the button waits for the queue', () => {
    renderDialog(1);

    expect(
      screen.getByText('Há 1 impressão na fila. O app espera ela terminar e reinicia sozinho.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reiniciar após a fila' })).toBeInTheDocument();
  });

  it('with three: the plural, from the count it was given', () => {
    renderDialog(3);

    expect(
      screen.getByText('Há 3 impressões na fila. O app espera elas terminarem e reinicia sozinho.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reiniciar após a fila' })).toBeInTheDocument();
  });

  it('Cancelar closes and confirms nothing; the label button confirms and closes nothing itself', () => {
    const { onCancel, onConfirm } = renderDialog(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e atualizar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc and a click on the veil cancel', () => {
    const { onCancel, onConfirm, container } = renderDialog(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(`.${styles.veil}`) as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the panel', () => {
    renderDialog(0);

    const confirm = screen.getByRole('button', { name: 'Reiniciar e atualizar' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancelar' }), { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('gives the focus back to the button that opened it', () => {
    const Opener: React.FC = () => {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            abrir
          </button>
          {open && (
            <RestartDialog version="3.1.0" pendingJobs={0} onCancel={() => setOpen(false)} onConfirm={vi.fn()} />
          )}
        </>
      );
    };
    render(<Opener />);

    const opener = screen.getByRole('button', { name: 'abrir' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps one class per element that carries layout', () => {
    const { container } = renderDialog(2);

    const title = screen.getByRole('heading', { name: 'Reiniciar para atualizar?' });
    const warning = screen.getByText(/Há 2 impressões/);
    expect(screen.getByRole('dialog')).toHaveClass(styles.panel);
    expect(screen.getByRole('dialog').parentElement).toHaveClass(styles.root);
    expect(container.querySelector('[aria-hidden]')).toHaveClass(styles.veil);
    expect(title).toHaveClass(styles.title);
    expect(title.parentElement).toHaveClass(styles.head);
    expect(screen.getByText('restart_alt').parentElement).toHaveClass(styles.badge);
    expect(screen.getByText(/O Delivery Printer fecha/)).toHaveClass(styles.text);
    expect(warning.parentElement).toHaveClass(styles.queue);
    expect(screen.getByRole('button', { name: 'Cancelar' }).parentElement).toHaveClass(styles.actions);
    expectNoUndefinedClasses(container);
  });
});
