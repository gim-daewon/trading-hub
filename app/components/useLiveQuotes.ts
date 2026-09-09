'use client'
import { useEffect, useRef, useState } from 'react'
import type { Market } from '@/lib/markets'

export interface LiveQuote { price: number; pct: number }

export interface LiveState {
  quotes: Record<string, LiveQuote>
  /** 장이 열려 있나. 마감 후 값을 '실시간'이라 부르면 거짓말이 된다 */
  open: boolean
  at: number
  loading: boolean
}

const DEFAULT_MS = 30_000

/**
 * 보이는 종목의 실시간 등락률을 주기적으로 받아온다.
 *
 * 몇 가지를 일부러 지킨다:
 *
 * - **보이는 것만 요청한다.** 전 종목을 물으면 소스에 부담이고 대부분 안 쓴다.
 * - **소스가 권고하는 간격을 존중한다.** 네이버는 응답에 pollingInterval(70초)을
 *   담아 보낸다. 화면은 30초로 두되 그보다 길게 권고하면 그쪽을 따른다.
 * - **탭이 숨겨져 있으면 멈춘다.** 폰에서 백그라운드로 두면 계속 때릴 이유가 없다.
 * - **응답 순서를 보장한다.** 늦게 온 옛 응답이 새 응답을 덮어쓰면 값이 뒤로 간다.
 */
export function useLiveQuotes(market: Market, symbols: string[]): LiveState {
  const [state, setState] = useState<LiveState>({
    quotes: {}, open: false, at: 0, loading: false,
  })
  // 심볼 배열은 매 렌더 새로 만들어진다. 내용이 같으면 다시 안 부르게 문자열로 비교한다
  const key = symbols.join(',')
  const seq = useRef(0)

  useEffect(() => {
    if (!key) {
      setState({ quotes: {}, open: false, at: 0, loading: false })
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(tick, DEFAULT_MS)
        return
      }
      const mine = ++seq.current
      setState(s => ({ ...s, loading: true }))
      let nextMs = DEFAULT_MS
      try {
        const r = await fetch(`/api/live?market=${market}&symbols=${encodeURIComponent(key)}`)
        const j = await r.json()
        // 늦게 도착한 옛 요청은 버린다
        if (!cancelled && mine === seq.current) {
          setState({
            quotes: j.quotes ?? {},
            open: !!j.open,
            at: j.at ?? Date.now(),
            loading: false,
          })
        }
        nextMs = Math.max(DEFAULT_MS, Number(j.suggestedIntervalMs) || 0)
      } catch {
        // 실시간이 안 되는 건 화면을 멈출 이유가 아니다. 다음 주기에 다시 시도한다
        if (!cancelled && mine === seq.current) setState(s => ({ ...s, loading: false }))
      }
      if (!cancelled) timer = setTimeout(tick, nextMs)
    }

    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [market, key])

  return state
}
