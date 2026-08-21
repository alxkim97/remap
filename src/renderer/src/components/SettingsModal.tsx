import type { Theme } from '../theme'

interface SettingsModalProps {
  theme: Theme
  onChange: (theme: Theme) => void
  onClose: () => void
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Match System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export function SettingsModal(props: SettingsModalProps): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <div className="settings-row">
          <span className="settings-label">Theme</span>
          <div className="view-switch">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={props.theme === opt.value ? 'active' : ''}
                onClick={() => props.onChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
