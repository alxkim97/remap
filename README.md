# FolderMapper

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

## Build

```
npm run build
```
