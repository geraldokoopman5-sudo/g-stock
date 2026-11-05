export const pageSizes = [10, 20, 50, 100] as const
export const defaultPageSize = 20

export function paginate<T>(items: readonly T[], requestedPage: number, requestedSize: number) {
  const pageSize = pageSizes.some((size) => size === requestedSize) ? requestedSize : defaultPageSize
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1))
  const offset = (page - 1) * pageSize
  return { page, pageSize, pageCount, total: items.length, start: items.length ? offset + 1 : 0, end: Math.min(offset + pageSize, items.length), items: items.slice(offset, offset + pageSize) }
}

export function getPageNumbers(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const start = Math.max(2, Math.min(page - 1, pageCount - 4))
  const end = Math.min(pageCount - 1, Math.max(page + 1, 5))
  return [1, ...(start > 2 ? ['ellipsis' as const] : []), ...Array.from({ length: end - start + 1 }, (_, index) => start + index), ...(end < pageCount - 1 ? ['ellipsis' as const] : []), pageCount]
}
