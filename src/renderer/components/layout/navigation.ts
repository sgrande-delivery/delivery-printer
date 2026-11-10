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

export function titleFor(pathname: string): string {
  return NAV_ITEMS.find(item => item.to === pathname)?.title ?? '';
}
