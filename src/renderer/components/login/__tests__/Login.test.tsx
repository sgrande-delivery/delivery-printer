import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthLayout from 'renderer/components/layout/AuthLayout';
import layoutStyles from 'renderer/components/layout/AuthLayout.module.css';
import MessagingProvider from 'renderer/providers/messaging';
import Login from '../Login';
import brandStyles from '../BrandPanel.module.css';
import headerStyles from '../StepHeader.module.css';
import loginStyles from '../Login.module.css';
import chipStyles from 'renderer/base/Chip.module.css';
import passwordStyles from '../PasswordStep.module.css';
import usernameStyles from '../UsernameStep.module.css';
import iconStyles from 'renderer/base/Icon.module.css';
import iconButtonStyles from 'renderer/base/IconButton.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import fieldStyles from 'renderer/base/TextField.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

const auth = vi.hoisted(() => ({
  me: vi.fn(),
  checkEmail: vi.fn(),
  login: vi.fn(),
}));

vi.mock('renderer/providers/auth', () => ({ useAuth: () => auth }));
vi.mock('renderer/services/history', () => ({ history: { push: vi.fn() } }));

function renderLogin() {
  return render(
    <MessagingProvider>
      <AuthLayout>
        <Login />
      </AuthLayout>
    </MessagingProvider>
  );
}

async function goToPassword(email = 'maria@example.com') {
  // The mount-time me() keeps the form locked (loading) until it rejects.
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
  await screen.findByText('Passo 2 de 2');
}

describe('Login', () => {
  beforeEach(() => {
    auth.me.mockReset().mockRejectedValue(new Error('no session'));
    auth.checkEmail.mockReset().mockResolvedValue({ name: 'Maria' });
    auth.login.mockReset().mockResolvedValue(undefined);
  });

  it('shows step 1 without the back chip', async () => {
    renderLogin();

    expect(await screen.findByText('Passo 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByText('Use o e-mail da sua conta SGrande Delivery.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /@/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeInTheDocument();
  });

  it('shows step 2 with a neutral greeting and the chip with the e-mail', async () => {
    renderLogin();
    await goToPassword();

    expect(screen.getByRole('heading', { name: 'Olá, Maria' })).toBeInTheDocument();
    expect(screen.queryByText(/bem-vind/i)).not.toBeInTheDocument();
    expect(screen.getByText('Digite sua senha para começar a imprimir.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'maria@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('the chip goes back to the e-mail step with the address filled in', async () => {
    renderLogin();
    await goToPassword();

    fireEvent.click(screen.getByRole('button', { name: 'maria@example.com' }));

    expect(screen.getByText('Passo 1 de 2')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('maria@example.com');
  });

  it('the eye toggles the password field between password and text', async () => {
    renderLogin();
    await goToPassword();

    const field = screen.getByLabelText('Senha');
    expect(field).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(screen.getByText('visibility_off')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('shows a refused credential through the messaging provider', async () => {
    auth.login.mockRejectedValue(new Error('Senha incorreta'));
    renderLogin();
    await goToPassword();

    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Senha incorreta')).toBeInTheDocument();
    expect(auth.login).toHaveBeenCalledWith('maria@example.com', 'x');
  });

  it('shows an unknown e-mail through the messaging provider and stays on step 1', async () => {
    auth.checkEmail.mockRejectedValue(new Error('E-mail não encontrado'));
    renderLogin();
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'x@y.z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(await screen.findByText('E-mail não encontrado')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 2')).toBeInTheDocument();
  });

  it('loads nothing from the network (RN-01)', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(auth.me).toHaveBeenCalled());

    const images = Array.from(container.querySelectorAll('img'));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.getAttribute('src')).not.toMatch(/^https?:/);
    }
  });

  it('prints the current year in the footer and the real version in the brand panel', async () => {
    renderLogin();

    expect(await screen.findByText(`SGrande Delivery Printer © ${new Date().getFullYear()}`)).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+.* · x64 · SGrande Delivery$/)).toBeInTheDocument();
  });

  // The helper only catches concatenation: className={styles.x} is omitted by React when undefined,
  // and cx() drops falsy, so each structural key is asserted present against styles.<key>.
  it('carries the structural classes on step 1', async () => {
    const { container } = renderLogin();
    await screen.findByText('Passo 1 de 2');

    expect(container.firstElementChild).toHaveClass(layoutStyles.container);
    expect(container.querySelector('main')).toHaveClass(layoutStyles.content);
    expect(container.querySelector('aside')).toHaveClass(brandStyles.root);
    expect(container.querySelector('aside img')).toHaveClass(brandStyles.logo);
    expect(screen.getByText('SGrande Delivery Printer')).toHaveClass(brandStyles.title);
    expect(screen.getByText(/^Impressão automática/)).toHaveClass(brandStyles.text);
    expect(screen.getByText(/ · SGrande Delivery$/)).toHaveClass(brandStyles.version);
    expect(container.querySelector('aside > div')).toHaveClass(brandStyles.pitch);
    expect(container.querySelector('form')).toHaveClass(loginStyles.form);
    expect(screen.getByText(/©/)).toHaveClass(loginStyles.footer);
    expect(screen.getByText('Passo 1 de 2')).toHaveClass(headerStyles.label);
    expect(screen.getByRole('heading', { name: 'Entrar' })).toHaveClass(headerStyles.title);
    expect(screen.getByText(/^Use o e-mail/)).toHaveClass(headerStyles.subtitle);
    expect(screen.getByText('Passo 1 de 2').parentElement).toHaveClass(headerStyles.root);
    expect(screen.getByText('person')).toHaveClass(usernameStyles.person);
    expect(screen.getByText('person')).toHaveClass(iconStyles.root);
    expect(screen.getByLabelText('E-mail')).toHaveClass(fieldStyles.boxedInput);
    expect(screen.getByText('E-mail')).toHaveClass(fieldStyles.boxedLabel);
    expect(screen.getByLabelText('E-mail').parentElement).toHaveClass(fieldStyles.box);
    expect(screen.getByLabelText('E-mail').parentElement?.parentElement).toHaveClass(
      fieldStyles.boxedRoot,
      fieldStyles.fullWidth
    );
    expect(screen.getByRole('button', { name: 'Próximo' })).toHaveClass(
      buttonStyles.root,
      buttonStyles.large,
      buttonStyles.containedPrimary,
      buttonStyles.fullWidth
    );
    expectNoUndefinedClasses(container);
  });

  it('carries the structural classes on step 2', async () => {
    const { container } = renderLogin();
    await goToPassword();

    expect(screen.getByRole('button', { name: 'maria@example.com' })).toHaveClass(
      passwordStyles.back,
      chipStyles.root,
      chipStyles.medium
    );
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveClass(
      iconButtonStyles.root,
      iconButtonStyles.small
    );
    expect(screen.getByText('visibility')).toHaveClass(iconStyles.root);
    expectNoUndefinedClasses(container);
  });
});
