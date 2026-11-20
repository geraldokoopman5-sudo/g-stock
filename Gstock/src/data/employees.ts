import type { EmployeeProfile } from '../types/employees'
import { JobTitle } from '../types/employees'

export const demoEmployee: EmployeeProfile = {
  id: 'user-demo-jamie',
  employeeId: 'GST-0012',
  fullName: 'Jamie Mokoena',
  role: JobTitle.Employee, accountRole: JobTitle.Employee, status: 'Active',
  email: 'jamie.mokoena@example.com',
}

export const demoEmployees: EmployeeProfile[] = [
  demoEmployee,
  {
    id: 'user-demo-lerato', employeeId: 'GST-0001', fullName: 'Lerato Dlamini',
    role: JobTitle.StaffManager, accountRole: JobTitle.StaffManager, status: 'Active', email: 'lerato.dlamini@example.com',
  },
  {
    id: 'user-demo-sipho', employeeId: 'GST-0018', fullName: 'Sipho Nkosi',
    role: JobTitle.StockManager, accountRole: JobTitle.StockManager, status: 'Active', email: 'sipho.nkosi@example.com',
  },
  {
    id: 'user-demo-amina', employeeId: 'GST-0024', fullName: 'Amina Patel',
    role: JobTitle.Employee, accountRole: JobTitle.Employee, status: 'Active', email: 'amina.patel@example.com',
  },
]
