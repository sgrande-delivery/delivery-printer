import React, { useState } from 'react';
import { useMessaging } from 'renderer/providers/messaging';
import { useTheme } from 'renderer/providers/theme';
import type { ThemePreference } from 'shared/uiTheme';
import styles from './AppearanceSection.module.css';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Automático (segue o Windows)' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

// The only local preference on a screen whose rest is the restaurant's (RN-02). It saves on the click
// and is outside the "unsaved changes" bar on purpose: it never goes to the server, and a theme you
// cannot see until you confirm is worse than the inconsistency.
const AppearanceSection: React.FC = () => {
  const { preference, setPreference } = useTheme();
  const messaging = useMessaging();
  const [saving, setSaving] = useState(false);

  function handleChange(next: ThemePreference): void {
    setSaving(true);
    setPreference(next)
      .catch(() => messaging.handleOpen('Não foi possível salvar a aparência. Tente de novo.'))
      .finally(() => setSaving(false));
  }

  return (
    <section className={styles.root} aria-labelledby="appearance-title">
      <h2 className={styles.title} id="appearance-title">
        Aparência
      </h2>
      <p className={styles.local}>Vale só neste computador, não muda o painel nem outras máquinas. Aplica na hora.</p>
      <div role="radiogroup" aria-labelledby="appearance-title" className={styles.options}>
        {OPTIONS.map(option => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              disabled={saving}
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
