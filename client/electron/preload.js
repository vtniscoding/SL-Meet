const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC capabilities to the React Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize-toggle'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedState: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-state', handler);
    return () => ipcRenderer.removeListener('window-maximized-state', handler);
  },
  enterPiP: () => ipcRenderer.invoke('window-enter-pip'),
  exitPiP: () => ipcRenderer.invoke('window-exit-pip'),
  isPiP: () => ipcRenderer.invoke('window-is-pip'),
  onPiPState: (callback) => {
    const handler = (_event, isPip) => callback(isPip);
    ipcRenderer.on('pip-mode-changed', handler);
    return () => ipcRenderer.removeListener('pip-mode-changed', handler);
  },
});
