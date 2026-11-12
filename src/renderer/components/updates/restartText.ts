// atualizacoes.dc.html:395-397, 441. pendingJobs comes from the UpdateState: the main process decides to wait.
export function queueText(pendingJobs: number): string {
  return pendingJobs === 1
    ? 'Há 1 impressão na fila. O app espera ela terminar e reinicia sozinho.'
    : `Há ${pendingJobs} impressões na fila. O app espera elas terminarem e reinicia sozinho.`;
}

export function confirmLabel(pendingJobs: number): string {
  return pendingJobs > 0 ? 'Reiniciar após a fila' : 'Reiniciar e atualizar';
}
