/**
 * 실시간 등락률.
 *
 * 스크리너 목록은 **마지막 종가 기준**으로 만들어진다. 그 뒤로 가격이 움직였는지
 * 보려면 별도 조회가 필요하다.
 *
 * 중요: 이건 "이미 늦었나"를 보는 값이지 진입 신호가 아니다.
 * 모든 백테스트가 종가 진입을 전제로 했다 — 장중 가격을 보고 들어가면
 * 검증한 것과 다른 매매가 된다. 화면에도 그렇게 적는다.
 */
import { fetchJson } from './fetch-retry'
import { binanceJson } from './binance'
import type { Market } from './markets'

export interface LiveQuote {
  /** 현재가 (장 마감 후에는 종가) */
  price: number
  /** 전일 종가 대비 등락률(%) */
  pct: number
}

export interface LiveResult {
  quotes: Record<string, LiveQuote>
  /** 장이 열려 있나. 마감 후 값을 '실시간'이라 부르면 거짓말이 된다 */
  open: boolean
  /** 데이터 소스가 권고하는 최소 조회 간격(ms). 없으면 0 */
  suggestedIntervalMs: number
  at: number
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** 한 번에 요청할 심볼 수. 너무 크면 URL이 길어지고 실패 시 전부 날아간다 */
const CHUNK = 40

const chunk = <T>(a: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

// ---------------------------------------------------------------- 미국

interface SparkEntry {
  symbol: string
  fulldayPrice?: number
  fulldayChangePercent?: number
  previousClose?: number
  chartPreviousClose?: number
  close?: (number | null)[]
  timestamp?: number[]
}

/**
 * 야후 spark — 배치로 현재가와 등락률을 한 번에 준다.
 *
 * v7/finance/quote(배치)는 2026-09 기준 401을 준다. 크럼·쿠키를 요구한다.
 * spark는 아직 열려 있고 `fulldayChangePercent`를 직접 줘서 계산이 필요 없다.
 *
 * chart 엔드포인트를 쓸 거면 `previousClose`가 아니라 `chartPreviousClose`를
 * 봐야 한다 — range=1d & interval=1d에서는 previousClose가 null이다.
 */
async function usLive(symbols: string[]): Promise<LiveResult> {
  const quotes: Record<string, LiveQuote> = {}
  let newest = 0
  for (const part of chunk(symbols, CHUNK)) {
    const j = await fetchJson<Record<string, SparkEntry>>(
      `https://query1.finance.yahoo.com/v8/finance/spark` +
      `?symbols=${part.map(encodeURIComponent).join(',')}&range=1d&interval=5m`,
      { headers: { 'User-Agent': UA }, next: { revalidate: 30 } },
    )
    if (!j) continue
    for (const [sym, e] of Object.entries(j)) {
      const prev = e.previousClose ?? e.chartPreviousClose
      const price = e.fulldayPrice ?? e.close?.filter(v => v != null).at(-1) ?? null
      if (price == null || !(prev! > 0)) continue
      quotes[sym] = {
        price,
        pct: e.fulldayChangePercent ?? ((price - prev!) / prev!) * 100,
      }
      const t = e.timestamp?.at(-1)
      if (t) newest = Math.max(newest, t * 1000)
    }
  }
  return {
    quotes,
    // 마지막 체결이 20분 안이면 장중으로 본다.
    // 정확한 개장 시간표 대신 데이터 자체로 판단한다 — 휴장일을 따로 관리할 필요가 없다
    open: newest > 0 && Date.now() - newest < 20 * 60 * 1000,
    suggestedIntervalMs: 0,
    at: Date.now(),
  }
}

// ---------------------------------------------------------------- 한국

interface NaverLive {
  itemCode: string
  closePriceRaw?: string
  fluctuationsRatioRaw?: string
  marketStatus?: string
}

/**
 * 네이버 실시간 폴링 엔드포인트.
 *
 * 응답에 `pollingInterval`(실측 70,000ms)이 들어 있다 — 소스가 스스로 권고하는
 * 간격이다. 그보다 자주 부르면 막힐 수 있으므로 그대로 돌려주고,
 * fetch 캐시도 그 값에 맞춰 잡는다. 화면은 30초마다 물어도
 * 실제 네이버 호출은 70초에 한 번이 된다.
 */
async function krLive(symbols: string[]): Promise<LiveResult> {
  // 우리 심볼은 '005930.KS' 형식이다. 네이버는 코드만 받는다
  const codes = symbols.map(s => s.replace(/\.(KS|KQ)$/i, ''))
  const byCode = new Map(codes.map((c, i) => [c, symbols[i]]))
  const quotes: Record<string, LiveQuote> = {}
  let open = false, interval = 70_000

  for (const part of chunk(codes, CHUNK)) {
    const j = await fetchJson<{ datas?: NaverLive[]; pollingInterval?: number }>(
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${part.join(',')}`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.naver.com/' },
        next: { revalidate: 70 },
      },
    )
    if (!j?.datas) continue
    if (j.pollingInterval) interval = j.pollingInterval
    for (const d of j.datas) {
      const price = Number(d.closePriceRaw)
      const pct = Number(d.fluctuationsRatioRaw)
      const key = byCode.get(d.itemCode)
      if (!key || !Number.isFinite(price) || !Number.isFinite(pct)) continue
      quotes[key] = { price, pct }
      if (d.marketStatus === 'OPEN') open = true
    }
  }
  return { quotes, open, suggestedIntervalMs: interval, at: Date.now() }
}

// ---------------------------------------------------------------- 크립토

/**
 * 바이낸스는 전 종목을 한 번에 준다 — 심볼 목록이 필요 없다.
 * 업비트 전용 코인만 따로 조회한다.
 *
 * 크립토는 24/7이라 open은 항상 true다.
 */
async function cryptoLive(symbols: string[]): Promise<LiveResult> {
  const quotes: Record<string, LiveQuote> = {}
  const want = new Set(symbols)
  const upbit = symbols.filter(s => s.startsWith('KRW-'))

  if (symbols.some(s => !s.startsWith('KRW-'))) {
    const t24 = await binanceJson<{ symbol: string; lastPrice: string; priceChangePercent: string }[]>(
      '/api/v3/ticker/24hr')
    for (const t of t24 ?? []) {
      if (!want.has(t.symbol)) continue
      const price = Number(t.lastPrice), pct = Number(t.priceChangePercent)
      if (Number.isFinite(price) && Number.isFinite(pct)) quotes[t.symbol] = { price, pct }
    }
  }

  for (const part of chunk(upbit, 90)) {
    const j = await fetchJson<{ market: string; trade_price: number; signed_change_rate: number }[]>(
      `https://api.upbit.com/v1/ticker?markets=${part.join(',')}`,
      { headers: { 'User-Agent': UA }, next: { revalidate: 30 } },
    )
    for (const t of j ?? []) {
      if (!Number.isFinite(t.trade_price)) continue
      quotes[t.market] = { price: t.trade_price, pct: (t.signed_change_rate ?? 0) * 100 }
    }
  }
  return { quotes, open: true, suggestedIntervalMs: 0, at: Date.now() }
}

// ----------------------------------------------------------------

export async function fetchLive(market: Market, symbols: string[]): Promise<LiveResult> {
  if (!symbols.length) return { quotes: {}, open: false, suggestedIntervalMs: 0, at: Date.now() }
  switch (market) {
    case 'us': return usLive(symbols)
    case 'kr': return krLive(symbols)
    case 'crypto': return cryptoLive(symbols)
  }
}
