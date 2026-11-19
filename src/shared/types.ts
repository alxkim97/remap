// Types shared between main and renderer processes.

/** Self-update state, pushed from main to the renderer's Settings panel. */
export interface UpdateStatus {
  state: 'dev' | 'idle' | 'checking' | 'none' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  checkedAt?: number
  error?: string
}

/** One entry as read straight off disk during a scan. */
export interface ScanEntry {
  id: string
  name: string
  path: string
  isDirectory: boolean
  size: number | null // null for directories (not computed up front)
  mtimeMs: number
  children: ScanEntry[] // empty for files
}

export interface ScanResult {
  root: ScanEntry
  totalItems: number
  truncated: boolean // hit the soft item cap
}

/**
 * One node of the plan tree, sent from renderer to main in pre-order
 * (parent always appears before its children). `parentId` is null only
 * for the root. `plannedPath` is the absolute path this node should end
 * up at if the plan is executed.
 */
export interface PlanNode {
  id: string
  parentId: string | null
  name: string
  originalName: string
  isDirectory: boolean
  isNew: boolean // created in the plan, does not exist on disk yet
  originalPath: string | null // null when isNew
  plannedPath: string
}

export interface PlanConflict {
  nodeId: string
  plannedPath: string
  reason: 'target-exists' | 'duplicate-target'
}

export type PlanOpResult =
  | { nodeId: string; status: 'moved' | 'created'; from: string | null; to: string }
  | { nodeId: string; status: 'skipped'; reason: string }
  | { nodeId: string; status: 'failed'; error: string }

export interface PlanExecuteResponse {
  results: PlanOpResult[]
  undoLogPath: string | null
  /** REMAP-LOG.md written in the remapped folder, when asked for and something changed */
  historyFile?: string | null
  historyError?: string
}

export interface UndoLogEntry {
  type: 'move' | 'mkdir'
  from: string | null
  to: string
}

export interface UndoLog {
  timestamp: number
  rootPath: string
  entries: UndoLogEntry[]
}

export interface UndoSummary {
  file: string
  timestamp: number
  rootPath: string
  opCount: number
}

export interface UndoApplyResult {
  reversed: number
  failed: { entry: UndoLogEntry; error: string }[]
}
