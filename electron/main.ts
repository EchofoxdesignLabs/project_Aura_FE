import { app, BrowserWindow, desktopCapturer, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM shim for Electron main process path handling.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Electron rejects navigator.mediaDevices.getDisplayMedia() unless the app
 * answers display-media requests itself, so without this, screen share fails
 * in the desktop app.
 *
 * macOS shows its native picker (useSystemPicker). Elsewhere we share the
 * primary screen; an in-app window picker can replace this later.
 */
const registerScreenShareHandler = () => {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          // An empty answer denies the request, so getDisplayMedia rejects cleanly.
          callback(sources[0] ? { video: sources[0] } : {});
        })
        .catch((error: unknown) => {
          console.error('[electron] Could not list screens to share:', error);
          callback({});
        });
    },
    { useSystemPicker: true },
  );
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Project Aura",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // preload: path.join(__dirname, 'preload.js'), 
    },
    autoHideMenuBar: true,
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

app.on('ready', () => {
  registerScreenShareHandler();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
