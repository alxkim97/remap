import { useState } from 'react'
import type { NodeViewProps, VirtualNode } from '../types'
import { formatBytes } from '../format'

export function TreeView(props: NodeViewProps): React.JSX.Element {
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  function startRename(node: VirtualNode): void {
    if (node.parent === null) return // root name is fixed
    setRenamingId(node.id)
    setDraftName(node.name)
  }

  function commitRename(node: VirtualNode): void {
    if (draftName.trim() && draftName.trim() !== node.name) {
      props.onRename(node.id, draftName.trim())
    }
    setRenamingId(null)
  }

  function renderNode(node: VirtualNode, depth: number): React.JSX.Element {
    const isExpanded = props.expanded.has(node.id)
    const isRoot = node.parent === null
    const isDirty = props.dirtyIds.has(node.id)
    const isDragOver = dragOverId === node.id
    const branchColor = props.branchColors.get(node.id)

    return (
      <div key={node.id}>
        <div
          className={`tree-row${isDirty ? ' dirty' : ''}${isDragOver ? ' drag-over' : ''}`}
          style={{
            paddingLeft: `${depth * 20 + 6}px`,
            borderLeft: branchColor ? `3px solid ${branchColor}` : '3px solid transparent'
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
        >
          {node.isDirectory ? (
            <button
              className="disclosure"
              onClick={() => props.onToggleExpand(node.id)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {node.children.length === 0 ? '·' : isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="disclosure-spacer" />
          )}
          <span className="icon">{node.isDirectory ? '📁' : '📄'}</span>

          {renamingId === node.id ? (
            <input
              className="rename-input"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => commitRename(node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(node)
                if (e.key === 'Escape') setRenamingId(null)
              }}
            />
          ) : (
            <span
              className={`name${node.isNew ? ' new' : ''}`}
              onDoubleClick={() => startRename(node)}
              title={node.originalPath ?? '(new folder — not yet created)'}
            >
              {node.name}
            </span>
          )}

          <span className="size">{formatBytes(node.size)}</span>

          {node.isDirectory && (
            <button className="row-action" title="New folder here" onClick={() => props.onCreateFolder(node.id)}>
              +📁
            </button>
          )}
          {!isRoot && (
            <button className="row-action" title="Rename" onClick={() => startRename(node)}>
              ✏️
            </button>
          )}
          {isDirty && (
            <button className="row-action" title="Undo this change" onClick={() => props.onRevert(node.id)}>
              ↺
            </button>
          )}
        </div>
        {node.isDirectory && isExpanded && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  return <div className="tree-view">{renderNode(props.root, 0)}</div>
}
