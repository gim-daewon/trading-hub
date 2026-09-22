'use client'
import { useEffect, useState } from 'react'
import { recentFetches, type FetchRec } from '@/lib/fetch-log'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  // 어느 화면에서, 직전에 무엇을 받아왔는지까지 같이 보여준다.
  // 메시지만 있으면 화면을 특정하는 데만 한참 걸린다 — 실제로 그랬다
  const [where, setWhere] = useState('')
  const [recent, setRecent] = useState<FetchRec[]>([])
  useEffect(() => {
    console.error(error)
    setWhere(location.pathname + location.search)
    setRecent(recentFetches())
  }, [error])

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 4px', color: 'var(--down)' }}>
        화면을 그리지 못했습니다
      </h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)' }}>
        아래 내용을 캡처해서 보내주세요. 원인 파악에 필요합니다.
      </p>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)' }}>메시지</p>
        <pre style={{
          margin: 0, fontSize: 12, lineHeight: 1.5,
          fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{error.message || '(메시지 없음)'}</pre>

        {error.digest && (
          <>
            <p style={{ margin: '12px 0 6px', fontSize: 11, color: 'var(--text-muted)' }}>digest</p>
            <pre style={{
              margin: 0, fontSize: 12, fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{error.digest}</pre>
          </>
        )}
      </div>

      {(where || recent.length > 0) && (
        <div className="card" style={{ padding: 14, marginBottom: 14, fontSize: 11 }}>
          <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>화면</p>
          <pre style={{
            margin: '0 0 12px', fontSize: 12, fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{where || '(주소 불명)'}</pre>

          {recent.length > 0 && (
            <>
              <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>직전 요청 (최근 순)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {recent.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}>
                    <span style={{
                      color: r.status >= 200 && r.status < 300 ? 'var(--up)' : 'var(--down)',
                      width: 28, flexShrink: 0,
                    }}>{r.status || 'ERR'}</span>
                    <span style={{ flex: 1, wordBreak: 'break-all' }}>{r.path}{r.note ? ` — ${r.note}` : ''}</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{r.ms}ms</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => retry()} style={{
          minHeight: 44, padding: '0 18px', borderRadius: 10,
          background: 'var(--info)', border: 'none', color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>다시 시도</button>
        <a href="/" style={{
          minHeight: 44, padding: '0 18px', borderRadius: 10,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', fontSize: 14,
          display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
        }}>홈으로</a>
      </div>
    </div>
  )
}
