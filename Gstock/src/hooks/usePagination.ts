import { useState } from 'react'
import { defaultPageSize, paginate } from '../lib/pagination'

export function usePagination<T>(items: readonly T[], scope: string) {
  const [selection, setSelection] = useState({ scope, page: 1, pageSize: defaultPageSize })
  const result = paginate(items, selection.scope === scope ? selection.page : 1, selection.pageSize)
  // Filters start at page one. Data changes clamp the current page before anything renders.
  if (selection.scope !== scope || selection.page !== result.page) {
    setSelection({ ...selection, scope, page: result.page })
  }
  return {
    ...result,
    onPageChange: (page: number) => setSelection({ scope, page: paginate(items, page, selection.pageSize).page, pageSize: selection.pageSize }),
    onPageSizeChange: (pageSize: number) => setSelection({ scope, page: 1, pageSize: paginate(items, 1, pageSize).pageSize }),
  }
}
