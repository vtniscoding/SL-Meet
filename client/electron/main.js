import { app, BrowserWindow, ipcMain, session, desktopCapturer, screen, Menu } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const { autoUpdater } = electronUpdater;

// Configure native NSIS auto-updater: notify first, download only when user clicks Update
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Strictly block DevTools and debug shortcuts in packaged production builds
if (app.isPackaged) {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('devtools-opened', () => {
      contents.closeDevTools();
    });

    contents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase();
      const ctrlOrCmd = input.control || input.meta;
      const isF12 = key === 'f12';
      const isDevToolsShortcut =
        ctrlOrCmd && input.shift && ['i', 'j', 'c'].includes(key);
      const isReloadShortcut =
        (ctrlOrCmd && key === 'r') || key === 'f5';

      if (isF12 || isDevToolsShortcut || isReloadShortcut) {
        event.preventDefault();
      }
    });
  });
}

let mainWindow = null;
let studioWindow = null;
let handMotionWindow = null;
let isPipMode = false;
let prePipBounds = null;
let prePipWasMaximized = false;
let updateCheckInterval = null;

function broadcastUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update-status', payload);
  }
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.webContents.send('app-update-status', payload);
  }
}

autoUpdater.on('checking-for-update', () => {
  broadcastUpdateStatus({ status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  broadcastUpdateStatus({
    status: 'available',
    version: info?.version || null,
    releaseDate: info?.releaseDate || null,
    releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : null,
  });
});

autoUpdater.on('update-not-available', (info) => {
  broadcastUpdateStatus({
    status: 'not-available',
    version: info?.version || app.getVersion(),
  });
});

autoUpdater.on('download-progress', (progress) => {
  broadcastUpdateStatus({
    status: 'downloading',
    percent: Math.round(progress?.percent || 0),
    bytesPerSecond: progress?.bytesPerSecond || 0,
    transferred: progress?.transferred || 0,
    total: progress?.total || 0,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  broadcastUpdateStatus({
    status: 'downloaded',
    version: info?.version || null,
  });
});

autoUpdater.on('error', (err) => {
  console.warn('[AutoUpdater] Error:', err?.message || err);
  broadcastUpdateStatus({
    status: 'error',
    message: err?.message || 'Unable to check for updates.',
  });
});

function createStudioWindow(initialHash = '#admin') {
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.focus();
    return studioWindow;
  }

  const primaryIcon = app.isPackaged
    ? path.join(__dirname, '../dist/assets/icons/app-icon.ico')
    : path.join(__dirname, '../public/assets/icons/app-icon.ico');
  const fallbackIcon = app.isPackaged
    ? path.join(__dirname, '../dist/assets/icons/app-icon.png')
    : path.join(__dirname, '../public/assets/icons/app-icon.png');
  const iconPath = fs.existsSync(primaryIcon) ? primaryIcon : fallbackIcon;

  studioWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#131314',
    title: 'SLMeet - Training and Monitoring',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });

  // Track and notify renderer of studio window maximize / unmaximize state
  studioWindow.on('maximize', () => {
    studioWindow?.webContents.send('window-maximized-state', true);
  });
  studioWindow.on('unmaximize', () => {
    studioWindow?.webContents.send('window-maximized-state', false);
  });

  const hash = initialHash.startsWith('#') ? initialHash : `#${initialHash}`;
  if (isDev) {
    const adminUrl = process.env.VITE_ADMIN_URL || 'http://localhost:5173';
    studioWindow.loadURL(`${adminUrl}/${hash}`);
  } else {
    const adminDist = path.join(__dirname, '../../admin/dist/index.html');
    if (fs.existsSync(adminDist)) {
      studioWindow.loadFile(adminDist, { hash: hash.replace('#', '') });
    } else if (process.env.VITE_ADMIN_URL && !process.env.VITE_ADMIN_URL.includes('localhost:5174')) {
      studioWindow.loadURL(`${process.env.VITE_ADMIN_URL}/${hash}`);
    } else {
      studioWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: hash.replace('#', '') });
    }
  }

  studioWindow.on('closed', () => {
    studioWindow = null;
  });

  return studioWindow;
}

function createWindow() {
  const primaryIcon = app.isPackaged
    ? path.join(__dirname, '../dist/assets/icons/app-icon.ico')
    : path.join(__dirname, '../public/assets/icons/app-icon.ico');
  const fallbackIcon = app.isPackaged
    ? path.join(__dirname, '../dist/assets/icons/app-icon.png')
    : path.join(__dirname, '../public/assets/icons/app-icon.png');
  const iconPath = fs.existsSync(primaryIcon) ? primaryIcon : fallbackIcon;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 500,
    icon: iconPath,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#F2F4F7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });

  // Track and notify renderer of window maximize / unmaximize state
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-state', true);
    }
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-state', false);
    }
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
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            devTools: !app.isPackaged,
          },
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
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

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

  // Automatically check GitHub Releases for updates in packaged production builds
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdater] Startup check warning:', err?.message || err);
      });
    }, 5000);

    updateCheckInterval = setInterval(
      () => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AutoUpdater] Periodic check warning:', err?.message || err);
        });
      },
      4 * 60 * 60 * 1000
    );
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler for System / Desktop integrations
ipcMain.handle('app-version', () => app.getVersion());

ipcMain.handle('app-check-for-updates', async () => {
  if (!app.isPackaged) {
    const devPayload = { status: 'dev-mode', version: app.getVersion() };
    broadcastUpdateStatus(devPayload);
    return devPayload;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: 'checked',
      version: result?.updateInfo?.version || app.getVersion(),
    };
  } catch (err) {
    return {
      status: 'error',
      message: err?.message || 'Unable to check for updates.',
    };
  }
});

ipcMain.handle('app-download-update', async () => {
  if (!app.isPackaged) {
    return { status: 'dev-mode' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { status: 'downloading' };
  } catch (err) {
    const message = err?.message || 'Failed to download update.';
    broadcastUpdateStatus({ status: 'error', message });
    return { status: 'error', message };
  }
});

ipcMain.handle('app-install-update', () => {
  if (!app.isPackaged) return false;

  if (handMotionWindow && !handMotionWindow.isDestroyed()) {
    handMotionWindow.destroy();
    handMotionWindow = null;
  }
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.destroy();
    studioWindow = null;
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });
  return true;
});

// Open dedicated Model Training Studio window (admin app)
ipcMain.handle('open-training-monitor', (_event, hash = '#admin') => {
  createStudioWindow(hash);
  return true;
});

// Native Window Controls IPC Handlers
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.on('window-maximize-toggle', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

ipcMain.handle('window-is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return win && !win.isDestroyed() ? win.isMaximized() : false;
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
  mainWindow.setBackgroundColor('#121212');
  isPipMode = true;
  mainWindow.webContents.send('pip-mode-changed', true);
  return true;
});

ipcMain.handle('window-exit-pip', () => {
  if (!mainWindow || mainWindow.isDestroyed() || !isPipMode) return false;

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setMinimumSize(480, 500);

  if (prePipBounds) {
    mainWindow.setBounds(prePipBounds);
  } else {
    mainWindow.setSize(1280, 800);
    mainWindow.center();
  }

  if (prePipWasMaximized) {
    mainWindow.maximize();
  }

  mainWindow.setBackgroundColor('#F2F4F7');
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
