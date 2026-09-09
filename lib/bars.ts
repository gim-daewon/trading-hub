/**
 * 시장별 일봉 수집.
 *
 * 미국·한국은 야후를 그대로 쓴다 (`lib/flow.ts`의 `fetchDatedBars`).
 * 크립토는 거래소에서 직접 받는다 — 야후는 코인 커버리지가 얕고
 * 거래량이 거래소 실거래와 다르다.
 *
 * 돌려주는 형태는 세 시장 동일하다 (`DatedBar`). 지표 계산 코드가
 * 시장을 몰라도 되게 하는 것이 이 파일의 존재 이유다.
 */
import { type DatedBar, fetchDatedBars } from './flow'
import { fetchJson } from './fetch-retry'
import { binanceJson } from './binance'
import type { UniverseRow } from './universe'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Accept: 'application/json' }

/** '2y' 같은 범위 표기를 봉 개수로. 크립토는 range 파라미터가 없어 개수로 받는다 */
function rangeToBars(range: string): number {
  const m = /^(\d+)(d|mo|y)$/.exec(range)
  if (!m) return 500
  const n = Number(m[1])
  // 크립토는 주말도 거래되므로 달력일 그대로다 (주식의 252/365 환산이 아니다)
  if (m[2] === 'd') return n
  if (m[2] === 'mo') return Math.ceil(n * 31)
  return Math.ceil(n * 366)
}

/**
 * 바이낸스 일봉. openTime을 봉 날짜로 쓴다 (UTC 자정 기준).
 *
 * 거래량은 **base 수량**을 쓴다 — `c * v`가 quote 거래대금(USDT)이 되어
 * 순자금 지표가 미국·한국과 같은 의미를 갖는다.
 */
async function binanceBars(symbol: string, want: number): Promise<DatedBar[] | null> {
  const out: DatedBar[] = []
  // 최신부터 거꾸로 받는다. limit 1000이 상한이라 필요하면 endTime으로 넘긴다
  let endTime: number | undefined
  for (let guard = 0; guard < 6 && out.length < want; guard++) {
    const q = new URLSearchParams({ symbol, interval: '1d', limit: '1000' })
    if (endTime) q.set('endTime', String(endTime))
    const k = await binanceJson<unknown[][]>(`/api/v3/klines?${q}`)
    if (!k?.length) break
    const page: DatedBar[] = []
    const now = Date.now()
    for (const row of k) {
      // 진행 중인 봉은 버린다.
      //
      // 크립토는 UTC 자정에 일봉이 바뀐다. 자정 직후에 스캔하면 마지막 봉이
      // 10분짜리 미완성 봉으로 오고, 그 거래량으로 VWMA를 계산하면 값이 깨진다.
      // 미국·한국은 마감 후 스캔이라 봉이 완성돼 있다. 크립토도 맞춘다.
      // row[6] = closeTime(ms). 미래면 아직 안 닫힌 봉이다
      if (Number(row[6]) > now) continue
      const t = Math.floor(Number(row[0]) / 1000)
      const c = Number(row[4]), v = Number(row[5]), l = Number(row[3])
      if (!Number.isFinite(t) || !Number.isFinite(c) || !Number.isFinite(v)) continue
      page.push({ t, c, v, l: Number.isFinite(l) ? l : undefined })
    }
    if (!page.length) break
    out.unshift(...page)
    if (k.length < 1000) break                  // 상장 시작점에 닿았다
    endTime = Number(k[0][0]) - 1
  }
  return out.length ? dedupeSort(out).slice(-want) : null
}

/**
 * 업비트 일봉. 최신순으로 오고 한 번에 200개가 상한이라 `to`로 넘긴다.
 *
 * 업비트만 상장된 코인에만 쓴다. 바이낸스에도 있으면 그쪽이 히스토리가
 * 훨씬 길어서(2017년~) 격자 20개 검증이 가능하다.
 */
async function upbitBars(market: string, want: number): Promise<DatedBar[] | null> {
  const out: DatedBar[] = []
  let to: string | undefined
  for (let guard = 0; guard < 12 && out.length < want; guard++) {
    const q = new URLSearchParams({ market, count: '200' })
    if (to) q.set('to', to)
    const j = await fetchJson<{
      candle_date_time_utc: string; trade_price: number
      low_price: number; candle_acc_trade_volume: number
    }[]>(`https://api.upbit.com/v1/candles/days?${q}`, { headers: H })
    if (!j?.length) break
    const page: DatedBar[] = []
    const today = new Date().toISOString().slice(0, 10)
    for (const c of j) {
      // 바이낸스와 같은 이유로 진행 중인 UTC 날짜는 버린다.
      // 업비트는 closeTime을 안 주므로 날짜를 직접 비교한다
      if (c.candle_date_time_utc.slice(0, 10) === today) continue
      const t = Math.floor(Date.parse(c.candle_date_time_utc + 'Z') / 1000)
      if (!Number.isFinite(t) || !Number.isFinite(c.trade_price)) continue
      page.push({ t, c: c.trade_price, v: c.candle_acc_trade_volume ?? 0, l: c.low_price })
    }
    if (!page.length) break
    // 응답이 최신순이므로 뒤집어 붙인다
    out.unshift(...page.reverse())
    if (j.length < 200) break
    to = j[j.length - 1].candle_date_time_utc
  }
  return out.length ? dedupeSort(out).slice(-want) : null
}

/**
 * 같은 날짜가 두 번 오는 경우가 있다 (페이지 경계). 중복을 지우고 시간순으로.
 *
 * 중복을 그냥 두면 VWMA 분모가 두 번 더해져 값이 조용히 틀린다.
 * 지표가 틀린 건 화면만 봐서는 절대 못 잡는다.
 */
function dedupeSort(bars: DatedBar[]): DatedBar[] {
  const byT = new Map<number, DatedBar>()
  for (const b of bars) byT.set(b.t, b)
  return [...byT.values()].sort((a, b) => a.t - b.t)
}

/** 시장·소스에 맞는 일봉. 실패하면 null (호출부가 그 종목을 건너뛴다) */
export async function fetchBarsFor(
  row: Pick<UniverseRow, 'symbol' | 'source'>, range = '2y',
): Promise<DatedBar[] | null> {
  switch (row.source) {
    case 'yahoo': return fetchDatedBars(row.symbol, range)
    case 'binance': return binanceBars(row.symbol, rangeToBars(range))
    case 'upbit': return upbitBars(row.symbol, rangeToBars(range))
  }
}

/**
 * 스테이블코인 2차 판정 — 목록으로 못 거른 것을 변동성으로 거른다.
 *
 * `lib/universe.ts`의 PEGGED 목록은 새 스테이블이 나오면 놓친다.
 * 봉을 받은 뒤 일간 변동폭 중앙값이 0.5% 미만이면 사실상 페그된 자산이다.
 * 가격이 안 움직이는 종목은 VWMA·순자금·볼린저가 전부 무의미하다.
 *
 * 임계값 0.5%의 근거: 실측 일중 변동폭 중앙값이 BTC 3.24% · SOL 5.74%였다.
 * 진짜 코인은 이 선에 걸리지 않는다.
 */
export function looksPegged(bars: DatedBar[]): boolean {
  const recent = bars.slice(-60)
  if (recent.length < 30) return false
  const moves: number[] = []
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].c
    if (prev > 0) moves.push(Math.abs((recent[i].c - prev) / prev) * 100)
  }
  if (moves.length < 20) return false
  moves.sort((a, b) => a - b)
  return moves[moves.length >> 1] < 0.5
}
