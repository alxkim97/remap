import type { ScanEntry } from '../../shared/types'

/** In-memory tree the user edits by dragging, renaming, and adding folders. */
export interface VirtualNode {
  id: string
  name: string
  originalName: string
  isDirectory: boolean
  isNew: boolean
  originalPath: string | null
  originalParentId: string | null
  size: number | null
  children: VirtualNode[]
  parent: VirtualNode | null
}

export function buildVirtualTree(entry: ScanEntry, parent: VirtualNode | null = null): VirtualNode {
  const node: VirtualNode = {
    id: entry.id,
    name: entry.name,
    originalName: entry.name,
    isDirectory: entry.isDirectory,
    isNew: false,
    originalPath: entry.path,
    originalParentId: parent ? parent.id : null,
    size: entry.size,
    children: [],
    parent
  }
  node.children = entry.children.map((child) => buildVirtualTree(child, node))
  return node
}

/** Shared by every tree/graph renderer so App can swap views freely. */
export interface NodeViewProps {
  root: VirtualNode
  dirtyIds: Set<string>
  branchColors: Map<string, string>
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onReparent: (dragId: string, targetParentId: string) => void
  onRename: (id: string, newName: string) => void
  onCreateFolder: (parentId: string) => void
  onRevert: (id: string) => void
}
