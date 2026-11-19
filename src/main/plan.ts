import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type {
  PlanConflict,
  PlanExecuteResponse,
  PlanNode,
  PlanOpResult,
  UndoLogEntry
} from '../shared/types'
import { writeUndoLog } from './undo'
import { appendApplyEntry } from './remapLog'

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function needsOp(node: PlanNode): boolean {
  return node.isNew || node.plannedPath !== node.originalPath
}

/**
 * A node's plan/target path never changes mid-run, but its real path on
 * disk can shift out from under it when an ancestor moves earlier in the
 * same batch (the OS relocates the whole subtree in one go). Whenever a
 * move executes, every node still tracked underneath the old path gets
 * its tracked path rewritten to the new one.
 */
function cascade(currentPath: Map<string, string>, oldPath: string, newPath: string): void {
  for (const [id, p] of currentPath) {
    if (p === oldPath) continue
    const rel = relative(oldPath, p)
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
      currentPath.set(id, join(newPath, rel))
    }
  }
}

export async function validatePlan(nodes: PlanNode[]): Promise<PlanConflict[]> {
  const conflicts: PlanConflict[] = []
  const movers = nodes.filter((n) => n.parentId !== null && needsOp(n))

  const targetCounts = new Map<string, string[]>()
  for (const n of movers) {
    const key = n.plannedPath.toLowerCase()
    targetCounts.set(key, [...(targetCounts.get(key) ?? []), n.id])
  }
  for (const ids of targetCounts.values()) {
    if (ids.length > 1) {
      for (const id of ids) {
        const n = movers.find((m) => m.id === id)!
        conflicts.push({ nodeId: id, plannedPath: n.plannedPath, reason: 'duplicate-target' })
      }
    }
  }

  const vacated = new Set(movers.filter((n) => !n.isNew).map((n) => n.originalPath!.toLowerCase()))

  for (const n of movers) {
    if (targetCounts.get(n.plannedPath.toLowerCase())!.length > 1) continue // already reported
    if (await pathExists(n.plannedPath) && !vacated.has(n.plannedPath.toLowerCase())) {
      conflicts.push({ nodeId: n.id, plannedPath: n.plannedPath, reason: 'target-exists' })
    }
  }

  return conflicts
}

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/**
 * Makes `target` free before something moves or is created there. Windows'
 * rename silently REPLACES an existing file, so a swap (a.txt <-> b.txt) or
 * "move X out, move another X in" would destroy whichever file was still
 * sitting at the target when its turn came. validatePlan lets such targets
 * through because they are vacated later in the batch, so here the current
 * occupant (another node in this plan that has not moved yet) is parked
 * under a temporary name first; it reaches its own planned path on its own
 * turn. Anything at the target that is NOT part of the plan is never
 * touched: that op fails instead. `selfId` allows case-only renames
 * (a.txt -> A.txt), where the "occupant" is the node itself.
 */
async function clearTarget(
  target: string,
  selfId: string | null,
  currentPath: Map<string, string>,
  leaving: Set<string>,
  undoEntries: UndoLogEntry[]
): Promise<void> {
  if (!(await pathExists(target))) return
  let occupant: string | null = null
  for (const [id, p] of currentPath) {
    if (samePath(p, target)) {
      occupant = id
      break
    }
  }
  if (occupant === selfId && occupant !== null) return
  if (occupant === null || !leaving.has(occupant)) {
    throw new Error(`Target already exists and is not moving away in this plan: ${target}`)
  }
  const from = currentPath.get(occupant)!
  let parked = `${from}.remap-tmp-${Date.now().toString(36)}`
  for (let i = 1; await pathExists(parked); i++) parked = `${from}.remap-tmp-${Date.now().toString(36)}-${i}`
  await fs.rename(from, parked)
  cascade(currentPath, from, parked)
  currentPath.set(occupant, parked)
  undoEntries.push({ type: 'move', from, to: parked })
}

export async function executePlan(
  nodes: PlanNode[],
  rootPath: string,
  writeHistory = false
): Promise<PlanExecuteResponse> {
  const currentPath = new Map<string, string>()
  for (const n of nodes) if (!n.isNew) currentPath.set(n.id, n.originalPath!)
  // Nodes that will end up somewhere else; only these may be parked out of the way.
  const leaving = new Set(
    nodes.filter((n) => !n.isNew && n.parentId !== null && n.plannedPath !== n.originalPath).map((n) => n.id)
  )

  const results: PlanOpResult[] = []
  const undoEntries: UndoLogEntry[] = []

  for (const node of nodes) {
    if (node.parentId === null) continue // root itself never moves

    if (node.isNew) {
      try {
        await fs.mkdir(dirname(node.plannedPath), { recursive: true })
        await clearTarget(node.plannedPath, null, currentPath, leaving, undoEntries)
        await fs.mkdir(node.plannedPath)
        currentPath.set(node.id, node.plannedPath)
        undoEntries.push({ type: 'mkdir', from: null, to: node.plannedPath })
        results.push({ nodeId: node.id, status: 'created', from: null, to: node.plannedPath })
      } catch (err) {
        results.push({ nodeId: node.id, status: 'failed', error: String(err) })
      }
      continue
    }

    const actual = currentPath.get(node.id)!
    if (actual === node.plannedPath) {
      results.push({ nodeId: node.id, status: 'skipped', reason: 'unchanged' })
      continue
    }

    try {
      await fs.mkdir(dirname(node.plannedPath), { recursive: true })
      await clearTarget(node.plannedPath, node.id, currentPath, leaving, undoEntries)
      await fs.rename(actual, node.plannedPath)
      cascade(currentPath, actual, node.plannedPath)
      currentPath.set(node.id, node.plannedPath)
      undoEntries.push({ type: 'move', from: actual, to: node.plannedPath })
      results.push({ nodeId: node.id, status: 'moved', from: actual, to: node.plannedPath })
    } catch (err) {
      results.push({ nodeId: node.id, status: 'failed', error: String(err) })
    }
  }

  const undoLogPath = undoEntries.length > 0 ? await writeUndoLog(rootPath, undoEntries) : null

  // The readable history in the folder itself. A failure here must never
  // turn a successful apply into an error: it is reported alongside instead.
  let historyFile: string | null = null
  let historyError: string | undefined
  if (writeHistory) {
    try {
      historyFile = await appendApplyEntry(rootPath, nodes, results, Date.now())
    } catch (err) {
      historyError = String(err instanceof Error ? err.message : err)
    }
  }

  return { results, undoLogPath, historyFile, historyError }
}
