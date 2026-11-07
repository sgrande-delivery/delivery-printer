import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { shell } from './shellMocks';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import { fetchPrinters } from 'renderer/services/printers';
import Sidebar from '../Sidebar';
import styles from '../Sidebar.module.css';

vi.mock('renderer/providers/auth', () => ({ useAuth: () => shell.auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn().mockResolvedValue([]),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const LONG_NAME = 'Pizzaria e Restaurante Bella Massa Artesanal da Praça Central do Bairro';

// null and undefined are values the Restaurant type forbids and the API still returns.
function setRestaurant(name: string | null | undefined): void {
  shell.auth.restaurant = { uuid: 'r-1', is_open: true, name };
}

// The real sidebar and the real hooks: only the borders (HTTP and IPC) are doubles. The await is
// what keeps the printers store from resolving after the test body and warning about act().
async function renderSidebar(): Promise<HTMLElement> {
  const { container } = render(
    <MemoryRouter>
      <Sidebar isConnected />
    </MemoryRouter>
  );

  await waitFor(() => expect(fetchPrinters).toHaveBeenCalled());

  return container;
}

describe('the store name in the sidebar footer', () => {
  beforeEach(() => {
    setRestaurant('Bella Massa');
  });

  it('shows the name inside the footer, with the layout class', async () => {
    const container = await renderSidebar();
    const name = screen.getByText('Bella Massa');

    expect(name).toHaveClass(styles.storeName);
    expect(container.querySelector(`.${styles.footer}`)).toContainElement(name);
    expectNoUndefinedClasses(container);
  });

  it('comes before the user block in the DOM', async () => {
    await renderSidebar();
    const name = screen.getByText('Bella Massa');
    const user = screen.getByText('maria');

    expect(name.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('carries the whole name in the title when it is too long to show', async () => {
    setRestaurant(LONG_NAME);
    await renderSidebar();

    expect(screen.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME);
  });

  it.each([null, undefined, ''])('renders no line and no empty container for the name %j', async name => {
    setRestaurant(name);
    const container = await renderSidebar();

    expect(container.querySelector(`.${styles.storeName}`)).toBeNull();
    expect(container.querySelector(`.${styles.footer}`)?.firstElementChild).toHaveClass(styles.status);
  });

  it('survives a session without a restaurant', async () => {
    shell.auth.restaurant = null;
    const container = await renderSidebar();

    expect(container.querySelector(`.${styles.storeName}`)).toBeNull();
    expect(screen.getByText('Loja fechada')).toBeInTheDocument();
  });
});
