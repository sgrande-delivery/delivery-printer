import { MAX_RELEASE_NOTE_LINES } from './appUpdate';

// The five entities GitHub emits. &amp; goes last so "&amp;lt;" decodes to "&lt;", not to "<".
const ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&amp;', '&'],
];

function textOf(notes: unknown): string {
  if (typeof notes === 'string') {
    return notes;
  }

  if (Array.isArray(notes)) {
    const first: unknown = notes[0];

    if (typeof first === 'object' && first !== null && 'note' in first && typeof first.note === 'string') {
      return first.note;
    }
  }

  return '';
}

/**
 * The release body reaches the app as HTML from the internet (spec 79, RN-04): it leaves here as plain
 * text lines, with every tag gone, so the renderer never has to trust it. Never throws.
 *
 * A decoded entity can still leave "<" and ">" inside a line, because a body that writes "&lt;b&gt;"
 * means those characters literally. The result is text: it goes on screen as text, never as markup.
 */
export function releaseNotesToLines(notes: unknown, max: number = MAX_RELEASE_NOTE_LINES): string[] {
  const html = textOf(notes);

  if (!html) {
    return [];
  }

  // Split into lines first, strip tags per line, decode entities last: decoding first would turn
  // "&lt;script&gt;" into a tag. An unclosed "<" is dropped to the end of ITS line, which is the safe side
  // for a fragment like "<img onerror=", and keeps one malformed item from erasing the ones after it.
  return html
    .replace(/<\s*(?:\/\s*)?(?:li|p|br|ul|ol|div|h[1-6])\b[^>]*>/gi, '\n')
    .split(/\r?\n/)
    .map(line => {
      let text = line.replace(/<[^>]*>/g, '').replace(/<.*$/, '');

      for (const [entity, char] of ENTITIES) {
        text = text.split(entity).join(char);
      }

      return text.trim();
    })
    .filter(line => line.length > 0)
    .slice(0, Math.max(0, max));
}
