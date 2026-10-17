const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

const DATA_PATH = path.join(app.getPath('userData'), 'sticky-notes-data.json');
const HISTORY_PATH = path.join(app.getPath('userData'), 'sticky-notes-history.json');
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

let mainWindow;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
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

  // En Linux, setIgnoreMouseEvents(true, { forward: true }) no soporta 'forward',
  // lo que bloquea todos los clics permanentemente. En Linux usamos setShape(rects).
  if (process.platform !== 'linux') {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
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

ipcMain.handle('history:load', async () => {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      const rawData = fs.readFileSync(HISTORY_PATH, 'utf-8');
      return JSON.parse(rawData);
    }
    return [];
  } catch (error) {
    console.error('Error al cargar el historial:', error);
    return [];
  }
});

ipcMain.handle('history:save', async (_event, history) => {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar el historial:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('window:set-ignore-mouse', (_event, ignore) => {
  if (!mainWindow || process.platform === 'linux') return;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
});

ipcMain.on('window:set-shape', (_event, rects) => {
  if (!mainWindow || process.platform !== 'linux' || !Array.isArray(rects)) return;
  try {
    const validRects = rects
      .map((r) => ({
        x: Math.max(0, Math.round(Number(r.x) || 0)),
        y: Math.max(0, Math.round(Number(r.y) || 0)),
        width: Math.max(1, Math.round(Number(r.width) || 0)),
        height: Math.max(1, Math.round(Number(r.height) || 0))
      }))
      .filter((r) => r.width > 0 && r.height > 0);
    mainWindow.setShape(validRects);
  } catch (err) {
    console.error('Error al actualizar setShape en Linux:', err);
  }
});

ipcMain.on('window:focus', () => {
  if (mainWindow && !mainWindow.isFocused()) {
    mainWindow.focus();
  }
});

ipcMain.on('app:quit', () => {
  app.quit();
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    app.dock.setIcon(ICON_PATH);
  }
  if (process.platform === 'linux') {
    setTimeout(createWindow, 300);
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
