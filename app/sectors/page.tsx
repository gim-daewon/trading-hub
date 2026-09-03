'use client'
import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink, TvLayoutSetting } from '../components/TvLink'

interface Holding {
  symbol: string
  name: string
  pct: number
  price: number | null
  changePct: number | null
}

interface SectorData {
  id: string
  label: string
  etf: string
  color: string
  group?: string
  broad: boolean
  price: number | null
  change: number | null
  changePct: number | null
  rs1d: number | null
  /** 거래일별 누적 등락률 (5·20·60·120) */
  periods: Record<string, number | null>
  /** 같은 기간의 SPY 대비 초과수익 */
  rs: Record<string, number | null>
  ts: number
}

interface SpyData { price: number; changePct: number }

type ViewMode = 'heatmap' | 'table'

/**
 * 순환 관측 기간. 10년·47섹터·겹치지 않는 113구간 실측으로 골랐다.
 *
 * 상위 섹터를 따라가는 건 어느 기간도 유의하지 않다(최고 54%, z=0.85).
 * 유의한 신호는 하나뿐이다 — 120일 하위 섹터는 63%의 구간에서 계속 뒤처졌다
 * (양수 37%, z=-2.77). 그래서 120일을 반드시 노출한다.
 *
 * 20일은 가장 쓸모없었다(상위 49% / 하위 43%). 그래도 남긴 이유는
 * 수급 스크리너가 20일 기준이라 화면끼리 맞춰 보기 위해서다.
 */
const PERIODS = [
  { key: '1',   label: '1일',   note: '오늘 무엇이 움직였나' },
  { key: '5',   label: '5일',   note: '단기 순환. 예측력은 없다 (54%, 유의 안 함)' },
  { key: '20',  label: '20일',  note: '스크리너와 같은 창. 순환 신호로는 가장 약했다 (49%)' },
  { key: '60',  label: '60일',  note: '중기 추세 (50%, 유의 안 함)' },
  { key: '120', label: '120일', note: '하위권이 계속 뒤처진다 (양수 37%, z=-2.77 · 유의)' },
] as const
type PeriodKey = typeof PERIODS[number]['key']

function pctLabel(v: number | null, decimals = 2): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

/** 색 클래스는 언제나 값의 부호에서 나온다 */
const cls = (v: number | null) => v == null ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'

function PctBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="flat">—</span>
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  return <span className={`num ${cls}`}>{pctLabel(v)}</span>
}

function RsBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="flat">—</span>
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  const sign = v >= 0 ? '+' : ''
  return <span className={`num ${cls}`}>{sign}{v.toFixed(2)}pp</span>
}

interface ConstituentFlow {
  symbol: string; name: string; pct: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null
}
interface SectorFlow {
  etfFlow: { f20: number | null } | null
  weightedF20: number | null
  megaCapSkew: { symbol: string; pct: number; f20: number; othersAvg: number } | null
  inflow: number
  outflow: number
  constituents: ConstituentFlow[]
}

