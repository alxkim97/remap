import type { PlanNode } from '../../shared/types'
import type { VirtualNode } from './types'

function joinPath(base: string, name: string): string {
  return `${base.replace(/[\\/]+$/, '')}\\${name}`
}

export interface PlannedPaths {
  plannedPath: Map<string, string> // node id -> planned absolute path
}

/** Computes each node's target path from the current (post-drag) tree shape. */
export function computePlannedPaths(root: VirtualNode): PlannedPaths {
  const plannedPath = new Map<string, string>()

  function walk(node: VirtualNode, parentPlanned: string): void {
    plannedPath.set(node.id, parentPlanned)
    for (const child of node.children) {
      walk(child, joinPath(parentPlanned, child.name))
    }
  }

  if (root.originalPath === null) throw new Error('root must be scanned, not virtual')
  plannedPath.set(root.id, root.originalPath)
  for (const child of root.children) {
    walk(child, joinPath(root.originalPath, child.name))
  }

  return { plannedPath }
}

export function needsOp(node: VirtualNode, plannedPath: Map<string, string>): boolean {
  if (node.parent === null) return false
  if (node.isNew) return true
  return plannedPath.get(node.id) !== node.originalPath
}

export interface PendingOp {
  node: VirtualNode
  kind: 'move' | 'rename' | 'create'
  from: string | null
  to: string
}

/** Flattens the tree (pre-order) and describes every node that differs from the original scan. */
export function collectPendingOps(root: VirtualNode): PendingOp[] {
  const { plannedPath } = computePlannedPaths(root)
  const ops: PendingOp[] = []

  function walk(node: VirtualNode): void {
    if (node.parent !== null && needsOp(node, plannedPath)) {
      const to = plannedPath.get(node.id)!
      if (node.isNew) {
        ops.push({ node, kind: 'create', from: null, to })
      } else if (node.parent.id === node.originalParentId) {
        ops.push({ node, kind: 'rename', from: node.originalPath, to })
      } else {
        ops.push({ node, kind: 'move', from: node.originalPath, to })
      }
    }
    for (const child of node.children) walk(child)
  }
  walk(root)

  return ops
}

/** Serializes the whole tree (pre-order) into the flat shape the main process expects. */
export function serializeForPlan(root: VirtualNode): PlanNode[] {
  const { plannedPath } = computePlannedPaths(root)
  const nodes: PlanNode[] = []

  function walk(node: VirtualNode): void {
    nodes.push({
      id: node.id,
      parentId: node.parent ? node.parent.id : null,
      name: node.name,
      originalName: node.originalName,
      isDirectory: node.isDirectory,
      isNew: node.isNew,
      originalPath: node.originalPath,
      plannedPath: plannedPath.get(node.id)!
    })
    for (const child of node.children) walk(child)
  }
  walk(root)

  return nodes
}

/** True if `candidate` is `node` itself or one of its descendants. */
export function isSelfOrDescendant(node: VirtualNode, candidate: VirtualNode): boolean {
  let cur: VirtualNode | null = candidate
  while (cur) {
    if (cur === node) return true
    cur = cur.parent
  }
  return false
}
