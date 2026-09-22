'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { MarketToggle, useMarket } from '../components/MarketToggle'
import { MARKETS } from '@/lib/markets'
import DailyTable, { type Daily } from './DailyTable'
import {
  tiersFor, CATS, BREAKOUTS, STOPPING_RULE,
  type TierId, type CatKey, type Regime,
  RR_BASELINE_BY_MARKET,
} from '@/lib/screener-shared'

// 스크리너에 뜬 종목이 실제로 올랐는지 사후 확인.
// 백테스트(과거 되짚기)와 달리 생존편향·표본중복이 없다.
// 다만 한 달로는 통계적 결론이 안 난다 — 대참사 조기 발견과 방향 확인용이다.

interface Result {
  n: number; avg: number; med: number
  exAvg: number; exMed: number; hit: number; up: number
  /** 손익비 — 오른 종목 평균 / |내린 종목 평균| */
  rr: number
  /** 거래당 기댓값. 중단 기준의 판정 지표다 */
  exp: number
}
interface Horizon {
  days: number; from: string; to: string; regime: Regime; spyRet: number
  defChanges?: { date: string; keys: string[]; what: string }[]
  byCat: Record<CatKey, Record<string, Result | null>>
  /** 상위 50개까지 넓힌 표본. 화면에 안 뜬 종목이 섞이므로 따로 본다 */
  byCatExt: Record<CatKey, Result | null>
  /** VWMA 신호별 성적 */
  byBreakout: Record<string, Result | null>
  /** 낙폭 반등 — VWMA 계열이 아니라 따로 잰다 */
  byRebound?: Result | null
}
interface Data {
  horizons: Horizon[]
  /** VWMA 신호별 다음날 등락 누적 */
  daily?: Daily
  snapshotCount: number
  latestAt?: string
  note?: string | null
  error?: string
}

const sgn = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
/**
 * 숫자가 아니면 '—'로 떨어뜨린다.
 *
 * API가 NaN을 내보내면 JSON에서 null이 된다. 타입은 number라 컴파일은 통과하고
 * 화면에서 null.toFixed()로 터진다. 서버 쪽도 고쳤지만, 화면이 데이터 하나에
 * 통째로 죽는 구조를 그대로 두지 않는다
 */
const fx = (v: number | null | undefined, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—'
const cls = (v: number) => v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
const dt = (s: string) => new Date(s).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

/**
 * 판정 지표는 기댓값이다. 승률·손익비는 참고로만 둔다.
 *
 * 주의: 여기 손익비는 '규칙 손익비'가 아니다.
 * 손절 -3%/익절 +9% 규칙의 2.5~2.9는 규칙이 만드는 값이고,
 * 이건 보유 기간 등락의 비대칭(상방이 하방보다 큰가)을 잰다.
 */
function Cell({ r }: { r: Result | null }) {
  if (!r) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
      <span className={`num ${cls(r.exp)}`} style={{ fontSize: 13, fontWeight: 700 }}>
        {sgn(r.exp)}%
      </span>
      <span className={`num ${cls(r.exAvg)}`} style={{ fontSize: 10, opacity: 0.85 }}>
        SPY {sgn(r.exAvg)}%p
      </span>
      <span className="num" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
        승률 {fx(r.up, 0)}% · 손익비 {fx(r.rr)} · {r.n}
      </span>
    </div>
  )
}

