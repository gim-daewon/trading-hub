'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MetricGuide from '../components/MetricGuide'
import { TvLink, TvLayoutSetting } from '../components/TvLink'
import {
  TIERS, CATS, TIER_EVIDENCE, RR_EVIDENCE, RR_BASELINE, rrVerdict,
  type TierId, type CatKey, type Regime, type Perf,
} from '@/lib/screener-shared'

interface Row {
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pctB: number | null
}
interface Data {
  regime: Regime
  spyChg20: number | null
  scanned: number
  universeSize: number
  source: 'snapshot' | 'live'
  tierCounts: Record<TierId, number>
  categories: Record<TierId, Record<CatKey, Row[]>>
  caveats: string[]
  scannedAt?: number
  /** 데이터 마지막 봉 날짜 (YYYY-MM-DD). 스캔 시각과 다를 수 있다 */
  barDate?: string | null
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
const cls = (v: number | null) => v == null ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'

function Bar({ v }: { v: number | null }) {
  if (v == null) return <span className="flat">—</span>
  const w = Math.min(Math.abs(v), 100)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 92 }}>
      <span className={`num ${cls(v)}`} style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{sgn(v)}%</span>
      <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-base)', overflow: 'hidden' }}>
        <span style={{
          display: 'block', height: '100%', width: `${w}%`,
          background: v > 0 ? 'var(--up)' : 'var(--down)',
          marginLeft: v > 0 ? 0 : `${100 - w}%`,
        }} />
      </span>
    </span>
  )
}

const TONE = {
  ok:   { color: 'var(--text-secondary)', border: 'var(--text-muted)' },
  weak: { color: 'var(--warn)',           border: 'var(--warn)' },
  none: { color: 'var(--down)',           border: 'var(--down)' },
} as const

/**
 * 10년 구간 단위 실측을 앞세운다.
 *
 * 예전에는 2년 뭉친 값으로 "기준선 상회"를 초록색으로 크게 띄웠는데,
 * 구간 단위로 재보니 유의한 조건이 하나도 없었다. 초록 배지는 없앴다.
 * 시총·국면별 값은 참고로 아래에 접어둔다.
 */
/**
 * 손익비 기준 근거 박스.
 *
 * 전에는 "20일 보유 후 양수 구간 비율"(승률)로 판정했다. 그런데 사용자 매매는
 * 손절 -3%가 있는 규칙 매매이고, 그 기준으로 재보니 순위가 정반대였다 —
 * 모멘텀은 승률 1위인데 기댓값은 유일한 마이너스였다.
 * 그래서 판정을 거래당 기댓값으로 바꿨다. 승률·손익비는 참고로만 둔다.
 */
function EvidenceBox({ tier, cat, regime }: { tier: TierId; cat: CatKey; regime: Regime }) {
  const q = RR_EVIDENCE[cat]
  const v = rrVerdict(cat)
  const tone = TONE[v.tone]
  const p: Perf = TIER_EVIDENCE[tier][cat][regime]
  const b: Perf = TIER_EVIDENCE[tier].base[regime]

  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${tone.border}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: tone.color }}>{v.text}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          10년 · 손절 −3% / 익절 +9% 규칙 · 격자 10개
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
        {[
          { k: '거래당 기댓값', v: `${sgn(q.exp, 2)}%`, sub: `기준선 ${sgn(RR_BASELINE.exp, 2)}`, hl: q.exp > RR_BASELINE.exp },
          { k: '연환산',       v: `${sgn(q.ann, 1)}%`, sub: `기준선 ${sgn(RR_BASELINE.ann, 1)}`, hl: q.ann > RR_BASELINE.ann },
          { k: '평균 보유',    v: `${q.days.toFixed(1)}일`, sub: `기준선 ${RR_BASELINE.days}`, hl: false },
          { k: '격자 범위',    v: `${sgn(q.lo, 2)}~${sgn(q.hi, 2)}`, sub: '10개 최소~최대', hl: q.lo > RR_BASELINE.exp },
        ].map(x => (
          <div key={x.k}>
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{x.k}</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 700, color: x.hl ? 'var(--up)' : 'var(--text-secondary)' }}>
              {x.v}
            </div>
            <div className="num" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{x.sub}</div>
          </div>
        ))}
      </div>

      {v.note && (
        <p style={{ margin: '8px 0 0', color: 'var(--warn)', lineHeight: 1.5 }}>{v.note}</p>
      )}

      <div className="num" style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        참고 · 승률 {q.win}% · 손익비 {q.rr.toFixed(2)}
        <span style={{ opacity: 0.75 }}> (기준선 {RR_BASELINE.win}% · {RR_BASELINE.rr.toFixed(2)})</span>
        <br />
        <span style={{ opacity: 0.75 }}>
          승률·손익비는 신호와 거의 무관하다 — 규칙(−3%/+9%)이 만드는 값이다.
        </span>
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10 }}>
          시총·국면별 참고값 (20일 보유 기준 · 표본이 겹쳐 과대평가된다)
        </summary>
        <div className="num" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {TIERS.find(t => t.id === tier)?.label} · {regime === 'up' ? 'SPY 상승' : 'SPY 하락'} 구간 ·
          2년 · 표본 {p.n.toLocaleString()}
          <br />
          평균 {sgn(p.avg, 2)}%p (기준 {sgn(b.avg, 2)}) ·
          중앙값 {sgn(p.md, 2)} (기준 {sgn(b.md, 2)}) ·
          상회율 {p.hit}% (기준 {b.hit}%)
        </div>
      </details>
    </div>
  )
}

