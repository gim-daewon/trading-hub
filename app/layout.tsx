import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar'
import FetchLog from './components/FetchLog'
import BottomNav from './components/BottomNav'

export const metadata: Metadata = {
  title: 'Trading Hub',
  description: '개인 트레이딩 커맨드 센터',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Trading Hub',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e1a',
  viewportFit: 'cover',  // env(safe-area-inset-*) 동작에 필요
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <FetchLog />
        <Sidebar />
        {/* 데스크톱: 사이드바 너비만큼 밀기 / 모바일: 하단 네비 높이만큼 여백 */}
        <main style={{
          marginRight: 'var(--sidebar-w, 0)',
          paddingBottom: 'var(--nav-h)',
          minHeight: '100dvh',
        }}>
          {children}
        </main>
        <BottomNav />
        <style>{`
          @media (min-width: 768px) {
            :root { --sidebar-w: 200px; }
          }
        `}</style>
      </body>
    </html>
  )
}
