'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { MarketToggle, MicroToggle, useMarket } from '../components/MarketToggle'
import { useLiveQuotes, type LiveQuote } from '../components/useLiveQuotes'
import { LivePct } from '../components/LivePct'
import { MARKETS, tiersFor, fmtCap, fmtPrice, type Market } from '@/lib/markets'
import MetricGuide from '../components/MetricGuide'
import { SymbolLabel } from '../components/SymbolLabel'
import { ExitPrices } from '../components/ExitPrices'
import {
  BREAKOUTS, RR_EVIDENCE_BY_MARKET, RR_BASELINE_BY_MARKET, rrVerdict, roomToVwma60, isWeeklyKey,
  alignStrength, hiddenBreakouts,
  type TierId, type BreakoutKey, type Regime,
} from '@/lib/screener-shared'

// VWMA20 돌파 목록.
//
// 이 화면은 성과를 주장하지 않는다. 10년 검증에서 돌파 계열은 전 구간이
// 기준선(전체 종목 균등, 양수 55%) 아래였다. 차트를 직접 볼 때
// 2,000종목을 100여 개로 좁히는 탐색 도구로만 쓴다.
//
// 목록은 매일 통째로 바뀐다. 오늘 돌파한 종목은 이미 VWMA 위에 있어
// 내일 다시 돌파할 수 없기 때문이다(실측 전날 겹침 0%).

interface Row {
  /** 화면용 짧은 이름. 한국은 005930, 크립토는 BTC */
  display?: string | null
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pctB: number | null
  vwma20?: number | null; vwma60?: number | null; aboveRun?: number | null
  atr14?: number | null; dollarVol?: number | null
  wClose?: number | null; wVwma20?: number | null; wVwma60?: number | null
  price: number | null
}
interface Data {
  regime: Regime
  scanned: number
  tierCounts?: Partial<Record<TierId, number>>
  source: 'snapshot' | 'live'
  breakouts?: Record<TierId, Record<BreakoutKey, Row[]>>
  /** false면 스냅샷에 VWMA 지표가 아직 없다 (컬럼 추가 + 스캔 필요) */
  hasVwma?: boolean
  scannedAt?: number
  /** 데이터 마지막 봉 날짜 (YYYY-MM-DD). 스캔 시각과 다를 수 있다 */
  barDate?: string | null
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

function StockRow({ r, weekly, market, live }: {
  r: Row; weekly: boolean; market: Market; live?: LiveQuote
}) {
  // 종가가 VWMA20에서 얼마나 떨어져 있나. 주봉 탭이면 주봉 값으로 잰다
  const px = weekly ? r.wClose : r.price
  const ma = weekly ? r.wVwma20 : r.vwma20
  const ma60 = weekly ? r.wVwma60 : r.vwma60
  const gap = px && ma ? ((px - ma) / ma) * 100 : null
  // 여력 = VWMA60까지 남은 거리. 역배열에서만 양수다 (60이 위에 있으므로).
  // 손절 -3% 기준으로 손익비를 가늠하는 데 쓴다 — 여력 9%면 3:1이다
  const room = px && ma60 ? ((ma60 - px) / px) * 100 : null
  const rr = room != null ? room / 3 : null
  // 정배열 강도 — 20선과 60선이 벌어진 폭(%). 조건이 아니라 참고용이다
  const align = alignStrength(r, weekly)
  // 지표 한 칸. 라벨 위 / 값 아래
  const Cell = ({ label, value, cls, foot }: {
    label: string; value: string; cls?: string; foot?: string
  }) => (
    <div style={{ textAlign: 'right', minWidth: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</div>
      <div className={`num ${cls ?? ''}`} style={{ fontSize: 12, fontWeight: 700 }}>{value}</div>
      {foot && (
        <div className="num" style={{ fontSize: 8, color: 'var(--text-muted)' }}>{foot}</div>
      )}
    </div>
  )

  // 5열 그리드를 3줄로 바꿨다.
  //
  // 폰(390px)에서 종목 칸이 약 130px밖에 안 남아 '에코프로비엠'이 '에.'로 잘리고
  // 손절가는 '손절 100,998 (' 에서 끊겼다. 이름과 가격은 잘리면 정보가 0이 된다.
  // 이름과 손절·익절이 각각 전체 폭을 쓰게 하고, 지표 4개는 아래 한 줄에 나눈다.
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <SymbolLabel
        symbol={r.symbol} display={r.display} name={r.name} market={market}
        trailing={live ? <LivePct live={live} market={market} /> : fmtCap(r.marketCap, market)}
        sub={<>
          {r.sector ? `${r.sector.slice(0, 20)} · ` : ''}{fmtCap(r.marketCap, market)}
          {live && <> · 현재 <span className="num">{fmtPrice(live.price, market)}</span></>}
        </>}
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6, marginTop: 6,
      }}>
        {/* 정배열 강도 = (VWMA20 - VWMA60) / VWMA60. 부호는 방향, 크기는 벌어진 폭.
            "정배열이냐"만 보면 간신히 붙은 것과 크게 벌어진 것이 같아진다.
            특징 분석에서 클수록 기댓값이 높았지만 살아남은 특징 수가 우연 수준이라
            **거르는 조건으로는 쓰지 않고** 판단 재료로만 보여준다. */}
        <Cell
          label={`${weekly ? '주봉 ' : ''}VWMA 대비`}
          value={gap == null ? '—' : `${sgn(gap, 1)}%`}
          cls={(gap ?? 0) >= 0 ? 'up' : 'down'}
          foot={align == null ? undefined : `정배열 ${sgn(align, 0)}%`}
        />
        <Cell label="20일" value={`${sgn(r.chg20, 0)}%`} cls={(r.chg20 ?? 0) >= 0 ? 'up' : 'down'} />
        <Cell label="수급" value={`${sgn(r.f20, 0)}%`} cls={(r.f20 ?? 0) >= 0 ? 'up' : 'down'} />
        {/* 60선까지 남은 여력과, 손절 -3% 기준 손익비.
            바닥잡기에서 여력이 클수록 손익비가 좋아진다는 게 실측으로 확인됐다
            (여력 15%+ 구간 기댓값 +0.42% vs 기준선 +0.22%).
            다만 도달률이 76%→22%로 떨어지므로 여력만 보고 고르면 안 된다. */}
        <Cell
          label="60선 여력"
          value={room == null ? '—' : `${sgn(room, 0)}%`}
          cls={(room ?? 0) >= 9 ? 'up' : undefined}
          foot={rr != null && room != null && room > 0 ? `${rr.toFixed(1)}:1` : undefined}
        />
      </div>

      <ExitPrices
        price={r.price} atr14={r.atr14} dollarVol={r.dollarVol} market={market} compact
      />
    </div>
  )
}

