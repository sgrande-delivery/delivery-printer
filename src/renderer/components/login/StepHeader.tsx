import React from 'react';
import styles from './StepHeader.module.css';

interface StepHeaderProps {
  label: string;
  title: string;
  subtitle: string;
}

const StepHeader: React.FC<StepHeaderProps> = ({ label, title, subtitle }) => (
  <div className={styles.root}>
    <span className={styles.label}>{label}</span>
    <h1 className={styles.title}>{title}</h1>
    <div className={styles.subtitle}>{subtitle}</div>
  </div>
);

export default StepHeader;
