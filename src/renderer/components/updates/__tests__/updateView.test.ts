import { describe, expect, it } from 'vitest';
import type { UpdateState } from 'shared/appUpdate';
import { autoDownloadHint, buildSidebarUpdate, buildUpdateCard, percentOf, releaseNotesTitle } from '../updateView';

function state(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: 'idle',
    currentVersion: '2.7.0',
    targetVersion: null,
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    lastCheckedAt: null,
    error: null,
    autoDownload: true,
    restartScheduled: false,
    pendingJobs: 0,
    releaseNotes: [],
    ...overrides,
  };
}

const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const MB = 1024 * 1024;

describe('buildUpdateCard, the status table', () => {
  it('idle: green dot, up to date, Verificar agora', () => {
    const view = buildUpdateCard(state(), NOW);

    expect(view.dot).toBe('ok');
    expect(view.text).toBe('Você está na versão mais recente');
    expect(view.button).toEqual({ label: 'Verificar agora', action: 'check', variant: 'outlined', disabled: false });
    expect(view.progress).toBeNull();
    expect(view.waiting).toBeNull();
  });

  it('checking: ring, searching, disabled Verificando…', () => {
    const view = buildUpdateCard(state({ status: 'checking' }), NOW);

    expect(view.dot).toBe('spinner');
    expect(view.text).toBe('Procurando atualizações…');
    expect(view.button).toEqual({ label: 'Verificando…', action: 'check', variant: 'outlined', disabled: true });
  });

  it('available: accent dot, offered version, Baixar agora', () => {
    const view = buildUpdateCard(state({ status: 'available', targetVersion: '2.8.0' }), NOW);

    expect(view.dot).toBe('accent');
    expect(view.text).toBe('A versão 2.8.0 está disponível');
    expect(view.button).toEqual({ label: 'Baixar agora', action: 'download', variant: 'contained', disabled: false });
  });

  it('downloading: accent dot, no button, with progress', () => {
    const view = buildUpdateCard(
      state({ status: 'downloading', targetVersion: '2.8.0', percent: 42.4, transferredBytes: 10 * MB }),
      NOW
    );

    expect(view.dot).toBe('accent');
    expect(view.text).toBe('Baixando a versão 2.8.0');
    expect(view.button).toBeNull();
    expect(view.progress?.percent).toBe(42);
  });

  it('ready: green dot, Reiniciar e atualizar', () => {
    const view = buildUpdateCard(state({ status: 'ready', targetVersion: '2.8.0' }), NOW);

    expect(view.dot).toBe('ok');
    expect(view.text).toBe('A versão 2.8.0 está pronta para instalar');
    expect(view.button).toEqual({
      label: 'Reiniciar e atualizar',
      action: 'restart',
      variant: 'contained',
      disabled: false,
    });
    expect(view.waiting).toBeNull();
  });

  it('ready and scheduled: warn dot, Cancelar, and the strip with the queue', () => {
    const view = buildUpdateCard(
      state({ status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: 3 }),
      NOW
    );

    expect(view.dot).toBe('warn');
    expect(view.text).toBe('A versão 2.8.0 será instalada em seguida');
    expect(view.button).toEqual({ label: 'Cancelar', action: 'cancel-restart', variant: 'outlined', disabled: false });
    expect(view.waiting).toBe('Reinicia sozinho quando a fila esvaziar · 3 na fila');
  });

  it.each([1, 2])('the strip says "%i na fila" (the wording has no plural form)', pending => {
    const view = buildUpdateCard(
      state({ status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: pending }),
      NOW
    );

    expect(view.waiting).toBe(`Reinicia sozinho quando a fila esvaziar · ${pending} na fila`);
  });

  it('error on a download: red dot, retry downloads', () => {
    const view = buildUpdateCard(state({ status: 'error', targetVersion: '2.8.0', error: 'ECONNRESET' }), NOW);

    expect(view.dot).toBe('err');
    expect(view.text).toBe('Não foi possível baixar. Verifique a internet.');
    expect(view.button).toEqual({
      label: 'Tentar novamente',
      action: 'download',
      variant: 'outlined',
      disabled: false,
    });
  });

  it('error on a check has no version: the text says so and retry checks, since download() is a no-op', () => {
    const view = buildUpdateCard(state({ status: 'error', targetVersion: null }), NOW);

    expect(view.text).toBe('Não foi possível verificar atualizações. Verifique a internet.');
    expect(view.button?.action).toBe('check');
    expect(view.text).not.toContain('null');
  });

  it('never prints the diagnostic error as the card text', () => {
    const view = buildUpdateCard(state({ status: 'error', targetVersion: '2.8.0', error: 'ECONNRESET' }), NOW);

    expect(view.text).not.toContain('ECONNRESET');
  });

  it('restarting: ring, installing, no button', () => {
    const view = buildUpdateCard(state({ status: 'restarting', targetVersion: '2.8.0' }), NOW);

    expect(view.dot).toBe('spinner');
    expect(view.text).toBe('Instalando a versão 2.8.0…');
    expect(view.button).toBeNull();
  });
});

