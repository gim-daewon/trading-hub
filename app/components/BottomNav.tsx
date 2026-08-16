'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_SECTIONS } from '@/lib/registry'

export default function BottomNav() {
  const pathname = usePathname()

  // 모바일에서 5개, 데스크톱에서 전부 표시
  const mobileNav = NAV_SECTIONS.slice(0, 5)

  return (
    <nav className="bottom-nav">
      {mobileNav.map(item => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)
        return (
          <Link
            key={item.id}
            href={item.href}
            className={isActive ? 'active' : ''}
            aria-label={item.label}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
