'use client'
import { useEffect, useState } from 'react'
import { fmtPrice, type Market } from '@/lib/markets'
import { levelsFresh, type Level } from '@/lib/levels'
import type { LevelsOut } from '../api/levels/route'

/** 보이는 종목들의 가까운 지지·저항. 실패하면 빈 객체 — 목록은 그대로 보인다 */
export function useLevels(market: Market, symbols: string[]) {
  return useLevelsStatus(market, symbols).levels
}

/** useLevels + 지금 종목 목록의 요청이 끝났는지(성공·실패 모두). 끝났는데 비었으면 못 받은 것이다 */
export function useLevelsStatus(market: Market, symbols: string[]) {
  const [levels, setLevels] = useState<Record<string, LevelsOut>>({})
  const [doneKey, setDoneKey] = useState('')
  // 등락률순으로 바꿔도 다시 받지 않게 정렬한 키를 쓴다
  const key = [...symbols].sort().join(',')
  const reqKey = `${market}|${key}`
  useEffect(() => {
    if (!key) return
    let alive = true
    fetch(`/api/levels?market=${market}&symbols=${encodeURIComponent(key)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => { if (alive) setLevels(j.levels ?? {}) })
      .catch(e => console.error('[levels]', e))
      .finally(() => { if (alive) setDoneKey(reqKey) })
    return () => { alive = false }
  }, [market, key, reqKey])
  return { levels, done: doneKey === reqKey }
}

/** 공용 fmtPrice는 1 이상을 정수로 반올림해 $16.20 지지와 $16.40 저항이 둘 다 "16"이 된다 */
const LEVEL_DECIMALS_BELOW = 100
export const fmtLevel = (v: number, market: Market) =>
  v >= 1 && v < LEVEL_DECIMALS_BELOW ? v.toFixed(2) : fmtPrice(v, market)

function Part({ label, lv, market }: { label: string; lv: Level | null; market: Market }) {
  // 색을 칠하지 않는다 — 바로 위 손절(빨강)·익절(초록)과 뜻이 섞이고, 신호처럼 읽힌다
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {label}{' '}
      {lv ? (
        <span className="num" style={{ color: 'var(--text-secondary)' }}>
          {fmtLevel(lv.price, market)} ({lv.pct >= 0 ? '+' : ''}{lv.pct.toFixed(1)}%)
        </span>
      ) : <span>1년 안 없음</span>}
    </span>
  )
}

/**
 * 한 줄: "지지 98 (−3.1%) · 저항 105 (+4.2%)". 최근 1년 확정 꼭짓점 기준, 신호가 아니다.
 * 일봉이 스냅샷보다 오래됐으면(캐시가 옛 봉을 준 경우) 아무것도 안 그린다.
 */
export function LevelsLine({ lv, market, snapshotDate }: {
  lv?: LevelsOut; market: Market; snapshotDate?: string | null
}) {
  if (!lv || !levelsFresh(lv.barDate, snapshotDate ?? null)) return null
  return (
    <div
      title="최근 1년 일봉에서 좌우 5봉보다 높은 고점·낮은 저점 중 지금 가격에 가장 가까운 것. 매매 신호가 아니다"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}
    >
      <Part label="지지" lv={lv.support} market={market} />
      <Part label="저항" lv={lv.resistance} market={market} />
    </div>
  )
}
