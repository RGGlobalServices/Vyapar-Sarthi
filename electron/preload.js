'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe Electron APIs to the renderer (web app)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});
