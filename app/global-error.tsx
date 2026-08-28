'use client'
import { useEffect } from 'react'

// 루트 레이아웃까지 죽는 경우의 최후 방어선.
// 이 화면은 globals.css를 불러오지 않으므로 CSS 변수를 쓸 수 없다 → 색을 직접 박는다.
const C = {
  base:   '#0a0e1a',
  card:   '#1a2235',
  border: '#1e293b',
  text:   '#f1f5f9',
  sub:    '#94a3b8',
  muted:  '#475569',
  down:   '#ef4444',
  info:   '#3b82f6',
}
const MONO = "ui-monospace, 'Cascadia Code', 'Fira Code', monospace"

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <html lang="ko">
      <body style={{
        margin: 0, background: C.base, color: C.text, colorScheme: 'dark',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minHeight: '100dvh',
      }}>
        <title>오류 · Trading Hub</title>
        <div style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 4px', color: C.down }}>
            앱을 시작하지 못했습니다
          </h1>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted }}>
            아래 내용을 캡처해서 보내주세요. 원인 파악에 필요합니다.
          </p>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, color: C.muted }}>메시지</p>
            <pre style={{
              margin: 0, fontSize: 12, lineHeight: 1.5, fontFamily: MONO, color: C.text,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{error.message || '(메시지 없음)'}</pre>

            {error.digest && (
              <>
                <p style={{ margin: '12px 0 6px', fontSize: 11, color: C.muted }}>digest</p>
                <pre style={{
                  margin: 0, fontSize: 12, fontFamily: MONO, color: C.sub,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>{error.digest}</pre>
              </>
            )}
          </div>

          <button onClick={() => retry()} style={{
            minHeight: 44, padding: '0 18px', borderRadius: 10,
            background: C.info, border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>다시 시도</button>
        </div>
      </body>
    </html>
  )
}
