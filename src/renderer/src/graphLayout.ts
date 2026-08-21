import type { VirtualNode } from './types'

export const GRAPH_METRICS = {
  colWidth: 280,
  rowHeight: 40,
  nodeHeight: 30,
  minNodeWidth: 110,
  maxNodeWidth: 260
}

/** Rough text-width estimate (12px UI font) so short names get a snug box and long ones get more room, up to the cap. */
function measureNodeWidth(name: string): number {
  const { minNodeWidth, maxNodeWidth } = GRAPH_METRICS
  const estimate = name.length * 6.6 + 58 // icon + padding + per-character allowance
  return Math.max(minNodeWidth, Math.min(maxNodeWidth, estimate))
}

export interface LayoutNode {
  node: VirtualNode
  x: number
  y: number
  width: number
  hasHiddenChildren: boolean
}

export interface GraphEdge {
  from: LayoutNode
  to: LayoutNode
}

export interface GraphLayout {
  nodes: LayoutNode[]
  edges: GraphEdge[]
  width: number
  height: number
}

/**
 * Simple tidy-tree layout: leaves get sequential rows top-to-bottom, each
 * parent centers on the average row of its (visible) children. Good enough
 * for folder-scale trees without pulling in a full layout library.
 */
export function computeGraphLayout(root: VirtualNode, expanded: Set<string>): GraphLayout {
  const { colWidth, rowHeight, nodeHeight, maxNodeWidth } = GRAPH_METRICS
  const nodes: LayoutNode[] = []
  const byId = new Map<string, LayoutNode>()
  let rowCounter = 0

  function visibleChildren(n: VirtualNode): VirtualNode[] {
    return n.isDirectory && expanded.has(n.id) ? n.children : []
  }

  function assign(n: VirtualNode, depth: number): number {
    const children = visibleChildren(n)
    let row: number
    if (children.length === 0) {
      row = rowCounter++
    } else {
      const childRows = children.map((c) => assign(c, depth + 1))
      row = childRows.reduce((a, b) => a + b, 0) / childRows.length
    }
    const ln: LayoutNode = {
      node: n,
      x: depth * colWidth,
      y: row * rowHeight,
      width: measureNodeWidth(n.name),
      hasHiddenChildren: n.isDirectory && n.children.length > 0 && children.length === 0
    }
    nodes.push(ln)
    byId.set(n.id, ln)
    return row
  }
  assign(root, 0)

  const edges: GraphEdge[] = []
  for (const ln of nodes) {
    for (const child of visibleChildren(ln.node)) {
      const cln = byId.get(child.id)
      if (cln) edges.push({ from: ln, to: cln })
    }
  }

  const width = Math.max(...nodes.map((n) => n.x)) + maxNodeWidth + 60
  const height = Math.max(...nodes.map((n) => n.y)) + nodeHeight + 40

  return { nodes, edges, width, height }
}