export default function BreakoutPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // 기본 탭은 기댓값 1위(강세눌림 터치 일봉)
  const [market, setMarket, marketReady] = useMarket()
  const [includeMicro, setIncludeMicro] = useState(false)
  const [tab, setTab] = useState<BreakoutKey>('today')
  // 기본 정렬을 여력순으로. 손절 -3% 기준이면 여력이 곧 손익비다
  const [sort, setSort] = useState<'room' | 'flow' | 'live'>('room')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/screener?market=${market}`)
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])

  useEffect(() => { if (marketReady) load() }, [load, marketReady])

  // 크립토는 주봉 신호를 통째로 숨긴다. 7일 캘린더 주는 주식의 주와 다르다
  const hidden = hiddenBreakouts(market)
  const visibleTiers = tiersFor(market)
    .filter(t => includeMicro || (t.id !== 'micro' && t.id !== 'unknown'))

  // 시장을 바꾸면 지금 탭이 사라질 수 있다 (크립토에서 주봉 탭을 보던 중 등).
  // 그대로 두면 빈 화면이 뜨고 "종목이 없다"고 오해한다
  useEffect(() => {
    if (hidden.has(tab)) setTab('today')
  }, [market, tab, hidden])

  const total = data?.breakouts
    ? visibleTiers.reduce((a, t) => a + (data.breakouts![t.id]?.[tab]?.length ?? 0), 0)
    : 0

  // 실시간 등락률은 **보이는 종목만** 요청한다.
  // 전 종목을 물으면 소스에 부담이고 대부분 화면에 안 뜬다.
  // useLiveQuotes가 심볼 목록을 문자열로 비교하므로 배열을 매번 새로 만들어도
  // 내용이 같으면 다시 부르지 않는다
  const visibleSymbols = data?.breakouts
    ? visibleTiers.flatMap(t => (data.breakouts![t.id]?.[tab] ?? []).map(r => r.symbol))
    : []
  const live = useLiveQuotes(market, visibleSymbols)
  const liveQuotes = live.quotes
  // above_run 컬럼 추가 전 스냅샷이면 전부 null이라 후보가 안 나온다.
  // 목록이 비어 보이는 두 상황을 구분해야 한다 —
  // "오늘 돌파한 종목이 없다"와 "지표가 아직 없다"는 할 일이 다르다.
  const awaitingScan = !!data && !loading && data.hasVwma === false

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="VWMA 돌파"
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
            {live.at > 0 && (
              <span
                className={`pill ${live.open ? 'pill-up' : ''}`}
                title={live.open
                  ? '30초마다 갱신한다'
                  : '장이 닫혀 있다. 아래 등락률은 마지막 거래일 종가 기준이다'}
              >
                {live.open ? '실시간' : '장 마감'}
                {live.loading && ' ·'}
              </span>
            )}
            {data.barDate && (
              <span className="num" title="이 목록을 계산한 마지막 거래일. 스캔 시각과 다를 수 있다">
                {data.barDate.slice(5).replace('-', '/')} 종가 기준
              </span>
            )}
          </span>
        )}
      />

      {/* 성과 근거가 없다는 걸 목록보다 먼저 말한다.
          숫자를 보고 나서 읽으면 이미 늦다. */}
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
          <br />
          아래 신호별 기댓값·손익비는 전부 <b>미국에서 잰 값</b>이라 여기엔 해당되지 않는다.
          {market === 'crypto' && (
            <><br /><b>주봉 신호는 뺐다.</b> 7일 캘린더 주는 주식의 5거래일 주와 다른 개념이고,
            그 차이로 신호가 망가지는 걸 이미 봤다 (touchW). 일봉만 먼저 붙였다.</>
          )}
        </div>
      )}

      <div className="card" style={{
        padding: '11px 13px', marginBottom: 12, fontSize: 11, lineHeight: 1.6,
        borderLeft: '3px solid var(--warn)',
      }}>
        <b style={{ color: 'var(--warn)' }}>기준선을 확실히 넘는 조건은 없다.</b>{' '}
        손절 −3% / 익절 +9% 규칙으로 10년·격자 10개를 재측정했다.
        <b> 손익비는 전부 2.5~2.9로 신호와 무관하다</b> — 규칙이 만드는 값이다.
        승률도 26~32%로 거의 같다. <b>차이는 오직 거래당 기댓값에서 난다.</b>
        <div className="num" style={{
          margin: '6px 0', padding: '7px 9px', borderRadius: 6,
          background: 'var(--bg-base)', color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.7,
        }}>
          기준선 {RR_BASELINE_BY_MARKET[market]?.exp ?? '—'}R/거래 · 연 {RR_BASELINE_BY_MARKET[market]?.ann ?? '—'}R
          <br />
          {BREAKOUTS.filter(b => !hidden.has(b.key)).map(b => {
            const q = RR_EVIDENCE_BY_MARKET[market][b.key]
            return q ? `${b.label} ${q.exp >= 0 ? '+' : ''}${q.exp}R` : ''
          }).filter(Boolean).join(' · ')}
        </div>
        <span style={{ color: 'var(--text-muted)' }}>
          10개 격자 전부에서 기준선을 넘은 조건은 하나도 없다.
          <b> 차트를 직접 볼 후보를 좁히는 용도</b>로 쓴다.
        </span>
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <b style={{ color: 'var(--text-secondary)' }}>60선 여력 · 손익비</b>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            VWMA60까지 남은 거리다. 손절 −3% 기준이면 여력 9%가 3:1이다.
            <b style={{ color: 'var(--warn)' }}> 다만 여력이 클수록 도달률이 76% → 22%로 떨어진다</b> —
            여력만 보고 고르면 목표에 못 닿는다.
          </span>
        </div>
      </div>

      {/* 탭 8개라 가로 스크롤 칩으로 둔다. flex:1로 나누면 글자가 다 뭉개진다 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 2 }}>
        {/* HIDDEN은 여기 안 띄운다 — brokeD는 /short 전용, touchW는 기각 */}
        {BREAKOUTS.filter(b => !hidden.has(b.key)).map(b => {
          const n = data?.breakouts
            ? visibleTiers.reduce((a, t) => a + (data.breakouts![t.id]?.[b.key]?.length ?? 0), 0)
            : 0
          const active = tab === b.key
          return (
            <button key={b.key} onClick={() => setTab(b.key)} style={{
              flexShrink: 0, minHeight: 40, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
            }}>
              {b.label}{n > 0 && <span className="num" style={{ marginLeft: 5, opacity: 0.75 }}>{n}</span>}
            </button>
          )
        })}
      </div>

      <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
        조건: {BREAKOUTS.find(b => b.key === tab)?.rule}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--text-muted)' }}>
        {/* 탭마다 실측치를 붙여둔다. 한 번 읽고 잊는 것보다 매번 보이는 게 낫다 */}
        <span className="num" style={{ color: 'var(--warn)' }}>
          기댓값 {(() => { const q = RR_EVIDENCE_BY_MARKET[market][tab]; return q ? `${q.exp >= 0 ? '+' : ''}${q.exp}R/거래 · 연 ${q.ann >= 0 ? '+' : ''}${q.ann}R` : '미측정' })()}
          {' '}(기준선 {RR_BASELINE_BY_MARKET[market] ? `+${RR_BASELINE_BY_MARKET[market]!.exp}R · 연 +${RR_BASELINE_BY_MARKET[market]!.ann}R` : '미측정'})
        </span>
        {' · '}
        {tab === 'today'
          ? '매일 통째로 바뀐다 — 오늘 돌파한 종목은 이미 VWMA 위라 내일 다시 돌파할 수 없다 (실측 전날 겹침 0%)'
          : tab.endsWith('W')
            ? '주봉 기준이라 한 주 동안 목록이 거의 그대로다'
            : '조건이 유지되는 동안 며칠간 겹친다'}
      </p>

      {/* 정렬 토글. 여력순이 기본이다 —
          손절 -3% 고정이면 여력이 그대로 손익비가 된다 (여력 9% = 3:1) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([['room', '여력순'], ['flow', '수급순'], ['live', '등락률순']] as const).map(([k, label]) => {
          const active = sort === k
          return (
            <button key={k} onClick={() => setSort(k)} style={{
              minHeight: 34, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 11, fontWeight: active ? 700 : 400,
            }}>{label}</button>
          )
        })}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {sort === 'room' ? '60선까지 여력이 큰 순 (손익비 큰 순)'
            : sort === 'flow' ? '20일 순자금이 큰 순'
            : '오늘 많이 오른 순 · 값이 없는 종목은 뒤로'}
        </span>
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
          <b style={{ color: 'var(--warn)' }}>아직 데이터가 없다.</b>
          <br />
          VWMA는 최근 추가한 지표라 <b>DB 컬럼 추가 + 스캔 1회</b>가 필요하다.
          <br /><br />
          1. Supabase SQL Editor에서 <code>supabase/add_vwma.sql</code> 실행
          <br />
          2. GitHub → Actions → Screener Scan → Run workflow
          <br /><br />
          평일이면 다음 자동 스캔(KST 07:30경)에 자동으로 채워진다.
        </div>
      )}

      {!awaitingScan && data?.hasVwma && total === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          이 조건을 만족하는 종목이 없다
        </div>
      )}

      {!awaitingScan && data?.hasVwma && visibleTiers.map(t => {
        const raw = data.breakouts![t.id]?.[tab] ?? []
        const wk = isWeeklyKey(tab)
        // 등락률순은 아직 값이 없는 종목을 뒤로 보낸다.
        // 0으로 두면 '보합'과 '아직 안 받아옴'이 섞여 순서가 거짓말이 된다
        const pctOf = (r: Row) => liveQuotes[r.symbol]?.pct ?? -Infinity
        const rows = [...raw].sort((a, b) =>
          sort === 'room' ? (roomToVwma60(b, wk) ?? -999) - (roomToVwma60(a, wk) ?? -999)
          : sort === 'flow' ? (b.f20 ?? -999) - (a.f20 ?? -999)
          : pctOf(b) - pctOf(a))
        if (!rows.length) return null
        return (
          <section key={t.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{t.label}</h2>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}종목</span>
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {rows.map(r => <StockRow key={r.symbol} r={r} weekly={tab.endsWith('W')} market={market} live={liveQuotes[r.symbol]} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
