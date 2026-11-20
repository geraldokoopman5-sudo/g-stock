import './BrandLogo.css'

interface BrandLogoProps {
  markOnly?: boolean
  decorative?: boolean
  className?: string
}

/** Scalable box, rising arrow and wordmark recreated from the supplied logo. */
export default function BrandLogo({ markOnly = false, decorative = false, className = '' }: BrandLogoProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={markOnly ? '0 0 96 96' : '0 0 258 96'}
      width={markOnly ? 96 : 258} height={96}
      className={`brand-logo${markOnly ? ' brand-logo--mark' : ''}${className ? ` ${className}` : ''}`}
      role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : 'G-Stock'}
      aria-hidden={decorative || undefined} focusable="false">
      <g>
        <path fill="var(--logo-top)" d="M6 28 40 8 74 28 65 33 40 19 30 25 55 39 40 48Z" />
        <path fill="var(--logo-left)" d="M6 28 40 48V88L6 68Z" />
        <path fill="var(--logo-right)" d="M20 36 28 41V54L20 49Z" />
        <path fill="var(--logo-right)" fillRule="evenodd" d="M40 48 74 28V68L40 88ZM40 56 67 40V51L52 60V67L67 58V65L40 81Z" />
        <path fill="var(--logo-arrow)" d="M40 42 56 33 64 38 78 22 73 20 87 17 84 31 81 26 65 44 56 39 40 48Z" />
      </g>
      {!markOnly && <text x="90" y="64" fontFamily="Arial, Helvetica, sans-serif" fontSize="43" fontWeight="700" letterSpacing="-1.8">
        <tspan fill="var(--logo-accent)">g</tspan><tspan fill="var(--logo-wordmark)">stock</tspan>
      </text>}
    </svg>
  )
}