export default function ScreenerPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tier, setTier] = useState<TierId>('large')
  // 기본 탭은 기댓값 1위(조용한 매집). 모멘텀은 기댓값이 마이너스라 뒤로 뺐다
  const [tab, setTab] = useState<CatKey>('quiet')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/screener')
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const rows = data?.categories?.[tier]?.[tab] ?? []

  // 근거가 약한 카테고리를 뒤로 민다 — 지우지는 않는다.
  // 지우면 "왜 없지?" 하고 나중에 또 만들게 되지만, 근거와 함께 남으면 그게 기록이 된다.
  //
  // 정렬 기준을 시총·국면별 값에서 10년 구간 단위 양수비율로 바꿨다.
  // 구간 단위로 재보니 순서가 뒤집혔다 — 모멘텀 57% > 눌림목 52% > 조용한매집 47%.
  // CATS가 이미 기댓값 순으로 정의돼 있다. 여기서 다시 정렬하지 않는다 —
  // 정렬 기준이 두 곳에 있으면 갈라진다
  const orderedCats = CATS

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="수급 스크리너"
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

      <div className="card" style={{ padding: '10px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--warn)' }}>이건 예측이 아니라 탐색 도구다.</b> 2,700종목을 수십 개로 좁혀줄 뿐,
        오를 종목을 고르지 않는다. 판정 기준을 <b>승률에서 거래당 기댓값</b>으로 바꿨다
        (손절 −3% / 익절 +9%). 그러자 순위가 뒤집혔다 —
        <b>모멘텀은 승률 1위인데 기댓값은 유일한 마이너스</b>, 조용한매집은 승률 꼴찌인데 기댓값 2위였다.
        <br /><b>10개 격자 전부에서 기준선을 넘은 조건은 하나도 없다.</b>
        <br />순자금은 실제 순매수가 아니라 상승일·하락일 거래대금 비교로 만든 <b>대리지표</b>다
        (미국은 기관 순매수를 실시간 공개하지 않는다).
        <div style={{ marginTop: 8 }}><TvLayoutSetting /></div>
      </div>

      {/* 시총 구간 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2 }}>
        {TIERS.map(t => {
          const active = tier === t.id
          const n = data?.tierCounts?.[t.id] ?? 0
          return (
            <button key={t.id} onClick={() => setTier(t.id)} style={{
              flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 10,
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400,
            }}>{t.label}{n > 0 && <span className="num" style={{ marginLeft: 6, opacity: 0.7 }}>{n}</span>}</button>
          )
        })}
      </div>

      {/* 신호 카테고리 — 근거 있는 것이 앞에 온다 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
        {orderedCats.map(c => {
          const n = data?.categories?.[tier]?.[c.key]?.length ?? 0
          const active = tab === c.key
          const strong = rrVerdict(c.key).tone === 'ok'
          return (
            <button key={c.key} onClick={() => setTab(c.key)} style={{
              flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 19,
              border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
              background: active ? 'var(--info)' : 'var(--bg-card)',
              color: active ? '#fff' : strong ? 'var(--text-secondary)' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
              opacity: active || strong ? 1 : 0.65,
            }}>
              {strong && <span style={{ marginRight: 4 }}>●</span>}
              {c.label}{n > 0 && ` ${n}`}
            </button>
          )
        })}
      </div>

      <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)' }}>
        조건: {CATS.find(c => c.key === tab)?.rule}
      </p>
      <MetricGuide show={['flow', 'pctB', 'rvol']} />

      {data && <EvidenceBox tier={tier} cat={tab} regime={data.regime} />}

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {data && !loading && rows.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          이 구간에 조건을 만족하는 종목이 없다
        </div>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="overflow-x-table">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>종목</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>20일 순자금</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>5일</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>60일</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>20일 등락</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>볼린저 %B</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>시총</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 10px' }}>
                      <div className="num" style={{ fontWeight: 700 }}><TvLink symbol={r.symbol} /></div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(r.sector || '').slice(0, 22)}</div>
                    </td>
                    <td style={{ padding: '9px 10px' }}><Bar v={r.f20} /></td>
                    <td className={`num ${cls(r.f5)}`} style={{ textAlign: 'right', padding: '9px 10px', fontSize: 12 }}>{sgn(r.f5)}%</td>
                    <td className={`num ${cls(r.f60)}`} style={{ textAlign: 'right', padding: '9px 10px', fontSize: 12 }}>{sgn(r.f60)}%</td>
                    <td className={`num ${cls(r.chg20)}`} style={{ textAlign: 'right', padding: '9px 10px', fontSize: 12 }}>{sgn(r.chg20, 1)}%</td>
                    <td className="num" style={{
                      textAlign: 'right', padding: '9px 10px', fontSize: 12,
                      // 하단권(20% 이하)은 강조 — 눌림목 카테고리의 핵심 조건
                      color: r.pctB == null ? 'var(--text-muted)'
                        : r.pctB <= 0.2 ? 'var(--info)'
                        : r.pctB >= 0.8 ? 'var(--warn)' : 'var(--text-secondary)',
                      fontWeight: r.pctB != null && r.pctB <= 0.2 ? 700 : 400,
                    }}>
                      {r.pctB == null ? '—' : `${(r.pctB * 100).toFixed(0)}%`}
                    </td>
                    <td className="num" style={{ textAlign: 'right', padding: '9px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
                      ${(r.marketCap / 1e9).toFixed(1)}B
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && (
        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>백테스트 한계</p>
          {data.caveats?.map((c, i) => <div key={i}>· {c}</div>)}
        </div>
      )}
    </div>
  )
}
