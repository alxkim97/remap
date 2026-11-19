import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'
import type { Theme } from '../theme'

/** Status line text plus the chip tone it is shown in. */
function describe(status: UpdateStatus | null): { text: string; tone: string } {
  if (!status) return { text: '', tone: '' }
  switch (status.state) {
    case 'dev':
      return { text: 'Off in dev builds', tone: '' }
    case 'idle':
      return { text: 'Not checked yet', tone: '' }
    case 'checking':
      return { text: 'Checking…', tone: 'busy' }
    case 'none':
      return { text: 'Up to date', tone: 'good' }
    case 'downloading':
      return { text: `Downloading ${status.version ?? 'update'}… ${status.percent ?? 0}%`, tone: 'busy' }
    case 'downloaded':
      return { text: `Version ${status.version} ready to install`, tone: 'ready' }
    case 'error':
      return { text: status.error ?? 'Update check failed', tone: 'bad' }
  }
}

function UpdateRow(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.api.getVersion().then(setVersion)
    void window.api.getUpdateStatus().then(setStatus)
    return window.api.onUpdateStatus(setStatus)
  }, [])

  const state = status?.state
  const { text, tone } = describe(status)
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-title">Remap {version}</div>
        {text && <span className={`update-chip ${tone}`}>{text}</span>}
      </div>
      {state === 'downloaded' ? (
        <button className="primary" onClick={() => void window.api.restartToUpdate()}>
          Restart to Update
        </button>
      ) : (
        <button
          className="settings-update-btn"
          onClick={() => void window.api.checkForUpdates().then(setStatus)}
          disabled={state === 'dev' || state === 'checking' || state === 'downloading'}
        >
          Check for Updates
        </button>
      )}
    </div>
  )
}

interface SettingsModalProps {
  theme: Theme
  onChange: (theme: Theme) => void
  onClose: () => void
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export function SettingsModal(props: SettingsModalProps): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="settings-section-label">Appearance</div>
        <div className="settings-group">
          <div className="settings-row">
            <span className="settings-row-title">Theme</span>
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
        </div>

        <div className="settings-section-label">Updates</div>
        <div className="settings-group settings-update">
          <UpdateRow />
        </div>

        <div className="modal-actions">
          <button onClick={props.onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
