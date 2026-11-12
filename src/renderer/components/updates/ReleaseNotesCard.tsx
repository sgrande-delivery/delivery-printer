import React from 'react';
import type { UpdateState } from 'shared/appUpdate';
import { releaseNotesTitle } from './updateView';
import styles from './ReleaseNotesCard.module.css';

interface ReleaseNotesCardProps {
  state: UpdateState;
}

// The lines are text from the network (RN-04): they go in as children, never as HTML.
const ReleaseNotesCard: React.FC<ReleaseNotesCardProps> = ({ state }) => {
  if (state.releaseNotes.length === 0) {
    return null;
  }

  return (
    <section className={styles.root} aria-labelledby="release-notes-title">
      <h2 className={styles.title} id="release-notes-title">
        {releaseNotesTitle(state)}
      </h2>
      <ul className={styles.list}>
        {state.releaseNotes.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </section>
  );
};

export default ReleaseNotesCard;
