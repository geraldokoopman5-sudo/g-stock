import { useId } from 'react'
import type { EmployeeProfile } from '../types/employees'
import ReflectiveCard from './ReflectiveCard'
import { palette } from '../theme'
import './EmployeeCard.css'

export default function EmployeeCard({ employee }: { employee: EmployeeProfile }) {
  const nameId = useId()
  const initials = employee.fullName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join('').toUpperCase()

  return (
    <ReflectiveCard
      className="employee-card"
      width={400}
      height="auto"
      theme="light"
      tint={palette.mistBlue}
      metalness={0.85}
      roughness={0.35}
      shine={0.8}
      glare={0.3}
      tiltStrength={7}
      webcam={false}
    >
      <article className="employee-card__profile" aria-labelledby={nameId}>
        <div className="employee-card__top">
          <span className="employee-card__brand">G-Stock<span>.</span></span>
          <span className="employee-card__badge">EMPLOYEE</span>
        </div>
        <div className="employee-card__portrait" aria-hidden="true">
          <span>{initials}</span>
          <i className="employee-card__orbit" />
        </div>
        <div className="employee-card__identity">
          <p className="employee-card__label">Full name</p>
          <h2 id={nameId}>{employee.fullName}</h2>
        </div>
        <dl className="employee-card__details">
          <div><dt>Department</dt><dd>{employee.department}</dd></div>
          <div><dt>Role</dt><dd>{employee.role}</dd></div>
          <div className="employee-card__email"><dt>Email address</dt><dd><a href={`mailto:${employee.email}`}>{employee.email}</a></dd></div>
        </dl>
        <footer className="employee-card__footer">
          <div><p className="employee-card__label">Employee ID</p><p className="employee-card__id">{employee.employeeId}</p></div>
          <span className="employee-card__stamp" aria-hidden="true">GS</span>
        </footer>
      </article>
    </ReflectiveCard>
  )
}
