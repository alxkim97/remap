import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

// Self-update via electron-updater + GitHub Releases (alxkim97/remap, the
// "publish" block in package.json). Background checks are silent unless an
// update is found; a manual check from Settings always reports back. The
// update downloads in the background, then asks before restarting, and
// otherwise installs the next time Remap quits.

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' }
let getWindow: () => BrowserWindow | null = () => null
let isBusy: () => boolean = () => false
let hasPendingPlan = false
let checking = false

/** electron-updater errors carry whole HTTP header dumps; keep one readable line. */
function friendlyError(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : err)
  if (/\b404\b/.test(msg)) return 'No published release found on GitHub yet.'
  if (/ENOTFOUND|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ETIMEDOUT|ECONNREFUSED|ERR_NETWORK/i.test(msg)) {
    return 'Could not reach GitHub (offline?).'
  }
  const first = msg.split('\n')[0].trim()
  return first.length > 160 ? `${first.slice(0, 157)}…` : first
}

function setStatus(next: UpdateStatus): void {
  status = next
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('updater:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Renderer reports whether it holds un-applied plan edits (lost on restart). */
export function setPendingPlan(pending: boolean): void {
  hasPendingPlan = pending
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status // dev / unpackaged runs never self-update
  if (status.state === 'downloaded' || status.state === 'downloading' || checking) return status
  checking = true
  setStatus({ state: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setStatus({ state: 'error', error: friendlyError(err) })
  } finally {
    checking = false
  }
  return status
}

export async function promptRestart(): Promise<void> {
  if (status.state !== 'downloaded') return
  const win = getWindow()
  if (isBusy()) {
    const opts = {
      type: 'info' as const,
      title: 'Remap',
      message: 'Remap is moving files right now.',
      detail: 'The update will install once that finishes and you restart or quit.'
    }
    if (win) await dialog.showMessageBox(win, opts)
    else await dialog.showMessageBox(opts)
    return
  }
  const opts = {
    type: 'info' as const,
    title: 'Remap update ready',
    message: `Remap ${status.version} has been downloaded.`,
    detail: hasPendingPlan
      ? 'You have plan changes that have not been applied yet. Restarting now discards them. Choose Later to finish first; the update installs when Remap quits.'
      : 'Restart now to install it, or it installs automatically the next time Remap quits.',
    buttons: ['Restart Now', 'Later'],
    defaultId: hasPendingPlan ? 1 : 0,
    cancelId: 1
  }
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (response === 0 && !isBusy()) autoUpdater.quitAndInstall()
}

export function initUpdater(windowGetter: () => BrowserWindow | null, busyGetter: () => boolean): void {
  getWindow = windowGetter
  isBusy = busyGetter
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) =>
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version })
    void promptRestart()
  })
  autoUpdater.on('error', (err) => setStatus({ state: 'error', error: friendlyError(err) }))

  setTimeout(() => void checkForUpdates(), 10_000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}
