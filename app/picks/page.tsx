'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink } from '../components/TvLink'
import {
  TIERS, TIER_EVIDENCE, verdictOf,
  type TierId, type CatKey, type Regime, type Perf,
} from '@/lib/screener-shared'

// 눌림목 매집만 보여주는 화면.
//
// 스크리너의 5개 카테고리 중 유일하게 2년 백테스트에서
// 시총 3구간 x 국면 2가지 = 6개 조합 전부 기준선을 상회한 조건이다.
// 나머지는 국면·구간에 따라 뒤집혔다.
//
// 그래도 "추천"을 단정하지 않는다. 상회율 최고가 58%다.

interface Row {
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pctB: number | null
}
interface Data {
  regime: Regime
  spyChg20: number | null
  scanned: number
  source: 'snapshot' | 'live'
  categories: Record<TierId, Record<CatKey, Row[]>>
  caveats: string[]
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

function EvidenceLine({ tier, regime }: { tier: TierId; regime: Regime }) {
  const p: Perf = TIER_EVIDENCE[tier].pullback[regime]
  const b: Perf = TIER_EVIDENCE[tier].base[regime]
  const v = verdictOf(p, b)
  return (
    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <span className={`pill ${v.strong ? 'pill-up' : 'pill-stale'}`}>{v.text}</span>
      <span className="num">
        2년 실측 {sgn(p.avg, 2)}%p · 중앙값 {sgn(p.md, 2)} · 상회율 {p.hit}%
        <span style={{ opacity: 0.65 }}> (기준선 {sgn(b.avg, 2)}%p · {b.hit}%)</span>
      </span>
    </span>
  )
}

function StockRow({ r }: { r: Row }) {
  const deep = (r.pctB ?? 1) <= 0.05
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      alignItems: 'center', gap: 10,
      padding: '10px 12px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 700 }}>
          <TvLink symbol={r.symbol} />
        </div>
        <div style={{
          fontSize: 10, color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {(r.sector || '').slice(0, 24)} · ${(r.marketCap / 1e9).toFixed(1)}B
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>볼린저</div>
        <div className="num" style={{
          fontSize: 13, fontWeight: 700,
          color: deep ? 'var(--info)' : 'var(--text-secondary)',
        }}>{r.pctB == null ? '—' : `${(r.pctB * 100).toFixed(0)}%`}</div>
      </div>

      <div style={{ textAlign: 'right', minWidth: 52 }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>20일 수급</div>
        <div className={`num ${(r.f20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 13, fontWeight: 700 }}>
          {sgn(r.f20)}%
        </div>
      </div>
    </div>
  )
}

export default function PicksPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/screener')
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const total = data
    ? TIERS.reduce((a, t) => a + (data.categories?.[t.id]?.pullback?.length ?? 0), 0)
    : 0
  // pct_b 컬럼 추가 전 스냅샷이면 전부 null이라 후보가 안 나온다
  const awaitingScan = !!data && !loading && total === 0

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="추천 종목"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${data.source === 'snapshot' ? 'pill-up' : 'pill-stale'}`}>
              {data.source === 'snapshot' ? `스냅샷 ${data.scanned.toLocaleString()}` : `라이브 ${data.scanned}`}
            </span>
            <span>{data.regime === 'up' ? '상승 국면' : '하락 국면'} (SPY 20일 {sgn(data.spyChg20, 1)}%)</span>
          </span>
        )}
      />

      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, fontSize: 11, lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          눌림목 매집 — 볼린저 하단권 + 수급 상위
        </p>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          조건: <b>볼린저 %B ≤ 0.2</b>(20일선 아래로 밀린 상태) + <b>20일 순자금 상위 30%</b>
          <br />
          스크리너 5개 조건 중 <b style={{ color: 'var(--up)' }}>유일하게</b> 2년 백테스트에서
          시총 3구간 × 국면 2가지 <b>6개 조합 전부</b> 기준선을 상회했다.
          <br />
          <span style={{ color: 'var(--warn)' }}>
            다만 상회율 최고가 58%다. 확실한 게 아니라 <b>확률이 약간 나은 후보</b>일 뿐이고,
            매수 판단은 직접 해야 한다.
          </span>
        </p>
      </div>

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {awaitingScan && (
        <div className="card" style={{ padding: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <b style={{ color: 'var(--warn)' }}>아직 후보가 없다.</b>
          <br />
          볼린저 %B는 최근 추가한 지표라, 스캔을 다시 돌려야 채워진다.
          <br />
          GitHub → Actions → <b>Screener Scan</b> → Run workflow (약 1분)
          <br /><br />
          조건을 만족하는 종목이 실제로 없을 수도 있다. 볼린저 하단권까지 밀리면서
          동시에 수급 상위 30%에 드는 건 흔한 조합이 아니다.
          <br /><br />
          스캔 직후라면 최대 10분간 이전 결과가 보일 수 있다. 새로고침을 눌러보라.
        </div>
      )}

      {!awaitingScan && data && TIERS.map(t => {
        const rows = data.categories?.[t.id]?.pullback ?? []
        return (
          <section key={t.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{t.label}</h2>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}종목</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <EvidenceLine tier={t.id} regime={data.regime} />
            </div>

            {rows.length === 0 ? (
              <div className="card" style={{ padding: 18, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                조건을 만족하는 종목 없음
              </div>
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                {rows.map(r => <StockRow key={r.symbol} r={r} />)}
              </div>
            )}
          </section>
        )
      })}

      {data && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>검증 한계</p>
          {data.caveats?.map((c, i) => <div key={i}>· {c}</div>)}
          <div>· 20일선 돌파 조건은 넣었다가 뺐다. 상회율이 44%로 오히려 기준선(48%)보다 낮았다.</div>
        </div>
      )}
    </div>
  )
}
