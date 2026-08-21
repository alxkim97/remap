import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlanConflict, PlanExecuteResponse } from '../../shared/types'
import { buildVirtualTree, type VirtualNode } from './types'
import { collectPendingOps, serializeForPlan } from './planDiff'
import {
  cloneVirtualTree,
  collectDirectoryIds,
  createFolder,
  indexTree,
  reparent,
  renameNode,
  revertAll,
  revertNode
} from './treeOps'
import { computeBranchColors } from './branchColors'
import { applyTheme, loadTheme, type Theme } from './theme'
import { TreeView } from './components/TreeView'
import { GraphView } from './components/GraphView'
import { PlanPanel } from './components/PlanPanel'
import { ConfirmModal } from './components/ConfirmModal'
import { SettingsModal } from './components/SettingsModal'

const UNDO_LIMIT = 50

export default function App(): React.JSX.Element {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanError, setScanError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [tick, setTick] = useState(0)
  const [conflicts, setConflicts] = useState<PlanConflict[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<PlanExecuteResponse | null>(null)
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [showSettings, setShowSettings] = useState(false)

  const treeRef = useRef<VirtualNode | null>(null)
  const nodeMapRef = useRef<Map<string, VirtualNode>>(new Map())
  const undoStackRef = useRef<VirtualNode[]>([])
  const redoStackRef = useRef<VirtualNode[]>([])

  const bump = (): void => setTick((t) => t + 1)

  async function loadFolder(path: string): Promise<void> {
    setScanning(true)
    setScanProgress(0)
    setScanError(null)
    setLastResult(null)
    setConflicts([])
    try {
      const result = await window.api.scanRoot(path, setScanProgress)
      const tree = buildVirtualTree(result.root)
      const map = new Map<string, VirtualNode>()
      indexTree(tree, map)
      treeRef.current = tree
      nodeMapRef.current = map
      undoStackRef.current = []
      redoStackRef.current = []
      setCanUndo(false)
      setCanRedo(false)
      setExpanded(new Set([tree.id]))
      setRootPath(path)
      setTruncated(result.truncated)
      bump()
    } catch (err) {
      setScanError(String(err))
    } finally {
      setScanning(false)
    }
  }

  async function handlePickFolder(): Promise<void> {
    const path = await window.api.pickFolder()
    if (path) await loadFolder(path)
  }

  const pendingOps = useMemo(() => {
    if (!treeRef.current) return []
    return collectPendingOps(treeRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const dirtyIds = useMemo(() => new Set(pendingOps.map((op) => op.node.id)), [pendingOps])

  const branchColors = useMemo(() => {
    if (!treeRef.current) return new Map<string, string>()
    return computeBranchColors(treeRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  function pushSnapshot(): void {
    if (!treeRef.current) return
    undoStackRef.current.push(cloneVirtualTree(treeRef.current, null))
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift()
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }

  function dropLastSnapshot(): void {
    undoStackRef.current.pop()
    setCanUndo(undoStackRef.current.length > 0)
  }

  function restoreSnapshot(snapshot: VirtualNode): void {
    const map = new Map<string, VirtualNode>()
    indexTree(snapshot, map)
    treeRef.current = snapshot
    nodeMapRef.current = map
    setConflicts([])
    bump()
  }

  function handlePlanUndo(): void {
    if (!treeRef.current || undoStackRef.current.length === 0) return
    redoStackRef.current.push(cloneVirtualTree(treeRef.current, null))
    const prev = undoStackRef.current.pop()!
    restoreSnapshot(prev)
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
  }

  function handlePlanRedo(): void {
    if (!treeRef.current || redoStackRef.current.length === 0) return
    undoStackRef.current.push(cloneVirtualTree(treeRef.current, null))
    const next = redoStackRef.current.pop()!
    restoreSnapshot(next)
    setCanRedo(redoStackRef.current.length > 0)
    setCanUndo(true)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (!e.ctrlKey && !e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handlePlanUndo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        handlePlanRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExpandAll(): void {
    if (!treeRef.current) return
    setExpanded(new Set(collectDirectoryIds(treeRef.current)))
  }

  function handleCollapseAll(): void {
    if (!treeRef.current) return
    setExpanded(new Set([treeRef.current.id]))
  }

  function handleReparent(dragId: string, targetParentId: string): void {
    const node = nodeMapRef.current.get(dragId)
    const target = nodeMapRef.current.get(targetParentId)
    if (!node || !target) return
    pushSnapshot()
    if (reparent(node, target)) {
      setConflicts([])
      bump()
    } else {
      dropLastSnapshot()
    }
  }

  function handleRename(id: string, newName: string): void {
    const node = nodeMapRef.current.get(id)
    if (!node) return
    pushSnapshot()
    if (renameNode(node, newName)) {
      setConflicts([])
      bump()
    } else {
      dropLastSnapshot()
    }
  }

  function handleCreateFolder(parentId: string): void {
    const parent = nodeMapRef.current.get(parentId)
    if (!parent) return
    pushSnapshot()
    const node = createFolder(parent)
    nodeMapRef.current.set(node.id, node)
    bump()
  }

  function handleRevertNode(id: string): void {
    const node = nodeMapRef.current.get(id)
    if (!node) return
    pushSnapshot()
    revertNode(node, nodeMapRef.current)
    setConflicts([])
    bump()
  }

  function handleRevertAll(): void {
    if (!treeRef.current) return
    pushSnapshot()
    revertAll(treeRef.current, nodeMapRef.current)
    setConflicts([])
    bump()
  }

  async function handleReview(): Promise<void> {
    if (!treeRef.current) return
    setBusy(true)
    try {
      const nodes = serializeForPlan(treeRef.current)
      const found = await window.api.validatePlan(nodes)
      setConflicts(found)
      if (found.length === 0) setShowConfirm(true)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!treeRef.current || !rootPath) return
    setBusy(true)
    try {
      const nodes = serializeForPlan(treeRef.current)
      const result = await window.api.executePlan(nodes, rootPath)
      setLastResult(result)
      setShowConfirm(false)
      await loadFolder(rootPath) // refresh from the real, now-updated disk state
    } finally {
      setBusy(false)
    }
  }

  async function handleUndoLastApplied(): Promise<void> {
    const logs = await window.api.listUndoLogs()
    if (logs.length === 0) {
      window.alert('Nothing to undo.')
      return
    }
    const latest = logs[0]
    const ok = window.confirm(
      `Undo the last ${latest.opCount} change(s) made to "${latest.rootPath}"?`
    )
    if (!ok) return
    setBusy(true)
    try {
      const result = await window.api.applyUndo(latest.file)
      window.alert(
        result.failed.length === 0
          ? `Reversed ${result.reversed} change(s).`
          : `Reversed ${result.reversed} change(s). ${result.failed.length} could not be undone (see console).`
      )
      if (result.failed.length > 0) console.warn('Undo failures:', result.failed)
      if (rootPath) await loadFolder(rootPath)
    } finally {
      setBusy(false)
    }
  }

  function handleThemeChange(next: Theme): void {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>FolderMapper</h1>
        <div className="header-actions">
          {rootPath && (
            <>
              <button onClick={handleExpandAll} disabled={scanning || busy}>
                Expand All
              </button>
              <button onClick={handleCollapseAll} disabled={scanning || busy}>
                Collapse All
              </button>
              <button
                className="icon-button"
                onClick={handlePlanUndo}
                disabled={scanning || busy || !canUndo}
                title="Undo edit (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                className="icon-button"
                onClick={handlePlanRedo}
                disabled={scanning || busy || !canRedo}
                title="Redo edit (Ctrl+Shift+Z)"
              >
                ↷
              </button>
              <div className="view-switch">
                <button
                  className={view === 'list' ? 'active' : ''}
                  onClick={() => setView('list')}
                  disabled={scanning || busy}
                >
                  List
                </button>
                <button
                  className={view === 'graph' ? 'active' : ''}
                  onClick={() => setView('graph')}
                  disabled={scanning || busy}
                >
                  Branch
                </button>
              </div>
            </>
          )}
          <button onClick={handlePickFolder} disabled={scanning || busy}>
            {rootPath ? 'Choose Different Folder' : 'Choose Folder'}
          </button>
          <button onClick={handleUndoLastApplied} disabled={scanning || busy} className="secondary">
            Undo Last Move
          </button>
          <button
            className="icon-button"
            onClick={() => setShowSettings(true)}
            disabled={scanning || busy}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {rootPath && <div className="root-path" title={rootPath}>{rootPath}</div>}

      {scanning && <div className="status-banner">Scanning… {scanProgress.toLocaleString()} items found</div>}
      {scanError && <div className="status-banner error">Scan failed: {scanError}</div>}
      {truncated && (
        <div className="status-banner warn">
          This folder is very large — scan stopped early at 20,000 items. Consider mapping a subfolder instead.
        </div>
      )}
      {lastResult && (
        <div className="status-banner success">
          Applied: {lastResult.results.filter((r) => r.status === 'moved').length} moved,{' '}
          {lastResult.results.filter((r) => r.status === 'created').length} created
          {lastResult.results.some((r) => r.status === 'failed') &&
            `, ${lastResult.results.filter((r) => r.status === 'failed').length} failed (see console)`}
          .
        </div>
      )}

      {!rootPath && !scanning && (
        <div className="empty-state">
          <p>Pick a folder to map it out. Nothing on disk changes until you confirm a plan.</p>
        </div>
      )}

      {rootPath && treeRef.current && (
        <div className="workspace">
          {view === 'list' ? (
            <TreeView
              root={treeRef.current}
              dirtyIds={dirtyIds}
              branchColors={branchColors}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onReparent={handleReparent}
              onRename={handleRename}
              onCreateFolder={handleCreateFolder}
              onRevert={handleRevertNode}
            />
          ) : (
            <GraphView
              root={treeRef.current}
              dirtyIds={dirtyIds}
              branchColors={branchColors}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onReparent={handleReparent}
              onRename={handleRename}
              onCreateFolder={handleCreateFolder}
              onRevert={handleRevertNode}
            />
          )}
          <PlanPanel
            ops={pendingOps}
            conflicts={conflicts}
            onRevert={handleRevertNode}
            onRevertAll={handleRevertAll}
            onConfirm={handleReview}
            busy={busy}
          />
        </div>
      )}

      {showConfirm && (
        <ConfirmModal
          ops={pendingOps}
          busy={busy}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
        />
      )}

      {showSettings && (
        <SettingsModal theme={theme} onChange={handleThemeChange} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
