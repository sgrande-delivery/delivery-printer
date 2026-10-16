import { Component, ErrorInfo, ReactNode } from 'react';
import Typography from 'renderer/base/Typography';
import Button from 'renderer/base/Button';
import { log } from 'renderer/services/log';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches whatever the tree below it throws SYNCHRONOUSLY: render, constructor,
 * lifecycle methods and the body of an effect. It does NOT catch work scheduled
 * for later — a rejected promise or a `.then`/`await` inside an effect, an event
 * handler, a timer, a socket callback. So an API failure in AuthProvider, which is
 * handled in `.catch`, never reaches this screen; that one belongs to the file log
 * of spec #11. It sits above every provider, so it cannot use useMessaging() or
 * anything else that lives inside them.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('render error', error, { componentStack: info.componentStack });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className={styles.container} role="alert">
        <Typography variant="h6" align="center">
          Algo deu errado
        </Typography>
        <Typography variant="body1" color="textSecondary" align="center">
          Ocorreu um erro inesperado nesta tela. Recarregue o aplicativo para continuar.
        </Typography>
        <Button variant="contained" onClick={this.handleReload}>
          Recarregar
        </Button>
      </div>
    );
  }
}

export default ErrorBoundary;
