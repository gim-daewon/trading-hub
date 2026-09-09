'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { MarketToggle, MicroToggle, useMarket } from '../components/MarketToggle'
import { MARKETS, tiersFor, fmtCap, type Market } from '@/lib/markets'
import MetricGuide from '../components/MetricGuide'
import { TvLayoutSetting } from '../components/TvLink'
import { SymbolLabel } from '../components/SymbolLabel'
import { useLiveQuotes } from '../components/useLiveQuotes'
import { LivePct } from '../components/LivePct'
import { ExitPrices } from '../components/ExitPrices'
import {
  CATS, TIER_EVIDENCE, RR_EVIDENCE_BY_MARKET, RR_BASELINE_BY_MARKET, rrVerdict,
  type TierId, type CatKey, type Regime,
} from '@/lib/screener-shared'

interface Row {
  atr14?: number | null; dollarVol?: number | null; price?: number | null
  /** 화면용 짧은 이름. 한국은 005930, 크립토는 BTC */
  display?: string | null
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
function EvidenceBox({ market, tier, cat, regime }: {
  market: Market; tier: TierId; cat: CatKey; regime: Regime
}) {
  // 반드시 그 시장의 근거·기준선을 쓴다.
  // 한국 기준선은 미국의 절반이라 미국 잣대로 재면 멀쩡한 신호가 다 미달로 나온다
  const q = RR_EVIDENCE_BY_MARKET[market][cat]
  const base = RR_BASELINE_BY_MARKET[market]
  const v = rrVerdict(cat, market)
  const tone = TONE[v.tone]
  // 실측치는 **미국 3구간**뿐이다. 한국·크립토, 그리고 초소형·시총 미상은
  // 잰 적이 없다. 없는 걸 0으로 채우면 근거가 거짓말이 된다
  const ev = market === 'us' ? TIER_EVIDENCE[tier] : undefined
  const p = ev?.[cat][regime]
  const b = ev?.base[regime]

  // 아직 재지 않은 시장·카테고리는 근거 상자를 그리지 않는다.
  // 빈 숫자를 0으로 채우면 "기댓값 0%"라는 잘못된 사실이 화면에 뜬다
  if (!q || !base) {
    return (
      <div style={{
        background: 'var(--bg-base)', borderRadius: 10, padding: '10px 12px',
        marginBottom: 12, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <b style={{ color: 'var(--warn)' }}>이 조건은 이 시장에서 아직 측정하지 않았다.</b>
        {' '}목록은 같은 규칙으로 걸러낸 것이지만 성과 근거가 없다.
      </div>
    )
  }
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
          { k: '거래당 기댓값', v: `${sgn(q.exp, 3)}R`, sub: `기준선 ${sgn(base.exp, 3)}R`, hl: q.exp > base.exp },
          { k: '연 R',         v: `${sgn(q.ann, 2)}R`, sub: `기준선 ${sgn(base.ann, 2)}R`, hl: q.ann > base.ann },
          { k: '평균 보유',    v: `${q.days.toFixed(1)}일`, sub: `기준선 ${base.days}`, hl: false },
          { k: '격자 범위',    v: `${sgn(q.lo, 3)}~${sgn(q.hi, 3)}R`, sub: '20개 최소~최대', hl: q.lo > base.exp },
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
        <span style={{ opacity: 0.75 }}> (기준선 {base.win}% · {base.rr.toFixed(2)})</span>
        <br />
        <span style={{ opacity: 0.75 }}>
          승률·손익비는 신호와 거의 무관하다 — 규칙(−3%/+9%)이 만드는 값이다.
        </span>
      </div>

      {/* 시총·국면별 참고값은 미국 3구간만 실측했다.
          한국·크립토나 초소형 구간에서는 아예 그리지 않는다 */}
      {p && b && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10 }}>
            시총·국면별 참고값 (20일 보유 기준 · 표본이 겹쳐 과대평가된다)
          </summary>
          <div className="num" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {tiersFor(market).find(t => t.id === tier)?.label} · {regime === 'up' ? '상승' : '하락'} 구간 ·
            2년 · 표본 {p.n.toLocaleString()}
            <br />
            평균 {sgn(p.avg, 2)}%p (기준 {sgn(b.avg, 2)}) ·
            중앙값 {sgn(p.md, 2)} (기준 {sgn(b.md, 2)}) ·
            상회율 {p.hit}% (기준 {b.hit}%)
          </div>
        </details>
      )}
    </div>
  )
}

