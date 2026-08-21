import type { VirtualNode } from './types'

// Distinct, dark-and-light-friendly hues cycled across root's direct children.
const PALETTE = [
  '#4f8cff',
  '#4caf7d',
  '#d9a441',
  '#e05a5a',
  '#a374db',
  '#3fb8c4',
  '#e07bc0',
  '#8bc34a',
  '#ff8a5c',
  '#6b8ffa'
]

/**
 * Colors every node by which top-level branch (direct child of root) it
 * currently falls under, so a wide fan-out tree reads at a glance. Root
 * itself has no branch color. Recomputed fresh from the current tree shape
 * each call, so it stays correct as items get dragged between branches.
 */
export function computeBranchColors(root: VirtualNode): Map<string, string> {
  const colors = new Map<string, string>()

  function paint(node: VirtualNode, color: string): void {
    colors.set(node.id, color)
    for (const child of node.children) paint(child, color)
  }

  root.children.forEach((branch, i) => paint(branch, PALETTE[i % PALETTE.length]))

  return colors
}
