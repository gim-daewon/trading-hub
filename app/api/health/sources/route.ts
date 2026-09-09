import { NextResponse } from 'next/server'
import { CHUNK_YAHOO, CHUNK_NAVER, CHUNK_UPBIT } from '@/lib/live'
import { binanceJson } from '@/lib/binance'
import { fetchJson } from '@/lib/fetch-retry'

/**
 * 데이터 소스 무결성 점검 — **조용히 절반만 주는 실패**를 잡는다.
 *
 * 이 프로젝트에서 가장 자주, 가장 오래 못 잡은 종류의 버그다:
 *
 *   PostgREST 1,000행 상한       3번 (스냅샷 행 / 코인게코 캐시 / 추적)
 *   야후 spark 배치 20 상한       미국 등락률이 통째로 안 떴는데 로그는 조용
 *   코인게코 페이지 실패 시 break  429 한 번에 뒤 페이지 누락, WBTC가 '시총 미상'
 *   바이낸스 지역 차단            크립토 유니버스 555 -> 278인데 '성공'으로 끝남
 *
 * 전부 **에러가 안 나고 개수만 줄어든다.** 사람 눈으로는 못 찾는다.
 *
 * 설계 원칙: 검사는 **코드의 설정값을 직접 import** 한다.
 * 기대치를 여기 따로 적어두면 상수를 바꿀 때 검사가 뒤처져서
 * "통과했는데 실제로는 깨진" 상태가 된다 — 실제로 그렇게 당했다.
 * 배치 상한을 확인했다고 믿었는데 그 테스트가 심볼을 중복 제거해
 * 매번 10개만 보내고 있었다.
 */
export const revalidate = 600

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type Level = 'ok' | 'warn' | 'fail'

interface SourceCheck {
  source: string
  level: Level
  /** 요청한 개수 */
  asked: number
  /** 실제로 받은 개수 */
  got: number
  note: string
}

const verdict = (asked: number, got: number): Level =>
  got >= asked ? 'ok' : got >= asked * 0.9 ? 'warn' : 'fail'

/** 야후 spark — 우리가 실제로 쓰는 배치 크기 그대로 시험한다 */
async function yahooSpark(): Promise<SourceCheck> {
  const pool = [
    'AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'META', 'GOOG', 'AMZN', 'NFLX', 'INTC',
    'AVGO', 'QCOM', 'MU', 'TXN', 'NOW', 'PANW', 'ANET', 'ADI', 'KLAC', 'LRCX',
    'CRWD', 'SNOW', 'DDOG', 'NET', 'ABNB',
  ]
  const syms = pool.slice(0, CHUNK_YAHOO)
  const j = await fetchJson<Record<string, unknown>>(
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${syms.join(',')}&range=1d&interval=5m`,
    { headers: { 'User-Agent': UA }, cache: 'no-store' })
  // 400이면 본문이 {spark:{error}} 형태로 온다 — 심볼처럼 세면 1이 된다
  const got = j && !('spark' in j) ? Object.keys(j).length : 0
  return {
    source: `야후 spark (배치 ${CHUNK_YAHOO})`,
    level: verdict(syms.length, got),
    asked: syms.length,
    got,
    note: got === 0
      ? '배치가 거부됐다. CHUNK_YAHOO를 줄여야 한다 — 실측 상한은 20이었다'
      : got < syms.length ? '일부 심볼이 빠졌다 (상장폐지 가능성)' : '',
  }
}

/** 네이버 실시간 — 배치 크기 그대로 */
async function naverRealtime(): Promise<SourceCheck> {
  const list = await fetchJson<{ stocks?: { itemCode: string }[] }>(
    `https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=${CHUNK_NAVER}`,
    { headers: { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' }, cache: 'no-store' })
  const codes = (list?.stocks ?? []).map(s => s.itemCode)
  if (!codes.length) {
    return {
      source: '네이버 실시간', level: 'fail', asked: CHUNK_NAVER, got: 0,
      note: '종목 목록을 못 받았다. 비공식 API라 막혔을 수 있다',
    }
  }
  const j = await fetchJson<{ datas?: unknown[] }>(
    `https://polling.finance.naver.com/api/realtime/domestic/stock/${codes.join(',')}`,
    { headers: { 'User-Agent': UA, Referer: 'https://finance.naver.com/' }, cache: 'no-store' })
  const got = j?.datas?.length ?? 0
  return {
    source: `네이버 실시간 (배치 ${CHUNK_NAVER})`,
    level: verdict(codes.length, got),
    asked: codes.length,
    got,
    note: got === 0 ? '응답이 비었다. CHUNK_NAVER를 줄이거나 소스를 바꿔야 한다' : '',
  }
}