export default function ScreenerPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [market, setMarket, marketReady] = useMarket()
  // 기본은 꺼짐. 한국은 거래대금 1억원 미만이 52%라 켜두면 목록이 잠긴다
  const [includeMicro, setIncludeMicro] = useState(false)
  const [tier, setTier] = useState<TierId>('large')
  // 기본 탭은 정체 구간. 기댓값은 눌림목과 사실상 같지만(+0.28 vs +0.30)
  // 격자 20개 전부에서 플러스인 건 이쪽뿐이다. 모멘텀은 기댓값이 마이너스다
  const [tab, setTab] = useState<CatKey>('quiet')
  const [sort, setSort] = useState<'default' | 'flowHigh' | 'flowLow' | 'live'>('default')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/screener?market=${market}`)
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])

  // 저장된 시장을 읽기 전에 부르면 미국을 한 번 받았다가 다시 받는다
  useEffect(() => { if (marketReady) load() }, [load, marketReady])

  // 수급은 이제 **거르지 않고 정렬만 한다.**
  //
  // 눌림목·정체 구간에서 수급 상위 필터가 앞뒤 절반 검증을 통과하지 못했다.
  // 그렇다고 화면에서 지우면 판단 재료가 사라지므로, 선정은 카테고리 고유
  // 변수(%B, 등락)로 하고 수급은 여기서 껐다 켜는 정렬 기준으로 남긴다.
  //
  // 서버가 이미 25개로 자른 뒤라 이 정렬은 **보이는 것의 순서만** 바꾼다.
  // 종목 선정에는 관여하지 않는다 — 그게 필터와 다른 점이다.
  const picked = data?.categories?.[tier]?.[tab] ?? []
  // 실시간 등락률은 보이는 종목만 요청한다.
  // useLiveQuotes가 심볼 목록을 문자열로 비교하므로 배열이 매번 새로 만들어져도
  // 내용이 같으면 다시 부르지 않는다
  const live = useLiveQuotes(market, picked.map(r => r.symbol))

  // 등락률순은 아직 값이 없는 종목을 뒤로 보낸다.
  // 0으로 두면 '보합'과 '아직 안 받아옴'이 섞여 순서가 거짓말이 된다
  const pctOf = (r: Row) => live.quotes[r.symbol]?.pct ?? -Infinity
  const rows = useMemo(() => {
    if (sort === 'default') return picked
    if (sort === 'live') return [...picked].sort((a, b) => pctOf(b) - pctOf(a))
    return [...picked].sort((a, b) => sort === 'flowHigh'
      ? (b.f20 ?? -999) - (a.f20 ?? -999)
      : (a.f20 ?? 999) - (b.f20 ?? 999))
    // live.quotes가 30초마다 바뀌므로 등락률순일 때만 그걸 의존성에 넣는다
  }, [picked, sort, sort === 'live' ? live.quotes : null])

  // 근거가 약한 카테고리를 뒤로 민다 — 지우지는 않는다.
  // 지우면 "왜 없지?" 하고 나중에 또 만들게 되지만, 근거와 함께 남으면 그게 기록이 된다.
  //
  // CATS가 이미 기댓값 순으로 정의돼 있다. 여기서 다시 정렬하지 않는다 —
  // 정렬 기준이 두 곳에 있으면 갈라진다
  const orderedCats = CATS

  // 초소형·시총 미상은 토글이 켜져야 보인다.
  // 지우지 않는 이유: "모든 종목"이 요구사항이다. 볼지 말지를 고르게 한다
  const visibleTiers = tiersFor(market)
    .filter(t => includeMicro || (t.id !== 'micro' && t.id !== 'unknown'))

  // 시장을 바꾸거나 토글을 끄면 지금 구간이 사라질 수 있다.
  // 그대로 두면 빈 화면이 뜨고 사용자는 "종목이 없다"고 오해한다
  useEffect(() => {
    if (!visibleTiers.some(t => t.id === tier)) setTier(visibleTiers[0]?.id ?? 'large')
  }, [visibleTiers, tier])

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

      <MarketToggle value={market} onChange={setMarket} />

      {/* 규칙이 검증되지 않은 시장은 근거 문구를 통째로 바꾼다.
          미국에서 잰 숫자를 그대로 띄우면 그건 거짓말이 된다 */}
      {!MARKETS[market].ruleValidated && (
        <div className="card" style={{
          padding: '10px 12px', marginBottom: 14, fontSize: 11, lineHeight: 1.6,
          borderLeft: '3px solid var(--warn)',
        }}>
          <b style={{ color: 'var(--warn)' }}>{MARKETS[market].label}은 아직 검증 전이다.</b>
          {' '}{MARKETS[market].ruleNote}
          <br />
          아래 목록은 <b>같은 조건으로 걸러낸 종목</b>일 뿐, 성과 근거가 붙어 있지 않다.
          화면에 뜨는 기댓값·손익비는 전부 <b>미국에서 잰 값</b>이라 여기엔 해당되지 않는다.
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            유니버스: {MARKETS[market].universeNote}
          </div>
        </div>
      )}

      {MARKETS[market].ruleValidated && (
      <div className="card" style={{ padding: '10px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--warn)' }}>이건 예측이 아니라 탐색 도구다.</b> 2,700종목을 수십 개로 좁혀줄 뿐,
        오를 종목을 고르지 않는다. 판정 기준을 <b>승률에서 거래당 기댓값</b>으로 바꿨다
        (손절 −3% / 익절 +9%). 그러자 순위가 뒤집혔다 —
        <b>모멘텀은 승률 1위인데 기댓값은 유일한 마이너스</b>, 정체 구간은 승률 꼴찌인데 기댓값 2위였다.
        <br /><b style={{ color: 'var(--info)' }}>2026-09-06: 눌림목·정체 구간에서 수급 상위 필터를 뺐다.</b>
        {' '}앞뒤 절반으로 나눠 재보니 수급 상위는 부호가 뒤집혔고(+0.094% → −0.065%)
        수급 하위가 양쪽 모두 더 나았다(+0.308% / +0.035%). 수급은 이제 거르지 않고
        <b> 정렬로만</b> 쓴다. 모멘텀에서만 방향이 맞아 거기만 필터를 남겼다.
        <br /><b>20개 격자 전부에서 기준선을 넘은 조건은 하나도 없다.</b>
        <br />순자금은 실제 순매수가 아니라 상승일·하락일 거래대금 비교로 만든 <b>대리지표</b>다
        (미국은 기관 순매수를 실시간 공개하지 않는다).
        <div style={{ marginTop: 8 }}><TvLayoutSetting /></div>
      </div>
      )}

      <MicroToggle
        on={includeMicro}
        onChange={setIncludeMicro}
        counts={(data?.tierCounts?.micro ?? 0) + (data?.tierCounts?.unknown ?? 0)}
      />

      {/* 시총 구간 — 경계가 시장마다 다르다 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2 }}>
        {visibleTiers.map(t => {
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
          const strong = rrVerdict(c.key, market).tone === 'ok'
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

      {/* 수급 정렬 — 필터가 아니라 순서만 바꾼다.
          어느 방향이 나은지 검증에서 갈리지 않았으므로 양쪽 다 열어둔다.
          하위 정렬은 장난이 아니다: 수급 하위 30%가 앞뒤 절반 모두에서
          상위 30%보다 기댓값이 높았다(+0.308/+0.035 vs +0.094/-0.065). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>정렬</span>
        {([
          ['default', tab === 'pullback' ? '%B 낮은 순' : tab === 'quiet' ? '등락 0에 가까운 순' : '수급 높은 순'],
          ['flowHigh', '수급 높은 순'],
          ['flowLow', '수급 낮은 순'],
          ['live', '등락률순'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={sort === k ? 'pill pill-up' : 'pill'}
            style={{ cursor: 'pointer', border: 'none', fontSize: 10 }}
          >
            {label}
          </button>
        ))}
      </div>
      <MetricGuide show={['flow', 'pctB', 'rvol']} />

      {data && <EvidenceBox market={market} tier={tier} cat={tab} regime={data.regime} />}

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
                      {/* ExitPrices를 sub 안에 넣으면 말줄임 컨테이너라 가격이 잘린다.
                          별도 줄로 뺀다 */}
                      <SymbolLabel
                        symbol={r.symbol} display={r.display} name={r.name} market={market}
                        trailing={<LivePct live={live.quotes[r.symbol]} market={market} />}
                        sub={r.sector ? r.sector.slice(0, 22) : fmtCap(r.marketCap, market)}
                      />
                      <ExitPrices
                        price={r.price} atr14={r.atr14} dollarVol={r.dollarVol}
                        market={market} compact
                      />
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
