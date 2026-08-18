import { NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}

// Importance classification by event name keywords
const HIGH = /FOMC|Federal Reserve|Fed Fund|CPI|Consumer Price|PCE|Personal Consumption|Nonfarm|Unemployment Rate|GDP|Gross Domestic|Retail Sales|PPI|Producer Price|ISM Manufacturing|ISM Services|JOLTS/i
const MED  = /Jobless|Building Permit|Industrial Prod|Durable Goods|Trade Balance|Consumer Confidence|Michigan|PMI|Existing Home|New Home|Core Inflation|Housing Start/i

export interface EconEvent {
  date: string
  time: string
  name: string
  importance: 'high' | 'medium' | 'low'
  actual: string | null
  consensus: string | null
  previous: string | null
}

function getWeekDates(offset: number): string[] {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day   // Monday of current week
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + diff + offset * 7)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

async function fetchDay(date: string): Promise<EconEvent[]> {
  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/calendar/economicevents?date=${date}`,
      { headers: HEADERS, next: { revalidate: 1800 } }
    )
    if (!res.ok) return []
    const json = await res.json()

    type Row = {
      gmt?: string; country?: string; eventName?: string
      actual?: string; consensus?: string; previous?: string
    }
    const rows: Row[] = Array.isArray(json?.data?.rows) ? json.data.rows : []

    const ord: Record<EconEvent['importance'], number> = { high: 0, medium: 1, low: 2 }

    return rows
      .filter(r => !r.country || r.country === 'United States' || r.country === 'US')
      .map((r): EconEvent => {
        const name = r.eventName ?? ''
        const importance: EconEvent['importance'] =
          HIGH.test(name) ? 'high' : MED.test(name) ? 'medium' : 'low'
        return {
          date,
          time:      r.gmt ?? '',
          name,
          importance,
          actual:    r.actual    || null,
          consensus: r.consensus || null,
          previous:  r.previous  || null,
        }
      })
      .sort((a, b) => {
        if (ord[a.importance] !== ord[b.importance]) return ord[a.importance] - ord[b.importance]
        return (a.time || '99:99').localeCompare(b.time || '99:99')
      })
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const offset = parseInt(searchParams.get('week') ?? '0', 10)
  const days = getWeekDates(offset)
  const results = await Promise.all(days.map(fetchDay))
  return NextResponse.json({ days, events: results.flat() })
}
