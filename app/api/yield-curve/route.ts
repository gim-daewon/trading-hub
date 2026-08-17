import { NextResponse } from 'next/server'

const FRED_KEY  = process.env.FRED_API_KEY ?? ''
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

const MATURITIES = [
  { id: 'DGS1MO', label: '1M',  years: 1 / 12 },
  { id: 'DGS3MO', label: '3M',  years: 0.25 },
  { id: 'DGS6MO', label: '6M',  years: 0.5 },
  { id: 'DGS1',   label: '1Y',  years: 1 },
  { id: 'DGS2',   label: '2Y',  years: 2 },
  { id: 'DGS5',   label: '5Y',  years: 5 },
  { id: 'DGS7',   label: '7Y',  years: 7 },
  { id: 'DGS10',  label: '10Y', years: 10 },
  { id: 'DGS20',  label: '20Y', years: 20 },
  { id: 'DGS30',  label: '30Y', years: 30 },
]

async function fetchRate(seriesId: string): Promise<number | null> {
  if (!FRED_KEY) return null
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=5`
    const res = await fetch(url, { next: { revalidate: 43200 } })
    if (!res.ok) return null
    const json = await res.json()
    const obs = (json.observations ?? []).filter((o: { value: string }) => o.value !== '.')
    if (!obs.length) return null
    return parseFloat(obs[0].value)
  } catch {
    return null
  }
}

export async function GET() {
  const rates = await Promise.all(MATURITIES.map(m => fetchRate(m.id)))
  const points = MATURITIES.map((m, i) => ({ ...m, rate: rates[i] }))

  const r2y  = points.find(p => p.id === 'DGS2')?.rate ?? null
  const r3mo = points.find(p => p.id === 'DGS3MO')?.rate ?? null
  const r10y = points.find(p => p.id === 'DGS10')?.rate ?? null

  return NextResponse.json({
    points,
    spread_2y10y:  r2y  != null && r10y != null ? r10y - r2y  : null,
    spread_3mo10y: r3mo != null && r10y != null ? r10y - r3mo : null,
    fetchedAt: Date.now(),
  })
}
