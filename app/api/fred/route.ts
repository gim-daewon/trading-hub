import { NextRequest, NextResponse } from 'next/server'

const FRED_KEY  = process.env.FRED_API_KEY ?? ''
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

// bp로 정규화가 필요한 series (FRED는 percent 단위로 제공)
const PCT_TO_BP = new Set(['BAMLC0A4CBBB', 'BAMLH0A0HYM2'])

async function fetchSeries(seriesId: string) {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=5`
  const res = await fetch(url, { next: { revalidate: 43200 } }) // 12시간 캐시
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`)
  const json = await res.json()
  const obs = json.observations?.filter((o: { value: string }) => o.value !== '.') ?? []
  if (!obs.length) throw new Error(`FRED ${seriesId}: no data`)

  const latest = obs[0]
  const prev   = obs[1]
  let value = parseFloat(latest.value)

  // OAS는 percent → bp 변환
  if (PCT_TO_BP.has(seriesId)) value = value * 100

  const prevValue = prev ? parseFloat(prev.value) * (PCT_TO_BP.has(seriesId) ? 100 : 1) : value
  return {
    id:        seriesId,
    value,
    prevValue,
    change:    value - prevValue,
    date:      latest.date,
    ts:        Date.now(),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('ids') ?? 'DGS5,DGS10,T10Y2Y,BAMLC0A4CBBB,BAMLH0A0HYM2')
    .split(',').filter(Boolean)

  const results = await Promise.allSettled(ids.map(fetchSeries))

  const data: Record<string, unknown> = {}
  const errors: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') data[ids[i]] = r.value
    else errors.push(`${ids[i]}: ${r.reason?.message}`)
  })

  return NextResponse.json({ data, errors, fetchedAt: Date.now() })
}
