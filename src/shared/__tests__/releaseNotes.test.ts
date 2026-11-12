import { describe, expect, it } from 'vitest';
import { releaseNotesToLines } from '../releaseNotes';

describe('releaseNotesToLines', () => {
  it('turns a GitHub release body into lines, in order', () => {
    const body =
      '<h2>Novidades</h2>\n<ul>\n<li>Tela de atualizações</li>\n<li>Verificação a cada 6 h</li>\n</ul>\n<p>Obrigado!<br>Equipe</p>';

    expect(releaseNotesToLines(body)).toEqual([
      'Novidades',
      'Tela de atualizações',
      'Verificação a cada 6 h',
      'Obrigado!',
      'Equipe',
    ]);
  });

  it.each([[''], [null], [undefined], [[]], [42], [{}]])('returns [] for %j', input => {
    expect(releaseNotesToLines(input)).toEqual([]);
  });

  it('RN-04: script, handlers and unclosed tags come out as text without any tag', () => {
    const lines = releaseNotesToLines('<p><script>alert(1)</script></p><img src=x onerror=alert(2)><li>ok <b>bold');

    expect(lines.join('\n')).not.toMatch(/[<>]/);
    expect(lines).toContain('alert(1)');
    expect(lines).toContain('ok bold');
  });

  it('an escaped tag stays literal text, never markup', () => {
    expect(releaseNotesToLines('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toEqual(['<script>alert(1)</script>']);
    expect(releaseNotesToLines('<p>&amp;lt;</p>')).toEqual(['&lt;']);
  });

  it('a malformed item does not erase the ones after it', () => {
    expect(releaseNotesToLines('<ul><li>primeiro</li><li>quebrado <img src=x</li><li>terceiro</li></ul>')).toEqual([
      'primeiro',
      'quebrado',
      'terceiro',
    ]);
  });

  it('decodes the five entities', () => {
    expect(releaseNotesToLines('<li>a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;</li>')).toEqual([
      `a & b < c > d "e" 'f'`,
    ]);
  });

  it('cuts at max, and by default at 12', () => {
    const body = Array.from({ length: 20 }, (_, i) => `<li>${i}</li>`).join('');

    expect(releaseNotesToLines(body, 3)).toEqual(['0', '1', '2']);
    expect(releaseNotesToLines(body)).toHaveLength(12);
  });

  it('accepts ReleaseNoteInfo[] using the first entry, and never throws on a malformed one', () => {
    expect(
      releaseNotesToLines([
        { version: '3.1.0', note: '<li>x</li>' },
        { version: '3.0.0', note: 'y' },
      ])
    ).toEqual(['x']);
    expect(releaseNotesToLines([{ version: '3.1.0', note: null }])).toEqual([]);
    expect(releaseNotesToLines([null])).toEqual([]);
  });
});
