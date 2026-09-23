import { NextResponse } from 'next/server'

const KEY  = process.env.FRED_API_KEY ?? ''
const BASE = 'https://api.stlouisfed.org/fred/series/observations'

interface Obs { date: string; value: string }
interface Stat { value: number | null; prev: number | null; date: string | null }

async function fred(id: string, { limit = 3, units }: { limit?: number; units?: string } = {}): Promise<Obs[]> {
  if (!KEY) return []
  const p = new URLSearchParams({ series_id: id, api_key: KEY, file_type: 'json', sort_order: 'desc', limit: String(limit) })
  if (units) p.set('units', units)
  try {
    const res = await fetch(`${BASE}?${p}`, { next: { revalidate: 43200 } })
    if (!res.ok) return []
    const j = await res.json()
    return ((j.observations ?? []) as Obs[]).filter(o => o.value !== '.')
  } catch { return [] }
}

function stat(obs: Obs[]): Stat {
  const v = obs[0] ? parseFloat(obs[0].value) : NaN
  const p = obs[1] ? parseFloat(obs[1].value) : NaN
  return {
    value: isNaN(v) ? null : v,
    prev:  isNaN(p) ? null : p,
    date:  obs[0]?.date ?? null,
  }
}

export async function GET() {
  const [
    cpi, coreCpi, corePce, bei10, bei5,
    unrate, nfp, icsa, jolts,
    walcl, rrpo, tga, ffr, sofr,
    gdp, sahm, retail, housing,
    stlfsi, hyOas, igOas, bbOas, bOas, cccOas,
  ] = await Promise.all([
    fred('CPIAUCSL',        { limit: 3, units: 'pc1' }),
    fred('CPILFESL',        { limit: 3, units: 'pc1' }),
    fred('PCEPILFE',        { limit: 3, units: 'pc1' }),
    fred('T10YIE',          { limit: 3 }),
    fred('T5YIE',           { limit: 3 }),
    fred('UNRATE',          { limit: 3 }),
    fred('PAYEMS',          { limit: 3, units: 'chg' }),   // MoM change in thousands
    fred('ICSA',            { limit: 5 }),                  // weekly, raw level
    fred('JTSJOL',          { limit: 3 }),                  // thousands
    fred('WALCL',           { limit: 5 }),                  // millions USD
    fred('RRPONTSYD',       { limit: 5 }),                  // billions USD
    fred('WTREGEN',         { limit: 5 }),                  // millions USD
    fred('FEDFUNDS',        { limit: 3 }),
    fred('SOFR',            { limit: 5 }),
    fred('A191RL1Q225SBEA', { limit: 3 }),                  // GDP QoQ %
    fred('SAHMREALTIME',    { limit: 5 }),
    fred('RSAFS',           { limit: 3 }),                  // millions USD
    fred('HOUST',           { limit: 3 }),                  // thousands of units
    fred('STLFSI4',         { limit: 5 }),
    // 등급별 OAS. **순서와 라벨이 어긋나 있었다** — BB 계열을 안 받고 나머지를
    // 한 칸씩 당겨 써서 화면에 'BB 271bp'(실제 B), 'B 1,075bp'(실제 CCC)가 떴다.
    // BB는 HY 안에서 가장 우량한 등급이라 **항상 HY 전체보다 좁아야 한다** —
    // 그 관계가 깨져 보이면 매핑이 틀린 것이다.
    fred('BAMLH0A0HYM2',    { limit: 3 }),                  // HY 전체 (percent → ×100 for bp)
    fred('BAMLC0A4CBBB',    { limit: 3 }),                  // BBB (투자등급 최하위)
    fred('BAMLH0A1HYBB',    { limit: 3 }),                  // BB
    fred('BAMLH0A2HYB',     { limit: 3 }),                  // B
    fred('BAMLH0A3HYC',     { limit: 3 }),                  // CCC 이하
  ])

  // OAS: FRED stores in percent, convert to basis points
  function oasStat(obs: Obs[]): Stat {
    const s = stat(obs)
    return {
      value: s.value !== null ? s.value * 100 : null,
      prev:  s.prev  !== null ? s.prev  * 100 : null,
      date:  s.date,
    }
  }

  return NextResponse.json({
    inflation: {
      cpi:     stat(cpi),
      coreCpi: stat(coreCpi),
      corePce: stat(corePce),
      bei10:   stat(bei10),
      bei5:    stat(bei5),
    },
    employment: {
      unrate: stat(unrate),
      nfp:    stat(nfp),      // value = MoM change in thousands
      icsa:   stat(icsa),     // value = raw number
      jolts:  stat(jolts),    // value = thousands
    },
    liquidity: {
      walcl: stat(walcl),     // millions → /1e6 for trillions
      rrpo:  stat(rrpo),      // billions
      tga:   stat(tga),       // millions → /1000 for billions
      ffr:   stat(ffr),
      sofr:  stat(sofr),
    },
    cycle: {
      gdp:     stat(gdp),
      sahm:    stat(sahm),
      retail:  stat(retail),  // millions → /1000 for billions
      housing: stat(housing), // thousands
    },
    credit: {
      hyOas: oasStat(hyOas),
      igOas: oasStat(igOas),
      bbOas: oasStat(bbOas),
      bOas:  oasStat(bOas),
      cccOas: oasStat(cccOas),
    },
    risk: {
      stlfsi: stat(stlfsi),
    },
  })
}
