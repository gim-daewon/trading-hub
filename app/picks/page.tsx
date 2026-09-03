'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MetricGuide from '../components/MetricGuide'
import { TvLink } from '../components/TvLink'
import {
  TIERS, TIER_EVIDENCE, PERIOD_EVIDENCE, periodVerdict,
  type TierId, type CatKey, type Regime, type Perf,
} from '@/lib/screener-shared'

// 눌림목 조건에 걸린 종목만 모아 보는 화면.
//
// 원래는 "추천 종목"이었다. 2년 백테스트에서 눌림목이 시총 3구간 x 국면 2가지
// 6개 조합 전부 기준선을 넘긴 유일한 조건이었기 때문이다.
//
// 그 근거는 10년 구간 단위 재검증에서 무너졌다 — 118구간 중 양수 61개(52%),
// 중앙값 +0.10%p, 최고 구간 하나가 +46%p였다. 소수 구간이 전부를 만들었다.
// 그래서 "추천"을 떼고 후보 목록으로 성격을 되돌렸다.

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
  scannedAt?: number
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

/** 시총 구간별 참고값. 판정은 구간 단위(PERIOD_EVIDENCE)로만 하므로 배지를 달지 않는다 */
function EvidenceLine({ tier, regime }: { tier: TierId; regime: Regime }) {
  const p: Perf = TIER_EVIDENCE[tier].pullback[regime]
  const b: Perf = TIER_EVIDENCE[tier].base[regime]
  return (
    <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
      참고 · 2년 뭉친 값 {sgn(p.avg, 2)}%p · 중앙값 {sgn(p.md, 2)} · 상회율 {p.hit}%
      <span style={{ opacity: 0.65 }}> (기준선 {sgn(b.avg, 2)}%p · {b.hit}%)</span>
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
        title="눌림목 후보"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${data.source === 'snapshot' ? 'pill-up' : 'pill-stale'}`}>
              {data.source === 'snapshot' ? `스냅샷 ${data.scanned.toLocaleString()}` : `라이브 ${data.scanned}`}
            </span>
            {data.scannedAt && (
              <span className="num" title="스캔이 돌아 이 목록이 만들어진 시각. 평일 1회 갱신된다">
                {new Date(data.scannedAt).toLocaleString('ko-KR', {
                  timeZone: 'America/New_York', month: 'numeric', day: 'numeric',
                })} 종가 기준
              </span>
            )}
            <span>{data.regime === 'up' ? '상승 국면' : '하락 국면'} (SPY 20일 {sgn(data.spyChg20, 1)}%)</span>
          </span>
        )}
      />

      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, fontSize: 11, lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          눌림목 — 볼린저 하단권 + 수급 상위
        </p>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          조건: <b>볼린저 %B ≤ 0.2</b>(20일선 아래로 밀린 상태) + <b>20일 순자금 상위 30%</b>
          <br />
          10년 실측: 겹치지 않는 20거래일 {PERIOD_EVIDENCE.pullback.periods}구간 중
          양수 <b>{PERIOD_EVIDENCE.pullback.pos.toFixed(0)}%</b> ·
          중앙값 <b>{sgn(PERIOD_EVIDENCE.pullback.med, 2)}%p</b>
          <br />
          <span style={{ color: 'var(--warn)' }}>
            <b>{periodVerdict('pullback').text}.</b> 최고 구간 하나가
            +{PERIOD_EVIDENCE.pullback.max.toFixed(0)}%p이고, 그걸 빼면 우위가
            {' '}{sgn(PERIOD_EVIDENCE.pullback.trimmed, 2)}%p로 줄어든다.
            평소엔 거의 차이가 없다는 뜻이다. <b>오를 종목 목록이 아니라 살펴볼 후보 목록</b>으로 쓸 것.
          </span>
        </p>
      </div>

      <MetricGuide show={['flow', 'pctB']} />

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
