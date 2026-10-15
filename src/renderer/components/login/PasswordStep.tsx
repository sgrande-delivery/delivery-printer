import React, { ChangeEvent } from 'react';
import { MdArrowBack, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import Typography from 'renderer/base/Typography';
import TextField from 'renderer/base/TextField';
import IconButton from 'renderer/base/IconButton';
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
}) => (
  <>
    <IconButton color="primary" className={styles.arrowBackIcon} onClick={handleStepBack}>
      <MdArrowBack />
    </IconButton>
    <Typography align="center" color="primary">
      Seja bem-vindo {login.name}.
    </Typography>
    <div className={styles.inputContainer}>
      <TextField
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
          <IconButton onClick={handlePasswordVisibility}>
            {shownPassword ? <MdVisibilityOff size={20} color="#666" /> : <MdVisibility size={20} color="#666" />}
          </IconButton>
        }
      />
    </div>
    <input type="hidden" autoComplete="email username" name="username" value={login.email} />
  </>
);

export default PasswordStep;
