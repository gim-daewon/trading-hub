'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { MarketToggle, MicroToggle, useMarket } from '../components/MarketToggle'
import { MARKETS, tiersFor as tf, type Market } from '@/lib/markets'
import MetricGuide from '../components/MetricGuide'
import { SymbolLabel } from '../components/SymbolLabel'
import { ExitPrices } from '../components/ExitPrices'
import {
  tiersFor, TIER_EVIDENCE, RR_EVIDENCE_BY_MARKET, RR_BASELINE_BY_MARKET, rrVerdict,
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
  atr14?: number | null; dollarVol?: number | null; price?: number | null
  /** 화면용 짧은 이름. 한국은 005930, 크립토는 BTC */
  display?: string | null
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pctB: number | null
}
interface Data {
  tierCounts?: Partial<Record<TierId, number>>
  regime: Regime
  spyChg20: number | null
  scanned: number
  source: 'snapshot' | 'live'
  categories: Record<TierId, Record<CatKey, Row[]>>
  caveats: string[]
  scannedAt?: number
  /** 데이터 마지막 봉 날짜 (YYYY-MM-DD). 스캔 시각과 다를 수 있다 */
  barDate?: string | null
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

/** 시총 구간별 참고값. 판정은 구간 단위(PERIOD_EVIDENCE)로만 하므로 배지를 달지 않는다 */
function EvidenceLine({ tier, regime }: { tier: TierId; regime: Regime }) {
  // 미국 3구간만 실측했다. 초소형·시총 미상은 잰 적이 없어 값이 없다 —
  // 없으면 아무것도 안 그린다. 없는 숫자를 0으로 채우면 근거가 거짓말이 된다
  const ev = TIER_EVIDENCE[tier]
  if (!ev) return null
  const p: Perf = ev.pullback[regime]
  const b: Perf = ev.base[regime]
  return (
    <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
      참고 · 2년 뭉친 값 {sgn(p.avg, 2)}%p · 중앙값 {sgn(p.md, 2)} · 상회율 {p.hit}%
      <span style={{ opacity: 0.65 }}> (기준선 {sgn(b.avg, 2)}%p · {b.hit}%)</span>
    </span>
  )
}

function StockRow({ r, market }: { r: Row; market: Market }) {
  const deep = (r.pctB ?? 1) <= 0.05
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      alignItems: 'center', gap: 10,
      padding: '10px 12px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <SymbolLabel
          symbol={r.symbol} display={r.display} name={r.name} market={market}
          sub={<ExitPrices price={r.price} atr14={r.atr14} dollarVol={r.dollarVol} market={market} compact />}
        />
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
  const [market, setMarket, marketReady] = useMarket()
  const [includeMicro, setIncludeMicro] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/screener?market=${market}`)
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])

  useEffect(() => { if (marketReady) load() }, [load, marketReady])

  const visibleTiers = tf(market)
    .filter(t => includeMicro || (t.id !== 'micro' && t.id !== 'unknown'))
  const total = data
    ? visibleTiers.reduce((a, t) => a + (data.categories?.[t.id]?.pullback?.length ?? 0), 0)
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
            {/* 스캔 시각이 아니라 '데이터 기준일'을 보여준다.
                야후가 당일 일봉을 늦게 주면 둘이 하루씩 어긋난다 */}
            {data.barDate && (
              <span className="num" title="이 목록을 계산한 마지막 거래일. 스캔 시각과 다를 수 있다">
                {data.barDate.slice(5).replace('-', '/')} 종가 기준
              </span>
            )}
            <span>{data.regime === 'up' ? '상승 국면' : '하락 국면'} (SPY 20일 {sgn(data.spyChg20, 1)}%)</span>
          </span>
        )}
      />

      <MarketToggle value={market} onChange={setMarket} />

      <MicroToggle
        on={includeMicro}
        onChange={setIncludeMicro}
        counts={(data?.tierCounts?.micro ?? 0) + (data?.tierCounts?.unknown ?? 0)}
      />

      {!MARKETS[market].ruleValidated && (
        <div className="card" style={{
          padding: '10px 12px', marginBottom: 12, fontSize: 11, lineHeight: 1.6,
          borderLeft: '3px solid var(--warn)',
        }}>
          <b style={{ color: 'var(--warn)' }}>{MARKETS[market].label}은 검증 전이다.</b>
          {' '}{MARKETS[market].ruleNote}
          <br />아래 기댓값·연환산은 <b>미국에서 잰 값</b>이라 여기엔 해당되지 않는다.
        </div>
      )}

      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, fontSize: 11, lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          눌림목 — 볼린저 하단권
        </p>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          조건: <b>볼린저 %B ≤ 0.2</b>(20일선 아래로 밀린 상태)
          <br />
          <span style={{ color: 'var(--info)' }}>
            2026-09-06에 <b>수급 상위 30% 조건을 뺐다.</b> %B ≤ 0.2는 “최근 떨어졌다”,
            순자금 상위는 “최근 올랐다”는 뜻이라 두 조건이 서로 싸운다. 실측으로
            눌림목 종목 중 수급 상위는 9%뿐이었고(1,491 / 16,144) 그 소수 표본에서
            기댓값 부호가 뒤집혔다(앞절반 −0.417% → 뒤절반 +0.454%).
          </span>
          <br />
          {/* 근거는 그 시장에서 잰 것만 띄운다.
              한국은 수급 카테고리를 아직 안 쟀다 — VWMA 신호만 측정했다 */}
          {(() => {
            const q = RR_EVIDENCE_BY_MARKET[market].pullback
            const base = RR_BASELINE_BY_MARKET[market]
            const quiet = RR_EVIDENCE_BY_MARKET[market].quiet
            if (!q || !base) {
              return (
                <span style={{ color: 'var(--warn)' }}>
                  <b>이 시장에서는 눌림목을 아직 측정하지 않았다.</b>{' '}
                  목록은 같은 조건(볼린저 %B ≤ 0.2)으로 걸러낸 것이지만 성과 근거가 없다.
                  {' '}<b>오를 종목 목록이 아니라 살펴볼 후보 목록</b>으로 쓸 것.
                </span>
              )
            }
            return (
              <>
                10년 실측 (손절 −3% / 익절 +9% 규칙, 격자 20개):
                거래당 기댓값 <b>{q.exp >= 0 ? '+' : ''}{q.exp}R</b>
                {' '}· 연 <b>{q.ann >= 0 ? '+' : ''}{q.ann}R</b>
                {' '}(기준선 +{base.exp}R · 연 +{base.ann}R)
                <br />
                <span style={{ color: 'var(--warn)' }}>
                  <b>{rrVerdict('pullback', market).text}.</b> 격자 범위가
                  {' '}{q.lo}~{q.hi}R로 넓어 구간에 따라 기준선에 지기도 한다.
                  {quiet && <> 기댓값은 정체 구간(+{quiet.exp}R)과 사실상 같은데,
                    <b> 정체 구간은 격자 20개 전부에서 플러스였고 눌림목은 아니다.</b></>}
                  {' '}<b>오를 종목 목록이 아니라 살펴볼 후보 목록</b>으로 쓸 것.
                </span>
              </>
            )
          })()}
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
          조건을 만족하는 종목이 실제로 없을 수도 있다.
          <br /><br />
          스캔 직후라면 최대 10분간 이전 결과가 보일 수 있다. 새로고침을 눌러보라.
        </div>
      )}

      {!awaitingScan && data && visibleTiers.map(t => {
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
                {rows.map(r => <StockRow key={r.symbol} r={r} market={market} />)}
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
