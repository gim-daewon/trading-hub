'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { EconEvent } from '@/app/api/econ-calendar/route'

const DAY_KO   = ['월', '화', '수', '목', '금']
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

const IMP = {
  high:   { dot: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: '중요' },
  medium: { dot: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: '보통' },
  low:    { dot: '#475569', bg: 'rgba(71,85,105,0.1)',    label: '낮음' },
}

function EventRow({ e }: { e: EconEvent }) {
  const c = IMP[e.importance]
  const released = e.actual !== null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
      borderBottom: '1px solid var(--border)',
      background: e.importance === 'high' && !released ? 'rgba(239,68,68,0.03)' : 'transparent',
    }}>
      {/* importance dot */}
      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: c.dot }} />

      {/* time (ET) */}
      <span style={{
        fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)',
        width: 44, flexShrink: 0,
      }}>
        {e.time || '—'}
      </span>

      {/* event name */}
      <span style={{
        flex: 1, fontSize: 13,
        fontWeight: e.importance === 'high' ? 700 : 400,
        color: e.importance === 'high' ? 'var(--text-primary)' : 'var(--text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{e.name}</span>

      {/* values */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 11, fontFamily: 'monospace' }}>
        {e.consensus !== null && (
          <span style={{ color: 'var(--text-muted)' }}>예상 {e.consensus}</span>
        )}
        {e.actual !== null ? (
          <span style={{
            fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: c.bg, color: c.dot,
          }}>
            실제 {e.actual}
          </span>
        ) : e.previous !== null ? (
          <span style={{ color: 'var(--text-muted)' }}>이전 {e.previous}</span>
        ) : null}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const [weekOffset, setWeekOffset]   = useState(0)
  const [data, setData]               = useState<{ days: string[]; events: EconEvent[] } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [selectedDay, setSelectedDay] = useState(0)
  const [filter, setFilter]           = useState<'all' | 'high'>('all')

  const load = useCallback((offset: number) => {
    setLoading(true)
    setData(null)
    fetch(`/api/econ-calendar?week=${offset}`)
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

  const days   = data?.days   ?? []
  const events = data?.events ?? []

  const dayEvents = useMemo(() => {
    const base = days[selectedDay] ? events.filter(e => e.date === days[selectedDay]) : []
    return filter === 'high' ? base.filter(e => e.importance === 'high') : base
  }, [events, days, selectedDay, filter])

  const btnBase: CSSProperties = {
    padding: '5px 10px', borderRadius: 7, fontSize: 13,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', cursor: 'pointer',
  }

  return (
    <div style={{ padding: '16px', maxWidth: 860, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>매크로 캘린더</h1>
          {days.length === 5 && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{fmtWeekRange(days)}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* filter toggle */}
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg-card)', borderRadius: 8, padding: 3 }}>
            {(['all', 'high'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, border: 'none', cursor: 'pointer',
                background: filter === f ? 'var(--info)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--text-muted)',
              }}>{f === 'all' ? '전체' : '주요만'}</button>
            ))}
          </div>
          {/* week nav */}
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
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
        {(['high', 'medium', 'low'] as const).map(imp => (
          <div key={imp} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: IMP[imp].dot, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{IMP[imp].label}</span>
          </div>
        ))}
      </div>

      {/* day tabs */}
      {!loading && days.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {days.map((date, i) => {
            const dayEvs  = events.filter(e => e.date === date)
            const highCnt = dayEvs.filter(e => e.importance === 'high').length
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
                <div style={{ fontSize: 10, marginTop: 2 }}>{dayEvs.length}건</div>
                {highCnt > 0 && (
                  <div style={{ fontSize: 8, marginTop: 1, color: '#ef4444' }}>중요 {highCnt}</div>
                )}
                {isToday && highCnt === 0 && (
                  <div style={{ fontSize: 8, marginTop: 1, color: '#f59e0b' }}>오늘</div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* content */}
      {loading ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 10, height: 240, opacity: 0.4, border: '1px solid var(--border)' }} />
      ) : dayEvents.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px solid var(--border)' }}>
          {filter === 'high' ? '이날 주요 이벤트 없음' : '예정된 이벤트 없음'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {days[selectedDay] ? fmtDayLabel(days[selectedDay], selectedDay) : ''}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dayEvents.length}건</span>
          </div>
          {dayEvents.map((e, i) => (
            <EventRow key={`${e.date}-${e.time}-${i}`} e={e} />
          ))}
        </div>
      )}

      <p style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        Nasdaq 경제이벤트 API · 30분 캐시 · 미국 지표만 표시 · 시간은 ET 기준
      </p>
    </div>
  )
}
