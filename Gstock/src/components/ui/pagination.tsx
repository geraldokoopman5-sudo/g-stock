// Adapted from shadcn/ui's MIT-licensed Base UI pagination for this app's CSS theme.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/pagination.tsx
import type { ComponentProps } from 'react'
import './pagination.css'

const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(' ')

function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return <nav role="navigation" aria-label="Pagination" data-slot="pagination" className={classes('cn-pagination', className)} {...props} />
}

function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return <ul data-slot="pagination-content" className={classes('cn-pagination-content', className)} {...props} />
}

function PaginationItem(props: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = ComponentProps<'a'> & { isActive?: boolean; size?: 'icon' | 'default' }

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
  return <a aria-current={isActive ? 'page' : undefined} data-slot="pagination-link" data-active={isActive} data-size={size} className={classes('cn-pagination-link', className)} {...props} />
}

function PaginationPrevious({ className, text = 'Previous', ...props }: PaginationLinkProps & { text?: string }) {
  return <PaginationLink aria-label="Go to previous page" size="default" className={classes('cn-pagination-previous', className)} {...props}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    <span className="cn-pagination-previous-text">{text}</span>
  </PaginationLink>
}

function PaginationNext({ className, text = 'Next', ...props }: PaginationLinkProps & { text?: string }) {
  return <PaginationLink aria-label="Go to next page" size="default" className={classes('cn-pagination-next', className)} {...props}>
    <span className="cn-pagination-next-text">{text}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
  </PaginationLink>
}

function PaginationEllipsis({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-hidden="true" data-slot="pagination-ellipsis" className={classes('cn-pagination-ellipsis', className)} {...props}>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
    <span className="pagination-sr-only">More pages</span>
  </span>
}

export { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis }
