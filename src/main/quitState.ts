// The mark that the app is really quitting. window.ts reads it on 'close' to choose between hiding the
// window and letting it close, and the Electron app.quit() aborts when a window vetoes its own close
// (spec 79, RN-05). TWO paths quit the app -- the tray's "Fechar" and the restart to update -- and that
// is why the mark cannot live inside either of them.
let quiting = false;

export function isQuiting(): boolean {
  return quiting;
}

export function markQuiting(): void {
  quiting = true;
}