describe('buildUpdateCard, the progress', () => {
  const downloading = (overrides: Partial<UpdateState>): UpdateState =>
    state({ status: 'downloading', targetVersion: '2.8.0', ...overrides });

  it('omits the estimate with bytesPerSecond 0', () => {
    const view = buildUpdateCard(downloading({ totalBytes: 40 * MB, transferredBytes: 10 * MB }), NOW);

    expect(view.progress?.eta).toBeNull();
  });

  it('omits the estimate with bytesPerSecond missing', () => {
    const missing = downloading({ totalBytes: 40 * MB, transferredBytes: 10 * MB });
    delete (missing as Partial<UpdateState>).bytesPerSecond;

    expect(buildUpdateCard(missing, NOW).progress?.eta).toBeNull();
  });

  it('omits the estimate with totalBytes 0', () => {
    const view = buildUpdateCard(downloading({ totalBytes: 0, bytesPerSecond: 1000 }), NOW);

    expect(view.progress?.eta).toBeNull();
  });

  it('derives the estimate from the real rate, in seconds and in minutes', () => {
    const seconds = buildUpdateCard(
      downloading({ totalBytes: 40 * MB, transferredBytes: 30 * MB, bytesPerSecond: 2 * MB }),
      NOW
    );
    const minutes = buildUpdateCard(
      downloading({ totalBytes: 40 * MB, transferredBytes: 0, bytesPerSecond: 0.25 * MB }),
      NOW
    );

    expect(seconds.progress?.eta).toBe('cerca de 5 s');
    expect(minutes.progress?.eta).toBe('cerca de 3 min');
  });

  it('writes the megabytes with one decimal and a comma, from the real total', () => {
    const view = buildUpdateCard(
      downloading({ totalBytes: Math.round(43.7 * MB), transferredBytes: Math.round(18.35 * MB) }),
      NOW
    );

    expect(view.progress?.totalMb).toBe('43,7');
    expect(view.progress?.doneMb).toBe('18,4');
  });
});

describe('buildUpdateCard, the last check', () => {
  it('says there was none yet instead of inventing a time', () => {
    expect(buildUpdateCard(state({ lastCheckedAt: null }), NOW).lastCheck).toBe('Ainda não houve verificação');
  });

  it('writes the local time of today in the design format', () => {
    const at = new Date(2026, 10, 12, 10, 42).getTime();

    expect(buildUpdateCard(state({ lastCheckedAt: at }), NOW).lastCheck).toBe('Última verificação: hoje às 10:42');
  });

  it('does not say "hoje" about another day', () => {
    const at = new Date(2026, 10, 10, 9, 5).getTime();

    expect(buildUpdateCard(state({ lastCheckedAt: at }), NOW).lastCheck).toBe('Última verificação: 10/11 às 09:05');
  });
});

describe('the small texts', () => {
  it('titles the notes with the offered version, or "desta versão" when it is the installed one', () => {
    expect(releaseNotesTitle(state({ targetVersion: '2.8.0' }))).toBe('Novidades da versão 2.8.0');
    expect(releaseNotesTitle(state({ targetVersion: '2.7.0' }))).toBe('Novidades desta versão');
    expect(releaseNotesTitle(state({ targetVersion: null }))).toBe('Novidades desta versão');
  });

  it('has a hint for each side of the preference', () => {
    expect(autoDownloadHint(true)).toContain('sem você precisar clicar');
    expect(autoDownloadHint(false)).toContain('você clica em Baixar');
  });
});

