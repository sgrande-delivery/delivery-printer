import React from 'react';
import Typography from 'renderer/base/Typography';
import { useMessaging } from 'renderer/providers/messaging';
import { useTheme } from 'renderer/providers/theme';
import type { ThemePreference } from 'shared/uiTheme';
import styles from './AppearanceSection.module.css';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Automático (segue o Windows)' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

const AppearanceSection: React.FC = () => {
  const { preference, setPreference } = useTheme();
  const messaging = useMessaging();

  function handleChange(next: ThemePreference): void {
    setPreference(next).catch(() => messaging.handleOpen('Não foi possível salvar a aparência. Tente de novo.'));
  }

  return (
    <section className={styles.root} aria-labelledby="appearance-title">
      <Typography variant="h6" id="appearance-title">
        Aparência
      </Typography>
      <Typography variant="body2" color="textSecondary">
        Vale só neste computador.
      </Typography>
      <div role="radiogroup" aria-labelledby="appearance-title" className={styles.options}>
        {OPTIONS.map(option => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => handleChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </section>
  );
};

export default AppearanceSection;
