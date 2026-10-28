'use client'
import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import { useLiveQuotes } from '../components/useLiveQuotes'
import { TvLink, TvLayoutSetting } from '../components/TvLink'
import { upShare } from '../components/MetricGuide'

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

type ViewMode = 'heatmap' | 'table' | 'move'

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

/**
 * 기간별 하위 섹터 실측 — 하위 3개가 다음 20일에 오른 구간 비율(10년·47섹터·113구간, app/api/sectors/route.ts 표).
 * 50%보다 낮을수록 계속 뒤처졌다는 뜻. 120일만 유의했다. 1일은 실측하지 않았다.
 */
const LAGGARD_TEST: Record<PeriodKey, { up: number; z?: number } | null> = {
  '1': null,
  '5': { up: 44 },
  '20': { up: 43 },
  '60': { up: 47 },
  '120': { up: 37, z: -2.77 },
}

/**
 * 이동 뷰의 단기·장기 짝. 선택한 기간이 단기, 그보다 긴 게 장기다.
 * 120일은 비교할 더 긴 기간이 없어 20일 대 120일로 되돌린다.
 */
const MOVE_PAIR: Record<PeriodKey, [PeriodKey, PeriodKey]> = {
  '1':   ['1', '20'],
  '5':   ['5', '60'],
  '20':  ['20', '120'],
  '60':  ['60', '120'],
  '120': ['20', '120'],
}

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
  // 이동 뷰의 개별 섹터 목록. 그룹이 더 잘 읽혀서 기본은 접어둔다
  const [showMoveDetail, setShowMoveDetail] = useState(false)
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

  /**
   * 1일 등락은 **실시간 시세로 덮어쓴다.**
   *
   * /api/sectors는 화면을 열 때 한 번만 부르고 서버가 5분 캐시를 건다.
   * 그래서 장중에 값이 멈춰 있었다 — 다른 화면(눌림목·수급·VWMA)은 30초마다
   * 갱신되는데 여기만 아니었다. 사용자가 그걸 발견했다.
   *
   * 기간 등락(5·20·60·120일)은 종가 기준이라 그대로 둔다. 1일만 실시간이 의미가 있다.
   */
  // SPY도 같이 받는다 — 상대강도(vs SPY)가 1일 기준일 때 둘 다 실시간이어야 맞다
  const live = useLiveQuotes('us', sectors.length ? ['SPY', ...sectors.map(s => s.etf)] : [])
  const chg1 = useCallback(
    (s: SectorData) => live.quotes[s.etf]?.pct ?? s.changePct,
    [live.quotes]
  )
  const spyChg1 = spy ? (live.quotes.SPY?.pct ?? spy.changePct) : null

  // 선택한 기간의 등락률. 1일은 실시간, 나머지는 periods에서 꺼낸다
  const pctOf = useCallback(
    (s: SectorData) => period === '1' ? chg1(s) : (s.periods?.[period] ?? null),
    [period, chg1]
  )
  const rsOf = useCallback(
    (s: SectorData) => {
      if (period !== '1') return s.rs?.[period] ?? null
      // 실시간 값이 있으면 둘 다 실시간으로 뺀다. 한쪽만 실시간이면 상대강도가 거짓말이 된다
      const a = live.quotes[s.etf]?.pct, b = live.quotes.SPY?.pct
      return a != null && b != null ? a - b : s.rs1d
    },
    [period, live.quotes]
  )
  // 정렬도 vs SPY 기준이다. 막대가 vs SPY인데 절대 등락순으로 세우면
  // 순서와 막대 길이가 어긋난다(XLK +1.0%/+0.1pp 가 XLRE +1.0%/+0.0pp 위인데 막대는 같아 보임).
  // 섹터를 보는 목적도 "무엇이 시장보다 센가"이므로 상대강도가 맞는 기준이다.
  const byPct = useCallback(
    (list: SectorData[]) => [...list].sort((a, b) => (rsOf(b) ?? -999) - (rsOf(a) ?? -999)),
    [rsOf]
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

  // 선택한 기간의 하위 5개(2026-10-29 사용자 "탭에 맞게 변하도록"). 예전엔 120일만 유의해서 고정했다 —
  // 대신 상자 설명이 그 기간의 실측 숫자(LAGGARD_TEST)로 바뀌어, 유의하지 않은 기간은 그렇다고 말한다.
  // 백테스트가 "하위 3~5개"를 봤으므로 5개로 맞춘다.
  const laggards = [...sectors]
    .filter(s => pctOf(s) != null)
    .sort((a, b) => (pctOf(a) as number) - (pctOf(b) as number))
    .slice(0, 5)
  const laggardTest = LAGGARD_TEST[period]

  // 순위 이동 — 단기 순위 vs 장기 순위.
  //
  // 기간 탭과 연동한다. 선택한 기간이 '단기'가 되고 그보다 긴 기간이 '장기'다.
  // 시점별 과거 순위를 저장하지 않아도 되는 구현이라 스냅샷이 필요 없다.
  // (120일을 고르면 비교 대상이 없으므로 20일 대 120일로 되돌린다)
  const [shortKey, longKey] = MOVE_PAIR[period]

  const rankBy = useCallback((list: SectorData[], key: string) => {
    const get = (x: SectorData) => key === '1' ? x.rs1d : (x.rs?.[key] ?? null)
    const ok = list.filter(x => get(x) != null)
    const sortedK = [...ok].sort((a, b) => (get(b) as number) - (get(a) as number))
    return new Map(sortedK.map((x, i) => [x.id, i + 1]))
  }, [])

  const moves = (() => {
    const rs = rankBy(sectors, shortKey), rl = rankBy(sectors, longKey)
    return sectors
      .filter(x => rs.has(x.id) && rl.has(x.id))
      .map(x => ({ s: x, short: rs.get(x.id)!, long: rl.get(x.id)!, delta: rl.get(x.id)! - rs.get(x.id)! }))
      .sort((a, b) => b.delta - a.delta)
  })()

  // 그룹 단위 이동 — 개별 ETF보다 테마 전체의 이동이 크게 보인다.
  // 실제로 원자력·전력 계열(URNM·URA·XLU·UTES)이 통째로 부진한 게 개별로는 흩어져 보였다.
  // 그룹 값은 구성 ETF 상대수익의 중앙값이다 (평균은 한 종목에 끌려간다).
  const groupMoves = (() => {
    const all = [...groups.map(g => ({ label: g.label, items: g.items })),
                 { label: 'GICS 대분류', items: broad }]
    const val = (items: SectorData[], key: string) => {
      const xs = items
        .map(x => key === '1' ? x.rs1d : (x.rs?.[key] ?? null))
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b)
      if (!xs.length) return null
      const h = xs.length >> 1
      return xs.length % 2 ? xs[h] : (xs[h - 1] + xs[h]) / 2
    }
    const rows = all
      .map(g => ({ label: g.label, n: g.items.length, s: val(g.items, shortKey), l: val(g.items, longKey) }))
      .filter(g => g.s != null && g.l != null)
    const rk = (key: 's' | 'l') => {
      const sortedK = [...rows].sort((a, b) => (b[key] as number) - (a[key] as number))
      return new Map(sortedK.map((x, i) => [x.label, i + 1]))
    }
    const rs = rk('s'), rl = rk('l')
    return rows
      .map(g => ({ ...g, short: rs.get(g.label)!, long: rl.get(g.label)!, delta: rl.get(g.label)! - rs.get(g.label)! }))
      .sort((a, b) => b.delta - a.delta)
  })()

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
        sub={spy && spyChg1 != null && (
          <span style={{ color: 'var(--text-secondary)' }}>
            SPY <span className="num" style={{ color: spyChg1 >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {pctLabel(spyChg1)}
            </span>
            {live.open && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>실시간</span>}
          </span>
        )}
      />

      {/* 뷰/정렬 토글 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['heatmap', 'table', 'move'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 12, border: '1px solid var(--border)',
              background: view === v ? 'var(--info)' : 'var(--bg-card)',
              color: view === v ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {v === 'heatmap' ? '순위' : v === 'table' ? '기간 비교' : '이동'}
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

      {/* 선택한 기간의 부진 섹터 — 설명은 그 기간의 실측(120일만 유의) */}
      {laggards.length > 0 && (
        <div className="card" style={{
          padding: '10px 12px', marginBottom: 14, fontSize: 11, lineHeight: 1.6,
          borderLeft: `3px solid ${laggardTest?.z ? 'var(--warn)' : 'var(--border)'}`,
        }}>
          <b style={{ color: laggardTest?.z ? 'var(--warn)' : 'var(--text-secondary)' }}>
            {PERIODS.find(p => p.key === period)?.label} 부진 섹터 {laggards.length}
          </b>
          <span style={{ color: 'var(--text-muted)' }}>
            {laggardTest == null
              ? ' — 하루 등락은 실측하지 않았다. 오늘 많이 빠진 곳일 뿐이다'
              : laggardTest.z
                ? ` — 10년 113구간에서 ${100 - laggardTest.up}%가 다음 20일에도 뒤처졌다 (z=${laggardTest.z})`
                : ` — 10년 실측에서 다음 20일 양수 ${laggardTest.up}%. 유의하지 않아 회피 근거는 못 된다`}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 6px' }}>
            {laggards.map(s => (
              <button key={s.id} onClick={() => setSelected(s)} style={{
                minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap',
              }}>
                <span className="num" style={{ fontWeight: 700 }}>{s.etf}</span>
                <span style={{ color: 'var(--text-muted)' }}> {s.label} </span>
                <span className={`num ${(pctOf(s) ?? 0) < 0 ? 'down' : 'up'}`}>{pctLabel(pctOf(s), 1)}</span>
              </button>
            ))}
          </div>
          {/* 보유기간 실측은 120일 하위 섹터로 잰 것 — 다른 기간에 붙이면 틀린 근거가 된다 */}
          {period === '120' && <div style={{ color: 'var(--text-muted)' }}>
            <b>기다리면 돌아오지 않는다.</b> 보유기간을 늘려도 회복이 없다 (10년 실측):
            <div className="num" style={{
              margin: '4px 0 6px', padding: '6px 8px', borderRadius: 6,
              background: 'var(--bg-base)', fontSize: 10, lineHeight: 1.6,
            }}>
              20일 보유 양수 40% · 60일 38% · 120일 33% · <b>250일 22%</b>
            </div>
            검증된 범위는 <b>섹터 ETF를 사는 경우</b>다. 이 섹터에 속한 개별 종목까지
            피하라는 뜻은 아니다 — 눌림목 후보에 이 필터를 걸어본 결과 효과가 없었다
            (양수비율 52%로 동일, 중앙값은 오히려 하락).
          </div>}
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
      {/* ── 이동 뷰 — 순환을 '관찰'만 한다 ──
          순환 순서를 예측하는 건 근거가 없다(기각 기록 참고: 110쌍 중 단일검정
          통과 6쌍인데 우연 기대치도 6쌍). 그래서 앞으로 어디가 오를지는 말하지 않고,
          "지금 어디서 어디로 옮겨가는 중인가"만 보여준다.

          단기(5일) 순위와 중기(60일) 순위의 차이를 쓴다. 시점별 과거 순위를
          따로 저장할 필요가 없고, 최근 순위가 중기 순위보다 높으면 돈이 들어오는 중이다. */}
      {view === 'move' && !loading && (
        <>
          <div className="card" style={{
            padding: '10px 12px', marginBottom: 12, fontSize: 11,
            color: 'var(--text-muted)', lineHeight: 1.6,
          }}>
            <b style={{ color: 'var(--warn)' }}>이건 예측이 아니라 관찰이다.</b>{' '}
            <b>{shortKey === '1' ? '1일' : `${shortKey}일`}</b> 순위가{' '}
            <b>{longKey}일</b> 순위보다 높으면 최근 자금이 들어오는 중이다.
            <b> 다음에 어디가 오를지는 말하지 않는다</b> — 섹터 순환 순서는 10년 검정에서
            우연 수준이었다 (110쌍 중 유의 6쌍 = 우연 기대치 6쌍).
            <br />
            <span style={{ opacity: 0.8 }}>위 기간 탭을 바꾸면 비교 기준도 같이 바뀐다.</span>
          </div>

          {/* 그룹 단위 — 개별 ETF로는 흩어져 보이는 테마 이동을 잡는다 */}
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            테마 그룹 (구성 ETF 상대수익 중앙값)
          </p>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            {groupMoves.map(g => (
              <div key={g.label} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 52px 52px 64px',
                gap: 6, alignItems: 'center', minHeight: 40, padding: '0 10px',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.label}
                  </span>
                  <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{g.n}</span>
                </span>
                <span className="num" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>{g.short}위</span>
                <span className="num" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-muted)' }}>{g.long}위</span>
                <span className={`num ${g.delta > 0 ? 'up' : g.delta < 0 ? 'down' : 'flat'}`}
                      style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                  {g.delta === 0 ? '—' : `${g.delta > 0 ? '↑' : '↓'}${Math.abs(g.delta)}`}
                </span>
              </div>
            ))}
          </div>

          {/* 개별 섹터는 접어둔다. 그룹 단위가 훨씬 잘 읽힌다 —
              헬스케어가 통째로 60일 1위에서 5일 11위로 빠진 게
              개별로는 XBI/IHI로 흩어져 잘 안 보였다. */}
          <button
            onClick={() => setShowMoveDetail(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              minHeight: 44, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 12, textAlign: 'left',
              marginBottom: showMoveDetail ? 6 : 0,
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 10 }}>{showMoveDetail ? '▾' : '▸'}</span>
            <span style={{ fontWeight: 700 }}>개별 섹터</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{moves.length}</span>
            {!showMoveDetail && moves[0] && (
              <span style={{ marginLeft: 'auto', fontSize: 11, display: 'flex', gap: 10 }}>
                <span className="num up">↑{moves[0].delta} {moves[0].s.etf}</span>
                <span className="num down">↓{Math.abs(moves[moves.length - 1].delta)} {moves[moves.length - 1].s.etf}</span>
              </span>
            )}
          </button>
          <div className="card" style={{ overflow: 'hidden', display: showMoveDetail ? 'block' : 'none' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 52px 52px 64px',
              gap: 6, padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
            }}>
              <span>개별 ETF</span>
              <span style={{ textAlign: 'right' }}>{shortKey === '1' ? '1일' : `${shortKey}일`}</span>
              <span style={{ textAlign: 'right' }}>{longKey}일</span>
              <span style={{ textAlign: 'right' }}>이동</span>
            </div>
            {moves.map(m => (
              <button
                key={m.s.id}
                onClick={() => setSelected(m.s)}
                style={{
                  width: '100%', display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 52px 52px 64px',
                  gap: 6, alignItems: 'center', minHeight: 44, padding: '0 10px',
                  background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                  <span className="num" style={{ fontSize: 12, fontWeight: 700 }}>{m.s.etf}</span>
                  <span style={{
                    fontSize: 10, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{m.s.label}</span>
                </span>
                <span className="num" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>{m.short}위</span>
                <span className="num" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-muted)' }}>{m.long}위</span>
                <span className={`num ${m.delta > 0 ? 'up' : m.delta < 0 ? 'down' : 'flat'}`}
                      style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                  {m.delta === 0 ? '—' : `${m.delta > 0 ? '↑' : '↓'}${Math.abs(m.delta)}`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'table' && (
        <div className="overflow-x-table">
          {/* 기간을 한눈에 비교하려고 남긴 뷰다.
              섹터명을 별도 열에 두니 "채굴·AI데이터센터"가 다섯 줄로 쪼개졌다.
              ETF를 주 라벨로 올리고 이름은 아래 작은 글씨 + 줄바꿈 금지로 바꿨다.
              첫 열은 가로 스크롤 중에도 고정돼 어느 섹터인지 놓치지 않는다. */}
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                <th style={{
                  textAlign: 'left', padding: '6px 8px', position: 'sticky', left: 0,
                  background: 'var(--bg-base)', zIndex: 1, minWidth: 132,
                }}>섹터</th>
                {PERIODS.map(p => (
                  <th key={p.key} style={{ textAlign: 'right', padding: '6px 10px', whiteSpace: 'nowrap' }}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 30 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {Array.from({ length: PERIODS.length + 1 }).map((_, j) => (
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
                      <td style={{
                        padding: '8px', position: 'sticky', left: 0, zIndex: 1,
                        background: selected?.id === s.id ? 'var(--bg-hover)' : 'var(--bg-base)',
                        minWidth: 132, maxWidth: 132,
                      }}>
                        <div className="num" style={{ fontSize: 12, fontWeight: 700 }}>
                          <TvLink symbol={s.etf} />
                        </div>
                        <div style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{s.label}</div>
                      </td>
                      {PERIODS.map(p => (
                        <td key={p.key} style={{
                          textAlign: 'right', padding: '8px 10px', whiteSpace: 'nowrap',
                          // 선택한 기간을 강조해 정렬 기준이 어디인지 보이게 한다
                          background: period === p.key ? 'var(--bg-hover)' : undefined,
                        }}>
                          <PctBadge v={p.key === '1' ? chg1(s) : (s.periods?.[p.key] ?? null)} />
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
                { label: '1D 등락', v: <PctBadge v={chg1(selected)} /> },
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
              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                구성종목 자금 흐름 · 최근 20일
              </p>
              {/* 사용자 피드백: "ETF 레벨이라거나 퍼센트가 무슨 말인지 모르겠다".
                  숫자만 띄우고 정의를 어디에도 안 적어놨다. 화면에서 바로 읽히게 한다. */}
              <details style={{ marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--info)' }}>
                  이 숫자가 무슨 뜻인가?
                </summary>
                <div style={{
                  marginTop: 6, padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg-base)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7,
                }}>
                  최근 20일 거래대금을 <b>오른 날</b>과 <b>내린 날</b>로 나눠 비교한 값이다.
                  <br />
                  <span className="num">(오른 날 거래대금 − 내린 날 거래대금) ÷ 전체 × 100</span>
                  <br /><br />
                  <b>+38%</b>면 거래대금의 <b>69%가 오른 날</b>에 발생했다는 뜻이다.
                  0%면 반반, −38%면 69%가 내린 날에 몰렸다.
                  <br /><br />
                  <span style={{ color: 'var(--warn)' }}>
                    이건 순매수가 아니다. 거래대금은 매수와 매도가 이미 상쇄된 총량이라
                    누가 샀는지는 알 수 없다. 미국은 기관 순매수를 실시간 공개하지 않아
                    이게 무료로 얻을 수 있는 <b>대리지표</b>다.
                  </span>
                </div>
              </details>
              {flowLoading ? (
                <div style={{ height: 88, borderRadius: 8, background: 'var(--bg-surface)', opacity: 0.6, animation: 'pulse 1.5s infinite' }} />
              ) : !flow || flow.constituents.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>자금 데이터 없음</p>
              ) : (
                <>
                  {/* 각 칸에 "그래서 뭔데"를 한 줄로 붙인다. 숫자만으로는 안 읽힌다 */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 104, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ETF 자체 거래</div>
                      <div className={`num ${cls(flow.etfFlow?.f20 ?? null)}`} style={{ fontSize: 15, fontWeight: 700 }}>
                        {flow.etfFlow?.f20 == null ? '—' : `${flow.etfFlow.f20 >= 0 ? '+' : ''}${flow.etfFlow.f20.toFixed(0)}%`}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{upShare(flow.etfFlow?.f20 ?? null)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 104, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>구성종목 (비중 반영)</div>
                      <div className={`num ${cls(flow.weightedF20)}`} style={{ fontSize: 15, fontWeight: 700 }}>
                        {flow.weightedF20 == null ? '—' : `${flow.weightedF20 >= 0 ? '+' : ''}${flow.weightedF20.toFixed(0)}%`}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{upShare(flow.weightedF20)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 104, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>매집 / 분산</div>
                      <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                        <span className="up">{flow.inflow}</span>
                        <span style={{ color: 'var(--text-muted)' }}> / </span>
                        <span className="down">{flow.outflow}</span>
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                        {flow.inflow + flow.outflow}종목 중
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
