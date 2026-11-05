import { useId, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import { setTheme } from '../theme'
import WorkspaceIcon from './WorkspaceIcon'
import './ThemeToggle.css'

export default function ThemeToggle() {
  const darkMode = useTheme() === 'dark'
  const [saveFailed, setSaveFailed] = useState(false)
  const feedbackId = useId()
  const label = darkMode ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <div className="theme-control">
      <button className="theme-toggle" type="button" role="switch" aria-checked={darkMode} aria-label="Dark mode" aria-describedby={saveFailed ? feedbackId : undefined} title={label} onClick={() => setSaveFailed(!setTheme(darkMode ? 'light' : 'dark'))}>
        <WorkspaceIcon name={darkMode ? 'moon' : 'sun'} size={22} />
      </button>
      {saveFailed && <p id={feedbackId} className="theme-control__feedback" role="status">Appearance updated for this visit. Your browser could not save the preference.</p>}
    </div>
  )
}
