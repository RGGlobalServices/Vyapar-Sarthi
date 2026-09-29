const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron', 'preload.js'),
    },
    backgroundColor: '#0f172a',
    title: 'Vyapar Sarthi',
    icon: path.join(__dirname, 'public', 'icon.png'),
  });

  if (isDev) {
    win.loadURL('http://localhost:3001');
    win.webContents.openDevTools();
  } else {
    win.loadURL('https://app.vyaparsarthii.com/');
  }

  // Open external links in default browser, not Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://app.vyaparsarthii.com') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.maximize();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
