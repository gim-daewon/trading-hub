'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface IndexQuote {
  id: string
  label: string
  price: number
  changePct: number
}

interface SectorTop {
  label: string
  etf: string
  changePct: number
}

const MAIN_INDICES = [
  { id: '^GSPC', label: 'S&P 500', source: 'yahoo' },
  { id: '^IXIC', label: 'NASDAQ',  source: 'yahoo' },
  { id: '^VIX',  label: 'VIX',     source: 'yahoo' },
  { id: '^KS11', label: 'KOSPI',   source: 'yahoo' },
]

function Pct({ v, size = 14 }: { v: number; size?: number }) {
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  return (
    <span className={`num ${cls}`} style={{ fontSize: size }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

export default function HomePage() {
  const [indices, setIndices]     = useState<IndexQuote[]>([])
  const [topSector, setTopSector] = useState<SectorTop | null>(null)
  const [botSector, setBotSector] = useState<SectorTop | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // 지수와 섹터 병렬 요청
        const [finnhubRes, yahooRes, sectorRes] = await Promise.allSettled([
          fetch('/api/quotes?symbols=%5EGSPC,%5EIXIC,%5EVIX,%5EKS11&source=yahoo'),
          Promise.resolve(new Response('{}', { status: 200 })), // unused
          fetch('/api/sectors'),
        ])

        const quotes: IndexQuote[] = []

        if (finnhubRes.status === 'fulfilled' && finnhubRes.value.ok) {
          const j = await finnhubRes.value.json()
          for (const [id, q] of Object.entries(j.data as Record<string, { price: number; changePct: number }>)) {
            const meta = MAIN_INDICES.find(m => m.id === id)
            if (meta) quotes.push({ id, label: meta.label, price: q.price, changePct: q.changePct })
          }
        }

        const ordered = MAIN_INDICES.map(m => quotes.find(q => q.id === m.id)).filter(Boolean) as IndexQuote[]
        setIndices(ordered)

        if (sectorRes.status === 'fulfilled' && sectorRes.value.ok) {
          const j = await sectorRes.value.json()
          const s: SectorTop[] = j.sectors ?? []
          if (s.length > 0) {
            setTopSector(s[0])
            setBotSector(s[s.length - 1])
          }
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = new Date().toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div style={{ padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))', maxWidth: 700, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Trading Hub
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{now}</p>
      </div>

      {/* 주요 지수 */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>주요 지수</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--bg-card)' }} />
              ))
            : indices.map(idx => (
                <div key={idx.id} className="card" style={{ padding: '12px 14px' }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{idx.label}</p>
                  <p className="num" style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
                    {idx.id === '^VIX'
                      ? idx.price.toFixed(2)
                      : idx.id === '^KS11' || idx.id === '^GSPC' || idx.id === '^IXIC'
                        ? idx.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : `$${idx.price.toFixed(2)}`}
                  </p>
                  <Pct v={idx.changePct} size={13} />
                </div>
              ))
          }
        </div>
      </section>

      {/* 섹터 빠른 요약 */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>섹터 자금 흐름</p>
          <Link href="/sectors" style={{ fontSize: 11, color: 'var(--info)', textDecoration: 'none' }}>전체 보기 →</Link>
        </div>
        <div className="card card-interactive" style={{ padding: '12px 14px' }}>
          {loading ? (
            <div style={{ height: 48 }} />
          ) : topSector && botSector ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>강세 섹터</p>
                <p style={{ margin: '2px 0', fontSize: 14, fontWeight: 700 }}>{topSector.label}</p>
                <Pct v={topSector.changePct} size={13} />
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>약세 섹터</p>
                <p style={{ margin: '2px 0', fontSize: 14, fontWeight: 700 }}>{botSector.label}</p>
                <Pct v={botSector.changePct} size={13} />
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>섹터 데이터 없음</p>
          )}
        </div>
      </section>

      {/* 빠른 탐색 */}
      <section>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>바로 가기</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { href: '/market',   icon: '📈', label: '시장' },
            { href: '/sectors',  icon: '🔥', label: '섹터' },
            { href: '/earnings', icon: '📅', label: '실적' },
            { href: '/journal',  icon: '📒', label: '매매일지' },
            { href: '/credit',   icon: '⚠',  label: 'AI크레딧' },
            { href: '/desk',     icon: '💼', label: '데스크' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 8px', borderRadius: 12, textDecoration: 'none',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: 12,
                transition: 'background 150ms, color 150ms',
              }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
