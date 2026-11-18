/** Account shape for account creation and sign-in inputs. */
export interface User {
  id: string
  fullName: string
  email: string
  /** Write-only credential input; exclude from profile responses and storage. */
  password: string
}

export interface Employee extends User {
  employeeId: string
  department: string
  role: string
}

/** Only this password-free shape is used by the homepage and employee card. */
export type EmployeeProfile = Omit<Employee, 'password'>
export type UserCredentials = Pick<User, 'email' | 'password'>

export type EmployeeDetails = Pick<EmployeeProfile, 'employeeId' | 'department' | 'role' | 'email' | 'fullName'>
export type EmployeeUpdate = EmployeeDetails & { password?: string }
export type EmployeeField = keyof EmployeeDetails

export interface EmployeeChange {
  field: EmployeeField
  before: string
  after: string
}

export interface EmployeeEdit {
  id: string
  editedAt: string
  editedBy: Pick<EmployeeProfile, 'id' | 'employeeId' | 'fullName' | 'role'>
  changes: EmployeeChange[]
  passwordChanged?: boolean
}

export interface PasswordVerifier {
  algorithm: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  hash: string
}

export interface EmployeeAccount {
  profile: EmployeeProfile
  editHistory: EmployeeEdit[]
  passwordVerifier?: PasswordVerifier
}
