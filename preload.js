const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stickyAPI', {
  platform: process.platform,
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (notes) => ipcRenderer.invoke('notes:save', notes),
  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveHistory: (history) => ipcRenderer.invoke('history:save', history),
  setIgnoreMouse: (ignore) => ipcRenderer.send('window:set-ignore-mouse', ignore),
  setWindowShape: (rects) => ipcRenderer.send('window:set-shape', rects),
  focusWindow: () => ipcRenderer.send('window:focus'),
  quitApp: () => ipcRenderer.send('app:quit')
});
