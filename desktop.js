const { app, BrowserWindow, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

let overlayWindow;
let generatedOwnerPassword = null;

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
  const userDir = app.getPath('userData');
  const envPath = path.join(userDir, '.env');
  const dataDir = path.join(userDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(envPath)) {
    generatedOwnerPassword = crypto.randomBytes(18).toString('base64url');
    const sessionSecret = crypto.randomBytes(48).toString('hex');
    const env = [
      'PORT=3000',
      'BASE_URL=http://localhost:3000',
      'SESSION_SECRET=' + sessionSecret,
      'OWNER_USERNAME=lonyrty',
      'OWNER_PASSWORD=' + generatedOwnerPassword,
      'CURRENCY=eur',
      ''
    ].join('\n');
    fs.writeFileSync(envPath, env, { mode: 0o600 });
  }

  process.env.DATA_DIR = dataDir;
  process.env.PORT = '3000';
  process.chdir(userDir);
  require('dotenv').config({ path: envPath, override: true });
  process.env.DATA_DIR = dataDir;
  process.env.PORT = '3000';

  try { require('./server.js'); }
  catch (e) { await dialog.showErrorBox('Не удалось запустить CS2 Visual Hub', e.message); app.quit(); return; }
  try { await waitForServer('http://127.0.0.1:3000'); }
  catch (e) { await dialog.showErrorBox('Ошибка запуска', 'Локальный сервер не запустился. Закрой программы, использующие порт 3000, и попробуй снова.'); app.quit(); return; }

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
  overlayWindow.once('ready-to-show', async () => {
    overlayWindow.show();
    if (generatedOwnerPassword) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'CS2 Visual Hub — данные входа',
        message: 'Локальный аккаунт владельца создан.',
        detail: 'Логин: lonyrty\nПароль: ' + generatedOwnerPassword + '\n\nСохрани пароль: он хранится в настройках приложения на этом компьютере.'
      });
      generatedOwnerPassword = null;
    }
  });
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
