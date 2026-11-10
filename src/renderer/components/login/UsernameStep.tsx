import React, { ChangeEvent } from 'react';
import TextField from 'renderer/base/TextField';
import Icon from 'renderer/base/Icon';
import StepHeader from './StepHeader';
import styles from './UsernameStep.module.css';

interface UserNameStepProps {
  email: string;
  handleChange(e: ChangeEvent<HTMLInputElement>): void;
  loading: boolean;
}

const UsernameStep: React.FC<UserNameStepProps> = ({ email, handleChange, loading }) => (
  <>
    <StepHeader label="Passo 1 de 2" title="Entrar" subtitle="Use o e-mail da sua conta SGrande Delivery." />
    <TextField
      variant="boxed"
      label="E-mail"
      placeholder="Digite o seu e-mail"
      fullWidth
      value={email}
      onChange={loading ? undefined : handleChange}
      name="email"
      type="email"
      required
      autoFocus
      autoComplete="email"
      endAdornment={<Icon name="person" className={styles.person} />}
    />
  </>
);

export default UsernameStep;
