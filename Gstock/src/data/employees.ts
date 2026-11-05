import type { EmployeeProfile } from '../types/employees'

export const demoEmployee: EmployeeProfile = {
  id: 'user-demo-jamie',
  employeeId: 'GST-0012',
  fullName: 'Jamie Mokoena',
  department: 'Operations',
  role: 'Inventory coordinator',
  email: 'jamie.mokoena@example.com',
}

export const demoEmployees: EmployeeProfile[] = [
  demoEmployee,
  {
    id: 'user-demo-lerato', employeeId: 'GST-0001', fullName: 'Lerato Dlamini',
    department: 'Operations', role: 'Manager', email: 'lerato.dlamini@example.com',
  },
  {
    id: 'user-demo-sipho', employeeId: 'GST-0018', fullName: 'Sipho Nkosi',
    department: 'Warehouse', role: 'Stock controller', email: 'sipho.nkosi@example.com',
  },
  {
    id: 'user-demo-amina', employeeId: 'GST-0024', fullName: 'Amina Patel',
    department: 'Sales', role: 'Order coordinator', email: 'amina.patel@example.com',
  },
]
