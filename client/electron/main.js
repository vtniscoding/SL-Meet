import { app, BrowserWindow, ipcMain, session, desktopCapturer, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let handMotionWindow = null;
let isPipMode = false;
let prePipBounds = null;
let prePipWasMaximized = false;

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

  // Allow same-origin detached OS companion window for 2-Hand Motion Tracking
  mainWindow.webContents.setWindowOpenHandler(({ frameName }) => {
    if (frameName === 'sl-meet-hand-motion') {
      const refBounds =
        mainWindow && !mainWindow.isDestroyed()
          ? mainWindow.getBounds()
          : { x: 0, y: 0, width: 1280, height: 800 };
      const display = screen.getDisplayMatching(refBounds);
      const { workArea } = display;
      const motionWidth = 440;
      const motionHeight = 340;
      const margin = 24;

      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          x: Math.round(workArea.x + workArea.width - motionWidth - margin),
          y: Math.round(workArea.y + margin + 36),
          width: motionWidth,
          height: motionHeight,
          minWidth: 320,
          minHeight: 250,
          icon: iconPath,
          autoHideMenuBar: true,
          frame: false,
          titleBarStyle: 'hidden',
          alwaysOnTop: true,
          backgroundColor: '#202124',
          title: 'AI Hand Motion',
        },
      };
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-create-window', (childWin, details) => {
    if (details.frameName === 'sl-meet-hand-motion') {
      handMotionWindow = childWin;
      childWin.setAlwaysOnTop(true, 'floating');
      childWin.on('closed', () => {
        if (handMotionWindow === childWin) {
          handMotionWindow = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('hand-motion-window-closed');
        }
      });
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    if (handMotionWindow && !handMotionWindow.isDestroyed()) {
      handMotionWindow.close();
      handMotionWindow = null;
    }
    mainWindow = null;
    isPipMode = false;
    prePipBounds = null;
    prePipWasMaximized = false;
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

// Picture-in-Picture (PiP) Window IPC Handlers
ipcMain.handle('window-enter-pip', () => {
  if (!mainWindow || mainWindow.isDestroyed() || isPipMode) return false;

  prePipWasMaximized = mainWindow.isMaximized();
  prePipBounds = mainWindow.getBounds();

  if (prePipWasMaximized) {
    mainWindow.unmaximize();
  }

  // Allow window to shrink below regular desktop constraints
  mainWindow.setMinimumSize(320, 260);

  const display = screen.getDisplayMatching(prePipBounds);
  const { workArea } = display;
  const pipWidth = 360;
  const pipHeight = 320;
  const margin = 20;

  mainWindow.setBounds({
    x: Math.round(workArea.x + workArea.width - pipWidth - margin),
    y: Math.round(workArea.y + workArea.height - pipHeight - margin),
    width: pipWidth,
    height: pipHeight,
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  isPipMode = true;
  mainWindow.webContents.send('pip-mode-changed', true);
  return true;
});

ipcMain.handle('window-exit-pip', () => {
  if (!mainWindow || mainWindow.isDestroyed() || !isPipMode) return false;

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setMinimumSize(1024, 680);

  if (prePipBounds) {
    mainWindow.setBounds(prePipBounds);
  } else {
    mainWindow.setSize(1280, 800);
    mainWindow.center();
  }

  if (prePipWasMaximized) {
    mainWindow.maximize();
  }

  isPipMode = false;
  mainWindow.webContents.send('pip-mode-changed', false);
  return true;
});

ipcMain.handle('window-is-pip', () => isPipMode);

// Detached 2-Hand Motion Tracking Window IPC Handlers
ipcMain.on('hand-motion-minimize', () => {
  if (handMotionWindow && !handMotionWindow.isDestroyed()) {
    handMotionWindow.minimize();
  }
});

ipcMain.handle('hand-motion-toggle-pin', () => {
  if (!handMotionWindow || handMotionWindow.isDestroyed()) return false;
  const nextPinned = !handMotionWindow.isAlwaysOnTop();
  if (nextPinned) {
    handMotionWindow.setAlwaysOnTop(true, 'floating');
  } else {
    handMotionWindow.setAlwaysOnTop(false);
  }
  return nextPinned;
});

ipcMain.on('hand-motion-close', () => {
  if (handMotionWindow && !handMotionWindow.isDestroyed()) {
    handMotionWindow.close();
    handMotionWindow = null;
  }
});
