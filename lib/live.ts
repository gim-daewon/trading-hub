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

/**
 * 한 번에 요청할 심볼 수 — **소스마다 상한이 다르다. 실측값이다.**
 *
 *   야후 spark  20까지. 25부터 400 "Number of symbols needs to be less than..."
 *   네이버      60까지 확인 (더 될 수도 있으나 URL 길이가 부담이라 50으로)
 *   업비트      287(전 마켓) 한 번에 됨
 *
 * 처음에 전부 40으로 잡았다가 **미국만 등락률이 안 떴다.** 40이면 야후가
 * 400을 주는데 그 응답이 {spark:{result:null,error:{...}}} 형태라
 * 심볼 하나짜리 객체로 훑고 넘어가 조용히 0개를 돌려줬다.
 * 상한을 안 재보고 정한 게 원인이다.
 */
const CHUNK_YAHOO = 20
const CHUNK_NAVER = 50
const CHUNK_UPBIT = 200

/** 배치 여러 개를 동시에. 순차로 하면 134종목에 7번 왕복이라 느리다 */
const POOL = 4
async function inPool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }))
  return out
}

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
  const pages = await inPool(chunk(symbols, CHUNK_YAHOO), part => fetchJson<
    Record<string, SparkEntry> & { spark?: { error?: { description?: string } } }
  >(
    `https://query1.finance.yahoo.com/v8/finance/spark` +
    `?symbols=${part.map(encodeURIComponent).join(',')}&range=1d&interval=5m`,
    { headers: { 'User-Agent': UA }, next: { revalidate: 30 } },
  ))
  for (const j of pages) {
    if (!j) continue
    // 야후는 실패해도 200이 아니라 400을 주는데 본문이 {spark:{error:...}} 형태다.
    // 이걸 심볼 목록처럼 훑으면 조용히 0개가 나온다 — 반드시 걸러내고 남긴다
    if (j.spark?.error) {
      console.error(`[live] 야후 spark 거부: ${j.spark.error.description ?? '이유 불명'}`)
      continue
    }
    for (const [sym, raw] of Object.entries(j)) {
      // 'spark' 키는 위에서 걸렀다. 나머지는 심볼별 항목이다
      if (sym === 'spark') continue
      const e = raw as SparkEntry
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

  const pages = await inPool(chunk(codes, CHUNK_NAVER), part =>
    fetchJson<{ datas?: NaverLive[]; pollingInterval?: number }>(
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${part.join(',')}`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.naver.com/' },
        next: { revalidate: 70 },
      },
    ))
  for (const j of pages) {
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

  for (const part of chunk(upbit, CHUNK_UPBIT)) {
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
  const r = market === 'us' ? await usLive(symbols)
    : market === 'kr' ? await krLive(symbols)
    : await cryptoLive(symbols)
  // 절반도 못 받았으면 조용히 넘어가지 않는다.
  // 미국 등락률이 안 뜬 걸 화면을 보고서야 알았다 — 로그에는 아무것도 없었다
  const got = Object.keys(r.quotes).length
  if (got < symbols.length * 0.5) {
    console.error(`[live] ${market}: ${symbols.length}개 요청했는데 ${got}개만 받았다`)
  }
  return r
}
