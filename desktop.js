const { app, BrowserWindow, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let overlayWindow;
function waitForServer(url, tries = 60) {
  return new Promise((resolve, reject) => {
    const check = left => {
      const req = http.get(url, res => { res.resume(); resolve(); });
      req.on('error', () => {
        if (left <= 0) reject(new Error('Сервер не запустился'));
        else setTimeout(() => check(left - 1), 300);
      });
      req.setTimeout(700, () => req.destroy());
    };
    check(tries);
  });
}
function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.isVisible()) overlayWindow.hide();
  else { overlayWindow.show(); overlayWindow.focus(); }
}
async function createOverlay() {
  const envPath = path.join(app.getPath('userData'), '.env');
  const bundledEnv = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath) && fs.existsSync(bundledEnv)) fs.copyFileSync(bundledEnv, envPath);
  if (!fs.existsSync(envPath)) {
    await dialog.showMessageBox({ type: 'info', title: 'CS2 Visual Hub', message: 'Нужен файл .env с настройками приложения.', detail: 'Сначала настрой сервер приложения. Не добавляй секретные ключи в репозиторий.' });
    app.quit(); return;
  }
  process.chdir(__dirname);
  require('dotenv').config({ path: envPath });
  try { require('./server.js'); }
  catch (e) { await dialog.showErrorBox('Не удалось запустить CS2 Visual Hub', e.message); app.quit(); return; }
  try { await waitForServer('http://127.0.0.1:3000'); }
  catch (e) { await dialog.showErrorBox('Ошибка запуска', 'Локальный сервер не запустился. Проверь .env и порт 3000.'); app.quit(); return; }

  overlayWindow = new BrowserWindow({
    width: 1050, height: 760, minWidth: 780, minHeight: 560,
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, skipTaskbar: false, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  overlayWindow.loadURL('http://127.0.0.1:3000');
  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  overlayWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') { event.preventDefault(); overlayWindow.hide(); }
  });
  overlayWindow.once('ready-to-show', () => overlayWindow.show());
  overlayWindow.on('closed', () => { overlayWindow = null; });
}
app.whenReady().then(async () => {
  await createOverlay();
  if (!overlayWindow) return;
  const registered = globalShortcut.register('F8', toggleOverlay);
  if (!registered) dialog.showMessageBox({ type: 'warning', title: 'CS2 Visual Hub', message: 'Не удалось зарегистрировать F8. Возможно, клавиша занята другой программой.' });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
