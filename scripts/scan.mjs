// 스크리너 전체 스캔 — GitHub Actions에서 시장별로 하루 1회 실행.
//
// Vercel 함수는 10초 제한이라 705종목까지만 가능하다. 여기서는 시간 제약이
// 사실상 없으므로 전 종목을 스캔해 Supabase에 저장하고, 앱은 읽기만 한다.
//
// 계산 로직은 lib/ 를 그대로 재사용한다 (Node 24의 TS 직접 실행).
// 확장자 없는 상대 import 때문에 해석 훅이 필요하다:
//
//   node --import ./scripts/ts-resolve-hook.mjs scripts/scan.mjs
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARKET (us|kr|crypto)
// (service_role은 RLS를 우회한다. 절대 클라이언트에 노출하지 말 것)

import { computeFlow, persistence } from '../lib/flow.ts'
import { fetchUniverse, CAP_CACHE_DAYS } from '../lib/universe.ts'
import { fetchBarsFor, looksPegged } from '../lib/bars.ts'
import { MARKETS, isMarket } from '../lib/markets.ts'

const MARKET = (process.env.MARKET || 'us').trim()
if (!isMarket(MARKET)) {
  console.error(`MARKET이 us|kr|crypto 중 하나여야 한다 (받은 값: ${MARKET})`)
  process.exit(1)
}
const DEF = MARKETS[MARKET]

// 대시보드는 REST 엔드포인트(.../rest/v1/)만 보여주는 경우가 많다.
// 어느 쪽을 넣어도 동작하도록 베이스 URL로 정규화한다.
const normalize = u => String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')

const SUPABASE_URL = normalize(process.env.SUPABASE_URL)
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다')
  process.exit(1)
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL)) {
  console.error(`SUPABASE_URL 형식이 이상하다: ${SUPABASE_URL}`)
  console.error('기대 형식: https://<프로젝트ID>.supabase.co')
  process.exit(1)
}
console.log(`시장 ${DEF.label} · Supabase ${SUPABASE_URL}`)

// 야후는 데이터센터 IP를 더 조인다. 거래소 API는 여유가 있다
const CONCURRENCY = MARKET === 'crypto' ? 8 : 10
const MAX_RETRY = 2
const sleep = ms => new Promise(r => setTimeout(r, ms))

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

/**
 * 크립토 시총 캐시. 코인게코 레이트리밋 때문에 시총 수집이 실측 123초 걸린다.
 * 구간 경계가 하루 만에 바뀔 값이 아니라 주 1회만 갱신한다.
 */
const capSource = MARKET !== 'crypto' ? undefined : {
  async load() {
    // PostgREST는 한 번에 최대 1,000행만 준다. offset으로 넘겨야 한다.
    //
    // 이 함정에 걸린 게 세 번째다 — 스냅샷 행 조회에서 2,124행 중 1,000행만
    // 받아 조용히 라이브로 폴백했고, 코인게코 캐시도 2,380개 중 1,000개만
    // 읽어서 매 스캔마다 158개를 2차 조회하고 있었다.
    // 조용히 절반만 가져오는 실패는 로그만 봐서는 정상으로 보인다.
    const rows = []
    for (let from = 0; from < 20000; from += 1000) {
      const page = await sb(
        `crypto_market_caps?select=symbol,name,market_cap,updated_at` +
        `&order=symbol.asc&offset=${from}&limit=1000`, 'GET')
      if (!page?.length) break
      rows.push(...page)
      if (page.length < 1000) break
    }
    if (!rows.length) return null
    const caps = new Map(), names = new Map()
    let newest = 0
    for (const r of rows) {
      caps.set(r.symbol, Number(r.market_cap))
      if (r.name) names.set(r.symbol, r.name)
      newest = Math.max(newest, Date.parse(r.updated_at) || 0)
    }
    return { caps, names, ageDays: (Date.now() - newest) / 86400000 }
  },
  async save(caps, names) {
    const rows = [...caps].map(([symbol, market_cap]) => ({
      symbol, market_cap, name: names.get(symbol) ?? null, updated_at: new Date().toISOString(),
    }))
    for (let i = 0; i < rows.length; i += 500) {
      // on_conflict를 명시해야 merge-duplicates가 실제로 upsert가 된다.
      // 빠지면 기본키 충돌로 409가 난다
      await sb('crypto_market_caps?on_conflict=symbol', 'POST', rows.slice(i, i + 500),
        { Prefer: 'resolution=merge-duplicates,return=minimal' })
    }
    console.log(`시총 캐시 저장 ${rows.length}개 (${CAP_CACHE_DAYS}일간 재사용)`)
  },
}

