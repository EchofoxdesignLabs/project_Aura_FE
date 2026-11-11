# electron — desktop shell

`main.ts` is the Electron main process (ESM). `tsconfig.json` compiles it to `dist-electron/main.js`, which `package.json`
`main` points at and which is git-ignored.

## Behaviour

- In dev (`!app.isPackaged`) it loads the Vite dev server (`http://localhost:5173`) and opens DevTools. When packaged, it
  loads the **hosted frontend**, `AURA_APP_URL` or `https://aura.echofox.design` by default. It never loads `file://`: such
  a page sends `Origin: null`, which the backend CORS allowlist rejects. Desktop users therefore always run the latest
  deployed frontend, and the shell only needs rebuilding when `electron/` changes.
- Because the window shows remote content, `keepNavigationInApp()` keeps navigation on the app's origin. Other links and
  `window.open` open in the system browser.
- Security: `nodeIntegration: false`, `contextIsolation: true`, and no preload script yet. If the renderer ever needs native
  APIs, add a preload with a narrow `contextBridge` API. Never enable `nodeIntegration`.
- Screen share: Electron rejects `getDisplayMedia()` unless the main process answers it, so `registerScreenShareHandler()`
  sets `session.defaultSession.setDisplayMediaRequestHandler`. macOS shows the native picker; Windows and Linux share the
  primary screen. An in-app picker (windows and screens from `desktopCapturer`) is a later improvement.

## Known issues

- With no network, the packaged app shows a blank window. A small offline page (`did-fail-load`) is a later improvement.
- Invite links open in the browser, not the desktop app. A deep-link protocol (`aura://invite/...`) would change that.
- `electron-builder` is invoked without any config, so it uses the defaults: no appId, icons, signing or auto-update.
