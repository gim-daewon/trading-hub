'use client'
import { exitPrices, fmtPrice, MARKETS, type Market } from '@/lib/markets'

/**
 * 손절가·익절가.
 *
 * 진입가는 **마지막 종가**다. 실제 체결가가 아니다 — 그래서 화면에도 적는다.
 * 이걸 안 적으면 "이 가격에 살 수 있다"로 읽힌다.
 *
 * 유동성이 규칙 검증 구간 아래면 아무것도 안 띄운다. 한국 전 종목 기준으로
 * ATR 손절의 R 격자최소가 -9.2였고, 거래대금 10억원 이상으로 거르니
 * +0.141로 뒤집혔다. 검증 안 된 구간에 숫자를 띄우면 근거처럼 읽힌다.
 */
export function ExitPrices({ price, atr14, dollarVol, market, compact }: {
  price: number | null | undefined
  atr14: number | null | undefined
  dollarVol?: number | null
  market: Market
  /** 목록 안에서는 한 줄로, 상세에서는 두 줄로 */
  compact?: boolean
}) {
  const e = exitPrices(price, atr14, market, dollarVol)
  const def = MARKETS[market]

  if (!e) {
    // 왜 없는지를 구분해서 알린다. 그냥 비우면 버그처럼 보인다
    const why = price == null ? null
      : dollarVol != null && dollarVol < def.rule.minVol ? '유동성 부족 — 규칙 미검증 구간'
      : def.rule.kind === 'atr' ? 'ATR 미저장 — 다음 스캔에 채워진다'
      : null
    return why ? (
      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{why}</span>
    ) : null
  }

  const body = (
    <>
      <span style={{ color: 'var(--down)' }}>
        손절 <span className="num">{fmtPrice(e.stop, market)}</span>
        <span style={{ opacity: 0.7 }}> ({e.stopPct.toFixed(1)}%)</span>
      </span>
      <span style={{ color: 'var(--up)', marginLeft: compact ? 8 : 10 }}>
        익절 <span className="num">{fmtPrice(e.target, market)}</span>
        <span style={{ opacity: 0.7 }}> (+{e.targetPct.toFixed(1)}%)</span>
      </span>
    </>
  )

  if (compact) {
    return <div style={{ fontSize: 10, marginTop: 2, whiteSpace: 'nowrap' }}>{body}</div>
  }
  return (
    <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
      {body}
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
        {def.rule.label} · 종가 기준 {fmtPrice(price, market)}
        {!def.ruleValidated && <span style={{ color: 'var(--warn)' }}> · 이 시장에선 미검증</span>}
      </div>
    </div>
  )
}
