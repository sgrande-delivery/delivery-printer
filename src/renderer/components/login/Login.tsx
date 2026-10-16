import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Typography from 'renderer/base/Typography';
import Button from 'renderer/base/Button';
import { useAuth } from 'renderer/providers/auth';
import { useMessaging } from 'renderer/providers/messaging';
import { history } from 'renderer/services/history';
import InsideSaving from '../loading/InsideSaving';
import UsernameStep from './UsernameStep';
import PasswordStep from './PasswordStep';
import styles from './Login.module.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('email');
  const [loading, setLoading] = useState(false);
  const [shownPassword, setShownPassword] = useState(false);
  const auth = useAuth();
  const messaging = useMessaging();

  useEffect(() => {
    setLoading(true);

    auth
      .me()
      .then(() => history.push('/'))
      .catch(() => setLoading(false));
  }, [auth]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === 'email') {
      setLoading(true);

      auth
        .checkEmail(email)
        .then(response => {
          setName(response.name);
          setStep('password');
          messaging.handleClose();
        })
        .catch(err => {
          messaging.handleOpen(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(true);

      auth
        .login(email, password)
        .then(() => {
          setLoading(false);
          history.push('/');
        })
        .catch(err => {
          messaging.handleOpen(err.message);
          setLoading(false);
        });
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.name === 'email') setEmail(event.target.value);
    else setPassword(event.target.value);
  }

  function handleStepBack() {
    setStep('email');
  }

  function handlePasswordVisibility() {
    setShownPassword(!shownPassword);
  }

  return (
    <div className={styles.container}>
      <div className={styles.paper}>
        {loading && <InsideSaving />}
        <div>
          <img src="https://admin.sgrande.delivery/logo192.png" className={styles.logo} alt="Logo sgrande.delivery" />
        </div>
        <div className={styles.title}>
          <Typography variant="h6">Login</Typography>
        </div>
        <form onSubmit={handleSubmit} autoComplete="on">
          {step === 'email' ? (
            <UsernameStep handleChange={handleChange} email={email} loading={loading} />
          ) : (
            <PasswordStep
              handleChange={handleChange}
              login={{ email, password, name }}
              shownPassword={shownPassword}
              handleStepBack={handleStepBack}
              handlePasswordVisibility={handlePasswordVisibility}
              loading={loading}
            />
          )}
          <Button disabled={loading} type="submit" variant="contained" fullWidth>
            {step === 'email' ? 'Próximo' : 'Entrar'}
          </Button>
        </form>
        <div className={styles.footer}>
          <Typography variant="body2" color="textSecondary">
            SGrande Delivery Printer 2023
          </Typography>
        </div>
      </div>
    </div>
  );
};

export default Login;
