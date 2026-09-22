/**
 * 시장별 종목 목록.
 *
 * 어댑터로 분리한 이유: 한국 유니버스가 **비공식 API**(네이버)다.
 * 막히면 스캔이 멈춘다. 공공데이터포털 키가 생기면 이 파일의
 * `krUniverse`만 갈아끼우면 되도록 경계를 여기서 끊는다.
 */
import { fetchJson, pool } from './fetch-retry'
import { binanceJson } from './binance'
import { type Market, type TierId, tierOf } from './markets'

/**
 * 크립토 시총 캐시.
 *
 * 코인게코 무료 티어 레이트리밋 때문에 시총 수집이 실측 123초 걸린다.
 * 시총은 하루 만에 구간이 바뀔 값이 아니므로(1천억/1조 경계) 캐시해두고
 * 주 1회만 갱신한다. 스캔이 그만큼 빨라진다.
 *
 * 구현은 호출부(스캔 스크립트)가 준다 — 이 파일이 Supabase를 알 필요가 없다.
 */
export interface CapSource {
  load(): Promise<{ caps: Map<string, number>; names: Map<string, string>; ageDays: number } | null>
  save(caps: Map<string, number>, names: Map<string, string>): Promise<void>
}

/** 이 일수를 넘으면 캐시를 버리고 다시 받는다 */
export const CAP_CACHE_DAYS = 7

