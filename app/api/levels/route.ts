import { NextResponse } from 'next/server'
import { isMarket, type Market } from '@/lib/markets'
import { fetchBarsFor } from '@/lib/bars'
import { pool } from '@/lib/fetch-retry'
import { 신선캐시 } from '@/lib/fresh-cache'
import { nearestLevels, type Levels } from '@/lib/levels'

/**
 * 화면에 보이는 종목의 가까운 지지·저항(lib/levels.ts). 정보 표시용이다.
 *
 * barDate(마지막 일봉 날짜)를 같이 준다. 야후 일봉은 Next 캐시를 거쳐 옛 봉이 올 수 있어
 * 화면이 스냅샷 날짜와 비교해 오래된 값은 숨긴다(levelsFresh).
 */
export const dynamic = 'force-dynamic'

const MAX_SYMBOLS = 80                 // 화면 한 번에 그리는 후보(구간당 25 × 3)보다 넉넉히
const CACHE_MS = 3 * 60 * 60 * 1000    // 일봉 기준이라 하루 안에 거의 안 바뀐다

export interface LevelsOut extends Levels { barDate: string }
const 캐시 = 신선캐시<LevelsOut>(CACHE_MS)

/** 크립토는 업비트(KRW-BTC)와 바이낸스(BTCUSDT) 기호가 섞여 있다 */
function sourceOf(market: Market, symbol: string) {
  if (market !== 'crypto') return 'yahoo' as const
  return symbol.startsWith('KRW-') ? 'upbit' as const : 'binance' as const
}

async function levelsFor(market: Market, symbol: string): Promise<LevelsOut | null> {
  const bars = await fetchBarsFor({ symbol, source: sourceOf(market, symbol) }, '1y')
  // 고가·저가 없는 봉이 섞이면 꼭짓점이 틀린다. 빼고 계산한다
  const ok = (bars ?? []).filter(b => b.h != null && b.l != null)
    .map(b => ({ t: b.t, h: b.h as number, l: b.l as number, c: b.c }))
  if (ok.length < 30) return null
  return { ...nearestLevels(ok), barDate: new Date(ok[ok.length - 1].t * 1000).toISOString().slice(0, 10) }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const raw = url.searchParams.get('market') ?? 'us'
  const market: Market = isMarket(raw) ? raw : 'us'
  const symbols = [...new Set((url.searchParams.get('symbols') ?? '')
    .split(',').map(s => s.trim()).filter(s => /^[A-Za-z0-9.\-^=]{1,20}$/.test(s)))].slice(0, MAX_SYMBOLS)

  const levels: Record<string, LevelsOut> = {}
  let failed = 0
  await pool(symbols, async s => {
    try {
      const v = await 캐시.가져오기(`${market}:${s}`, () => levelsFor(market, s))
      if (v) levels[s] = v; else failed++
    } catch (e) {
      // 한 종목 실패가 목록 전체를 막으면 안 된다. 세어서 같이 알려 준다
      console.error('[levels]', s, e)
      failed++
    }
  }, 8)
  return NextResponse.json({ levels, failed, at: Date.now() })
}
