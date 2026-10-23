const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
function waitForServer(url, tries = 50) {
  return new Promise((resolve, reject) => {
    const check = (left) => {
      const req = http.get(url, res => { res.resume(); resolve(); });
      req.on('error', () => { if (left <= 0) reject(new Error('Сервер не запустился')); else setTimeout(() => check(left - 1), 300); });
      req.setTimeout(500, () => req.destroy());
    };
    check(tries);
  });
}
async function createWindow() {
  const envPath = path.join(app.getPath('userData'), '.env');
  const bundledEnv = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath) && fs.existsSync(bundledEnv)) fs.copyFileSync(bundledEnv, envPath);
  if (!fs.existsSync(envPath)) {
    await dialog.showMessageBox({type:'info', title:'CS2 Visual Hub — настройка', message:'Для запуска нужен файл .env с настройками сервера и Stripe.', detail:'Для настоящей оплаты нужны Stripe API keys и webhook secret.'});
    app.quit(); return;
  }
  process.chdir(__dirname);
  require('dotenv').config({path: envPath});
  try { require('./server.js'); } catch (e) { await dialog.showErrorBox('Не удалось запустить CS2 Visual Hub', e.message); app.quit(); return; }
  try { await waitForServer('http://127.0.0.1:3000'); } catch (e) { await dialog.showErrorBox('Ошибка запуска', 'Сервер не запустился. Проверь настройки .env.'); app.quit(); return; }
  const win = new BrowserWindow({width:1280,height:850,minWidth:900,minHeight:650,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true}});
  win.loadURL('http://127.0.0.1:3000');
  win.webContents.setWindowOpenHandler(({url}) => { if (url.startsWith('https://')) shell.openExternal(url); return {action:'deny'}; });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
