const { app, BrowserWindow, dialog, shell, globalShortcut } = require('electron');

let overlayWindow;
const HUB_URL = (process.env.CS2_VISUAL_HUB_URL || 'https://cs2-visual-hub-1.onrender.com').replace(/\/$/, '');

function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.isVisible()) { overlayWindow.hide(); return; }
  overlayWindow.show();
  overlayWindow.focus();
}
async function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 1180, height: 860, minWidth: 760, minHeight: 600,
    show: false, frame: true, backgroundColor: '#090c0d',
    autoHideMenuBar: true, title: 'CS2 Visual Hub — Desktop Visual Lab',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  overlayWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(HUB_URL)) { event.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url); }
  });
  overlayWindow.webContents.on('did-fail-load', async (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      await dialog.showMessageBox(overlayWindow, {
        type: 'warning', title: 'CS2 Visual Hub — нет соединения',
        message: 'Не удалось открыть облачный Visual Lab.',
        detail: 'Проверь интернет и адрес сервера: ' + HUB_URL + '\n' + description
      });
    }
  });
  await overlayWindow.loadURL(HUB_URL + '/desktop.html');
  overlayWindow.once('ready-to-show', () => overlayWindow && overlayWindow.show());
  overlayWindow.on('closed', () => { overlayWindow = null; });
}
app.whenReady().then(async () => {
  await createOverlay();
  const registered = globalShortcut.register('F8', toggleOverlay);
  if (!registered) dialog.showMessageBox({ type: 'warning', title: 'CS2 Visual Hub', message: 'Не удалось зарегистрировать F8. Возможно, клавиша занята другой программой.' });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
