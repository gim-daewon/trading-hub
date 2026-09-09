'use client'
import { TvLink } from './TvLink'
import type { Market } from '@/lib/markets'

/**
 * 티커 + 종목명.
 *
 * 한국 종목은 티커가 `005930`이라 그것만 보고는 무슨 회사인지 알 수 없다.
 * 크립토도 `1000SATS` 같은 건 이름이 있어야 읽힌다.
 * 미국은 티커가 곧 이름 역할을 하므로 이름이 티커와 같으면 생략한다.
 *
 * 링크는 TvLink가 시장에 맞는 트레이딩뷰 심볼로 바꿔준다
 * (005930.KS -> KRX:005930). 야후 형식을 그대로 보내면 "없는 종목"이 뜬다.
 *
 * **이름이 남는 폭을 전부 차지한다.** 좁은 칸에 넣으면 '에코프로비엠'이 '에.'로
 * 잘려 아무 정보가 안 된다 — 실제로 폰에서 그렇게 보였다. 부가 정보(시총 등)는
 * `trailing`으로 오른쪽 끝에 고정하고, 이름이 그 사이를 채운다.
 */
export function SymbolLabel({
  symbol, display, name, market, sub, trailing,
}: {
  /** 봉 조회 키 (005930.KS). 링크 변환에 쓴다 */
  symbol: string
  /** 화면용 짧은 이름 (005930). 없으면 symbol을 쓴다 */
  display?: string | null
  name?: string | null
  market: Market
  /** 아래 줄에 붙일 부가 정보 (섹터 등) */
  sub?: React.ReactNode
  /** 오른쪽 끝에 고정할 값 (시총 등) */
  trailing?: React.ReactNode
}) {
  const short = display || symbol
  // 이름이 티커와 같으면 (미국 대부분) 굳이 두 번 쓰지 않는다
  const showName = !!name && name !== short
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span className="num" style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
          <TvLink symbol={symbol} market={market}>{short}</TvLink>
        </span>
        {showName && (
          <span style={{
            fontSize: 11, color: 'var(--text-secondary)', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
        )}
        {trailing != null && (
          <span className="num" style={{
            fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
            marginLeft: showName ? 0 : 'auto',
          }}>
            {trailing}
          </span>
        )}
      </div>
      {sub && (
        <div style={{
          fontSize: 10, color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}
