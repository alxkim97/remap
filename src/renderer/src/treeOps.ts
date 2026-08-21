import type { VirtualNode } from './types'

export function indexTree(root: VirtualNode, map: Map<string, VirtualNode>): void {
  map.set(root.id, root)
  for (const child of root.children) indexTree(child, map)
}

export function isSelfOrDescendant(node: VirtualNode, candidate: VirtualNode): boolean {
  let cur: VirtualNode | null = candidate
  while (cur) {
    if (cur === node) return true
    cur = cur.parent
  }
  return false
}

/** Moves `node` to become the last child of `newParent`. No-op on illegal drops. */
export function reparent(node: VirtualNode, newParent: VirtualNode): boolean {
  if (!newParent.isDirectory) return false
  if (node.parent === newParent) return false
  if (isSelfOrDescendant(node, newParent)) return false // can't drop into itself/its own child

  const oldParent = node.parent
  if (!oldParent) return false // root can't move

  oldParent.children = oldParent.children.filter((c) => c !== node)
  newParent.children.push(node)
  node.parent = newParent
  return true
}

export function renameNode(node: VirtualNode, newName: string): boolean {
  const trimmed = newName.trim()
  if (!trimmed || /[\\/:*?"<>|]/.test(trimmed)) return false
  if (node.parent === null) return false // root name is fixed
  node.name = trimmed
  return true
}

let newFolderCounter = 0

export function createFolder(parent: VirtualNode): VirtualNode {
  newFolderCounter += 1
  const name = newFolderCounter === 1 ? 'New Folder' : `New Folder (${newFolderCounter})`
  const node: VirtualNode = {
    id: crypto.randomUUID(),
    name,
    originalName: name,
    isDirectory: true,
    isNew: true,
    originalPath: null,
    originalParentId: null,
    size: null,
    children: [],
    parent
  }
  parent.children.push(node)
  return node
}

/** Discards one pending change: undoes a move/rename, or deletes a not-yet-created folder. */
export function revertNode(node: VirtualNode, nodeMap: Map<string, VirtualNode>): void {
  if (node.isNew) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1)
    return
  }
  node.name = node.originalName
  const originalParent = node.originalParentId ? nodeMap.get(node.originalParentId) : null
  if (originalParent && node.parent !== originalParent) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1)
    originalParent.children.push(node)
    node.parent = originalParent
  }
}

/** Discards every pending change in the whole tree. */
export function revertAll(root: VirtualNode, nodeMap: Map<string, VirtualNode>): void {
  function walk(node: VirtualNode): void {
    // Snapshot children first: reverting a "new" node removes it from its
    // parent's array while we're mid-iteration.
    for (const child of [...node.children]) walk(child)
    if (node.parent !== null) revertNode(node, nodeMap)
  }
  walk(root)
}

/** Deep-copies the tree so it can be pushed onto an undo/redo stack. */
export function cloneVirtualTree(node: VirtualNode, parent: VirtualNode | null): VirtualNode {
  const copy: VirtualNode = { ...node, parent, children: [] }
  copy.children = node.children.map((child) => cloneVirtualTree(child, copy))
  return copy
}

export function collectDirectoryIds(root: VirtualNode): string[] {
  const ids: string[] = []
  function walk(node: VirtualNode): void {
    if (node.isDirectory) {
      ids.push(node.id)
      for (const child of node.children) walk(child)
    }
  }
  walk(root)
  return ids
}