async function barsWithRetry(row) {
  for (let i = 0; i <= MAX_RETRY; i++) {
    // 2년치를 받는다. 주봉 VWMA60에 60주(약 14개월)치 일봉이 필요하다.
    // 6개월로는 주봉 지표가 전부 null이 된다.
    const b = await fetchBarsFor(row, '2y')
    if (b && b.length >= 65) return b
    if (i < MAX_RETRY) await sleep(300 * (i + 1))
  }
  return null
}

// ── 실행 ──────────────────────────────────────────────────────────────
const t0 = Date.now()

const list = await fetchUniverse(MARKET, capSource)
console.log(`유니버스 ${list.length}종목 — ${DEF.universeNote}`)
if (!list.length) {
  console.error('유니버스가 비었다. 소스가 막혔을 수 있다')
  process.exit(1)
}

// 시장 국면 — 카테고리별 성과가 국면에 따라 갈리므로 같이 저장한다.
// 기준 지수는 시장마다 다르다 (미국 SPY / 한국 코스피 / 크립토 BTC)
const benchBars = await barsWithRetry(DEF.benchmark)
if (!benchBars || benchBars.length < 21) {
  // 기본값 'up'을 그대로 저장하면 안 된다.
  //
  // 첫 크립토 스캔이 정확히 이렇게 돌았다 — 바이낸스가 지역 차단으로 막혀
  // BTC 봉을 못 받았는데 "국면 up (BTC 20일 ?%)"으로 저장하고 성공으로 끝났다.
  // 국면은 카테고리 성과 판정의 축이라 틀리면 근거 전체가 어긋난다.
  console.error(`기준 지수(${DEF.benchmark.symbol}) 봉을 받지 못했다. 국면을 알 수 없으므로 중단한다`)
  console.error('데이터 소스가 막혔을 가능성이 높다 — 지역 차단이나 API 변경을 확인할 것')
  process.exit(1)
}
const a = benchBars[benchBars.length - 21].c, b = benchBars[benchBars.length - 1].c
const benchChg20 = ((b - a) / a) * 100
const benchPrice = b
const regime = benchChg20 >= 0 ? 'up' : 'down'
console.log(`국면 ${regime} (${DEF.benchmark.label} 20일 ${benchChg20.toFixed(2)}%)`)

const out = []
let done = 0, failed = 0, pegged = 0
const queue = [...list]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const u = queue.shift()
    const bars = await barsWithRetry(u)
    done++
    if (done % 250 === 0) console.log(`  ...${done}/${list.length}`)
    if (!bars) { failed++; continue }
    // 목록으로 못 거른 스테이블을 변동성으로 한 번 더 거른다.
    // 가격이 안 움직이면 VWMA·순자금·볼린저가 전부 무의미하다
    if (MARKET === 'crypto' && looksPegged(bars)) { pegged++; continue }
    const m = computeFlow(bars)
    if (m.f20 === null) { failed++; continue }
    out.push({
      // market은 스냅샷에만 있다. 행은 snapshot_id로 따라가므로 중복이다
      symbol: u.symbol,
      display: u.display,
      name: u.name,
      sector: u.sector,
      market_cap: u.marketCap,
      cap_known: u.capKnown,
      dollar_vol: u.dollarVol,
      premium: u.premium ?? null,
      bar_source: u.source,
      f5: m.f5, f20: m.f20, f60: m.f60,
      rvol: m.rvol, chg20: m.chg20,
      pct_b: m.pctB,
      vwma20: m.vwma20,
      vwma60: m.vwma60,                 // vwma20과의 상하 관계가 정배열/역배열
      above_run: m.aboveRun,            // 1 = 오늘 종가로 VWMA20 상향 돌파
      w_close: m.wClose,                // 진행 중인 주를 포함한다
      w_vwma20: m.wVwma20,
      w_vwma60: m.wVwma60,
      w_above_run: m.wAboveRun,
      prev_run: m.prevRun,              // 돌파 전 며칠 아래에 있었나
      w_prev_run: m.wPrevRun,
      low: m.low,                       // 밑꼬리 판정용
      w_low: m.wLow,
      price: bars[bars.length - 1].c,   // 진입가 — 사후 성과 추적용
      persistence: persistence(m),
    })
  }
}))
console.log(
  `스캔 완료: 성공 ${out.length} / 실패 ${failed}` +
  (pegged ? ` / 스테이블 제외 ${pegged}` : '') +
  ` / ${((Date.now() - t0) / 1000).toFixed(1)}초`
)

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
const lastBarDate = benchBars?.length
  ? new Date(benchBars[benchBars.length - 1].t * 1000).toISOString().slice(0, 10)
  : null
