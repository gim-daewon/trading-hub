// 수급 스크리너 전체 스캔 — GitHub Actions에서 하루 1회 실행.
//
// Vercel 함수는 10초 제한이라 705종목까지만 가능하다. 여기서는 시간 제약이
// 사실상 없으므로 유니버스를 1,900종목으로 넓혀 Supabase에 저장하고,
// 앱은 읽기만 한다.
//
// 계산 로직은 lib/flow.ts를 그대로 재사용한다 (Node 24의 TS 직접 실행).
//
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (service_role은 RLS를 우회한다. 절대 클라이언트에 노출하지 말 것)

import { fetchDatedBars, computeFlow, persistence } from '../lib/flow.ts'

// 대시보드는 REST 엔드포인트(.../rest/v1/)만 보여주는 경우가 많다.
// 어느 쪽을 넣어도 동작하도록 베이스 URL로 정규화한다.
const normalize = u => String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')

const SUPABASE_URL = normalize(process.env.SUPABASE_URL)
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다')
  process.exit(1)
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL)) {
  console.error(`SUPABASE_URL 형식이 이상하다: ${SUPABASE_URL}`)
  console.error('기대 형식: https://<프로젝트ID>.supabase.co')
  process.exit(1)
}
console.log(`Supabase: ${SUPABASE_URL}`)

// Vercel 라우트(705종목)보다 넓게 잡는다.
// 첫 실행이 1,776종목에 46초였으므로 여유가 크다. 소형주까지 포함해
// 시총 구간별로 나눠 볼 수 있게 $500M까지 내렸다 (약 2,700종목).
const MIN_DOLLAR_VOL = 5e6   // $5M
const MIN_MARKET_CAP = 5e8   // $500M
const CONCURRENCY    = 10    // 데이터센터 IP라 야후가 더 조인다. 낮게 유지
const MAX_RETRY      = 2

const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}
const toNum = s => parseFloat(String(s).replace(/[$,%]/g, '')) || 0
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function universe() {
  const res = await fetch(
    'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true',
    { headers: NASDAQ_HEADERS }
  )
  if (!res.ok) throw new Error(`nasdaq screener ${res.status}`)
  const rows = (await res.json())?.data?.rows ?? []
  return rows
    .map(r => ({
      symbol: r.symbol,
      name: r.name,
      sector: r.sector || null,
      marketCap: toNum(r.marketCap),
      dollarVol: toNum(r.lastsale) * toNum(r.volume),
    }))
    .filter(r => /^[A-Z]{1,5}$/.test(r.symbol) && r.dollarVol >= MIN_DOLLAR_VOL && r.marketCap >= MIN_MARKET_CAP)
}

async function barsWithRetry(symbol) {
  for (let i = 0; i <= MAX_RETRY; i++) {
    // 2년치를 받는다. 주봉 VWMA60에 60주(약 14개월)치 일봉이 필요하다.
    // 6개월로는 주봉 지표가 전부 null이 된다.
    const b = await fetchDatedBars(symbol, '2y')
    if (b && b.length >= 65) return b
    if (i < MAX_RETRY) await sleep(300 * (i + 1))
  }
  return null
}

async function sb(path, method, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`supabase ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── 실행 ──────────────────────────────────────────────────────────────
const t0 = Date.now()

const list = await universe()
console.log(`유니버스 ${list.length}종목 (거래대금 $${MIN_DOLLAR_VOL / 1e6}M+ · 시총 $${MIN_MARKET_CAP / 1e9}B+)`)

// 시장 국면 — 카테고리별 성과가 국면에 따라 갈리므로 같이 저장한다
const spyBars = await barsWithRetry('SPY')
let regime = 'up', spyChg20 = null, spyPrice = null
if (spyBars && spyBars.length >= 21) {
  const a = spyBars[spyBars.length - 21].c, b = spyBars[spyBars.length - 1].c
  spyChg20 = ((b - a) / a) * 100
  spyPrice = b
  regime = spyChg20 >= 0 ? 'up' : 'down'
}
console.log(`국면 ${regime} (SPY 20일 ${spyChg20?.toFixed(2) ?? '?'}%)`)

const out = []
let done = 0, failed = 0
const queue = [...list]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const u = queue.shift()
    const bars = await barsWithRetry(u.symbol)
    done++
    if (done % 250 === 0) console.log(`  ...${done}/${list.length}`)
    if (!bars) { failed++; continue }
    const m = computeFlow(bars)
    if (m.f20 === null) { failed++; continue }
    out.push({
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      market_cap: u.marketCap,
      f5: m.f5, f20: m.f20, f60: m.f60,
      rvol: m.rvol, chg20: m.chg20,
      pct_b: m.pctB,
      vwma20: m.vwma20,
      vwma60: m.vwma60,                 // vwma20과의 상하 관계가 정배열/역배열
      above_run: m.aboveRun,            // 1 = 오늘 종가로 VWMA20 상향 돌파
      w_close: m.wClose,                // 마지막 '완료된' 주 기준
      w_vwma20: m.wVwma20,
      w_vwma60: m.wVwma60,
      w_above_run: m.wAboveRun,   // 1 = 지난주에 주봉 VWMA20 탈환
      prev_run: m.prevRun,        // 돌파 전 며칠 아래에 있었나
      w_prev_run: m.wPrevRun,
      low: m.low,           // 밑꼬리 판정용
      w_low: m.wLow,
      price: bars[bars.length - 1].c,   // 진입가 — 사후 성과 추적용
      persistence: persistence(m),
    })
  }
}))
console.log(`스캔 완료: 성공 ${out.length} / 실패 ${failed} / ${((Date.now() - t0) / 1000).toFixed(1)}초`)

if (out.length < list.length * 0.5) {
  // 절반도 못 긁었으면 저장하지 않는다. 반쪽짜리 스냅샷이 최신으로 잡히면
  // 앱이 잘못된 랭킹을 12시간 동안 보여준다.
  console.error(`성공률이 너무 낮아 저장을 중단한다 (${out.length}/${list.length})`)
  process.exit(1)
}

// 스캔 시각과 데이터 기준일은 다르다.
// 야후가 당일 일봉을 늦게 내놓는 날이 있다 — 실제로 2026-09-04 마감 4시간 뒤에도
// 전 종목 일봉이 null이라 스캔이 09-03 종가로 돌았다.
// 그 상태로 화면에 "9/4 종가 기준"이라고 띄우면 표시가 거짓말을 한다.
const lastBarDate = spyBars && spyBars.length
  ? new Date(spyBars[spyBars.length - 1].t * 1000).toISOString().slice(0, 10)
  : null
console.log(`데이터 기준일 ${lastBarDate ?? '?'}`)

const [snap] = await sb('screener_snapshots', 'POST', {
  regime,
  bar_date: lastBarDate,
  spy_chg20: spyChg20,
  spy_price: spyPrice,
  universe_size: list.length,
  scanned_count: out.length,
  min_dollar_vol: MIN_DOLLAR_VOL,
  min_market_cap: MIN_MARKET_CAP,
}, { Prefer: 'return=representation' })

console.log(`스냅샷 생성 id=${snap.id}`)

const CHUNK = 500
for (let i = 0; i < out.length; i += CHUNK) {
  const chunk = out.slice(i, i + CHUNK).map(r => ({ ...r, snapshot_id: snap.id }))
  await sb('screener_rows', 'POST', chunk, { Prefer: 'return=minimal' })
  console.log(`  저장 ${Math.min(i + CHUNK, out.length)}/${out.length}`)
}

console.log(`완료 · 총 ${((Date.now() - t0) / 1000).toFixed(1)}초`)
