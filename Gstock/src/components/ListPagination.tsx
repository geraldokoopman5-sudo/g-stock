import { useId } from 'react'
import type { MouseEvent } from 'react'
import { getPageNumbers, pageSizes } from '../lib/pagination'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from './ui/pagination'

interface ListPaginationProps {
  page: number
  pageSize: number
  pageCount: number
  total: number
  start: number
  end: number
  label: string
  href: string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function ListPagination({ page, pageSize, pageCount, total, start, end, label, href, onPageChange, onPageSizeChange }: ListPaginationProps) {
  const id = useId()
  const goToPage = (event: MouseEvent<HTMLAnchorElement>, nextPage: number) => {
    event.preventDefault()
    if (nextPage >= 1 && nextPage <= pageCount && nextPage !== page) onPageChange(nextPage)
  }
  return (
    <div className="list-pagination">
      <p className="list-pagination__summary" role="status">{total ? `Showing ${start}–${end} of ${total} ${label}` : `0 ${label}`}</p>
      <div className="list-pagination__controls">
        <div className="list-pagination__size"><label htmlFor={id}>Per page</label><select id={id} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></div>
        <Pagination aria-label={`${label} pagination`}>
          <PaginationContent>
            <PaginationItem><PaginationPrevious href={href} aria-disabled={page === 1} tabIndex={page === 1 ? -1 : undefined} onClick={(event) => goToPage(event, page - 1)} /></PaginationItem>
            {getPageNumbers(page, pageCount).map((entry, index) => <PaginationItem key={typeof entry === 'number' ? entry : `gap-${index}`}>
              {entry === 'ellipsis' ? <PaginationEllipsis /> : <PaginationLink href={href} isActive={entry === page} aria-label={`Page ${entry}`} onClick={(event) => goToPage(event, entry)}>{entry}</PaginationLink>}
            </PaginationItem>)}
            <PaginationItem><PaginationNext href={href} aria-disabled={page === pageCount} tabIndex={page === pageCount ? -1 : undefined} onClick={(event) => goToPage(event, page + 1)} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
