'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAV_SECTIONS } from '@/lib/registry'

export default function Sidebar() {
  const pathname = usePathname()
  // SSR과 클라이언트의 시각이 달라 hydration mismatch가 나므로 마운트 후에만 렌더
  const [today, setToday] = useState('')

  useEffect(() => {
    setToday(new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }))
  }, [])

  return (
    <aside className="desktop-sidebar" style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 200,
      background: '#0d1420',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 40,
    }}>
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Trading Hub
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>{today}</p>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px' }}>
        {NAV_SECTIONS.map(item => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.id}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                opacity: item.soon ? 0.55 : 1,
                transition: 'background 120ms, color 120ms',
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.soon && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>준비중</span>
              )}
              {isActive && !item.soon && (
                <span style={{
                  marginLeft: 'auto', width: 4, height: 4,
                  borderRadius: '50%', background: 'var(--info)', flexShrink: 0,
                }} />
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
