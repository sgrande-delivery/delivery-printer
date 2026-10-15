import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NoConnection from '../NoConnection';
import constants from 'constants/constants';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('NoConnection', () => {
  it('explains the failure, shows the address and retries on click', () => {
    const onRetry = vi.fn();
    const { container } = render(<NoConnection onRetry={onRetry} />);

    expect(screen.getByText('Sem conexão com o servidor')).toBeInTheDocument();
    expect(screen.getByText(`Endereço: ${constants.BASE_URL}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expectNoUndefinedClasses(container);
  });
});
