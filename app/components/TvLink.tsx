'use client'
import { useEffect, useState } from 'react'
import { tvUrl, getLayoutId, setLayoutId, extractLayoutId } from '@/lib/tradingview'

/**
 * 티커를 누르면 트레이딩뷰 차트로 이동.
 * 클릭 가능한 행·카드 안에 중첩되는 경우가 많아 이벤트 전파를 막는다
 * (안 막으면 섹터 테이블 행을 눌렀을 때 바텀시트까지 같이 열린다).
 */
export function TvLink({ symbol, children, style }: {
  symbol: string
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  const [id, setId] = useState('')
  useEffect(() => { setId(getLayoutId()) }, [])

  return (
    <a
      href={tvUrl(symbol, id)}
      target="_blank"
      rel="noopener noreferrer"
      title={`트레이딩뷰에서 ${symbol} 보기`}
      onClick={e => e.stopPropagation()}
      style={{
        color: 'inherit', textDecoration: 'none',
        borderBottom: '1px dotted var(--text-muted)',
        ...style,
      }}
    >
      {children ?? symbol}
    </a>
  )
}

/** 본인 차트 레이아웃 ID 설정 — 저장하면 그 차트로 열린다 */
export function TvLayoutSetting() {
  const [id, setIdState] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { const v = getLayoutId(); setIdState(v); setDraft(v) }, [])

  const save = () => {
    if (draft.trim() && !extractLayoutId(draft)) {
      setErr('차트 URL 또는 ID를 붙여넣어 주세요')
      return
    }
    setLayoutId(draft)
    const v = getLayoutId()
    setIdState(v); setDraft(v); setEditing(false); setErr('')
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: 11, color: 'var(--info)', minHeight: 32,
      }}>
        {id ? `내 차트 연결됨 (${id}) · 변경` : '내 트레이딩뷰 차트 연결'}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        트레이딩뷰에서 쓰던 차트를 열고 주소창의 URL을 통째로 붙여넣으세요.<br />
        예: tradingview.com/chart/<b>aBcD1234</b>/?symbol=AAPL → 지표·그림이 그대로 있는 그 차트로 열립니다.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={e => { setDraft(e.target.value); setErr('') }}
          placeholder="차트 URL 붙여넣기 (비우면 기본 차트)"
          style={{
            flex: 1, minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: 13,
            background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)',
          }}
        />
        <button onClick={save} style={{
          minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none',
          background: 'var(--info)', color: '#fff', fontSize: 13, cursor: 'pointer',
        }}>저장</button>
        <button onClick={() => { setEditing(false); setErr('') }} style={{
          minHeight: 40, padding: '0 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
          background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
        }}>취소</button>
      </div>
      {err && <span style={{ fontSize: 11, color: 'var(--down)' }}>{err}</span>}
    </div>
  )
}
