'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PRIMARY_NAV, SECONDARY_NAV } from '@/lib/registry'

const NAV_H = 58

export default function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // 라우트가 바뀌면 시트를 닫는다
  useEffect(() => { setMoreOpen(false) }, [pathname])

  const isSecondaryActive = SECONDARY_NAV.some(i => pathname.startsWith(i.href))

  const tabStyle = (active: boolean) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: NAV_H,
    position: 'relative' as const,
    textDecoration: 'none',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: 0,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontWeight: active ? 700 : 400,
    transition: 'color 120ms',
  })

  return (
    <>
      <nav className="mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70,
        background: 'rgba(10,14,26,0.94)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {PRIMARY_NAV.map(item => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link key={item.id} href={item.href} aria-label={item.label} style={tabStyle(active)}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ fontSize: 11 }}>{item.label}</span>
              {active && (
                <span style={{
                  position: 'absolute', top: 0, width: 24, height: 2,
                  borderRadius: 1, background: 'var(--info)',
                }} />
              )}
            </Link>
          )
        })}

        <button
          onClick={() => setMoreOpen(v => !v)}
          aria-label="더보기"
          aria-expanded={moreOpen}
          style={tabStyle(moreOpen || isSecondaryActive)}
        >
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{moreOpen ? '✕' : '⋯'}</span>
          <span style={{ fontSize: 11 }}>더보기</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            className="mobile-only"
            style={{ position: 'fixed', inset: 0, background: '#00000088', backdropFilter: 'blur(2px)', zIndex: 68 }}
          />
          <div className="mobile-only" style={{
            position: 'fixed', left: 0, right: 0,
            bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))`,
            zIndex: 69,
            background: 'var(--bg-card)',
            borderTop: '1px solid var(--border)',
            borderRadius: '16px 16px 0 0',
            padding: '10px 12px 16px',
            animation: 'slideUp 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            {SECONDARY_NAV.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.id} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  minHeight: 48, padding: '0 12px', borderRadius: 10,
                  textDecoration: 'none', fontSize: 15,
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  opacity: item.soon ? 0.55 : 1,
                }}>
                  <span aria-hidden="true" style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.soon && (
                    <span className="pill pill-stale" style={{ marginLeft: 'auto' }}>준비중</span>
                  )}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