/** 업비트 ticker — 배치 크기 그대로 */
async function upbitTicker(): Promise<SourceCheck> {
  const all = await fetchJson<{ market: string }[]>(
    'https://api.upbit.com/v1/market/all?isDetails=false',
    { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const krw = (all ?? []).filter(m => m.market.startsWith('KRW-')).slice(0, CHUNK_UPBIT)
  if (!krw.length) {
    return { source: '업비트', level: 'fail', asked: CHUNK_UPBIT, got: 0, note: '마켓 목록 실패' }
  }
  const j = await fetchJson<unknown[]>(
    `https://api.upbit.com/v1/ticker?markets=${krw.map(m => m.market).join(',')}`,
    { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const got = j?.length ?? 0
  return {
    source: `업비트 ticker (배치 ${krw.length})`,
    level: verdict(krw.length, got),
    asked: krw.length,
    got,
    note: '',
  }
}

/**
 * 바이낸스 — 개수로 지역 차단을 잡는다.
 *
 * GitHub Actions(미국 IP)에서 막혔을 때 유니버스가 555 -> 278로 줄었는데
 * 에러 없이 '성공'으로 끝났다. Vercel도 데이터센터 IP라 같은 위험이 있다.
 */
async function binanceUniverse(): Promise<SourceCheck> {
  const EXPECT = 300
  const ei = await binanceJson<{ symbols?: { quoteAsset: string; status: string }[] }>(
    '/api/v3/exchangeInfo')
  const got = (ei?.symbols ?? [])
    .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING').length
  return {
    source: '바이낸스 USDT 현물',
    level: got === 0 ? 'fail' : got < EXPECT ? 'warn' : 'ok',
    asked: EXPECT,
    got,
    note: got === 0
      ? '전부 실패했다. 지역 차단(451)일 수 있다 — data-api.binance.vision 폴백도 안 통했다'
      : got < EXPECT ? '평소보다 적다. 일부 호스트가 막혔을 수 있다' : '',
  }
}

/** 코인게코 — 페이지가 온전히 오는지 (실패 시 조용히 뒤 페이지가 빠졌었다) */
async function coingeckoPage(): Promise<SourceCheck> {
  const PER = 250
  const j = await fetchJson<unknown[]>(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${PER}&page=1`,
    { headers: { 'User-Agent': UA }, cache: 'no-store' },
    { tries: 2, baseDelayMs: 1500 })
  const got = j?.length ?? 0
  return {
    source: '코인게코 시총 1페이지',
    level: verdict(PER, got),
    asked: PER,
    got,
    note: got === 0 ? '레이트리밋일 수 있다. 시총 캐시가 있으면 스캔은 계속된다' : '',
  }
}

/**
 * Supabase — 스냅샷이 기록한 종목 수와 실제 저장된 행 수가 맞는가.
 *
 * PostgREST 1,000행 상한에 세 번 당했다. 이 검사가 그걸 전부 잡는다.
 * 행을 다 받아와서 세면 안 된다 — 그 조회 자체가 상한에 걸린다.
 * count=exact 헤더로 서버가 세게 한다.
 */
async function supabaseRows(): Promise<SourceCheck[]> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) {
    return [{ source: 'Supabase', level: 'fail', asked: 0, got: 0, note: '환경변수 미설정' }]
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const out: SourceCheck[] = []

  for (const market of ['us', 'kr', 'crypto'] as const) {
    const snaps = await fetchJson<{ id: number; scanned_count: number; bar_date: string | null }[]>(
      `${url}/rest/v1/screener_snapshots?select=id,scanned_count,bar_date` +
      `&market=eq.${market}&order=scanned_at.desc&limit=1`,
      { headers, cache: 'no-store' })
    const snap = snaps?.[0]
    if (!snap) {
      out.push({ source: `Supabase ${market}`, level: 'warn', asked: 0, got: 0, note: '스냅샷 없음' })
      continue
    }
    const res = await fetch(
      `${url}/rest/v1/screener_rows?select=id&snapshot_id=eq.${snap.id}&limit=1`,
      { headers: { ...headers, Prefer: 'count=exact' }, cache: 'no-store' })
    const got = Number((res.headers.get('content-range') ?? '').split('/')[1]) || 0
    out.push({
      source: `Supabase ${market} 행 (${snap.bar_date ?? '?'})`,
      level: verdict(snap.scanned_count, got),
      asked: snap.scanned_count,
      got,
      note: got < snap.scanned_count
        ? '스캔이 기록한 수보다 행이 적다. 저장이 중간에 끊겼을 수 있다'
        : '',
    })
  }
  return out
}

export async function GET() {
  const [spark, naver, upbit, binance, cg, sb] = await Promise.all([
    yahooSpark(), naverRealtime(), upbitTicker(),
    binanceUniverse(), coingeckoPage(), supabaseRows(),
  ])
  const checks = [spark, naver, upbit, binance, cg, ...sb]
  const fails = checks.filter(c => c.level === 'fail')
  const warns = checks.filter(c => c.level === 'warn')

  return NextResponse.json({
    ok: fails.length === 0,
    summary: fails.length
      ? `${fails.length}개 실패`
      : warns.length ? `${warns.length}개 경고` : '전부 정상',
    checks,
    at: Date.now(),
  }, { status: fails.length ? 503 : 200 })
}
