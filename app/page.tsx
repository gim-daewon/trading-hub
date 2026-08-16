'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import IndexCard from './components/IndexCard'

// ── 자산 그룹 정의 ── 지수 추가 시 여기에만 추가하면 됩니다
const US_FUTURES = [
  { id: 'ES=F',  label: 'ES 선물' },
  { id: 'YM=F',  label: '다우 선물' },
  { id: 'RTY=F', label: '러셀 2000' },
  { id: '^NDX',  label: 'NASDAQ 100' },
]

const VOL_KR = [
  { id: '^VIX',  label: 'VIX' },
  { id: '^KS11', label: 'KOSPI' },
]

const COMMODITIES = [
  { id: 'GC=F', label: '금' },
  { id: 'CL=F', label: 'WTI 원유' },
  { id: 'SI=F', label: '은' },
]

const CRYPTO = [
  { id: 'BTC-USD', label: '비트코인' },
  { id: 'ETH-USD', label: '이더리움' },
]

const RATES_FX = [
  { id: '^TNX',  label: '미국 10Y' },
  { id: 'DGS2',  label: '미국 2Y' },   // FRED
  { id: 'DX=F',  label: '달러 인덱스' },
  { id: 'KRW=X', label: '달러/원' },
]

const ALL_YAHOO = [...US_FUTURES, ...VOL_KR, ...COMMODITIES, ...CRYPTO,
  { id: '^TNX', label: '' }, { id: 'DX=F', label: '' }, { id: 'KRW=X', label: '' }]

interface Q { price: number; changePct: number }
type QuoteMap = Record<string, Q>

interface SectorTop { label: string; changePct: number }

function Skeleton() {
  return <div style={{ height: 72, borderRadius: 12, background: 'var(--bg-card)' }} />
}

function Pct({ v }: { v: number }) {
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  return <span className={`num ${cls}`} style={{ fontSize: 13 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
}

function SectionHead({ title }: { title: string }) {
  return (
    <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {title}
    </p>
  )
}

export default function HomePage() {
  const [quotes, setQuotes]     = useState<QuoteMap>({})
  const [topSector, setTop]     = useState<SectorTop | null>(null)
  const [botSector, setBot]     = useState<SectorTop | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const yahooSymbols = [...new Set(ALL_YAHOO.map(a => a.id))].filter(id => id !== 'DGS2')
    const symbolsParam = yahooSymbols.map(encodeURIComponent).join(',')

    Promise.allSettled([
      fetch(`/api/quotes?symbols=${symbolsParam}&source=yahoo`),
      fetch('/api/fred?ids=DGS2'),
      fetch('/api/sectors'),
    ]).then(async ([quotesRes, fredRes, sectorsRes]) => {
      const q: QuoteMap = {}

      if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
        const j = await quotesRes.value.json()
        for (const [id, d] of Object.entries(j.data as Record<string, Q>)) {
          q[id] = { price: d.price, changePct: d.changePct }
        }
      }

      if (fredRes.status === 'fulfilled' && fredRes.value.ok) {
        const j = await fredRes.value.json()
        const d = j.data?.DGS2
        if (d) {
          const changePct = d.prevValue ? (d.change / d.prevValue) * 100 : 0
          q['DGS2'] = { price: d.value, changePct }
        }
      }

      setQuotes(q)

      if (sectorsRes.status === 'fulfilled' && sectorsRes.value.ok) {
        const j = await sectorsRes.value.json()
        const s: SectorTop[] = j.sectors ?? []
        if (s.length > 0) { setTop(s[0]); setBot(s[s.length - 1]) }
      }

      setLoading(false)
    })
  }, [])

  const now = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  function renderCards(assets: typeof US_FUTURES, cols: number) {
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
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Trading Hub</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{now}</p>
      </div>

      {/* 미국 선물 */}
      <section style={{ marginBottom: 20 }}>
        <SectionHead title="미국 선물" />
        {renderCards(US_FUTURES, 2)}
      </section>

      {/* 변동성 & 한국 */}
      <section style={{ marginBottom: 20 }}>
        <SectionHead title="변동성 & 한국" />
        {renderCards(VOL_KR, 2)}
      </section>

      {/* 원자재 */}
      <section style={{ marginBottom: 20 }}>
        <SectionHead title="원자재" />
        {renderCards(COMMODITIES, 3)}
      </section>

      {/* 크립토 */}
      <section style={{ marginBottom: 20 }}>
        <SectionHead title="크립토" />
        {renderCards(CRYPTO, 2)}
      </section>

      {/* 금리 & 환율 */}
      <section style={{ marginBottom: 20 }}>
        <SectionHead title="금리 & 환율" />
        {renderCards(RATES_FX, 2)}
      </section>

      {/* 섹터 자금 흐름 */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <SectionHead title="섹터 자금 흐름" />
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
        <SectionHead title="바로 가기" />
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
              transition: 'background 150ms, color 150ms',
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
