'use client'
import { useEffect, useState } from 'react'
import {
  tvAnchor, tvUrl, getLayoutId, setLayoutId, extractLayoutId,
  getOpenInApp, setOpenInApp, platform,
} from '@/lib/tradingview'

/**
 * 티커를 누르면 트레이딩뷰 차트로 이동.
 *
 * 모바일에서는 앱으로 연다:
 *   Android — intent:// + browser_fallback_url (앱 없으면 브라우저로 자동 폴백)
 *   iOS     — 평범한 https. target="_blank"를 붙이면 Universal Link가 안 걸린다
 * 그래서 href와 target을 함께 계산해 받는다.
 *
 * 클릭 가능한 행·카드 안에 중첩되는 경우가 많아 이벤트 전파도 막는다
 * (안 막으면 섹터 테이블 행을 눌렀을 때 바텀시트까지 같이 열린다).
 */
export function TvLink({ symbol, children, style }: {
  symbol: string
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  // SSR에서는 navigator/localStorage가 없다. 우선 동작하는 웹 URL로 시작하고
  // 마운트 후 플랫폼·설정을 반영해 앱 링크로 교체한다 (href='#'로 두면 그 사이 클릭이 먹통)
  const [a, setA] = useState<{ href: string; target?: string }>(
    () => ({ href: tvUrl(symbol, ''), target: '_blank' })
  )

  useEffect(() => {
    setA(tvAnchor(symbol, getLayoutId(), getOpenInApp()))
  }, [symbol])

  return (
    <a
      href={a.href}
      target={a.target}
      rel={a.target ? 'noopener noreferrer' : undefined}
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

/** 트레이딩뷰 연결 설정 — 앱으로 열기 + 본인 차트 레이아웃 */
export function TvLayoutSetting() {
  const [id, setIdState] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [inApp, setInApp] = useState(true)
  const [plat, setPlat] = useState<'android' | 'ios' | 'other'>('other')

  useEffect(() => {
    const v = getLayoutId()
    setIdState(v); setDraft(v)
    setInApp(getOpenInApp())
    setPlat(platform())
  }, [])

  const toggleApp = () => {
    const next = !inApp
    setOpenInApp(next)
    setInApp(next)
  }

  const save = () => {
    if (draft.trim() && !extractLayoutId(draft)) {
      setErr('차트 URL 또는 ID를 붙여넣어 주세요')
      return
    }
    setLayoutId(draft)
    const v = getLayoutId()
    setIdState(v); setDraft(v); setEditing(false); setErr('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {plat !== 'other' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 32 }}>
          <input type="checkbox" checked={inApp} onChange={toggleApp} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            트레이딩뷰 앱으로 열기
            <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
              (앱이 없으면 웹으로 열립니다)
            </span>
          </span>
        </label>
      )}

      {!editing ? (
        <button onClick={() => setEditing(true)} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 11, color: 'var(--info)', minHeight: 32, textAlign: 'left',
        }}>
          {id ? `내 차트 연결됨 (${id}) · 변경` : '내 트레이딩뷰 차트 연결'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
      )}
    </div>
  )
}
