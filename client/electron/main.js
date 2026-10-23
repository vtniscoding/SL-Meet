import { app, BrowserWindow, ipcMain, session, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

function createWindow() {
  const primaryIcon = app.isPackaged
    ? path.join(__dirname, '../dist/assets/icon.ico')
    : path.join(__dirname, '../public/assets/icon.ico');
  const fallbackIcon = app.isPackaged
    ? path.join(__dirname, '../dist/assets/app-icon.png')
    : path.join(__dirname, '../public/assets/app-icon.png');
  const iconPath = fs.existsSync(primaryIcon) ? primaryIcon : fallbackIcon;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    icon: iconPath,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#F2F4F7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Track and notify renderer of window maximize / unmaximize state
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-state', false);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Automatic media permission grants for WebRTC camera and microphone
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
    return allowed.includes(permission);
  });

  // Handle WebRTC getDisplayMedia screen capture requests in Electron
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        // Prefer physical monitor screens (screen:x:x) over application windows
        const screenSource = sources.find((s) => s.id.startsWith('screen:'));
        const targetSource = screenSource || sources.find((s) => !s.name.includes('SLMeet') && !s.name.includes('SL-Meet')) || sources[0];
        if (targetSource) {
          callback({ video: targetSource });
        } else {
          callback({});
        }
      })
      .catch((err) => {
        console.error('Error fetching desktop capturer sources:', err);
        callback({});
      });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler for System / Desktop integrations
ipcMain.handle('app-version', () => app.getVersion());

// Frameless Window Control IPC Listeners
ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize-toggle', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});

