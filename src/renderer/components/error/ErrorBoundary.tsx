import { Component, ErrorInfo, ReactNode } from 'react';
import Icon from 'renderer/base/Icon';
import Button from 'renderer/base/Button';
import { log } from 'renderer/services/log';
import symbol from 'renderer/images/brand/simbolo.png';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.png';
import styles from './ErrorBoundary.module.css';

// No useTheme() here: this component is above the providers. index.tsx writes the attribute
// on <html> before the first render, so reading it is enough to pick the symbol.
function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
  // The boundary sits above the providers, so there is no useMessaging() here: the notice is inline.
  notice: string | null;
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
  state: ErrorBoundaryState = { failed: false, notice: null };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true, notice: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('render error', error, { componentStack: info.componentStack });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleRevealLogs = (): void => {
    window.electron
      .revealLogs()
      .then(found => {
        this.setState({ notice: found ? null : 'Ainda não há registros para exportar.' });
      })
      .catch((err: unknown) => {
        log.error('reveal logs failed', err);
        this.setState({ notice: 'Não foi possível abrir a pasta dos registros.' });
      });
  };

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className={styles.root}>
        {/* Same bar as the StateLayout (printer-v2.dc.html:470-476). This screen cannot use that
            component: it sits above the providers, and StateLayout calls useTheme(). The theme is
            read from the attribute index.tsx writes before the first render. */}
        <div className={styles.bar}>
          <img className={styles.symbol} src={isDark() ? symbolNegative : symbol} alt="SGrande" />
          <span className={styles.name}>SGrande Delivery Printer</span>
        </div>
        <div className={styles.content}>
          <div className={styles.container} role="alert">
            <div className={styles.badge}>
              <Icon name="error" size={36} />
            </div>
            <div className={styles.title}>Algo deu errado nesta tela</div>
            <div className={styles.body}>
              Ocorreu um erro inesperado. Recarregue o aplicativo para voltar a imprimir. Se repetir, envie os registros
              ao suporte.
            </div>
            {this.state.notice && (
              <div className={styles.notice} role="status">
                {this.state.notice}
              </div>
            )}
            <div className={styles.actions}>
              <Button variant="outlined" size={42} onClick={this.handleRevealLogs}>
                Abrir registros
              </Button>
              <Button variant="contained" size={42} onClick={this.handleReload}>
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
