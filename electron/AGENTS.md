# electron — desktop shell

`main.ts` is the Electron main process (ESM). `tsconfig.json` compiles it to `dist-electron/main.js`, which `package.json`
`main` points at and which is git-ignored.

## Behaviour

- In dev (`!app.isPackaged`) it loads the Vite dev server URL and opens DevTools. When packaged, it loads `dist/index.html`. Vite
  `base: './'` keeps asset paths relative for `file://`.
- Security: `nodeIntegration: false`, `contextIsolation: true`, and no preload script yet. If the renderer ever needs native
  APIs, add a preload with a narrow `contextBridge` API. Never enable `nodeIntegration`.

## Known issues

- **Port mismatch:** Vite runs on `51173` (`vite.config.ts`, `strictPort`), but `electron:wait` waits on `tcp:5173` and
  `main.ts` loads `http://localhost:5173`. `npm run electron:dev` therefore hangs. Use a single port everywhere, ideally read
  from an env var.
- Packaged builds load `file://`, so `/invite/:token` routing (which reads `window.location.pathname`) and the localhost API
  defaults do not work. Production builds need `VITE_AURA_*` set at build time, plus hash routing or a deep-link
  protocol for invites.
- `electron-builder` is invoked without any config, so it uses the defaults: no appId, icons, signing or auto-update.