export interface UniverseRow {
  /** 봉 조회에 쓰는 키. 시장마다 형식이 다르다 (AAPL / 005930.KS / BTCUSDT) */
  symbol: string
  /** 화면 표시용 짧은 이름 (BTCUSDT -> BTC) */
  display: string
  name: string
  sector: string | null
  /** 시총. 한국은 원, 미국·크립토는 USD */
  marketCap: number
  /** 일 거래대금. 통화는 marketCap과 같다 */
  dollarVol: number
  /** 시총 미상이면 'unknown'. 초소형으로 단정하지 않는다 */
  tier: TierId
  /** 시총을 실제로 알아냈나. false면 화면에 '미상'으로 표시한다 */
  capKnown: boolean
  /** 봉을 어디서 받아야 하는지 */
  source: 'yahoo' | 'binance' | 'upbit'
  /** 크립토 전용 — 업비트 원화가와 비교한 김치 프리미엄(%) */
  premium?: number | null
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const JSON_H = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' }
const num = (s: unknown) => parseFloat(String(s ?? '').replace(/[$,%]/g, '')) || 0

// ---------------------------------------------------------------- 미국

/**
 * 미국은 기존 필터를 그대로 둔다 ($5M 거래대금 / $500M 시총).
 * 2026-12-08 판정 표본이 이 유니버스로 쌓이고 있어서, 넓히면 표본의
 * 의미가 달라진다. 한국·크립토를 붙이는 것과는 별개 문제다.
 */
const US_MIN_DOLLAR_VOL = 5e6
const US_MIN_MARKET_CAP = 5e8

interface NasdaqRow {
  symbol: string; name: string; sector?: string
  /** 세부 업종. sector(11개)보다 훨씬 구체적이다 — 'Biotechnology: Laboratory Analytical Instruments' */
  industry?: string
  marketCap: string; lastsale: string; volume: string
}

async function usUniverse(): Promise<UniverseRow[]> {
  const j = await fetchJson<{ data?: { rows?: NasdaqRow[] } }>(
    'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true',
    { headers: { ...JSON_H, Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } },
  )
  const rows = j?.data?.rows ?? []
  const out: UniverseRow[] = []
  for (const r of rows) {
    // 우선주·워런트 등은 심볼에 ^ / 가 붙는다. 보통주만 남긴다
    if (!/^[A-Z]{1,5}$/.test(r.symbol)) continue
    const marketCap = num(r.marketCap)
    const dollarVol = num(r.lastsale) * num(r.volume)
    if (marketCap < US_MIN_MARKET_CAP || dollarVol < US_MIN_DOLLAR_VOL) continue
    const tier = tierOf(marketCap, 'us')
    if (!tier) continue
    out.push({
      symbol: r.symbol, display: r.symbol, name: r.name,
      // 섹터(11개)는 너무 넓어 "반도체인지 제약인지"가 안 보인다.
      // 나스닥이 세부 업종을 같이 주므로 그걸 쓰고, 없으면 섹터로 내려간다
      sector: r.industry || r.sector || null,
      marketCap, dollarVol, tier, capKnown: true, source: 'yahoo',
    })
  }
  return out
}

// ---------------------------------------------------------------- 한국

interface NaverStock {
  itemCode: string
  stockName: string
  /** 'stock' | 'etf' | 'etn' | ... — ETF·ETN을 이걸로 걸러낸다 */
  stockEndType?: string
  marketValueRaw?: string
  accumulatedTradingValueRaw?: string
  tradeStopType?: { name?: string }
  tradableStatus?: string
  /** code가 'KS'(코스피) / 'KQ'(코스닥) — 야후 접미사를 그대로 준다 */
  stockExchangeType?: { code?: string }
}

/**
 * 네이버 시총순 목록. 페이지당 100개, `totalCount`까지 넘긴다.
 *
 * 이름 패턴으로 ETF를 거르지 않는다 — 새 상품이 나올 때마다 깨진다.
 * `stockEndType === 'stock'` 으로 거른다. 실측으로 시총 최하위 40종목 중
 * 야후가 못 준 유일한 1건이 ETN이었다.
 */
async function krList(category: 'KOSPI' | 'KOSDAQ'): Promise<NaverStock[]> {
  const H = { ...JSON_H, Referer: 'https://m.stock.naver.com/' }
  const first = await fetchJson<{ stocks?: NaverStock[]; totalCount?: number }>(
    `https://m.stock.naver.com/api/stocks/marketValue/${category}?page=1&pageSize=100`, { headers: H })
  if (!first?.stocks?.length) return []
  const total = first.totalCount ?? first.stocks.length
  const pages = Math.min(Math.ceil(total / 100), 60)   // 폭주 방지 상한
  const rest = await pool(
    Array.from({ length: pages - 1 }, (_, i) => i + 2),
    async page => (await fetchJson<{ stocks?: NaverStock[] }>(
      `https://m.stock.naver.com/api/stocks/marketValue/${category}?page=${page}&pageSize=100`,
      { headers: H }))?.stocks ?? [],
    4,   // 비공식 API다. 얌전하게 부른다
  )
  return [...first.stocks, ...rest.flat()]
}

/**
 * 한국 업종(섹터) 맵 — 종목코드 -> 업종명.
 *
 * 시총순 목록에는 업종이 없다. 종목마다 따로 부르면 2,600번이라 못 쓴다.
 * 대신 **업종 그룹 목록**(79개)을 받고 그룹별 종목을 받는다 — 90번쯤이면 끝난다.
 *
 * 실패해도 스캔을 막지 않는다. 업종이 비면 화면이 시총만 보여줄 뿐이다.
 */
async function krIndustryMap(): Promise<Map<string, string>> {
  const H = { ...JSON_H, Referer: 'https://m.stock.naver.com/' }
  const map = new Map<string, string>()
  // pageSize=100이면 79개가 한 번에 온다. 2페이지는 응답이 비어 있다(실측)
  const groups = (await fetchJson<{ groups?: { no: number; name: string; totalCount: number }[] }>(
    'https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100', { headers: H }))?.groups ?? []
  if (!groups.length) {
    console.warn('[universe] 한국 업종 목록을 못 받았다. 업종 없이 진행한다')
    return map
  }
  await pool(groups, async g => {
    const pages = Math.min(Math.ceil((g.totalCount || 1) / 100), 5)
    for (let page = 1; page <= pages; page++) {
      const j = await fetchJson<{ stocks?: { itemCode: string }[] }>(
        `https://m.stock.naver.com/api/stocks/industry/${g.no}?page=${page}&pageSize=100`, { headers: H })
      for (const st of j?.stocks ?? []) {
        // 한 종목이 여러 그룹에 들어가면 먼저 본 것을 남긴다 (그룹은 등락률 순이라 순서가 매일 바뀐다 —
        // 그래서 덮어쓰면 같은 종목의 업종이 날마다 달라진다)
        if (st.itemCode && !map.has(st.itemCode)) map.set(st.itemCode, g.name)
      }
    }
  }, 4)   // 비공식 API다. 얌전하게 부른다
  return map
}

async function krUniverse(): Promise<UniverseRow[]> {
  const [kospi, kosdaq, industry] = await Promise.all([
    krList('KOSPI'), krList('KOSDAQ'), krIndustryMap(),
  ])
  const seen = new Set<string>()
  const out: UniverseRow[] = []
  for (const s of [...kospi, ...kosdaq]) {
    if (!s.itemCode || seen.has(s.itemCode)) continue
    // 주식만. ETF·ETN·리츠파생 등은 지표의 의미가 다르다
    if (s.stockEndType !== 'stock') continue
    if (s.tradeStopType?.name && s.tradeStopType.name !== 'TRADING') continue
    if (s.tradableStatus && s.tradableStatus !== 'tradable') continue
    const sfx = s.stockExchangeType?.code === 'KQ' ? 'KQ' : 'KS'
    const marketCap = num(s.marketValueRaw)
    const dollarVol = num(s.accumulatedTradingValueRaw)
    if (marketCap <= 0) continue
    // 시총 하한을 두지 않는다 — "모든 종목"이 요구사항이고 초소형 구간이 받는다.
    // 대신 유동성이 0인 종목은 지표가 무의미하므로 제외한다
    if (dollarVol <= 0) continue
    const tier = tierOf(marketCap, 'kr')
    if (!tier) continue
    seen.add(s.itemCode)
    out.push({
      symbol: `${s.itemCode}.${sfx}`, display: s.itemCode, name: s.stockName,
      sector: industry.get(s.itemCode) ?? null,
      marketCap, dollarVol, tier, capKnown: true, source: 'yahoo',
    })
  }
  return out
}

// ---------------------------------------------------------------- 크립토

/**
 * 스테이블코인·연동자산 제외.
 *
 * 실측으로 USDT($183B)가 대형에, USDS($9.8B)가 중형에 들어와 있었다.
 * 업비트에 KRW-USDT 마켓이 있어 base가 USDT가 되면서 필터를 빠져나갔다.
 * 가격이 안 움직이니 VWMA·순자금이 무의미하고 구간 통계를 오염시킨다.
 *
 * 금·유로 연동(XAUT·PAXG·EURC)도 뺀다 — 움직이긴 하지만 주식형 신호와
 * 성격이 달라 같은 규칙으로 재면 안 된다.
 *
 * 목록 방식은 새 스테이블이 나오면 놓친다. 봉을 받은 뒤 **변동성으로**
 * 한 번 더 거르는 게 근본 해법이다 (일간 변동폭 중앙값 0.5% 미만).
 * 그건 스캔 단계에서 한다 — 여기서는 헛되게 봉을 받는 걸 줄이는 1차 필터다.
 */
const PEGGED = new Set([
  'USDT', 'USDC', 'USDS', 'USDE', 'USD1', 'USDG', 'USDP', 'USDD', 'USDX', 'USDY',
  'FDUSD', 'TUSD', 'BUSD', 'DAI', 'PYUSD', 'RLUSD', 'BFUSD', 'GUSD', 'LUSD',
  'SUSD', 'CRVUSD', 'FRAX', 'XUSD', 'USTC', 'EUR', 'EURI', 'EURC', 'EURS', 'EURT',
  'XAUT', 'PAXG',
])
const isPegged = (base: string) => PEGGED.has(base.toUpperCase())

/**
 * 랩드·스테이킹 파생 제외.
 *
 * WBTC는 BTC와, WBETH·BNSOL은 각각 ETH·SOL과 사실상 동일하게 움직인다.
 * 남겨두면 같은 자산이 두 번 세어져 구간 통계와 상관 구조가 왜곡된다.
 * 레버리지 토큰을 뺀 것과 같은 이유다.
 *
 * 실측으로 이들이 '시총 미상' 52개의 상당수였다 — 코인게코가 랩드 토큰을
 * 기본 시총 순위에서 빼기 때문이다. 미상으로 남기는 것보다 빼는 게 정직하다.
 */
const DERIVATIVE = new Set([
  'WBTC', 'BTCB', 'SOLVBTC', 'TBTC', 'CBBTC',
  'WETH', 'WBETH', 'STETH', 'WSTETH', 'CBETH', 'RETH', 'EZETH', 'WEETH', 'METH',
  'BNSOL', 'JITOSOL', 'MSOL', 'JUPSOL',
])
const isDerivative = (base: string) => DERIVATIVE.has(base.toUpperCase())

interface BinanceSymbol {
  symbol: string; baseAsset: string; quoteAsset: string
  status: string; isSpotTradingAllowed: boolean
}
interface CgCoin { symbol: string; name: string; market_cap: number | null }
interface CgResult { caps: Map<string, number>; names: Map<string, string> }

/**
 * 바이낸스 USDT 현물 + 업비트 KRW 마켓의 합집합.
 *
 * 둘 다 있는 코인은 **바이낸스**로 받는다 — 2017년부터 히스토리가 있어
 * 격자 20개 검증이 가능하다. 업비트만 있는 코인은 업비트로 받는다.
 *
 * 시총은 코인게코에서 심볼로 맞춘다. 심볼 충돌(같은 티커의 다른 코인)이
 * 있으므로 **시총이 큰 쪽**을 택한다. 완벽하지 않다 — 소형 코인에서
 * 엉뚱한 시총이 붙을 수 있고, 그래서 구간이 틀릴 수 있다.
 */
async function cryptoUniverse(capSource?: CapSource): Promise<UniverseRow[]> {
  const [ei, t24, upMarkets, cg] = await Promise.all([
    binanceJson<{ symbols?: BinanceSymbol[] }>('/api/v3/exchangeInfo'),
    binanceJson<{ symbol: string; quoteVolume: string; lastPrice: string }[]>('/api/v3/ticker/24hr'),
    fetchJson<{ market: string; korean_name: string; english_name: string }[]>('https://api.upbit.com/v1/market/all?isDetails=false', { headers: JSON_H }),
    cachedCaps(capSource),
  ])
  const { caps: cgCaps, names: cgNames } = cg

  const vol = new Map((t24 ?? []).map(x => [x.symbol, num(x.quoteVolume)]))
  const price = new Map((t24 ?? []).map(x => [x.symbol, num(x.lastPrice)]))

  const bn = (ei?.symbols ?? []).filter(s =>
    s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed
    // 레버리지 토큰은 원주와 움직임이 비례하지 않는다. 지표가 무의미하다
    && !/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset)
    && !isPegged(s.baseAsset) && !isDerivative(s.baseAsset))

