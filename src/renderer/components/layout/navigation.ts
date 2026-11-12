import type { IconName } from 'renderer/base/Icon';

export interface NavItem {
  label: string;
  icon: IconName;
  to: string;
  /** What the header says on this route; the design's titles map, printer-v2.dc.html:636. */
  title: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Painel', icon: 'space_dashboard', to: '/', title: 'Painel' },
  { label: 'Fila', icon: 'stacks', to: '/queue', title: 'Fila de impressão' },
  { label: 'Histórico', icon: 'history', to: '/history', title: 'Histórico de hoje' },
  { label: 'Impressoras', icon: 'print', to: '/printers', title: 'Impressoras' },
  { label: 'Configurações', icon: 'tune', to: '/printer-settings', title: 'Configurações de impressão' },
  { label: 'Teste de impressão', icon: 'receipt_long', to: '/print-test', title: 'Teste de impressão' },
];

/**
 * A shell route that has no menu item. The first is /updates: the design leaves it out of the sidebar
 * (atualizacoes.dc.html:384-387), and the ways to it are the update card and the version line. Its title
 * has to be here, or the header comes out empty (spec 79, RN-14).
 */
export const HIDDEN_ROUTES: readonly NavItem[] = [
  { label: 'Atualizações', icon: 'restart_alt', to: '/updates', title: 'Atualizações' },
];

export function titleFor(pathname: string): string {
  return [...NAV_ITEMS, ...HIDDEN_ROUTES].find(item => item.to === pathname)?.title ?? '';
}
