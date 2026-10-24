const { app, BrowserWindow, dialog, shell, globalShortcut, screen } = require('electron');

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
    width: 520, height: 820, minWidth: 420, minHeight: 620,
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, skipTaskbar: false, autoHideMenuBar: true,
    title: 'CS2 Visual Hub — In-game companion',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const area = screen.getPrimaryDisplay().workArea;
  overlayWindow.setPosition(Math.max(area.x, area.x + area.width - 540), area.y + 24);\n  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  overlayWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(HUB_URL)) { event.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url); }
  });
  overlayWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') { event.preventDefault(); overlayWindow.hide(); }
  });
  overlayWindow.webContents.on('did-fail-load', async (_event, code, description, _validatedURL, isMainFrame) => {
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
