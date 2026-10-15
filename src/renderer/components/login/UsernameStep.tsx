import React, { ChangeEvent } from 'react';
import { MdPerson } from 'react-icons/md';
import Typography from 'renderer/base/Typography';
import TextField from 'renderer/base/TextField';
import styles from './UsernameStep.module.css';

interface UserNameStepProps {
  email: string;
  handleChange(e: ChangeEvent<HTMLInputElement>): void;
  loading: boolean;
}

const UsernameStep: React.FC<UserNameStepProps> = ({ email, handleChange, loading }) => (
  <>
    <Typography align="center" color="primary">
      Olá. Para iniciar, digite seu e-mail.
    </Typography>
    <div className={styles.inputContainer}>
      <TextField
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
        endAdornment={<MdPerson size={20} color="#666" />}
      />
    </div>
  </>
);

export default UsernameStep;