export default function TrackingPage() {
  const [market, setMarket, marketReady] = useMarket()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/tracking?market=${market}`)
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])

  useEffect(() => { if (marketReady) load() }, [load, marketReady])

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title="성과 추적"
        onRefresh={load}
        loading={loading}
        showMarketStatus={false}
        sub={data && <span>스냅샷 {data.snapshotCount}개 누적</span>}
      />

      <MarketToggle value={market} onChange={setMarket} />

      {/* 시장마다 표본이 쌓인 날부터가 다르다. 한국·크립토는 2026-09-09부터다.
          그 사실을 안 적으면 "왜 기록이 적지"를 알 수 없다 */}
      {!MARKETS[market].ruleValidated && (
        <div className="card" style={{
          padding: '10px 12px', marginBottom: 12, fontSize: 11, lineHeight: 1.6,
          borderLeft: '3px solid var(--warn)',
        }}>
          <b style={{ color: 'var(--warn)' }}>{MARKETS[market].label}은 판정 기준이 없다.</b>
          {' '}{MARKETS[market].ruleNote}
          {' '}아래 수치는 기록일 뿐 기준선과 비교할 수 없다.
        </div>
      )}

      <div className="card" style={{ padding: '11px 13px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        스크리너에 뜬 종목이 그 뒤 실제로 올랐는지 추적한다. 백테스트와 달리
        <b> 생존편향·표본중복이 없다.</b>
        <br />
        <span style={{ color: 'var(--warn)' }}>
          다만 한 달로는 통계적 결론이 안 난다. 20일 구간이 겹쳐 독립 표본이 하루 1/20개꼴로 쌓인다.
          <b> 대참사 조기 발견과 방향 확인용</b>으로 보라.
        </span>
      </div>

      {/* 중단 기준을 결과보다 위에 둔다.
          결과를 본 뒤에 기준을 정하면 자기합리화가 된다. 먼저 못 박아놓고
          나중에 이 화면을 열었을 때 기준이 그대로인지 확인할 수 있게 한다. */}
      <details className="card" style={{ padding: '11px 13px', marginBottom: 14, fontSize: 11 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--warn)', fontWeight: 700 }}>
          중단 기준 — {STOPPING_RULE.decideAfter} 이후 판단
        </summary>
        <div style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <b style={{ color: 'var(--text-secondary)' }}>결과를 보기 전에 미리 정한 규칙이다.</b>
          <br />
          판정 대상을 <b>승률에서 거래당 기댓값</b>으로 바꿨다 (2026-09-05).
          손절 −3% 규칙으로 재보니 승률과 기댓값의 순위가 정반대였다 —
          모멘텀은 승률 1위인데 기댓값은 유일한 마이너스였고,
          정체 구간은 승률 꼴찌인데 기댓값 2위였다.
          손익비는 규칙이 만드는 값이라 신호별 차이가 없다(전부 2.5~2.9).
          <div className="num" style={{
            margin: '6px 0', padding: '8px 10px', borderRadius: 8,
            background: 'var(--bg-base)', color: 'var(--text-secondary)', fontSize: 11,
          }}>
            판정 지표: {STOPPING_RULE.metric}<br />
            백테스트 기준선 {STOPPING_RULE.baselineExp}R/거래 (미국)<br />
            카테고리 R 기댓값 &lt;= {STOPPING_RULE.dropBelowExp} → 화면에서 내림<br />
            세 카테고리 모두 &lt; {STOPPING_RULE.demoteAllBelowExp}% → 필터 전용으로 격하<br />
            최소 거래 {STOPPING_RULE.minTrades}건 이상일 때만 판단
          </div>
          {STOPPING_RULE.notes.map((n, i) => <div key={i}>· {n}</div>)}
        </div>
      </details>

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {data?.note && (
        <div className="card" style={{ padding: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {data.note}
        </div>
      )}

      {data?.daily && data.daily.pairs > 0 && <DailyTable daily={data.daily} market={market} />}

      {data?.horizons.map(h => (
        <section key={h.days} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{h.days}거래일 경과</h2>
            <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {dt(h.from)} → {dt(h.to)} · 당시 {h.regime === 'up' ? '상승' : '하락'} 국면
            </span>
            <span className={`num ${cls(h.spyRet)}`} style={{ fontSize: 11 }}>
              SPY {sgn(h.spyRet)}%
            </span>
          </div>

          {/* 이 구간이 정의 변경일을 걸치면 아래 성적은 소급 재계산된 것이다.
              그때 화면에 실제로 떴던 종목과 다르다 — 숨기면 12월 판정 때
              "이게 실제로 떴던 것인가"를 확인할 수 없다 */}
          {!!h.defChanges?.length && (
            <div className="card" style={{
              padding: '8px 10px', marginBottom: 8, fontSize: 10, lineHeight: 1.6,
              borderLeft: '3px solid var(--warn)', color: 'var(--text-muted)',
            }}>
              <b style={{ color: 'var(--warn)' }}>이 구간은 정의가 바뀐 날을 지난다.</b>
              {' '}아래 성적은 <b>지금 정의로 다시 묶은 것</b>이라, 그때 화면에 떴던 종목과 다르다.
              {h.defChanges.map(c => (
                <div key={c.date + c.keys.join()} className="num" style={{ marginTop: 3 }}>
                  {c.date} · {c.keys.join(', ')} — <span style={{ fontFamily: 'inherit' }}>{c.what}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="overflow-x-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>카테고리</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>전체</th>
                    {tiersFor('us').map(t => (
                      <th key={t.id} style={{ textAlign: 'right', padding: '8px 10px' }}>
                        {t.label.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(c => (
                    <tr key={c.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{c.label}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <Cell r={h.byCat[c.key]?.all ?? null} />
                      </td>
                      {tiersFor('us').map(t => (
                        <td key={t.id} style={{ padding: '10px', textAlign: 'right' }}>
                          <Cell r={h.byCat[c.key]?.[t.id as TierId] ?? null} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 확장 표본은 표 밖에 따로 둔다. 위 숫자와 섞이면
                "내가 본 것의 성적"이라는 의미가 흐려진다 */}
            <div style={{
              padding: '8px 10px', borderTop: '1px solid var(--border)',
              fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7,
            }}>
              <b>참고 · 상위 50개로 넓힌 표본</b>{' '}
              <span style={{ opacity: 0.8 }}>(화면에 안 뜬 26~50위 포함. 표본을 늘려 방향만 본다)</span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 3 }}>
                {CATS.map(c => {
                  const e = h.byCatExt?.[c.key]
                  return (
                    <span key={c.key} className="num">
                      {c.label} {e ? `상회 ${fx(e.hit, 0)}% · ${e.n}종목` : '—'}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* VWMA 신호 — 화면에 띄우면서 성적을 안 재고 있었다 */}
      {data?.horizons.map(h => h.byBreakout && (
        <section key={`b${h.days}`} style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 800 }}>
            VWMA 신호 · {h.days}거래일
          </h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="overflow-x-table">
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 460 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>신호</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>기댓값</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>승률</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>손익비</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>표본</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 낙폭 반등은 VWMA 계열이 아니지만 같은 표에 둔다 — 나란히 비교해야 의미가 있다 */}
                  {h.byRebound !== undefined && (
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                        낙폭 반등
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>VWMA 아님</span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <span className={`num ${h.byRebound ? cls(h.byRebound.exp) : ''}`} style={{ fontWeight: 700 }}>
                          {h.byRebound ? `${sgn(h.byRebound.exp)}%` : '—'}
                        </span>
                      </td>
                      <td className="num" style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {h.byRebound ? `${fx(h.byRebound.up, 0)}%` : '—'}
                      </td>
                      <td className="num" style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {h.byRebound ? fx(h.byRebound.rr) : '—'}
                      </td>
                      <td className="num" style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {h.byRebound ? h.byRebound.n : '—'}
                      </td>
                    </tr>
                  )}
                  {BREAKOUTS.map(b => {
                    const r = h.byBreakout[b.key]
                    return (
                      <tr key={b.key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{b.label}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <span className={`num ${r ? cls(r.exp) : ''}`} style={{ fontWeight: 700 }}>
                            {r ? `${sgn(r.exp)}%` : '—'}
                          </span>
                        </td>
                        <td className="num" style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {r ? `${fx(r.up, 0)}%` : '—'}
                        </td>
                        <td className="num" style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {r ? fx(r.rr) : '—'}
                        </td>
                        <td className="num" style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {r ? r.n : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {data && data.horizons.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>읽는 법</p>
          <div>· <b>큰 숫자 = 거래당 기댓값.</b> 중단 기준의 판정 지표다</div>
          <div>· SPY ±%p = 같은 기간 SPY 대비 초과수익</div>
          <div>· 손익비는 <b>이 표에서는 보유 기간 등락의 비대칭</b>을 잰다.
            손절 −3%/익절 +9% 규칙의 손익비(2.5~2.9)와는 다른 값이다 —
            그건 규칙이 만드는 값이고 이건 신호가 고른 종목의 성질이다</div>
          <div>· 1거래일 결과는 다음 스캔이면 바로 나온다. 5일을 기다릴 필요가 없다</div>
          <div>· 백테스트 기준선: 기댓값 {RR_BASELINE_BY_MARKET[market] ? `+${RR_BASELINE_BY_MARKET[market]!.exp}%/거래` : '미측정'} (손절 −3%/익절 +9% 규칙)</div>
          <div>· 스캔은 평일 1회라 스냅샷 1개 = 1거래일이다</div>
        </div>
      )}
    </div>
  )
}
