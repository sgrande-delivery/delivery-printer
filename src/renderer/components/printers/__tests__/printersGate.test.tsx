import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { printersGate } from '../printersGate';

describe('printersGate', () => {
  it('lets the screen draw once the list is ready', () => {
    expect(printersGate('ready', vi.fn())).toBeNull();
  });

  it('shows the spinner while loading', () => {
    render(printersGate('loading', vi.fn()));

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('explains the missing permission and offers no retry, because retrying cannot grant it', () => {
    render(printersGate('forbidden', vi.fn()));

    expect(screen.getByText('Sem permissão para ver as impressoras')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says the load failed and retries through the given function', () => {
    const retry = vi.fn();
    render(printersGate('error', retry));

    expect(screen.getByText('Não foi possível carregar as impressoras')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Tentar novamente' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
