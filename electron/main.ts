import { app, BrowserWindow, desktopCapturer, session, shell } from 'electron';

const DEV_SERVER_URL = 'http://localhost:5173';

/**
 * Packaged builds load the hosted frontend instead of a bundled file:// page.
 * A file:// page sends `Origin: null`, which the backend's CORS allowlist rejects,
 * and loading the hosted URL means desktop users always get the latest frontend.
 * Set AURA_APP_URL to point a build at another deployment (e.g. staging).
 */
const HOSTED_APP_URL = process.env.AURA_APP_URL ?? 'https://aura.echofox.design';

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
    },
    autoHideMenuBar: true,
  });

  const isDev = !app.isPackaged;
  const appUrl = isDev ? DEV_SERVER_URL : HOSTED_APP_URL;

  keepNavigationInApp(mainWindow, new URL(appUrl).origin);
  void mainWindow.loadURL(appUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};

/**
 * The window shows remote content, so it may only navigate within the app's own
 * origin. Other links (and window.open) open in the system browser instead.
 */
const keepNavigationInApp = (window: BrowserWindow, appOrigin: string) => {
  const openExternally = (url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== appOrigin) {
      event.preventDefault();
      openExternally(url);
    }
  });
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
