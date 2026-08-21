import type { PlanConflict } from '../../../shared/types'
import type { PendingOp } from '../planDiff'

interface PlanPanelProps {
  ops: PendingOp[]
  conflicts: PlanConflict[]
  onRevert: (id: string) => void
  onRevertAll: () => void
  onConfirm: () => void
  busy: boolean
}

const KIND_LABEL: Record<PendingOp['kind'], string> = {
  move: 'Move',
  rename: 'Rename',
  create: 'Create folder'
}

export function PlanPanel(props: PlanPanelProps): React.JSX.Element {
  const conflictIds = new Set(props.conflicts.map((c) => c.nodeId))

  return (
    <div className="plan-panel">
      <div className="plan-header">
        <h2>Plan{props.ops.length > 0 ? ` (${props.ops.length})` : ''}</h2>
        {props.ops.length > 0 && (
          <button className="link-button" onClick={props.onRevertAll} disabled={props.busy}>
            Reset all
          </button>
        )}
      </div>

      {props.ops.length === 0 ? (
        <p className="plan-empty">Drag items in the tree to plan changes. Nothing will move until you confirm.</p>
      ) : (
        <ul className="plan-list">
          {props.ops.map((op) => {
            const hasConflict = conflictIds.has(op.node.id)
            return (
              <li key={op.node.id} className={hasConflict ? 'conflict' : ''}>
                <div className="plan-item-text">
                  <span className="plan-kind">{KIND_LABEL[op.kind]}</span>
                  <span className="plan-name">{op.node.name}</span>
                  <span className="plan-dest" title={op.to}>
                    → {op.to}
                  </span>
                  {hasConflict && <span className="conflict-badge">already exists at destination</span>}
                </div>
                <button className="row-action" title="Undo this change" onClick={() => props.onRevert(op.node.id)}>
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button
        className="confirm-button"
        disabled={props.ops.length === 0 || props.busy}
        onClick={props.onConfirm}
      >
        {props.busy ? 'Working…' : 'Review & Confirm Moves'}
      </button>
    </div>
  )
}
