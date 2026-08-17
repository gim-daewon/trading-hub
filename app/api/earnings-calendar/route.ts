import { NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

interface NasdaqRow {
  symbol: string
  name: string
  eps_forecast: string
  eps_actual: string
  time: string
  noOfEsts: string
}

export interface EarningEntry {
  symbol: string
  name: string
  date: string           // YYYY-MM-DD
  epsEstimate: number | null
  epsActual: number | null
  time: 'pre' | 'post' | 'tbd'
  noOfEsts: number
}

async function fetchDay(dateStr: string): Promise<EarningEntry[]> {
  try {
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 1800 } })
    if (!res.ok) return []
    const json = await res.json()
    const rows: NasdaqRow[] = json?.data?.rows ?? []
    if (!Array.isArray(rows)) return []
    return rows.map(r => ({
      symbol:      r.symbol?.toUpperCase() ?? '',
      name:        r.name ?? '',
      date:        dateStr,
      epsEstimate: r.eps_forecast ? (parseFloat(r.eps_forecast) || null) : null,
      epsActual:   r.eps_actual   ? (parseFloat(r.eps_actual)   || null) : null,
      time:        (r.time?.toLowerCase().includes('before') ? 'pre'
                 : r.time?.toLowerCase().includes('after')  ? 'post' : 'tbd') as 'pre' | 'post' | 'tbd',
      noOfEsts:   parseInt(r.noOfEsts) || 0,
    })).filter(e => e.symbol)
  } catch {
    return []
  }
}

function getWeekDays(weekOffset: number): string[] {
  const now = new Date()
  const day = now.getDay()
  const mondayDelta = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayDelta + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  return [0, 1, 2, 3, 4].map(i => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const offset = parseInt(searchParams.get('week') ?? '0')
  const days = getWeekDays(offset)
  const results = await Promise.all(days.map(fetchDay))
  const entries = results.flat()
  return NextResponse.json({ days, entries })
}