  // 바이낸스가 막히면 업비트만 남아 유니버스가 절반으로 준다.
  // 조용히 넘어가면 '크립토 전 종목'이라고 표시하면서 절반만 보여주게 된다
  if (!ei?.symbols?.length) {
    throw new Error('바이낸스 exchangeInfo를 받지 못했다. 지역 차단(451)일 수 있다 — 업비트만으로는 유니버스가 반쪽이다')
  }

  const upKrw = (upMarkets ?? []).filter(m => m.market.startsWith('KRW-'))
  // 업비트 시세는 마켓을 확정한 뒤 한 번에 받는다 (쿼리 길이 때문에 나눠서)
  const upVol = new Map<string, number>(), upPrice = new Map<string, number>()
  for (let i = 0; i < upKrw.length; i += 90) {
    const chunk = upKrw.slice(i, i + 90).map(m => m.market)
    const t = await fetchJson<{ market: string; trade_price: number; acc_trade_price_24h: number }[]>(
      `https://api.upbit.com/v1/ticker?markets=${chunk.join(',')}`, { headers: JSON_H })
    for (const x of t ?? []) { upVol.set(x.market, x.acc_trade_price_24h); upPrice.set(x.market, x.trade_price) }
  }
  const usdkrw = await usdKrwRate()

