import { NextResponse } from 'next/server'
import { sendMessage } from '@/lib/notify/telegram'
import { 신용한줄 } from '@/lib/credit'

const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}

const HIGH = /FOMC|Federal Reserve|Fed Fund|CPI|Consumer Price|PCE|Personal Consumption|Nonfarm|Unemployment Rate|GDP|Gross Domestic|Retail Sales|PPI|Producer Price|ISM Manufacturing|ISM Services|JOLTS/i

type EconRow = { gmt?: string; country?: string; eventName?: string; actual?: string; consensus?: string; previous?: string }

// Today in KST (UTC+9)
function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function dayOfWeekKST(): number {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.getUTCDay() // 0=Sun, 6=Sat
}

async function fetchHighEvents(date: string): Promise<EconRow[]> {
  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/calendar/economicevents?date=${date}`,
      { headers: NASDAQ_HEADERS }
    )
    if (!res.ok) return []
    const json = await res.json()
    const rows: EconRow[] = Array.isArray(json?.data?.rows) ? json.data.rows : []
    return rows.filter(r =>
      (!r.country || r.country === 'United States' || r.country === 'US') &&
      HIGH.test(r.eventName ?? '')
    ).sort((a, b) => (a.gmt ?? '99:99').localeCompare(b.gmt ?? '99:99'))
  } catch {
    return []
  }
}

function etTime(gmt: string | undefined): string {
  if (!gmt) return '—'
  // ET = UTC-4 (EDT) or UTC-5 (EST); use EDT (summer default)
  const [h, m] = gmt.split(':').map(Number)
  const et = ((h - 4 + 24) % 24)
  return `${String(et).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')} ET`
}

function kstTime(gmt: string | undefined): string {
  if (!gmt) return '—'
  const [h, m] = gmt.split(':').map(Number)
  const kst = ((h + 9) % 24)
  return `${String(kst).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')} KST`
}

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function buildMorningMessage(date: string, events: EconRow[]): string {
  const d   = new Date(date)
  const dow = DAY_KO[d.getUTCDay()]
  const mm  = d.getUTCMonth() + 1
  const dd  = d.getUTCDate()

  if (events.length === 0) {
    return `📅 <b>오늘의 경제지표</b>\n<i>${mm}/${dd}(${dow})</i>\n\n오늘 주요 경제 지표 없음`
  }

  const lines = events.map(e => {
    const t    = kstTime(e.gmt)
    const cons = e.consensus ? `예상 ${e.consensus}` : ''
    const prev = e.previous  ? `이전 ${e.previous}`  : ''
    const meta = [cons, prev].filter(Boolean).join(' | ')
    return `🔴 <b>${e.eventName}</b>  ${t}${meta ? `\n   ${meta}` : ''}`
  })

  return (
    `📅 <b>오늘의 경제지표</b>\n` +
    `<i>${mm}/${dd}(${dow}) — 미국 주요 지표</i>\n\n` +
    lines.join('\n\n') +
    `\n\n<a href="https://trading-hub-nu-orcin.vercel.app/calendar">📊 캘린더 보기</a>`
  )
}

function buildAfternoonMessage(date: string, events: EconRow[]): string {
  const d   = new Date(date)
  const dow = DAY_KO[d.getUTCDay()]
  const mm  = d.getUTCMonth() + 1
  const dd  = d.getUTCDate()

  const released = events.filter(e => e.actual)
  const pending  = events.filter(e => !e.actual)

  if (events.length === 0) {
    return `📊 <b>오늘의 지표 결과</b>\n<i>${mm}/${dd}(${dow})</i>\n\n오늘 주요 경제 지표 없음`
  }

  const resultLines = released.map(e => {
    const cons    = e.consensus ? parseFloat(e.consensus.replace(/[^0-9.-]/g, '')) : null
    const actual  = e.actual    ? parseFloat(e.actual.replace(/[^0-9.-]/g, ''))    : null
    let arrow = ''
    if (cons !== null && actual !== null && !isNaN(cons) && !isNaN(actual)) {
      arrow = actual > cons ? ' ▲' : actual < cons ? ' ▼' : ' ='
    }
    const actLabel = `실제 <b>${e.actual}${arrow}</b>`
    const consLabel = e.consensus ? ` (예상 ${e.consensus})` : ''
    return `${e.eventName}\n${actLabel}${consLabel}`
  })

  const pendingLines = pending.map(e => `${e.eventName} — 미발표`)

  const parts = []
  if (resultLines.length > 0) parts.push(resultLines.join('\n\n'))
  if (pendingLines.length > 0) parts.push('<i>미발표</i>\n' + pendingLines.join('\n'))

  return (
    `📊 <b>오늘의 지표 결과</b>\n` +
    `<i>${mm}/${dd}(${dow})</i>\n\n` +
    parts.join('\n\n') +
    `\n\n<a href="https://trading-hub-nu-orcin.vercel.app/calendar">캘린더 보기</a>`
  )
}

async function creditLine(origin: string): Promise<string> {
  try {
    const r = await fetch(`${origin}/api/credit`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    if (!d?.판정?.조건) throw new Error('응답에 판정 없음')
    return `${신용한줄(d.판정, d.어제판정?.조건 ? d.어제판정 : null)}\n<a href="${origin}/credit">AI 신용 보기</a>`
  } catch (e) {
    // 오류 문구에 비밀이 실릴 수 있어 종류만 적는다
    return `AI 신용: 불러오기 실패 (${e instanceof Error ? e.name : 'unknown'})`
  }
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${secret}`) return true

  const url = new URL(req.url)
  if (url.searchParams.get('secret') === secret) return true

  return false
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Skip weekends (KST)
  const dow = dayOfWeekKST()
  if (dow === 0 || dow === 6) {
    return NextResponse.json({ skipped: 'weekend' })
  }

  const url    = new URL(req.url)
  const type   = url.searchParams.get('type') ?? 'morning'
  const date   = todayKST()
  const events = await fetchHighEvents(date)

  let text = type === 'afternoon'
    ? buildAfternoonMessage(date, events)
    : buildMorningMessage(date, events)

  // 아침 알림에 AI 신용 한 줄 — 실패해도 경제지표 알림은 나가고, 실패했다고 적는다
  if (type !== 'afternoon') text += `\n\n${await creditLine(url.origin)}`

  const sent = await sendMessage(text)

  return NextResponse.json({ date, type, eventCount: events.length, sent })
}
