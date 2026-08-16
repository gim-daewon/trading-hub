import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar'

export const metadata: Metadata = {
  title: 'Trading Hub',
  description: '개인 트레이딩 커맨드 센터',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e1a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Sidebar />
        {/* 데스크톱: 사이드바 너비만큼 밀기, 모바일: 그대로 */}
        <main style={{ marginLeft: 'var(--sidebar-w, 0)', minHeight: '100dvh', padding: '0' }}>
          {children}
        </main>
        <style>{`
          @media (min-width: 768px) {
            :root { --sidebar-w: 200px; }
          }
        `}</style>
      </body>
    </html>
  )
}
