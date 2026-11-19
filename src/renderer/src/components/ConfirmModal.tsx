import type { PendingOp } from '../planDiff'

interface ConfirmModalProps {
  ops: PendingOp[]
  busy: boolean
  writeHistory: boolean
  onWriteHistoryChange: (on: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmModal(props: ConfirmModalProps): React.JSX.Element {
  const moves = props.ops.filter((o) => o.kind !== 'create').length
  const creates = props.ops.filter((o) => o.kind === 'create').length

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Apply {props.ops.length} change{props.ops.length === 1 ? '' : 's'}?</h2>
        <p className="modal-summary">
          {creates > 0 && `${creates} new folder${creates === 1 ? '' : 's'}`}
          {creates > 0 && moves > 0 && ', '}
          {moves > 0 && `${moves} move/rename${moves === 1 ? '' : 's'}`}. This changes real files on disk.
        </p>
        <ul className="modal-op-list">
          {props.ops.map((op) => (
            <li key={op.node.id}>
              <strong>{op.kind === 'create' ? 'Create' : op.kind === 'rename' ? 'Rename' : 'Move'}</strong>{' '}
              {op.node.name} <span className="modal-dest">→ {op.to}</span>
            </li>
          ))}
        </ul>
        <label className="history-toggle" htmlFor="write-history">
          <input
            id="write-history"
            type="checkbox"
            checked={props.writeHistory}
            onChange={(e) => props.onWriteHistoryChange(e.target.checked)}
            disabled={props.busy}
          />
          <span>
            <span className="history-toggle-title">Record in REMAP-LOG.md</span>
            <span className="history-toggle-hint">
              Adds a dated list of these changes to a file in this folder, so people and Claude chats can see what moved.
              In a git repo, commit it with the moves.
            </span>
          </span>
        </label>
        <div className="modal-actions">
          <button onClick={props.onCancel} disabled={props.busy}>
            Cancel
          </button>
          <button className="confirm-button" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? 'Applying…' : 'Confirm & Move Files'}
          </button>
        </div>
      </div>
    </div>
  )
}
