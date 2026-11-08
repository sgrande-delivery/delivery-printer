import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import symbol from 'renderer/images/brand/simbolo-negativo.svg';
import { usePrintQueue } from 'renderer/hooks/usePrintQueue';
import { usePrinters } from 'renderer/hooks/usePrinters';
import { useLogout } from 'renderer/hooks/useLogout';
import { useAuth } from 'renderer/providers/auth';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import packageJson from '../../../../package.json';
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from 'shared/sidebarWidth';
import { NAV_ITEMS } from './navigation';
import SidebarResizeHandle, { applySidebarWidth } from './SidebarResizeHandle';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isConnected: boolean;
}

interface Badge {
  count: number;
  failed: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isConnected }) => {
  const { restaurant, user } = useAuth();
  const { handleOpen } = useMessaging();
  const { pending, failed } = usePrintQueue();
  const { printers, devicesRead } = usePrinters();
  const logout = useLogout();
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const committedRef = useRef(false);

  // The first paint is the default and this adjusts it (spec 62, decision 2). A read that fails or returns
  // garbage stays on the default; one that arrives after the operator already dragged is ignored.
  useEffect(() => {
    window.electron
      .uiSidebarWidth()
      .then(saved => {
        if (committedRef.current) {
          return;
        }

        const next = clampSidebarWidth(saved);
        applySidebarWidth(next);
        setWidth(next);
      })
      .catch((err: unknown) => {
        log.error('read sidebar width failed', err);
      });
  }, []);

  function handleCommitWidth(next: number): void {
    committedRef.current = true;
    applySidebarWidth(next);
    setWidth(next);

    // Integer: the clamp does not round, and a fractional width would be saved as is. The main answers with
    // the width it kept, which is the one the screen adopts.
    window.electron
      .setUiSidebarWidth(Math.round(next))
      .then(saved => {
        const kept = clampSidebarWidth(saved);
        applySidebarWidth(kept);
        setWidth(kept);
      })
      .catch((err: unknown) => {
        log.error('save sidebar width failed', err);
        handleOpen('Não foi possível salvar a largura do menu.');
      });
  }

  // Same rule as the printer card (PrinterItem): without a read of this machine's devices nobody is accused.
  // The list is shared with the printers screen, so a fix made there reaches this badge on its own.
  const missing = devicesRead ? printers.filter(printer => !printer.resolvedDevice).length : 0;

  const badges: Record<string, Badge | undefined> = {
    '/queue': { count: failed.length || pending.length, failed: failed.length > 0 },
    '/printers': { count: missing, failed: true },
  };

  function handleRevealLogs(): void {
    window.electron
      .revealLogs()
      .then(found => {
        if (!found) {
          handleOpen('Ainda não há registros para exportar.');
        }
      })
      .catch((err: unknown) => {
        log.error('reveal logs failed', err);
        handleOpen('Não foi possível abrir a pasta dos registros.');
      });
  }

  return (
    <aside className={styles.root}>
      <div className={styles.brand}>
        <img className={styles.symbol} src={symbol} alt="SGrande" />
        <div className={styles.brandText}>
          <span className={styles.brandName}>SGrande</span>
          <span className={styles.brandProduct}>Delivery Printer</span>
        </div>
      </div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(item => {
          const badge = badges[item.to];

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => cx(styles.item, isActive && styles.itemActive)}
            >
              <Icon name={item.icon} className={styles.itemIcon} />
              <span className={styles.itemLabel}>{item.label}</span>
              {badge && badge.count > 0 && (
                <span className={cx(styles.badge, badge.failed ? styles.badgeFailed : styles.badgePending)}>
                  {badge.count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className={styles.footer}>
        {restaurant?.name && (
          <div className={styles.storeName} title={restaurant.name}>
            {restaurant.name}
          </div>
        )}
        <div className={styles.status}>
          <div className={styles.statusLine}>
            <span className={cx(styles.dot, isConnected ? styles.dotOk : styles.dotErr)} />
            <span>{isConnected ? 'Conectado ao servidor' : 'Sem conexão'}</span>
          </div>
          <div className={styles.statusLine}>
            <span className={cx(styles.dot, restaurant?.is_open ? styles.dotOk : styles.dotErr)} />
            <span>{restaurant?.is_open ? 'Loja aberta' : 'Loja fechada'}</span>
          </div>
        </div>
        {user.name && (
          <div className={styles.user}>
            {user.image ? (
              <img className={styles.avatar} src={user.image.imageUrl} alt="imagem do usuário" />
            ) : (
              <div className={styles.avatar}>{user.name.charAt(0)}</div>
            )}
            <div className={styles.userText}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
            <button
              type="button"
              className={styles.logout}
              title="Desconectar"
              aria-label="Desconectar"
              onClick={logout}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        )}
        <div className={styles.version}>
          <span>
            v{packageJson.version} · {window.electron.arch}
          </span>
          <span>·</span>
          <button type="button" className={styles.logs} onClick={handleRevealLogs}>
            abrir logs
          </button>
        </div>
      </div>
      <SidebarResizeHandle width={width} onCommit={handleCommitWidth} />
    </aside>
  );
};

export default Sidebar;
