'use client'
import { useEffect, useState, useCallback } from 'react'
import { ASSETS } from '@/lib/registry'
import type { EarningEntry } from '@/app/api/earnings-calendar/route'

const WATCHLIST_SYMBOLS = new Set(ASSETS.map(a => a.id.toUpperCase()))
const ASSET_LABEL = Object.fromEntries(ASSETS.map(a => [a.id.toUpperCase(), a.label]))

const DAY_KO = ['월', '화', '수', '목', '금']
const MONTH_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function fmtDayLabel(dateStr: string, idx: number): string {
  const d = new Date(dateStr)
  return `${MONTH_KO[d.getMonth()]} ${d.getDate()}일 (${DAY_KO[idx]})`
}

function fmtWeekRange(days: string[]): string {
  if (days.length < 5) return ''
  const a = new Date(days[0]), b = new Date(days[4])
  return `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10)
}

function EpsChange({ actual, estimate }: { actual: number | null; estimate: number | null }) {
  if (actual === null || estimate === null) return null
  const beat = actual >= estimate
  const delta = actual - estimate
  return (
    <span style={{
      marginLeft: 4, fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
      background: beat ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
      color: beat ? '#22c55e' : '#ef4444',
    }}>
      {beat ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
    </span>
  )
}

function EntryRow({ e, highlight }: { e: EarningEntry; highlight: boolean }) {
  const reported = e.epsActual !== null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
      borderRadius: 6, background: highlight ? 'rgba(59,130,246,0.1)' : 'transparent',
      borderLeft: highlight ? '2px solid #3b82f6' : '2px solid transparent',
      opacity: reported ? 0.65 : 1,
    }}>
      {/* time badge */}
      <span style={{
        fontSize: 8, fontWeight: 700, width: 22, textAlign: 'center',
        padding: '1px 0', borderRadius: 3, flexShrink: 0,
        background: e.time === 'pre'  ? 'rgba(251,191,36,0.2)'
                  : e.time === 'post' ? 'rgba(99,102,241,0.2)' : 'rgba(100,116,139,0.15)',
        color:    e.time === 'pre'  ? '#f59e0b'
                : e.time === 'post' ? '#818cf8' : '#64748b',
      }}>
        {e.time === 'pre' ? '장전' : e.time === 'post' ? '장후' : '?'}
      </span>

      {/* symbol + name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: highlight ? 800 : 700, fontFamily: 'monospace',
          color: highlight ? '#3b82f6' : 'var(--text-primary)',
        }}>{e.symbol}</span>
        {highlight && ASSET_LABEL[e.symbol] && (
          <span style={{ fontSize: 9, color: '#3b82f6', marginLeft: 4 }}>{ASSET_LABEL[e.symbol]}</span>
        )}
        {!highlight && (
          <span style={{
            display: 'block', fontSize: 9, color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{e.name}</span>
        )}
      </div>

      {/* EPS */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {reported ? (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            ${e.epsActual!.toFixed(2)}
            <EpsChange actual={e.epsActual} estimate={e.epsEstimate} />
          </span>
        ) : e.epsEstimate !== null ? (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            ${e.epsEstimate.toFixed(2)}e
          </span>
        ) : null}
      </div>
    </div>
  )
}

function DayColumn({ date, dayIdx, entries, filter }: {
  date: string
  dayIdx: number
  entries: EarningEntry[]
  filter: 'all' | 'watchlist'
}) {
  const today = isToday(date)
  const visible = filter === 'watchlist'
    ? entries.filter(e => WATCHLIST_SYMBOLS.has(e.symbol))
    : entries

  // watchlist entries first, then rest
  const sorted = [
    ...visible.filter(e => WATCHLIST_SYMBOLS.has(e.symbol)),
    ...visible.filter(e => !WATCHLIST_SYMBOLS.has(e.symbol)),
  ]

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: today ? 'rgba(59,130,246,0.04)' : 'var(--bg-card)',
      borderRadius: 10, padding: '10px 8px',
      border: today ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border)',
    }}>
      {/* day header */}
      <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: today ? '#3b82f6' : 'var(--text-muted)', fontWeight: today ? 700 : 400 }}>
          {fmtDayLabel(date, dayIdx)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
          {entries.length}건
          {filter === 'all' && entries.filter(e => WATCHLIST_SYMBOLS.has(e.symbol)).length > 0 && (
            <span style={{ color: '#3b82f6', marginLeft: 4 }}>
              (내 종목 {entries.filter(e => WATCHLIST_SYMBOLS.has(e.symbol)).length})
            </span>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
          {filter === 'watchlist' ? '없음' : '데이터 없음'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {sorted.slice(0, filter === 'all' ? 60 : 30).map(e => (
            <EntryRow key={e.symbol + e.date} e={e} highlight={WATCHLIST_SYMBOLS.has(e.symbol)} />
          ))}
          {filter === 'all' && sorted.length > 60 && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
              +{sorted.length - 60}건 더
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EarningsPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [data, setData] = useState<{ days: string[]; entries: EarningEntry[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'watchlist'>('all')

  const load = useCallback((offset: number) => {
    setLoading(true)
    setData(null)
    fetch(`/api/earnings-calendar?week=${offset}`)
      .then(r => r.json())
      .then(j => setData(j))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(weekOffset) }, [weekOffset, load])

  const days = data?.days ?? []
  const entries = data?.entries ?? []

  return (
    <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>실적 캘린더</h1>
          {days.length === 5 && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              {fmtWeekRange(days)}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* filter */}
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg-card)', borderRadius: 8, padding: 3 }}>
            {(['all', 'watchlist'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, border: 'none',
                background: filter === f ? 'var(--info)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}>{f === 'all' ? '전체' : '내 종목'}</button>
            ))}
          </div>
          {/* week nav */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 13, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
            }}>←</button>
            <button onClick={() => setWeekOffset(0)} style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 11, border: '1px solid var(--border)',
              background: weekOffset === 0 ? 'var(--info)' : 'var(--bg-card)',
              color: weekOffset === 0 ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
            }}>이번 주</button>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 13, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
            }}>→</button>
          </div>
        </div>
      </div>

      {/* calendar grid */}
      {loading ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 300, borderRadius: 10, background: 'var(--bg-card)', opacity: 0.4 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {days.map((date, i) => (
            <DayColumn
              key={date}
              date={date}
              dayIdx={i}
              entries={entries.filter(e => e.date === date)}
              filter={filter}
            />
          ))}
        </div>
      )}

      <p style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        Nasdaq 공개 API · 30분 캐시 · 파란색 = 내 워치리스트 종목 · EPS는 Non-GAAP 기준
      </p>
    </div>
  )
}