describe('buildSidebarUpdate, the sidebar column of the table', () => {
  it.each(['idle', 'checking', 'restarting'] as const)('%s: the card is not shown', status => {
    expect(buildSidebarUpdate(state({ status, targetVersion: '2.8.0' }))).toBeNull();
  });

  it('available: new_releases, accent, v<x>, Baixar', () => {
    expect(buildSidebarUpdate(state({ status: 'available', targetVersion: '2.8.0' }))).toEqual({
      icon: 'new_releases',
      tone: 'accent',
      title: 'Nova versão disponível',
      subtitle: 'v2.8.0',
      bar: false,
      percent: 0,
      button: { label: 'Baixar', action: 'download', variant: 'outlinedOnDark' },
    });
  });

  it('downloading: downloading, v<x> · <pct>%, the bar and no button', () => {
    expect(buildSidebarUpdate(state({ status: 'downloading', targetVersion: '2.8.0', percent: 42.4 }))).toEqual({
      icon: 'downloading',
      tone: 'accent',
      title: 'Baixando atualização',
      subtitle: 'v2.8.0 · 42%',
      bar: true,
      percent: 42,
      button: null,
    });
  });

  it('downloading: the percent is the one of the main card', () => {
    const downloading = state({ status: 'downloading', targetVersion: '2.8.0', percent: 99.5 });

    expect(buildSidebarUpdate(downloading)?.percent).toBe(percentOf(downloading));
    expect(buildUpdateCard(downloading, NOW).progress?.percent).toBe(percentOf(downloading));
  });

  it('downloading without a target omits the version', () => {
    expect(buildSidebarUpdate(state({ status: 'downloading', percent: 10 }))?.subtitle).toBe('10%');
  });

  it('ready: restart_alt, accent, v<x>, contained Reiniciar e atualizar', () => {
    expect(buildSidebarUpdate(state({ status: 'ready', targetVersion: '2.8.0' }))).toEqual({
      icon: 'restart_alt',
      tone: 'accent',
      title: 'Atualização pronta',
      subtitle: 'v2.8.0',
      bar: false,
      percent: 0,
      button: { label: 'Reiniciar e atualizar', action: 'restart', variant: 'contained' },
    });
  });

  it('ready and scheduled: hourglass_top in warn, the queue, Cancelar', () => {
    expect(
      buildSidebarUpdate(state({ status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: 3 }))
    ).toEqual({
      icon: 'hourglass_top',
      tone: 'warn',
      title: 'Reinício agendado',
      subtitle: 'Aguardando 3 na fila',
      bar: false,
      percent: 0,
      button: { label: 'Cancelar', action: 'cancel-restart', variant: 'outlinedOnDark' },
    });
  });

  it('error with a version: error in err, v<x>, downloads again', () => {
    expect(buildSidebarUpdate(state({ status: 'error', targetVersion: '2.8.0', error: 'net' }))).toEqual({
      icon: 'error',
      tone: 'err',
      title: 'Falha no download',
      subtitle: 'v2.8.0',
      bar: false,
      percent: 0,
      button: { label: 'Tentar novamente', action: 'download', variant: 'outlinedOnDark' },
    });
  });

  it('error without a version: no vnull, does not claim a download, and the button checks', () => {
    const view = buildSidebarUpdate(state({ status: 'error', targetVersion: null, error: 'net' }));

    expect(view?.title).toBe('Falha na verificação');
    expect(view?.subtitle).toBe('');
    expect(view?.button?.action).toBe('check');
    expect(JSON.stringify(view)).not.toContain('null');
  });

  it('never writes the diagnostic error text', () => {
    const view = buildSidebarUpdate(state({ status: 'error', targetVersion: '2.8.0', error: 'ECONNRESET secret' }));

    expect(JSON.stringify(view)).not.toContain('ECONNRESET');
  });
});
