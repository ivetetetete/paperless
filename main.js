const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(app.getPath('userData'), 'sticky-notes-data.json');
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

let mainWindow;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    icon: ICON_PATH,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.loadFile('index.html');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
}

ipcMain.handle('notes:load', async () => {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(rawData);
    }
    return [];
  } catch (error) {
    console.error('Error al cargar las notas:', error);
    return [];
  }
});

ipcMain.handle('notes:save', async (_event, notes) => {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(notes, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar las notas:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('window:set-ignore-mouse', (_event, ignore) => {
  if (!mainWindow) return;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
});

ipcMain.on('app:quit', () => {
  app.quit();
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    app.dock.setIcon(ICON_PATH);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
