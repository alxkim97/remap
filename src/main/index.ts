import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { scanFolder } from './scan'
import { validatePlan, executePlan } from './plan'
import { listUndoLogs, applyUndo } from './undo'
import type { PlanNode } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
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

  ipcMain.handle('plan:execute', async (_event, nodes: PlanNode[], rootPath: string) => {
    return executePlan(nodes, rootPath)
  })

  ipcMain.handle('undo:list', async () => listUndoLogs())
  ipcMain.handle('undo:apply', async (_event, logFile: string) => applyUndo(logFile))

  ipcMain.handle('shell:openPath', async (_event, path: string) => {
    return shell.openPath(path)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
