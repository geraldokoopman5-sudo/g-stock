import type { ComponentProps } from 'react'
import WorkspaceIcon from './WorkspaceIcon'
import './ActionIconButton.css'

type ActionIconButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon: 'pen' | 'trash' | 'gallery'
  label: string
}

export default function ActionIconButton({ icon, label, className = '', ...props }: ActionIconButtonProps) {
  const accessibleLabel = props['aria-label'] ?? label
  return (
    <button type="button" {...props} className={`${className} action-icon-button`}
      aria-label={accessibleLabel} title={props.title ?? accessibleLabel}>
      <WorkspaceIcon name={icon} />
      <span className="action-icon-button__label">{label}</span>
    </button>
  )
}
