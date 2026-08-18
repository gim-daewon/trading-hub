'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { EarningEntry } from '@/app/api/earnings-calendar/route'

const DAY_KO = ['월', '화', '수', '목', '금']
const MONTH_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function fmtDayLabel(dateStr: string, idx: number) {
  const d = new Date(dateStr)
  return `${MONTH_KO[d.getMonth()]} ${d.getDate()}일 (${DAY_KO[idx]})`
}

function fmtWeekRange(days: string[]) {
  if (days.length < 5) return ''
  const a = new Date(days[0]), b = new Date(days[4])
  return `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`
}

function EpsBadge({ actual, estimate }: { actual: number | null; estimate: number | null }) {
  if (actual === null || estimate === null) return null
  const beat = actual >= estimate
  const delta = actual - estimate
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
      background: beat ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
      color: beat ? '#22c55e' : '#ef4444',
    }}>
      {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
    </span>
  )
}

function EntryRow({ e }: { e: EarningEntry }) {
  const reported = e.epsActual !== null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
      borderBottom: '1px solid var(--border)', opacity: reported ? 0.6 : 1,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, width: 28, textAlign: 'center', flexShrink: 0,
        padding: '2px 0', borderRadius: 3,
        background: e.time === 'pre'  ? 'rgba(251,191,36,0.2)'
                  : e.time === 'post' ? 'rgba(99,102,241,0.2)' : 'rgba(100,116,139,0.15)',
        color: e.time === 'pre' ? '#f59e0b' : e.time === 'post' ? '#818cf8' : '#64748b',
      }}>
        {e.time === 'pre' ? '장전' : e.time === 'post' ? '장후' : '?'}
      </span>
      <span style={{
        fontSize: 13, fontWeight: 800, fontFamily: 'monospace', width: 64, flexShrink: 0,
        color: 'var(--text-primary)',
      }}>{e.symbol}</span>
      <span style={{
        flex: 1, fontSize: 11, color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{e.name}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        {reported ? (
          <>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
              ${e.epsActual!.toFixed(2)}
            </span>
            <EpsBadge actual={e.epsActual} estimate={e.epsEstimate} />
          </>
        ) : e.epsEstimate !== null ? (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            ${e.epsEstimate.toFixed(2)}e
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SectionGroup({ title, entries }: { title: string; entries: EarningEntry[] }) {
  const [limit, setLimit] = useState(25)
  return (
    <div>
      <div style={{
        padding: '5px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        color: 'var(--text-muted)', background: 'rgba(255,255,255,0.025)',
        borderBottom: '1px solid var(--border)',
      }}>
        {title} · {entries.length}건
      </div>
      {entries.slice(0, limit).map(e => <EntryRow key={e.symbol + e.date} e={e} />)}
      {entries.length > limit && (
        <button onClick={() => setLimit(l => l + 25)} style={{
          display: 'block', width: '100%', padding: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#60a5fa', fontSize: 11,
        }}>
          +{entries.length - limit}건 더 보기
        </button>
      )}
    </div>
  )
}

function DayList({ entries, label }: { entries: EarningEntry[]; label: string }) {
  const pre   = entries.filter(e => e.time === 'pre')
  const post  = entries.filter(e => e.time === 'post')
  const other = entries.filter(e => e.time !== 'pre' && e.time !== 'post')

  if (!entries.length) {
    return (
      <div style={{
        background: 'var(--bg-card)', borderRadius: 10, padding: 48,
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
        border: '1px solid var(--border)',
      }}>
        실적 발표 없음
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{
        padding: '11px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>총 {entries.length}건</span>
      </div>
      {pre.length   > 0 && <SectionGroup title="장전"     entries={pre} />}
      {post.length  > 0 && <SectionGroup title="장후"     entries={post} />}
      {other.length > 0 && <SectionGroup title="시간 미정" entries={other} />}
    </div>
  )
}

function SearchResults({ days, filtered }: { days: string[]; filtered: EarningEntry[] }) {
  if (!filtered.length) {
    return (
      <div style={{
        background: 'var(--bg-card)', borderRadius: 10, padding: 48,
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
        border: '1px solid var(--border)',
      }}>
        검색 결과 없음
      </div>
    )
  }
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
        {filtered.length}건 매치
      </div>
      {days.map((date, i) => {
        const dayEntries = filtered.filter(e => e.date === date)
        if (!dayEntries.length) return null
        return (
          <div key={date}>
            <div style={{
              padding: '5px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              color: 'var(--text-muted)', background: 'rgba(255,255,255,0.025)',
              borderBottom: '1px solid var(--border)',
            }}>
              {fmtDayLabel(date, i)} · {dayEntries.length}건
            </div>
            {dayEntries.map(e => <EntryRow key={e.symbol + e.date} e={e} />)}
          </div>
        )
      })}
    </div>
  )
}

export default function EarningsPage() {
  const [weekOffset, setWeekOffset]   = useState(0)
  const [data, setData]               = useState<{ days: string[]; entries: EarningEntry[] } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [selectedDay, setSelectedDay] = useState(0)
  const [search, setSearch]           = useState('')

  const load = useCallback((offset: number) => {
    setLoading(true)
    setData(null)
    fetch(`/api/earnings-calendar?week=${offset}`)
      .then(r => r.json())
      .then(j => {
        setData(j)
        const today = new Date().toISOString().slice(0, 10)
        const idx = (j.days as string[])?.indexOf(today) ?? -1
        setSelectedDay(idx >= 0 ? idx : 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(weekOffset) }, [weekOffset, load])

  const days    = data?.days ?? []
  const entries = data?.entries ?? []

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() =>
    q ? entries.filter(e =>
      e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
    ) : null
  , [entries, q])

  const dayEntries = useMemo(() =>
    days[selectedDay] ? entries.filter(e => e.date === days[selectedDay]) : []
  , [entries, days, selectedDay])

  const btnBase: CSSProperties = {
    padding: '5px 10px', borderRadius: 7, fontSize: 13,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', cursor: 'pointer',
  }

  return (
    <div style={{ padding: '16px', maxWidth: 860, margin: '0 auto' }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>실적 캘린더</h1>
          {days.length === 5 && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              {fmtWeekRange(days)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={btnBase}>←</button>
          <button onClick={() => setWeekOffset(0)} style={{
            ...btnBase,
            background: weekOffset === 0 ? 'var(--info)' : 'var(--bg-card)',
            color: weekOffset === 0 ? '#fff' : 'var(--text-muted)',
          }}>이번 주</button>
          <button onClick={() => setWeekOffset(w => w + 1)} style={btnBase}>→</button>
        </div>
      </div>

      {/* search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="티커 또는 회사명 검색..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 36px 9px 12px', borderRadius: 8,
            border: `1px solid ${q ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            fontSize: 13, outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
          }}>×</button>
        )}
      </div>

      {/* day tabs — hidden when searching */}
      {!loading && !q && days.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {days.map((date, i) => {
            const cnt     = entries.filter(e => e.date === date).length
            const isToday = date === new Date().toISOString().slice(0, 10)
            const active  = i === selectedDay
            return (
              <button key={date} onClick={() => setSelectedDay(i)} style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                background: active ? 'rgba(59,130,246,0.12)' : 'var(--bg-card)',
                color: active ? '#60a5fa' : isToday ? '#f59e0b' : 'var(--text-muted)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{DAY_KO[i]}</div>
                <div style={{ fontSize: 10, marginTop: 2 }}>{cnt}건</div>
                {isToday && <div style={{ fontSize: 8, marginTop: 1, color: '#f59e0b' }}>오늘</div>}
              </button>
            )
          })}
        </div>
      )}

      {/* content */}
      {loading ? (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 10, height: 280,
          opacity: 0.4, border: '1px solid var(--border)',
        }} />
      ) : filtered !== null ? (
        <SearchResults days={days} filtered={filtered} />
      ) : (
        <DayList
          entries={dayEntries}
          label={days[selectedDay] ? fmtDayLabel(days[selectedDay], selectedDay) : ''}
        />
      )}

      <p style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        Nasdaq 공개 API · 30분 캐시 · EPS Non-GAAP 기준
      </p>
    </div>
  )
}