  // 1차 조회에서 빠진 심볼을 먼저 채운다 — 구간을 나누기 전에 해야 한다
  const bases = [...new Set([...bn.map(s => s.baseAsset), ...upKrw.map(m => m.market.slice(4))])]
  const missing = bases.filter(b => capOf(cgCaps, b) <= 0)
  if (missing.length) {
    console.error(`[coingecko] 심볼로 못 찾은 ${missing.length}개 2차 조회: ${missing.slice(0, 10).join(' ')}...`)
    await resolveMissingCaps(missing, cgCaps, cgNames)
  }

  const out: UniverseRow[] = []
  const done = new Set<string>()

  for (const s of bn) {
    const base = s.baseAsset
    const cap = capOf(cgCaps, base)
    const tier = tierOf(cap, 'crypto') ?? 'unknown'
    // 김치 프리미엄 — 같은 코인이 업비트에도 있을 때만
    const upM = `KRW-${base}`
    const bp = price.get(s.symbol) ?? 0, up = upPrice.get(upM) ?? 0
    const premium = bp > 0 && up > 0 && usdkrw > 0 ? ((up / (bp * usdkrw)) - 1) * 100 : null
    done.add(base)
    out.push({
      symbol: s.symbol, display: base, name: cgNames.get(base) ?? base,
      sector: null, marketCap: cap, dollarVol: vol.get(s.symbol) ?? 0,
      tier, capKnown: cap > 0, source: 'binance', premium,
    })
  }

