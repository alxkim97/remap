import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { scanFolder } from './scan'
import { validatePlan, executePlan } from './plan'
import { listUndoLogs, applyUndo } from './undo'
import { checkForUpdates, getUpdateStatus, initUpdater, promptRestart, setPendingPlan } from './updater'
import type { PlanNode } from '../shared/types'

// Own taskbar identity; dev runs get a separate one so they don't borrow the
// installed app's shortcut icon.
app.setAppUserModelId(app.isPackaged ? 'com.alexkim.remap' : 'com.alexkim.remap.dev')

// One Remap at a time: two copies applying plans (or one installing an
// update under the other) would step on each other.
if (!app.requestSingleInstanceLock()) app.quit()

let mainWindow: BrowserWindow | null = null
let fileOpsInFlight = 0 // plan execute / undo running: never restart for an update mid-move

async function trackFileOp<T>(op: () => Promise<T>): Promise<T> {
  fileOpsInFlight++
  try {
    return await op()
  } finally {
    fileOpsInFlight--
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('scan:root', async (event, rootPath: string) => {
    const sender = event.sender
    return scanFolder(rootPath, (count) => {
      if (!sender.isDestroyed()) sender.send('scan:progress', count)
    })
  })

  ipcMain.handle('plan:validate', async (_event, nodes: PlanNode[]) => {
    return validatePlan(nodes)
  })

  ipcMain.handle('plan:execute', async (_event, nodes: PlanNode[], rootPath: string, writeHistory: boolean) => {
    return trackFileOp(() => executePlan(nodes, rootPath, writeHistory === true))
  })

  ipcMain.handle('undo:list', async () => listUndoLogs())
  ipcMain.handle('undo:apply', async (_event, logFile: string) => trackFileOp(() => applyUndo(logFile)))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('updater:status', () => getUpdateStatus())
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:restart', () => promptRestart())
  ipcMain.on('plan:pending', (_event, pending: boolean) => setPendingPlan(pending))

  ipcMain.handle('shell:openPath', async (_event, path: string) => {
    return shell.openPath(path)
  })

  createWindow()
  initUpdater(() => mainWindow, () => fileOpsInFlight > 0)

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
