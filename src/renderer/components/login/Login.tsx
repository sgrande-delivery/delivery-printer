import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
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
    setPassword('');
    setShownPassword(false);
    setStep('email');
  }

  function handlePasswordVisibility() {
    setShownPassword(!shownPassword);
  }

  return (
    <>
      {loading && <InsideSaving />}
      <form onSubmit={handleSubmit} autoComplete="on" className={styles.form}>
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
        <Button disabled={loading} type="submit" variant="contained" size={46} fullWidth>
          {step === 'email' ? 'Próximo' : 'Entrar'}
        </Button>
      </form>
      <div className={styles.footer}>SGrande Delivery Printer © {new Date().getFullYear()}</div>
    </>
  );
};

export default Login;