  // 업비트에만 있는 코인 — 원화 거래대금을 USD로 환산해 축을 맞춘다
  for (const m of upKrw) {
    const base = m.market.slice(4)
    if (done.has(base) || isPegged(base) || isDerivative(base)) continue
    const cap = capOf(cgCaps, base)
    const tier = tierOf(cap, 'crypto') ?? 'unknown'
    out.push({
      symbol: m.market, display: base, name: m.english_name || base,
      sector: null, marketCap: cap,
      dollarVol: usdkrw > 0 ? (upVol.get(m.market) ?? 0) / usdkrw : 0,
      tier, capKnown: cap > 0, source: 'upbit', premium: null,
    })
  }
  return out
}

/**
 * 코인게코 시총 — 키 없이 250개/페이지.
 *
 * 4페이지(1,000개)로는 부족했다. 실측으로 171종목이 시총 미상으로 남았다
 * (FTT·DUSK·OGN, 팬토큰 JUV·PSG 등). 10페이지(2,500개)로 늘린다.
 * 무료 티어 레이트리밋이 있어 페이지 간 간격을 둔다.
 */
async function coingeckoCaps(): Promise<CgResult> {
  const caps = new Map<string, number>(), names = new Map<string, string>()
  let failed = 0, empty = 0
  for (let page = 1; page <= 10; page++) {
    const j = await fetchJson<CgCoin[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
      { headers: JSON_H }, { tries: 3, baseDelayMs: 2000 })
    // 실패한 페이지에서 루프를 끊으면 안 된다.
    //
    // 처음엔 `if (!j?.length) break` 였는데, 429 하나에 뒤 페이지가 통째로
    // 빠져서 WBTC·WBETH 같은 상위 코인이 '시총 미상'으로 떨어졌다.
    // 지난번 페이지네이션 사고(1,000행만 받고 조용히 폴백)와 같은 종류다.
    if (j == null) { failed++; continue }
    if (!j.length) { empty++; continue }
    for (const c of j) {
      const sym = String(c.symbol || '').toUpperCase()
      const cap = c.market_cap ?? 0
      // 심볼 충돌 — 시총이 큰 쪽을 남긴다
      if (cap > (caps.get(sym) ?? 0)) { caps.set(sym, cap); names.set(sym, c.name) }
    }
  }
  if (failed) console.error(`[coingecko] ${failed}페이지 실패 — 그만큼 시총 미상이 늘어난다`)
  console.error(`[coingecko] 시총 ${caps.size}개 확보 (빈 페이지 ${empty})`)
  return { caps, names }
}

/**
 * 캐시가 신선하면 그걸 쓰고, 아니면 코인게코에서 받아 저장한다.
 *
 * 캐시 조회 자체가 실패하면 그냥 받는다 — 캐시는 최적화이지
 * 정확성의 근거가 아니다. 여기서 던지면 스캔 전체가 멈춘다.
 */
