import { contextBridge, ipcRenderer } from 'electron'
import type {
  PlanConflict,
  PlanExecuteResponse,
  PlanNode,
  ScanResult,
  UndoApplyResult,
  UndoSummary
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

  executePlan: (nodes: PlanNode[], rootPath: string): Promise<PlanExecuteResponse> =>
    ipcRenderer.invoke('plan:execute', nodes, rootPath),

  listUndoLogs: (): Promise<UndoSummary[]> => ipcRenderer.invoke('undo:list'),

  applyUndo: (logFile: string): Promise<UndoApplyResult> => ipcRenderer.invoke('undo:apply', logFile),

  openPath: (path: string): Promise<string> => ipcRenderer.invoke('shell:openPath', path)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
