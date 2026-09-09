import { NextResponse } from 'next/server'
import { fetchLive } from '@/lib/live'
import { isMarket, type Market } from '@/lib/markets'

/**
 * 화면에 보이는 종목의 실시간 등락률.
 *
 * 스크리너 목록은 마지막 종가 기준이라 그 뒤 움직임이 안 보인다.
 * 이 응답은 "이미 늦었나"를 보는 용도다 — 진입 신호가 아니다.
 * 백테스트는 전부 종가 진입 전제였다.
 *
 * 캐시는 상류(lib/live.ts의 fetch)에서 소스별로 잡는다.
 * 라우트 자체는 매번 돌아야 새 심볼 조합을 처리할 수 있다.
 */
export const dynamic = 'force-dynamic'

/** 한 번에 물어볼 수 있는 심볼 수 상한. 화면이 한 번에 그리는 양보다 넉넉하다 */
const MAX_SYMBOLS = 120

export async function GET(req: Request) {
  const url = new URL(req.url)
  const raw = url.searchParams.get('market') ?? 'us'
  const market: Market = isMarket(raw) ? raw : 'us'
  const symbols = (url.searchParams.get('symbols') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS)

  if (!symbols.length) {
    return NextResponse.json({ quotes: {}, open: false, suggestedIntervalMs: 0, at: Date.now() })
  }

  try {
    return NextResponse.json(await fetchLive(market, symbols))
  } catch (e) {
    // 실시간 조회 실패가 화면 전체를 죽이면 안 된다.
    // 등락률만 안 보이고 나머지는 그대로 동작해야 한다
    console.error('[live] 조회 실패:', e)
    return NextResponse.json({
      quotes: {}, open: false, suggestedIntervalMs: 0, at: Date.now(),
      error: String(e),
    })
  }
}