async function cachedCaps(src?: CapSource): Promise<CgResult> {
  if (src) {
    try {
      const hit = await src.load()
      if (hit && hit.caps.size > 0 && hit.ageDays < CAP_CACHE_DAYS) {
        console.error(`[coingecko] 캐시 사용 — ${hit.caps.size}개 · ${hit.ageDays.toFixed(1)}일 전`)
        return { caps: hit.caps, names: hit.names }
      }
    } catch (e) {
      console.error('[coingecko] 캐시 조회 실패 — 새로 받는다:', e instanceof Error ? e.message : e)
    }
  }
  const fresh = await coingeckoCaps()
  if (src && fresh.caps.size > 0) {
    try { await src.save(fresh.caps, fresh.names) } catch (e) {
      console.error('[coingecko] 캐시 저장 실패:', e instanceof Error ? e.message : e)
    }
  }
  return fresh
}

/**
 * 1차 조회에서 못 찾은 심볼을 /coins/list 로 보완한다.
 *
 * 코인게코 심볼이 거래소와 다른 경우가 있다 (BTTC→BTT, RONIN→RON, BEAMX→BEAM).
 * 전체 코인 목록에서 id를 찾아 시총을 다시 받는다.
 * 목록 1회 + 누락분 조회 1~2회면 끝난다.
 */
async function resolveMissingCaps(
  missing: string[], caps: Map<string, number>, names: Map<string, string>,
): Promise<void> {
  if (!missing.length) return
  const list = await fetchJson<{ id: string; symbol: string; name: string }[]>(
    'https://api.coingecko.com/api/v3/coins/list', { headers: JSON_H }, { tries: 3, baseDelayMs: 2000 })
  if (!list?.length) { console.error('[coingecko] coins/list 실패 — 시총 미상이 남는다'); return }
  // 심볼 -> id 후보. 같은 심볼에 여러 코인이 있으므로 전부 모아 조회 후 큰 쪽을 택한다
  const want = new Set(missing.map(m => m.toUpperCase()))
  const bySym = new Map<string, string[]>()
  for (const c of list) {
    const sym = String(c.symbol || '').toUpperCase()
    if (!want.has(sym)) continue
    const arr = bySym.get(sym) ?? []
    if (arr.length < 4) arr.push(c.id)     // 심볼당 후보 4개까지
    bySym.set(sym, arr)
  }
  const ids = [...bySym.values()].flat()
  for (let i = 0; i < ids.length; i += 200) {
    const j = await fetchJson<CgCoin[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.slice(i, i + 200).join(',')}&per_page=200&page=1`,
      { headers: JSON_H }, { tries: 3, baseDelayMs: 2000 })
    for (const c of j ?? []) {
      const sym = String(c.symbol || '').toUpperCase()
      const cap = c.market_cap ?? 0
      if (cap > (caps.get(sym) ?? 0)) { caps.set(sym, cap); names.set(sym, c.name) }
    }
  }
}

/**
 * 바이낸스는 저가 코인에 배수 접두사를 붙인다 (1000SATS, 1MBABYDOGE).
 * 코인게코 심볼과 안 맞아 시총 미상이 됐다. 접두사를 떼고 한 번 더 찾는다.
 *
 * `1INCH`처럼 숫자로 시작하는 진짜 심볼이 있으므로, **접두사를 뗀 결과가
 * 실제로 코인게코에 있을 때만** 그 값을 쓴다.
 */
function capOf(caps: Map<string, number>, base: string): number {
  const direct = caps.get(base)
  if (direct != null) return direct
  const m = /^(?:1000000|1000K|1000|1MB|1M|10)([A-Z0-9]{2,})$/.exec(base)
  const alt = m && caps.get(m[1])
  return alt ?? 0
}

/** 김치 프리미엄 계산에 필요한 환율. 실패하면 프리미엄을 안 띄운다 */
async function usdKrwRate(): Promise<number> {
  const j = await fetchJson<{ chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } }>(
    'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=5d',
    { headers: { 'User-Agent': UA } })
  return j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0
}

// ----------------------------------------------------------------

export async function fetchUniverse(
  market: Market, capSource?: CapSource,
): Promise<UniverseRow[]> {
  switch (market) {
    case 'us': return usUniverse()
    case 'kr': return krUniverse()
    case 'crypto': return cryptoUniverse(capSource)
  }
}
