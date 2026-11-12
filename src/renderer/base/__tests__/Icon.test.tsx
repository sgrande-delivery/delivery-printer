import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import Icon from '../Icon';
import styles from '../Icon.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import { readIconFont } from 'renderer/__tests__/iconFont';

describe('Icon', () => {
  it('renders the name as content, hidden from assistive tech', () => {
    render(<Icon name="print" />);
    const span = screen.getByText('print');

    expect(span).toHaveAttribute('aria-hidden', 'true');
    // Against styles.root, not a substring: 'icon' would also match a class like iconButton.
    expect(span.className).toContain(styles.root);
  });

  it('defaults to 20px and applies size', () => {
    const { container, rerender } = render(<Icon name="add" />);
    expect(container.querySelector('span')).toHaveStyle({ fontSize: '20px' });

    rerender(<Icon name="add" size={30} />);
    expect(container.querySelector('span')).toHaveStyle({ fontSize: '30px' });
  });

  it('keeps the external className', () => {
    const { container } = render(<Icon name="check" className="extra" />);

    expect(container.querySelector('span')).toHaveClass('extra');
    expectNoUndefinedClasses(container);
  });

  // The union and the font subset are two lists in two files (fonts/README.md): a name added
  // to one and not the other gives an icon the font does not carry, which renders as the word.
  it('has the same names as the icon_names of the font subset', () => {
    const readme = readFileSync('src/renderer/fonts/README.md', 'utf8');
    const match = /^ICONS="([^"]+)"$/m.exec(readme);

    expect(match, 'the ICONS= line of fonts/README.md').not.toBeNull();

    const fromReadme = (match as RegExpExecArray)[1].split(',');

    const source = readFileSync('src/renderer/base/Icon.tsx', 'utf8');
    const union = source.slice(source.indexOf('export type IconName'), source.indexOf('interface IconProps'));
    const fromUnion = Array.from(union.matchAll(/'([a-z_]+)'/g), group => group[1]);

    expect([...fromUnion].sort()).toEqual([...fromReadme].sort());
  });

  // IconName is a type and does not exist at runtime, so the names come from the source text,
  // as in the test above. Does not pin glyph count or file size: the recipe does not pin the
  // upstream version, and only a name without a ligature is a real defect. ICON_FONT_PATH points
  // the check at another file: it is how the test is proven to fail against an older subset.
  it('has a ligature in the font subset for every name of the union', () => {
    const source = readFileSync('src/renderer/base/Icon.tsx', 'utf8');
    const union = source.slice(source.indexOf('export type IconName'), source.indexOf('interface IconProps'));
    const names = Array.from(union.matchAll(/'([a-z_]+)'/g), group => group[1]);
    const font = readIconFont(
      process.env.ICON_FONT_PATH ?? 'src/renderer/fonts/material-symbols-outlined-subset.woff2'
    );

    expect(names.length).toBeGreaterThan(0);
    expect(font.ligatureCount).toBeGreaterThanOrEqual(names.length);
    expect(names.filter(name => !font.hasLigature(name))).toEqual([]);
  });
});
