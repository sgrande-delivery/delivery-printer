import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('the width of the sidebar', () => {
  const VAR = '--sidebar-width';
  const readWidth = vi.mocked(window.electron.uiSidebarWidth);
  const saveWidth = vi.mocked(window.electron.setUiSidebarWidth);

  function widthVar(): string {
    return document.documentElement.style.getPropertyValue(VAR);
  }

  function handle(): HTMLElement {
    const element = screen.getByRole('separator');
    // jsdom has no pointer capture; the component calls these on pointerdown.
    element.setPointerCapture = vi.fn();
    element.hasPointerCapture = vi.fn().mockReturnValue(false);
    element.releasePointerCapture = vi.fn();

    return element;
  }

  beforeEach(() => {
    setRestaurant('Bella Massa');
    document.documentElement.style.removeProperty(VAR);
    shell.handleOpen.mockClear();
    readWidth.mockReset().mockResolvedValue(216);
    saveWidth.mockReset().mockImplementation(width => Promise.resolve(width));
  });

  it('applies the saved width to the CSS var and to the handle', async () => {
    readWidth.mockResolvedValue(300);
    await renderSidebar();

    await waitFor(() => expect(widthVar()).toBe('300px'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '300');
  });

  it('clamps a saved width out of the range', async () => {
    readWidth.mockResolvedValue(99999);
    await renderSidebar();

    await waitFor(() => expect(widthVar()).toBe('360px'));
  });

  it.each([
    ['rejected', null],
    ['garbage', 'wide'],
  ])('stays on the default when the read is %s', async (kind, value) => {
    if (kind === 'rejected') {
      readWidth.mockRejectedValue(new Error('ipc'));
    } else {
      // The cast is the case: the channel is typed Promise<number>, the preferences file is edited by hand,
      // and the type is an assertion about the answer, not proof of it.
      readWidth.mockResolvedValue(value as unknown as number);
    }
    await renderSidebar();

    await waitFor(() => expect(readWidth).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '216'));
  });

  it('saves once per drag, with an integer, and adopts what the main kept', async () => {
    saveWidth.mockResolvedValue(250);
    const container = await renderSidebar();
    const element = handle();

    fireEvent.pointerDown(element, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(element, { clientX: 110.4, pointerId: 1 });
    fireEvent.pointerMove(element, { clientX: 120.4, pointerId: 1 });
    fireEvent.pointerMove(element, { clientX: 130.4, pointerId: 1 });
    expect(saveWidth).not.toHaveBeenCalled();
    fireEvent.pointerUp(element, { pointerId: 1 });

    expect(saveWidth).toHaveBeenCalledTimes(1);
    expect(saveWidth).toHaveBeenCalledWith(246);
    await waitFor(() => expect(widthVar()).toBe('250px'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '250');
    expect(container.querySelector(`.${styles.root}`)).toBeInTheDocument();
  });

  it('keeps the width on screen and says so when saving fails', async () => {
    saveWidth.mockRejectedValue(new Error('disk'));
    await renderSidebar();

    fireEvent.keyDown(handle(), { key: 'ArrowRight' });

    await waitFor(() => expect(shell.handleOpen).toHaveBeenCalledWith('Não foi possível salvar a largura do menu.'));
    expect(widthVar()).toBe('232px');
  });

  it('puts the handle inside the sidebar, with no undefined class', async () => {
    const container = await renderSidebar();

    expect(container.querySelector('aside')).toContainElement(screen.getByRole('separator'));
    expectNoUndefinedClasses(container);
    await act(async () => undefined);
  });
});
