'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { NAV_SECTIONS } from '@/lib/registry'

export default function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const NavLinks = () => (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px' }}>
      {NAV_SECTIONS.map(item => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={() => setMobileOpen(false)}
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
              transition: 'background 120ms, color 120ms',
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>
              {item.icon}
            </span>
            <span>{item.label}</span>
            {isActive && (
              <span style={{
                marginLeft: 'auto', width: 4, height: 4,
                borderRadius: '50%', background: 'var(--info)', flexShrink: 0,
              }} />
            )}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 200,
        background: '#0d1420',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }} className="desktop-sidebar">
        {/* 로고 */}
        <div style={{
          padding: '20px 16px 12px',
          borderBottom: '1px solid var(--border)',
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Trading Hub
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
          </p>
        </div>

        <NavLinks />
      </aside>

      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setMobileOpen(v => !v)}
        className="mobile-menu-btn"
        aria-label="메뉴"
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 60,
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: '#00000088',
            zIndex: 50, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* 모바일 슬라이드 패널 */}
      <aside
        className="mobile-sidebar"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 220,
          background: '#0d1420',
          borderRight: '1px solid var(--border)',
          zIndex: 55,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 220ms var(--ease)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '56px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Trading Hub</p>
        </div>
        <NavLinks />
      </aside>

      <style>{`
        @media (min-width: 768px) {
          .mobile-menu-btn  { display: none !important; }
          .mobile-sidebar   { display: none !important; }
        }
        @media (max-width: 767px) {
          .desktop-sidebar  { display: none !important; }
        }
      `}</style>
    </>
  )
}
