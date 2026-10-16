const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stickyAPI', {
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (notes) => ipcRenderer.invoke('notes:save', notes),
  setIgnoreMouse: (ignore) => ipcRenderer.send('window:set-ignore-mouse', ignore),
  quitApp: () => ipcRenderer.send('app:quit')
});
