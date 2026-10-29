import React, { ChangeEvent } from 'react';
import TextField from 'renderer/base/TextField';
import IconButton from 'renderer/base/IconButton';
import Icon from 'renderer/base/Icon';
import Chip from 'renderer/base/Chip';
import StepHeader from './StepHeader';
import styles from './PasswordStep.module.css';

interface PasswordStepProps {
  login: {
    name: string;
    email: string;
    password: string;
  };
  handleChange(e: ChangeEvent<HTMLInputElement>): void;
  loading: boolean;
  shownPassword: boolean;
  handlePasswordVisibility(): void;
  handleStepBack(): void;
}

const PasswordStep: React.FC<PasswordStepProps> = ({
  login,
  handleChange,
  handleStepBack,
  shownPassword,
  handlePasswordVisibility,
  loading,
}) => {
  const name = login.name.trim();

  return (
    <>
      <Chip size="medium" tone="muted" iconFirst className={styles.back} onClick={handleStepBack}>
        <Icon name="arrow_back" size={18} />
        {login.email}
      </Chip>
      {/* Neutral on purpose (RN-12): the app knows the name, not who the person is. */}
      <StepHeader
        label="Passo 2 de 2"
        title={name ? `Olá, ${name}` : 'Olá'}
        subtitle="Digite sua senha para começar a imprimir."
      />
      <TextField
        variant="boxed"
        label="Senha"
        placeholder="Informe sua senha"
        fullWidth
        value={login.password}
        onChange={loading ? undefined : handleChange}
        name="password"
        type={shownPassword ? 'text' : 'password'}
        required
        autoComplete="current-password"
        autoFocus
        endAdornment={
          <IconButton
            size="small"
            aria-label={shownPassword ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={handlePasswordVisibility}
          >
            <Icon name={shownPassword ? 'visibility_off' : 'visibility'} />
          </IconButton>
        }
      />
      <input type="hidden" autoComplete="email username" name="username" value={login.email} />
    </>
  );
};

export default PasswordStep;
