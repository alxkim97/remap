# 🗺️ Remap

Scan a folder, drag its contents into a new layout, review the plan, then apply it.

## How it works

1. **Choose Folder** — recursively scans a folder (capped at 20,000 items for now; whole-drive scanning is a later step).
2. **Rearrange** — drag items onto folders to reparent them, double-click to rename, use the +📁 button to create new folders. Nothing on disk changes yet — you're editing an in-memory copy of the tree.
3. **Plan panel** — every pending move/rename/new-folder shows up on the right as a diff. Revert any single change, or reset everything.
4. **Review & Confirm** — validates the plan (checks for name collisions), then shows a final confirmation dialog before touching any files.
5. **Undo Last** — reverses the most recently applied plan, using a log written to the app's user-data folder.

## Development

```
npm install
npm run dev
```

If `npm run dev` fails to find `electron.exe` after install: some AV/EDR
tools silently kill Node mid-extraction of the downloaded electron.exe zip
(no error, just a dead process). A `postinstall` script
(`scripts/ensure-electron.js`) detects this and re-extracts using
PowerShell's `Expand-Archive` instead, which isn't affected. It runs
automatically on `npm install`.

If Electron starts as plain Node (`Cannot read properties of undefined
(reading 'whenReady')`), the shell has `ELECTRON_RUN_AS_NODE=1` set (VS Code
extension hosts do this). Unset it for the launch:
`env -u ELECTRON_RUN_AS_NODE npm run dev`.

## Build

```
npm run build      # compile only (out/)
npm run dist       # typecheck + compile + Windows installer in dist/
```

## Releasing an update (self-update)

Installed copies check GitHub Releases on `alxkim97/remap` 10 s after start
and every 6 h (and on demand from Settings → Check for Updates). A new
version downloads in the background, then Remap asks to restart; if you say
Later it installs the next time Remap quits. It never restarts while files
are being moved, and warns when un-applied plan edits would be lost.

1. Bump `version` in `package.json` (e.g. 0.2.0 → 0.2.1), commit, push.
2. `npm run release` (needs `gh` logged in) builds the installer and creates
   release `v<version>` with `Remap-Setup-<version>.exe`, its `.blockmap` and
   `latest.yml`. All three are required for the updater.

Dev runs (`npm run dev` / `npm start`) never self-update.
