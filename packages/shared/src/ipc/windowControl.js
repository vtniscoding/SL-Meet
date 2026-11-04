import { BrowserWindow, ipcMain } from 'electron';
import { WINDOW_CHANNELS } from './channels.js';

/**
 * Register native window control IPC listeners and window state watchers
 * Works universally for both Admin and Client windows.
 * @param {BrowserWindow} targetWindow
 */
export function registerWindowControlIpc(targetWindow) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.on('maximize', () => {
      if (!targetWindow.isDestroyed()) {
        targetWindow.webContents.send(WINDOW_CHANNELS.MAXIMIZED_STATE, true);
      }
    });

    targetWindow.on('unmaximize', () => {
      if (!targetWindow.isDestroyed()) {
        targetWindow.webContents.send(WINDOW_CHANNELS.MAXIMIZED_STATE, false);
      }
    });
  }

  // Remove existing listeners to avoid multiple handlers on app/window reloads
  ipcMain.removeAllListeners(WINDOW_CHANNELS.MINIMIZE);
  ipcMain.removeAllListeners(WINDOW_CHANNELS.MAXIMIZE_TOGGLE);
  ipcMain.removeAllListeners(WINDOW_CHANNELS.CLOSE);
  ipcMain.removeHandler(WINDOW_CHANNELS.IS_MAXIMIZED);

  // Minimize window
  ipcMain.on(WINDOW_CHANNELS.MINIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || targetWindow;
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  // Toggle maximize / restore
  ipcMain.on(WINDOW_CHANNELS.MAXIMIZE_TOGGLE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || targetWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  // Close window
  ipcMain.on(WINDOW_CHANNELS.CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || targetWindow;
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  // Check if maximized (invokable)
  ipcMain.handle(WINDOW_CHANNELS.IS_MAXIMIZED, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || targetWindow;
    return win && !win.isDestroyed() ? win.isMaximized() : false;
  });
}

