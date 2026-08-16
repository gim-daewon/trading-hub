'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import IndexCard from './components/IndexCard'

// ── 자산 그룹 ── 지수 추가 시 여기에만 추가
const US_FUTURES = [
  { id: 'YM=F',  label: '다우 선물' },
  { id: 'ES=F',  label: 'ES 선물' },
  { id: '^NDX',  label: 'NASDAQ 100' },
  { id: 'RTY=F', label: '러셀 2000' },
]
const KR = [
  { id: '^KS11', label: 'KOSPI' },
  { id: '^KQ11', label: 'KOSDAQ' },
]
const COMMODITIES = [
  { id: 'CL=F', label: 'WTI 원유' },
  { id: 'GC=F', label: '금' },
  { id: 'SI=F', label: '은' },
]
const CRYPTO = [
  { id: 'BTC-USD', label: '비트코인' },
  { id: 'ETH-USD', label: '이더리움' },
]
const RATES_FX = [
  { id: '^TNX',  label: '미국 10Y' },
  { id: 'DGS2',  label: '미국 2Y' },
  { id: 'DX-Y.NYB', label: '달러 인덱스' },
  { id: 'KRW=X', label: '달러/원' },
]

const ALL_YAHOO_GROUPS = [...US_FUTURES, ...KR, ...COMMODITIES, ...CRYPTO,
  { id: '^VIX', label: '' }, { id: '^TNX', label: '' }, { id: 'DX-Y.NYB', label: '' }, { id: 'KRW=X', label: '' }]

interface Q { price: number; changePct: number }
type QuoteMap = Record<string, Q>
interface SectorTop { label: string; changePct: number }
interface Fgi { score: number; prevScore: number; change: number; ratingKo: string }

function Skeleton() {
  return <div style={{ height: 72, borderRadius: 12, background: 'var(--bg-card)' }} />
}
function Pct({ v }: { v: number }) {
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  return <span className={`num ${cls}`} style={{ fontSize: 13 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
}
function Head({ title }: { title: string }) {
  return <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</p>
}

function FgiCard({ fgi }: { fgi: Fgi | null }) {
  if (!fgi) return <Skeleton />
  const { score, change, ratingKo } = fgi
  const color = score >= 60 ? 'var(--up)' : score <= 40 ? 'var(--down)' : 'var(--warn)'
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>공탐지수</p>
      <p className="num" style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700, color }}>{score}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color }}>{ratingKo}</span>
        <span className={`num ${change >= 0 ? 'up' : 'down'}`} style={{ fontSize: 11 }}>
          {change >= 0 ? '+' : ''}{change}pt
        </span>
      </div>
    </div>
  )
}

export default function HomePage() {
  const [quotes, setQuotes]   = useState<QuoteMap>({})
  const [fgi, setFgi]         = useState<Fgi | null>(null)
  const [topSector, setTop]   = useState<SectorTop | null>(null)
  const [botSector, setBot]   = useState<SectorTop | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const yahooSymbols = [...new Set(ALL_YAHOO_GROUPS.map(a => a.id))]
    const symbolsParam = yahooSymbols.map(encodeURIComponent).join(',')

    Promise.allSettled([
      fetch(`/api/quotes?symbols=${symbolsParam}&source=yahoo`),
      fetch('/api/fred?ids=DGS2'),
      fetch('/api/sectors'),
      fetch('/api/fgi'),
    ]).then(async ([quotesRes, fredRes, sectorsRes, fgiRes]) => {
      const q: QuoteMap = {}

      if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
        const j = await quotesRes.value.json()
        for (const [id, d] of Object.entries(j.data as Record<string, Q>))
          q[id] = { price: d.price, changePct: d.changePct }
      }

      if (fredRes.status === 'fulfilled' && fredRes.value.ok) {
        const j = await fredRes.value.json()
        const d = j.data?.DGS2
        if (d) q['DGS2'] = { price: d.value, changePct: d.prevValue ? (d.change / d.prevValue) * 100 : 0 }
      }

      setQuotes(q)

      if (sectorsRes.status === 'fulfilled' && sectorsRes.value.ok) {
        const j = await sectorsRes.value.json()
        const s: SectorTop[] = j.sectors ?? []
        if (s.length > 0) { setTop(s[0]); setBot(s[s.length - 1]) }
      }

      if (fgiRes.status === 'fulfilled' && fgiRes.value.ok) {
        const j = await fgiRes.value.json()
        if (!j.error) setFgi(j)
      }

      setLoading(false)
    })
  }, [])

  const now = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  function Cards({ assets, cols }: { assets: { id: string; label: string }[]; cols: number }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {assets.map(a => {
          const q = quotes[a.id]
          return loading || !q
            ? <Skeleton key={a.id} />
            : <IndexCard key={a.id} symbol={a.id} label={a.label} price={q.price} changePct={q.changePct} />
        })}
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Trading Hub</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{now}</p>
      </div>

      {/* 미국 선물 */}
      <section style={{ marginBottom: 20 }}>
        <Head title="미국 선물" />
        <Cards assets={US_FUTURES} cols={2} />
      </section>

      {/* 변동성 */}
      <section style={{ marginBottom: 20 }}>
        <Head title="변동성" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {loading || !quotes['^VIX']
            ? <Skeleton />
            : <IndexCard symbol="^VIX" label="VIX" price={quotes['^VIX'].price} changePct={quotes['^VIX'].changePct} />
          }
          <FgiCard fgi={loading ? null : fgi} />
        </div>
      </section>

      {/* 한국 */}
      <section style={{ marginBottom: 20 }}>
        <Head title="한국" />
        <Cards assets={KR} cols={2} />
      </section>

      {/* 원자재 */}
      <section style={{ marginBottom: 20 }}>
        <Head title="원자재" />
        <Cards assets={COMMODITIES} cols={3} />
      </section>

      {/* 크립토 */}
      <section style={{ marginBottom: 20 }}>
        <Head title="크립토" />
        <Cards assets={CRYPTO} cols={2} />
      </section>

      {/* 금리 & 환율 */}
      <section style={{ marginBottom: 20 }}>
        <Head title="금리 & 환율" />
        <Cards assets={RATES_FX} cols={2} />
      </section>

      {/* 섹터 자금 흐름 */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Head title="섹터 자금 흐름" />
          <Link href="/sectors" style={{ fontSize: 11, color: 'var(--info)', textDecoration: 'none', marginBottom: 8 }}>전체 보기 →</Link>
        </div>
        <div className="card card-interactive" style={{ padding: '12px 14px' }}>
          {loading ? <div style={{ height: 48 }} /> : topSector && botSector ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>강세</p>
                <p style={{ margin: '2px 0', fontSize: 14, fontWeight: 700 }}>{topSector.label}</p>
                <Pct v={topSector.changePct} />
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>약세</p>
                <p style={{ margin: '2px 0', fontSize: 14, fontWeight: 700 }}>{botSector.label}</p>
                <Pct v={botSector.changePct} />
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>섹터 데이터 없음</p>
          )}
        </div>
      </section>

      {/* 바로 가기 */}
      <section>
        <Head title="바로 가기" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { href: '/market',   icon: '📈', label: '시장' },
            { href: '/sectors',  icon: '🔥', label: '섹터' },
            { href: '/earnings', icon: '📅', label: '실적' },
            { href: '/journal',  icon: '📒', label: '매매일지' },
            { href: '/credit',   icon: '⚠',  label: 'AI크레딧' },
            { href: '/desk',     icon: '💼', label: '데스크' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 12, textDecoration: 'none',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 12,
            }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
