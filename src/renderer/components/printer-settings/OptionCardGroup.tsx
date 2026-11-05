import React, { CSSProperties, KeyboardEvent, ReactNode, useRef } from 'react';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import styles from './OptionCardGroup.module.css';

export interface OptionCard<T extends string> {
  value: T;
  name: string;
  description: string;
  // Only the font list uses it: the name written in its own face.
  nameStyle?: CSSProperties;
}

interface OptionCardGroupProps<T extends string> {
  // The visible label, which also names the radiogroup through labelId.
  label: string;
  labelId: string;
  // The option in force, already resolved by the caller.
  value: T;
  // Navigation order is list order.
  options: readonly OptionCard<T>[];
  // NoInfer: without it the callback is an inference site too, T collapses to string, and passing a
  // useState setter of the narrow type does not compile.
  onChange(value: NoInfer<T>): void;
  // The support line under the cards.
  children?: ReactNode;
}

const NEXT_KEYS = ['ArrowRight', 'ArrowDown'];
const PREVIOUS_KEYS = ['ArrowLeft', 'ArrowUp'];

// 0 for any other key, which is what leaves it to the browser (no preventDefault, no selection).
function stepFor(key: string): number {
  if (NEXT_KEYS.includes(key)) {
    return 1;
  }

  if (PREVIOUS_KEYS.includes(key)) {
    return -1;
  }

  return 0;
}

function OptionCardGroup<T extends string>({
  label,
  labelId,
  value,
  options,
  onChange,
  children,
}: OptionCardGroupProps<T>): React.ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);

  function moveSelection(event: KeyboardEvent<HTMLDivElement>): void {
    const step = stepFor(event.key);

    if (step === 0) {
      return;
    }

    event.preventDefault();

    const current = options.findIndex(option => option.value === value);
    const target = (current + step + options.length) % options.length;

    onChange(options[target].value);
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[target]?.focus();
  }

  return (
    <div className={styles.root}>
      <span className={styles.label} id={labelId}>
        {label}
      </span>
      <div ref={groupRef} className={styles.grid} role="radiogroup" aria-labelledby={labelId} onKeyDown={moveSelection}>
        {options.map(option => {
          const selected = option.value === value;
          const descriptionId = `${labelId}-${option.value}-description`;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              // The name is explicit because the contents would glue name and description into
              // "OriginalIgual ao que imprime hoje"; the description is announced as one.
              aria-label={option.name}
              aria-describedby={descriptionId}
              className={cx(styles.card, selected && styles.selected)}
              onClick={() => onChange(option.value)}
            >
              <span className={styles.head}>
                {/* The glyph of the app's other radio cards (PrinterDrawer.tsx): selection that is
                    not signalled by colour alone. */}
                <Icon
                  name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                  size={18}
                  className={selected ? styles.radioOn : styles.radioOff}
                />
                <span className={styles.name} style={option.nameStyle}>
                  {option.name}
                </span>
              </span>
              <span className={styles.description} id={descriptionId}>
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

export default OptionCardGroup;
