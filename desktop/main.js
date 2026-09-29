const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');

const squirrelEvent = require('electron-squirrel-startup');
if (squirrelEvent) app.quit();
app.setAppUserModelId('com.squirrel.IMPERIUM.IMPERIUM');
let window;

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 850, minHeight: 620,
    backgroundColor: '#080c13', title: 'IMPERIUM',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.loadFile(path.join(__dirname, 'web', 'index.html'));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://' + path.join(__dirname, 'web').replace(/\\/g, '/'))) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  window.on('closed', () => { window = null; });
}

if (!squirrelEvent) app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'notifications');
  });
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Zapisz plik z IMPERIUM' });
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
