'use client'
import type { Market } from '@/lib/markets'
import type { LiveQuote } from './useLiveQuotes'

/**
 * 실시간 등락률 배지.
 *
 * 기준점이 시장마다 다르다 — 이걸 구분해 적지 않으면 전부 '전일 대비'로 읽힌다.
 *
 *   미국·한국  전일 종가 대비. 스캔이 마감 후 그 종가로 돌므로
 *              **스캔 시점 대비와 같은 값**이다.
 *   크립토     바이낸스는 **24시간 롤링**이라 UTC 자정 기준이 아니다.
 *              스캔은 완성된 전일 봉을 쓰므로 기준점이 어긋난다.
 *
 * 스캔이 하루 실패하면 미국·한국도 어긋난다 — 그때는 bar_date가 이틀 전이 된다.
 */
/**
 * 실시간 등락률이 진입 신호로 읽히는 걸 막는 문구.
 *
 * 목록 위에 한 번 띄운다. 큰 숫자가 뜨면(어느 날 +9.6%) 따라 들어가고 싶어지는데,
 * **모든 백테스트가 종가 진입 전제였다.** 장중 가격을 보고 들어가면
 * 측정한 것과 다른 매매가 된다.
 */
export function LiveCaveat() {
  return (
    <p style={{
      margin: '0 0 10px', fontSize: 10, lineHeight: 1.6, color: 'var(--text-muted)',
    }}>
      등락률은 <b>실시간</b>이고 신호는 <b>종가 기준</b>이다.
      {' '}검증은 전부 종가 진입으로 했으므로, 장중에 보이는 등락률은
      {' '}<b style={{ color: 'var(--warn)' }}>“이미 늦었나”를 보는 값</b>이지 진입 신호가 아니다.
    </p>
  )
}

export function LivePct({ live, market }: { live?: LiveQuote; market: Market }) {
  if (!live) return null
  const rolling = market === 'crypto'
  return (
    <span
      className={live.pct >= 0 ? 'up' : 'down'}
      style={{ fontWeight: 700, fontSize: 11 }}
      title={rolling
        ? '최근 24시간 변동 (바이낸스 롤링 기준). 스캔의 전일 종가와 기준점이 다르다'
        : '전일 종가 대비. 스캔이 그 종가로 돌았으므로 스캔 시점 대비와 같다'}
    >
      {live.pct >= 0 ? '+' : ''}{live.pct.toFixed(1)}%
      {rolling && <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 2 }}>24h</span>}
    </span>
  )
}
