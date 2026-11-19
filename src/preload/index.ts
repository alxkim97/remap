import { contextBridge, ipcRenderer } from 'electron'
import type {
  PlanConflict,
  PlanExecuteResponse,
  PlanNode,
  ScanResult,
  UndoApplyResult,
  UndoSummary,
  UpdateStatus
} from '../shared/types'

const api = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),

  scanRoot: (rootPath: string, onProgress: (count: number) => void): Promise<ScanResult> => {
    const listener = (_event: Electron.IpcRendererEvent, count: number): void => onProgress(count)
    ipcRenderer.on('scan:progress', listener)
    return ipcRenderer.invoke('scan:root', rootPath).finally(() => {
      ipcRenderer.removeListener('scan:progress', listener)
    })
  },

  validatePlan: (nodes: PlanNode[]): Promise<PlanConflict[]> =>
    ipcRenderer.invoke('plan:validate', nodes),

  executePlan: (nodes: PlanNode[], rootPath: string, writeHistory: boolean): Promise<PlanExecuteResponse> =>
    ipcRenderer.invoke('plan:execute', nodes, rootPath, writeHistory),

  listUndoLogs: (): Promise<UndoSummary[]> => ipcRenderer.invoke('undo:list'),

  applyUndo: (logFile: string): Promise<UndoApplyResult> => ipcRenderer.invoke('undo:apply', logFile),

  openPath: (path: string): Promise<string> => ipcRenderer.invoke('shell:openPath', path),

  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:status'),

  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:check'),

  restartToUpdate: (): Promise<void> => ipcRenderer.invoke('updater:restart'),

  /** Subscribe to update-status pushes; returns an unsubscribe function. */
  onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },

  setPendingPlan: (pending: boolean): void => ipcRenderer.send('plan:pending', pending)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
