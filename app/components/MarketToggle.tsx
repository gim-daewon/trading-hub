'use client'
import { useCallback, useEffect, useState } from 'react'
import { MARKET_IDS, MARKETS, isMarket, type Market } from '@/lib/markets'

const KEY = 'th.market'

/**
 * 시장 선택을 화면 사이에서 유지한다.
 *
 * 스크리너에서 한국을 보다가 VWMA 메뉴로 넘어갔는데 미국이 나오면
 * **다른 시장을 보면서 같은 시장이라고 착각하게 된다.** 그게 이 훅의 존재 이유다.
 *
 * localStorage는 브라우저마다 비어 있을 수 있고 접근 자체가 던지는 환경도 있다
 * (사생활 보호 모드 등). 실패하면 그냥 기본값을 쓴다.
 */
export function useMarket(): [Market, (m: Market) => void, boolean] {
  const [market, setMarketState] = useState<Market>('us')
  // 저장값을 읽기 전에 렌더하면 미국 데이터를 한 번 받았다가 다시 받는다.
  // 준비 여부를 알려 호출부가 첫 fetch를 미루게 한다
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY)
      if (isMarket(v)) setMarketState(v)
    } catch { /* 접근 불가면 기본값 */ }
    setReady(true)
  }, [])

  const setMarket = useCallback((m: Market) => {
    setMarketState(m)
    try { localStorage.setItem(KEY, m) } catch { /* 저장 못 해도 이번 세션은 동작한다 */ }
  }, [])

  return [market, setMarket, ready]
}

export function MarketToggle({ value, onChange }: { value: Market; onChange: (m: Market) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
      {MARKET_IDS.map(id => {
        const active = value === id
        const def = MARKETS[id]
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={def.universeNote}
            style={{
              flex: 1, minHeight: 40, borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: active ? 800 : 500, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            {def.short}
            {/* 규칙이 검증 안 된 시장은 버튼에서부터 표시한다.
                화면 안쪽에만 적어두면 놓친다 */}
            {!def.ruleValidated && (
              <span style={{ fontSize: 9, color: 'var(--warn)', fontWeight: 700 }}>미검증</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 초소형·시총 미상 구간을 볼지.
 *
 * 기본은 끈다. 한국은 거래대금 1억원 미만이 52%(1,325개)라 기본으로 켜두면
 * 호가 한 번에 몇 %씩 움직이는 종목이 목록을 채운다.
 * 없애지는 않는다 — "모든 종목"이 요구사항이다. 볼지 말지를 고르게 한다.
 */
export function MicroToggle({
  on, onChange, counts,
}: {
  on: boolean
  onChange: (v: boolean) => void
  counts: number
}) {
  if (counts <= 0) return null
  return (
    <button
      onClick={() => onChange(!on)}
      className={on ? 'pill pill-up' : 'pill'}
      style={{ cursor: 'pointer', border: 'none', fontSize: 10, marginBottom: 10 }}
    >
      초소형 포함 {on ? '켜짐' : '꺼짐'}
      <span className="num" style={{ marginLeft: 5, opacity: 0.75 }}>{counts.toLocaleString()}종목</span>
    </button>
  )
}
