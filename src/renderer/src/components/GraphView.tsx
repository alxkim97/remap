import { useEffect, useRef, useState } from 'react'
import type { NodeViewProps } from '../types'
import { formatBytes } from '../format'
import { computeGraphLayout, GRAPH_METRICS, type LayoutNode } from '../graphLayout'

const { nodeHeight } = GRAPH_METRICS
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function GraphView(props: NodeViewProps): React.JSX.Element {
  const [zoom, setZoom] = useState(1)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Recomputed every render (not memoized): the tree is a mutable ref
  // outside React state, so identity never changes when it's edited —
  // only a fresh walk picks up the mutation.
  const layout = computeGraphLayout(props.root, props.expanded)

  // Ctrl+scroll to zoom. Needs a native (non-passive) listener — React's
  // synthetic onWheel is passive by default, so preventDefault() there is
  // silently ignored and the browser's own page-zoom would fire instead.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function startRename(ln: LayoutNode): void {
    if (ln.node.parent === null) return
    setRenamingId(ln.node.id)
    setDraftName(ln.node.name)
  }

  function commitRename(ln: LayoutNode): void {
    if (draftName.trim() && draftName.trim() !== ln.node.name) {
      props.onRename(ln.node.id, draftName.trim())
    }
    setRenamingId(null)
  }

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <button onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}>+</button>
        <button onClick={() => setZoom(1)}>Reset</button>
        <span className="graph-toolbar-hint">Ctrl+Scroll to zoom</span>
      </div>
      <div className="graph-scroll" ref={scrollRef}>
        <div
          className="graph-canvas"
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom
          }}
        >
          <div
            className="graph-canvas-inner"
            style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}
          >
            <svg className="graph-edges" width={layout.width} height={layout.height}>
              {layout.edges.map(({ from, to }) => {
                const x1 = from.x + from.width
                const y1 = from.y + nodeHeight / 2
                const x2 = to.x
                const y2 = to.y + nodeHeight / 2
                const midX = (x1 + x2) / 2
                const color = props.branchColors.get(to.node.id)
                return (
                  <path
                    key={to.node.id}
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    className="graph-edge"
                    style={color ? { stroke: color } : undefined}
                  />
                )
              })}
            </svg>

            {layout.nodes.map((ln) => {
              const { node } = ln
              const isRoot = node.parent === null
              const isDirty = props.dirtyIds.has(node.id)
              const isDragOver = dragOverId === node.id
              const isExpanded = props.expanded.has(node.id)
              const branchColor = props.branchColors.get(node.id)

              return (
                <div
                  key={node.id}
                  className={`graph-node${isDirty ? ' dirty' : ''}${isDragOver ? ' drag-over' : ''}${isRoot ? ' root' : ''}`}
                  style={{
                    left: ln.x,
                    top: ln.y,
                    width: ln.width,
                    height: nodeHeight,
                    borderColor: branchColor
                  }}
                  draggable={!isRoot}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', node.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    if (!node.isDirectory) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverId(node.id)
                  }}
                  onDragLeave={() => setDragOverId((id) => (id === node.id ? null : id))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverId(null)
                    const dragId = e.dataTransfer.getData('text/plain')
                    if (dragId && node.isDirectory) props.onReparent(dragId, node.id)
                  }}
                  onDoubleClick={() => startRename(ln)}
                  title={`${node.name}\n${node.originalPath ?? '(new folder — not yet created)'}`}
                >
                  <span className="icon">{node.isDirectory ? '📁' : '📄'}</span>

                  {renamingId === node.id ? (
                    <input
                      className="rename-input"
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(ln)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(ln)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                    />
                  ) : (
                    <span className="name">{node.name}</span>
                  )}

                  <span className="size">{formatBytes(node.size)}</span>

                  {node.isDirectory && node.children.length > 0 && (
                    <button
                      className="graph-expand-dot"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                      onClick={() => props.onToggleExpand(node.id)}
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                  )}
                  {node.isDirectory && (
                    <button
                      className="row-action"
                      title="New folder here"
                      onClick={() => props.onCreateFolder(node.id)}
                    >
                      +📁
                    </button>
                  )}
                  {isDirty && (
                    <button
                      className="row-action"
                      title="Undo this change"
                      onClick={() => props.onRevert(node.id)}
                    >
                      ↺
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
