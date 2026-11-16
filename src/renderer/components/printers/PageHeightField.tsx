import React from 'react';
import Stepper from 'renderer/base/Stepper';
import Switch from 'renderer/base/Switch';
import { DEFAULT_PAGE_HEIGHT_MM, PAGE_HEIGHT_MAX_MM, PAGE_HEIGHT_MIN_MM } from 'shared/printerGeometry';
import styles from './PageHeightField.module.css';

// 100 mm por passo: a faixa vai de 297 a 3000, e de 1 em 1 mm o operador não chegaria na bobina de 3 m.
const STEP_MM = 100;

interface PageHeightFieldProps {
  // Salva nesta máquina para o dispositivo; null é automática.
  pageHeightMm: number | null;
  onChange(pageHeightMm: number | null): void;
}

// A altura da página que o app força quando a largura útil está ajustada (spec 101). Só aparece com ela
// ajustada: sem geometria explícita não há `pageSize`, e a altura não teria efeito nenhum (RN-01).
const PageHeightField: React.FC<PageHeightFieldProps> = ({ pageHeightMm, onChange }) => {
  const adjusted = pageHeightMm !== null;

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <div>Ajustar a altura da página</div>
          <p className={styles.hint}>
            {adjusted
              ? `O comprovante é cortado a cada ${Math.round(pageHeightMm / 10)} cm quando o driver corta por página.`
              : 'Automática: o app usa a altura do papel que o driver informa, ou 29,7 cm quando ele não informa.'}
          </p>
        </div>
        <Switch
          label="Ajustar a altura da página"
          checked={adjusted}
          onChange={on => onChange(on ? DEFAULT_PAGE_HEIGHT_MM : null)}
        />
      </div>
      {adjusted && (
        <Stepper
          label="Altura da página"
          value={pageHeightMm}
          min={PAGE_HEIGHT_MIN_MM}
          max={PAGE_HEIGHT_MAX_MM}
          step={STEP_MM}
          display={`${pageHeightMm} mm`}
          valueWidth={72}
          onChange={next => onChange(next)}
        />
      )}
    </div>
  );
};

export default PageHeightField;
