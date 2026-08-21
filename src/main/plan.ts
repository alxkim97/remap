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

export async function executePlan(
  nodes: PlanNode[],
  rootPath: string
): Promise<PlanExecuteResponse> {
  const currentPath = new Map<string, string>()
  for (const n of nodes) if (!n.isNew) currentPath.set(n.id, n.originalPath!)

  const results: PlanOpResult[] = []
  const undoEntries: UndoLogEntry[] = []

  for (const node of nodes) {
    if (node.parentId === null) continue // root itself never moves

    if (node.isNew) {
      try {
        await fs.mkdir(node.plannedPath, { recursive: true })
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

  return { results, undoLogPath }
}
