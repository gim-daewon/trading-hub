import type { Metadata, Viewport } from 'next'
import './globals.css'
import BottomNav from './components/BottomNav'

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
        <main style={{ paddingBottom: '72px', minHeight: '100dvh' }}>
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  )
}
