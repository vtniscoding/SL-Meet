const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC capabilities to the React Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  isElectron: true,
});