export default function SectorsPage() {
  const [sectors, setSectors]   = useState<SectorData[]>([])
  const [spy, setSpy]           = useState<SpyData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [view, setView]         = useState<ViewMode>('heatmap')
  const [period, setPeriod]     = useState<PeriodKey>('1')
  // 그룹은 기본 접힘. 47개를 한 번에 펴면 폰에서 스크롤이 끝나지 않는다
  const [openGroups, setOpen]   = useState<Set<string>>(new Set())
  const [selected, setSelected]     = useState<SectorData | null>(null)
  const [holdings, setHoldings]     = useState<Holding[]>([])
  const [holdLoading, setHoldLoad]  = useState(false)
  const [holdSource, setHoldSource] = useState<string>('static')
  const [flow, setFlow]             = useState<SectorFlow | null>(null)
  const [flowLoading, setFlowLoad]  = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/sectors')
      if (!res.ok) throw new Error('API 오류')
      const json = await res.json()
      setSectors(json.sectors ?? [])
      setSpy(json.spy ?? null)
      setFetchedAt(json.fetchedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 5분 자동 새로고침
  useEffect(() => {
    const t = setInterval(load, 300_000)
    return () => clearInterval(t)
  }, [load])

  // 섹터 클릭 시 ETF 구성종목 조회
  useEffect(() => {
    if (!selected) { setHoldings([]); return }
    setHoldLoad(true)
    fetch(`/api/etf-holdings?etf=${selected.etf}`)
      .then(r => r.json())
      .then(j => { setHoldings(j.holdings ?? []); setHoldSource(j.source ?? 'static') })
      .catch(() => { setHoldings([]); setHoldSource('static') })
      .finally(() => setHoldLoad(false))
  }, [selected])

  // 구성종목 자금 흐름 (10요청, 약 0.4초)
  useEffect(() => {
    if (!selected) { setFlow(null); return }
    setFlowLoad(true)
    fetch(`/api/sector-flow?etf=${selected.etf}`)
      .then(r => r.json())
      .then(j => setFlow(j.error ? null : j))
      .catch(() => setFlow(null))
      .finally(() => setFlowLoad(false))
  }, [selected])

  // 선택한 기간의 등락률. 1일은 changePct, 나머지는 periods에서 꺼낸다
  const pctOf = useCallback(
    (s: SectorData) => period === '1' ? s.changePct : (s.periods?.[period] ?? null),
    [period]
  )
  const rsOf = useCallback(
    (s: SectorData) => period === '1' ? s.rs1d : (s.rs?.[period] ?? null),
    [period]
  )
  const byPct = useCallback(
    (list: SectorData[]) => [...list].sort((a, b) => (pctOf(b) ?? -999) - (pctOf(a) ?? -999)),
    [pctOf]
  )

  const sorted = byPct(sectors)
  const broad  = byPct(sectors.filter(s => s.broad))
  // 그룹 순서는 registry의 SECTOR_GROUPS를 따른다. 그룹 안에서만 등락순 정렬
  const groups = sectors.filter(s => !s.broad).reduce<{ label: string; items: SectorData[] }[]>((acc, s) => {
    const g = s.group ?? '기타'
    const hit = acc.find(x => x.label === g)
    if (hit) hit.items.push(s); else acc.push({ label: g, items: [s] })
    return acc
  }, []).map(g => ({ ...g, items: byPct(g.items) }))

  // 120일 하위 5개. 실측에서 유의했던 유일한 신호라 기간 탭과 무관하게 항상 계산한다.
  // 백테스트가 "하위 3~5개"를 봤으므로 5개로 맞춘다.
  const laggards = [...sectors]
    .filter(s => s.periods?.['120'] != null)
    .sort((a, b) => (a.periods['120'] as number) - (b.periods['120'] as number))
    .slice(0, 5)

  const toggleGroup = (label: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(label)) next.delete(label); else next.add(label)
    return next
  })

  /**
   * 순위 행 — 한 줄에 한 섹터.
   *
   * 카드 그리드에서 바꿨다. 섹터 화면을 보는 이유는 "무엇이 시장보다 센가"인데
   * 2열 카드로는 11개를 보려고 여섯 줄을 스크롤해야 하고, 그 사이 1등이 뭐였는지
   * 잊는다. 순위는 세로 나열이 가장 잘 읽힌다.
   *
   * 막대 = vs SPY (시장 대비 강도), 숫자 = 절대 등락.
   * 둘을 분리해야 "헬스케어 +0.1%인데 vs SPY -0.8pp"가 헷갈리지 않는다.
   */
  const Row = ({ s, maxAbs }: { s: SectorData; maxAbs: number }) => {
    const v = pctOf(s), r = rsOf(s)
    const w = maxAbs > 0 && r != null ? Math.min(Math.abs(r) / maxAbs, 1) * 50 : 0
    const pos = (r ?? 0) >= 0
    return (
      <button
        onClick={() => setSelected(selected?.id === s.id ? null : s)}
        style={{
          width: '100%', display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 64px 62px',
          alignItems: 'center', gap: 8, minHeight: 44, padding: '0 10px',
          background: selected?.id === s.id ? 'var(--bg-hover)' : 'transparent',
          border: 'none', borderBottom: '1px solid var(--border)',
          cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{s.etf}</span>
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{s.label}</span>
        </span>

        {/* 중앙선이 SPY. 오른쪽으로 뻗으면 시장 상회, 왼쪽이면 하회 */}
        <span style={{ position: 'relative', height: 16 }}>
          <span style={{
            position: 'absolute', left: '50%', top: 0, bottom: 0,
            width: 1, background: 'var(--border)',
          }} />
          {r != null && (
            <span style={{
              position: 'absolute', top: 4, height: 8, borderRadius: 2,
              width: `${w}%`,
              left: pos ? '50%' : undefined,
              right: pos ? undefined : '50%',
              background: pos ? 'var(--up)' : 'var(--down)',
            }} />
          )}
        </span>

        <span style={{ textAlign: 'right' }}>
          <span className={`num ${cls(v)}`} style={{ fontSize: 13, fontWeight: 700, display: 'block' }}>
            {pctLabel(v, 1)}
          </span>
          <span className="num" style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>
            {r == null ? '' : `${r >= 0 ? '+' : ''}${r.toFixed(1)}pp`}
          </span>
        </span>
      </button>
    )
  }

  /** 목록 하나를 순위로 그린다. 막대 스케일은 그 목록 안에서 정규화한다 */
  const RankList = ({ items }: { items: SectorData[] }) => {
    const maxAbs = Math.max(...items.map(s => Math.abs(rsOf(s) ?? 0)), 0.1)
    return (
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {items.map(s => <Row key={s.id} s={s} maxAbs={maxAbs} />)}
      </div>
    )
  }

  return (
    <>
    <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="섹터 자금 흐름"
        fetchedAt={fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={spy && (
          <span style={{ color: 'var(--text-secondary)' }}>
            SPY <span className="num" style={{ color: spy.changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {pctLabel(spy.changePct)}
            </span>
          </span>
        )}
      />

      {/* 뷰/정렬 토글 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['heatmap', 'table'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 12, border: '1px solid var(--border)',
              background: view === v ? 'var(--info)' : 'var(--bg-card)',
              color: view === v ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {v === 'heatmap' ? '히트맵' : '테이블'}
          </button>
        ))}
      </div>

      {/* 순환 관측 기간 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 2 }}>
        {PERIODS.map(p => {
          const active = period === p.key
          return (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{
              flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
            }}>{p.label}</button>
          )
        })}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {PERIODS.find(p => p.key === period)?.note}
        {period === '120' && (
          <>
            <br />
            <span style={{ color: 'var(--warn)' }}>
              10년 113구간 실측에서 유의한 신호는 이것 하나였다. 다만 방향은 <b>회피</b>다 —
              하위권을 피하는 데 쓰지, 상위권을 따라가는 근거는 되지 않는다.
            </span>
          </>
        )}
      </p>

      {error && (
        <div style={{ background: '#7f1d1d22', border: '1px solid #dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--down)', fontSize: 13 }}>
          {error} — <button onClick={load} style={{ color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>재시도</button>
        </div>
      )}

      {/* 120일 부진 섹터 — 유일하게 유의했던 신호라 항상 보여준다 */}
      {laggards.length > 0 && (
        <div className="card" style={{
          padding: '10px 12px', marginBottom: 14, fontSize: 11, lineHeight: 1.6,
          borderLeft: '3px solid var(--warn)',
        }}>
          <b style={{ color: 'var(--warn)' }}>120일 부진 섹터 {laggards.length}</b>
          <span style={{ color: 'var(--text-muted)' }}> — 10년 113구간에서 63%가 다음 20일에도 뒤처졌다 (z=-2.77)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 6px' }}>
            {laggards.map(s => (
              <button key={s.id} onClick={() => setSelected(s)} style={{
                minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap',
              }}>
                <span className="num" style={{ fontWeight: 700 }}>{s.etf}</span>
                <span style={{ color: 'var(--text-muted)' }}> {s.label} </span>
                <span className="num down">{pctLabel(s.periods?.['120'] ?? null, 1)}</span>
              </button>
            ))}
          </div>
          <span style={{ color: 'var(--text-muted)' }}>
            검증된 범위는 <b>섹터 ETF를 사는 경우</b>다. 이 섹터에 속한 개별 종목까지
            피하라는 뜻은 아니다 — 눌림목 후보에 이 필터를 걸어본 결과 효과가 없었다
            (양수비율 52%로 동일, 중앙값은 오히려 하락).
          </span>
        </div>
      )}

      {/* ── 히트맵 뷰 — 대분류 11개를 위에, 세부 36개를 접이식 그룹으로 ── */}
      {view === 'heatmap' && (
        loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ height: 100, borderRadius: 8, background: 'var(--bg-card)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 6px' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                GICS 대분류 {broad.length}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                막대 = SPY 대비 · 숫자 = 등락
              </p>
            </div>
            <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
              <RankList items={broad} />
            </div>

            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              세부 섹터 {sectors.length - broad.length} · 눌러서 펼치기
            </p>
            {groups.map(g => {
              const open = openGroups.has(g.label)
              // 접힌 상태에서도 그룹 안에서 뭐가 제일 세고 약한지는 보여준다
              const best = g.items[0], worst = g.items[g.items.length - 1]
              return (
                <div key={g.label} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => toggleGroup(g.label)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      minHeight: 44, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', fontSize: 13, textAlign: 'left',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 10 }}>{open ? '▾' : '▸'}</span>
                    <span style={{ fontWeight: 700 }}>{g.label}</span>
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.items.length}</span>
                    {/* 색은 반드시 값의 부호를 따른다.
                        최고=초록·최저=빨강으로 하드코딩했더니 둘 다 양수인 그룹에서
                        "IBIT +5.0%"가 빨갛게 나왔다. 순위는 위치로, 부호는 색으로 구분한다 */}
                    {!open && best && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                        <span className={`num ${cls(pctOf(best))}`}>
                          <span style={{ color: 'var(--text-muted)', marginRight: 3 }}>▲</span>
                          {best.etf} {pctLabel(pctOf(best), 1)}
                        </span>
                        {worst && worst.id !== best.id && (
                          <span className={`num ${cls(pctOf(worst))}`}>
                            <span style={{ color: 'var(--text-muted)', marginRight: 3 }}>▼</span>
                            {worst.etf} {pctLabel(pctOf(worst), 1)}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="card" style={{ overflow: 'hidden', marginTop: 4 }}>
                      <RankList items={g.items} />
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )
      )}

      {/* ── 테이블 뷰 ── */}
      {view === 'table' && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ textAlign: 'left',  padding: '6px 8px' }}>섹터</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>ETF</th>
                {PERIODS.map(p => (
                  <th key={p.key} style={{ textAlign: 'right', padding: '6px 8px' }}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 30 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {Array.from({ length: PERIODS.length + 2 }).map((_, j) => (
                        <td key={j} style={{ padding: '10px 8px' }}>
                          <div style={{ height: 14, borderRadius: 4, background: 'var(--bg-card)' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map(s => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: selected?.id === s.id ? 'var(--bg-hover)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          {s.label}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)' }} className="num">
                        <TvLink symbol={s.etf} />
                      </td>
                      {PERIODS.map(p => (
                        <td key={p.key} style={{
                          textAlign: 'right', padding: '10px 8px',
                          // 선택한 기간을 강조해 정렬 기준이 어디인지 보이게 한다
                          background: period === p.key ? 'var(--bg-hover)' : undefined,
                        }}>
                          <PctBadge v={p.key === '1' ? s.changePct : (s.periods?.[p.key] ?? null)} />
                        </td>
                      ))}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>

    {/* ── 바텀시트: 섹터 상세 ── */}

    {selected && (
      <>
        {/* 백드롭 */}
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: '#00000066',
            backdropFilter: 'blur(2px)', zIndex: 200,
          }}
        />

        {/* 패널 */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0',
          maxHeight: '70vh', overflowY: 'auto',
          zIndex: 201,
          animation: 'slideUp 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          padding: '0 0 env(safe-area-inset-bottom)',
        }}>
          {/* 핸들 */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>

          <div style={{ padding: '0 16px 24px' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}><TvLink symbol={selected.etf} /></p>
                <h2 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800 }}>{selected.label}</h2>
              </div>
              <button onClick={() => setSelected(null)} style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>✕</button>
            </div>

            {/* 스탯 3개 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: '현재가',   v: selected.price ? `$${selected.price.toFixed(2)}` : '—' },
                { label: '1D 등락', v: <PctBadge v={selected.changePct} /> },
                { label: 'vs SPY',  v: <RsBadge v={selected.rs1d} /> },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{item.label}</p>
                  <p className="num" style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700 }}>{item.v}</p>
                </div>
              ))}
            </div>

            <div style={{
              marginBottom: 14, padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
            }}>
              <TvLayoutSetting />
            </div>

            {/* 구성종목 자금 흐름 — ETF 거래량은 유통시장 손바뀜이라
                어느 종목에 돈이 갔는지 못 본다. 종목별로 내려가야 분화가 보인다. */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                구성종목 자금 흐름 · 20일
              </p>
              {flowLoading ? (
                <div style={{ height: 88, borderRadius: 8, background: 'var(--bg-surface)', opacity: 0.6, animation: 'pulse 1.5s infinite' }} />
              ) : !flow || flow.constituents.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>자금 데이터 없음</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 96, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ETF 레벨</div>
                      <div className={`num ${(flow.etfFlow?.f20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 15, fontWeight: 700 }}>
                        {flow.etfFlow?.f20 == null ? '—' : `${flow.etfFlow.f20 >= 0 ? '+' : ''}${flow.etfFlow.f20.toFixed(0)}%`}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 96, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>비중가중</div>
                      <div className={`num ${(flow.weightedF20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 15, fontWeight: 700 }}>
                        {flow.weightedF20 == null ? '—' : `${flow.weightedF20 >= 0 ? '+' : ''}${flow.weightedF20.toFixed(0)}%`}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 96, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>유입 / 유출</div>
                      <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                        <span className="up">{flow.inflow}</span>
                        <span style={{ color: 'var(--text-muted)' }}> / </span>
                        <span className="down">{flow.outflow}</span>
                      </div>
                    </div>
                  </div>

                  {flow.megaCapSkew && (
                    <div style={{
                      background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--warn)',
                    }}>
                      대형주 왜곡 — 최대 비중 <b>{flow.megaCapSkew.symbol}</b>({(flow.megaCapSkew.pct * 100).toFixed(1)}%)가{' '}
                      {flow.megaCapSkew.f20 >= 0 ? '+' : ''}{flow.megaCapSkew.f20.toFixed(0)}%로
                      나머지 평균({flow.megaCapSkew.othersAvg >= 0 ? '+' : ''}{flow.megaCapSkew.othersAvg.toFixed(0)}%)과 방향이 반대다.
                      ETF 수치만 보면 가려진다.
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {flow.constituents.map(c => {
                      const w = Math.min(Math.abs(c.f20 ?? 0), 100)
                      const up = (c.f20 ?? 0) >= 0
                      return (
                        <div key={c.symbol} style={{
                          display: 'grid', gridTemplateColumns: '52px 40px 1fr 46px',
                          alignItems: 'center', gap: 8, padding: '5px 10px',
                          borderRadius: 6, background: 'var(--bg-surface)',
                        }}>
                          <span className="num" style={{ fontSize: 12, fontWeight: 700 }}><TvLink symbol={c.symbol} /></span>
                          <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(c.pct * 100).toFixed(1)}%</span>
                          <span style={{ height: 5, borderRadius: 3, background: 'var(--bg-base)', overflow: 'hidden' }}>
                            <span style={{
                              display: 'block', height: '100%', width: `${w}%`,
                              background: up ? 'var(--up)' : 'var(--down)',
                              marginLeft: up ? 0 : `${100 - w}%`,
                            }} />
                          </span>
                          <span className={`num ${up ? 'up' : 'down'}`} style={{ fontSize: 11, textAlign: 'right' }}>
                            {c.f20 == null ? '—' : `${up ? '+' : ''}${c.f20.toFixed(0)}%`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 구성종목 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                주요 구성종목 top 10
              </p>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                background: holdSource === 'ishares' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                color:      holdSource === 'ishares' ? '#22c55e' : '#64748b',
              }}>
                {holdSource === 'ishares' ? 'iShares 실시간' : holdSource === 'yahoo' ? 'Yahoo' : '정적 데이터'}
              </span>
            </div>
            {holdLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: 32, borderRadius: 8, background: 'var(--bg-surface)', opacity: 0.6, animation: 'pulse 1.5s infinite' }} />
                ))}
              </div>
            ) : holdings.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>데이터 없음 (휴장일이거나 Yahoo 응답 없음)</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {holdings.slice(0, 10).map(h => {
                  const chgCls = h.changePct === null ? 'flat' : h.changePct > 0 ? 'up' : h.changePct < 0 ? 'down' : 'flat'
                  return (
                    <div key={h.symbol} style={{
                      display: 'grid', gridTemplateColumns: '52px 1fr auto auto auto',
                      alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, background: 'var(--bg-surface)',
                    }}>
                      <span className="num" style={{ fontSize: 13, fontWeight: 700 }}><TvLink symbol={h.symbol} /></span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {h.price !== null ? `$${h.price.toFixed(h.price >= 100 ? 1 : 2)}` : '—'}
                      </span>
                      <span className={`num ${chgCls}`} style={{ fontSize: 11, minWidth: 52, textAlign: 'right' }}>
                        {h.changePct !== null ? `${h.changePct >= 0 ? '+' : ''}${h.changePct.toFixed(2)}%` : '—'}
                      </span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>
                        {(h.pct * 100).toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </>
    )}
    </>
  )
}