console.log(`데이터 기준일 ${lastBarDate ?? '?'}`)

const [snap] = await sb('screener_snapshots', 'POST', {
  market: MARKET,
  regime,
  bar_date: lastBarDate,
  // 컬럼 이름은 spy_*지만 담기는 값은 시장별 기준 지수다.
  // 이름을 바꾸면 과거 데이터가 끊기는데 얻는 건 이름뿐이다
  spy_chg20: benchChg20,
  spy_price: benchPrice,
  universe_size: list.length,
  scanned_count: out.length,
  // 한국·크립토는 하한을 두지 않는다 ("모든 종목"이 요구사항)
  min_dollar_vol: MARKET === 'us' ? 5e6 : 0,
  min_market_cap: MARKET === 'us' ? 5e8 : 0,
}, { Prefer: 'return=representation' })

console.log(`스냅샷 생성 id=${snap.id} market=${MARKET}`)

// 행 저장이 실패하면 **스냅샷도 지운다.**
//
// 안 지우면 행이 0개인 스냅샷이 '최신'으로 남는다. 앱은 그걸 읽어 빈 화면을
// 보여주고, 성과 추적은 그날을 통째로 비운다. 실제로 이 경로로 id=19가 남았다.
// 반쪽 저장은 저장 안 한 것보다 나쁘다.
const CHUNK = 500
try {
  for (let i = 0; i < out.length; i += CHUNK) {
    const chunk = out.slice(i, i + CHUNK).map(r => ({ ...r, snapshot_id: snap.id }))
    await sb('screener_rows', 'POST', chunk, { Prefer: 'return=minimal' })
    console.log(`  저장 ${Math.min(i + CHUNK, out.length)}/${out.length}`)
  }
} catch (e) {
  console.error(`행 저장 실패 — 스냅샷 ${snap.id}을 되돌린다`)
  try {
    await sb(`screener_snapshots?id=eq.${snap.id}`, 'DELETE', undefined, { Prefer: 'return=minimal' })
    console.error(`스냅샷 ${snap.id} 삭제 완료 (행은 cascade로 같이 지워진다)`)
  } catch (e2) {
    console.error(`스냅샷 삭제도 실패했다. 수동으로 지워야 한다: id=${snap.id}`, e2.message.slice(0, 120))
  }
  throw e
}

// 보관 정리.
//
// 실측: 50,519행이 24MB였다 = 행당 약 498바이트(인덱스 포함).
// 세 시장이 매일 돌면 하루 5,798행이다 (미국 2,755 + 한국 2,565 + 크립토 478).
// 신규 컬럼을 더해 행당 550바이트로 잡으면:
//
//   120개 보관 -> 695,760행 -> 약 392MB (무료 티어 500MB의 78%)
//    90개 보관 -> 521,820행 -> 약 297MB (59%)
//
// 90개로 잡는다. 잃는 게 없다 — /api/tracking이 애초에 최근 90개만 조회한다.
// 120개는 앱이 읽지도 않는 데이터를 쌓아두는 것이었다.
//
// 시장별로 세는 것이 중요하다 — 전체에서 세면 매일 도는 크립토가
// 주 5회 도는 주식의 이력을 밀어낸다.
const KEEP_SNAPSHOTS = 90
try {
  const pruned = await sb('rpc/prune_snapshots', 'POST', { keep_per_market: KEEP_SNAPSHOTS })
  if (pruned?.length) console.log('보관 정리:', pruned.map(p => `${p.mkt} ${p.n_deleted}개`).join(' · '))
} catch (e) {
  // 함수가 아직 없어도 스캔은 성공이다. 조용히 넘기지 말고 남긴다
  console.error('보관 정리 건너뜀:', e.message.slice(0, 160))
}

console.log(`완료 · 총 ${((Date.now() - t0) / 1000).toFixed(1)}초`)
