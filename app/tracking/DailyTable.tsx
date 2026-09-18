'use client'
import { BREAKOUTS, hiddenBreakouts, DAILY_EVIDENCE } from '@/lib/screener-shared'
import type { Market } from '@/lib/markets'

/**
 * VWMA 신호별 다음날 등락 — 날마다 쌓은 누적.
 *
 * 판정은 '같은 날 유니버스 평균 대비 초과R'의 날짜 평균으로 한다.
 * 1일 등락은 시장 흐름이 거의 전부라, 절대 등락으로는 하락장 하루에
 * 모든 신호가 나빠 보인다.
 */
export interface DailyStat {
  n: number; days: number
  avg: number; exAvg: number; up: number; beat: number
  nR: number; exR: number | null
  posDays: number; daysR: number
  t: number | null
  perDay: { date: string; n: number; ex: number; exR: number | null }[]
}
export interface Daily {
  from: string | null; to: string | null
  pairs: number; dropped: number; cost: number
  stats: Record<string, DailyStat | null>
}

/** 날짜 20개 미만이면 t값이 크게 흔들린다. 그 전에는 결론을 적지 않는다 */
const MIN_DAYS = 20

const sgn = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
const cls = (v: number) => v > 0 ? 'up' : v < 0 ? 'down' : 'flat'

function Verdict({ s }: { s: DailyStat }) {
  const [text, color] =
    s.daysR < MIN_DAYS ? [`표본 부족 ${s.daysR}/${MIN_DAYS}일`, 'var(--text-muted)']
    : s.t != null && s.t >= 2 ? ['평균보다 낫다', 'var(--up)']
    : s.t != null && s.t <= -2 ? ['평균보다 못하다', 'var(--down)']
    : ['평균과 구분 안 됨', 'var(--text-muted)']
  return <span style={{ fontSize: 9, color, whiteSpace: 'nowrap' }}>{text}</span>
}

/** 날짜별 초과R 막대. 하루에 끌려간 결과인지 고르게 나온 결과인지가 보인다 */
function Bars({ days }: { days: DailyStat['perDay'] }) {
  const xs = days.flatMap(d => d.exR == null ? [] : [d.exR])
  if (!xs.length) return null
  const max = Math.max(...xs.map(Math.abs), 0.05)
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {xs.map((x, i) => (
        <div key={i} style={{ position: 'relative', width: 4, height: 18 }}>
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: `${Math.max(6, (Math.abs(x) / max) * 50)}%`,
            ...(x >= 0 ? { bottom: '50%' } : { top: '50%' }),
            background: x >= 0 ? 'var(--up)' : 'var(--down)', opacity: 0.8,
          }} />
        </div>
      ))}
    </div>
  )
}

export default function DailyTable({ daily, market }: { daily: Daily; market: Market }) {
  const hidden = hiddenBreakouts(market)
  const base = daily.stats.base
  const ev = DAILY_EVIDENCE[market]
  const rows = BREAKOUTS
    .filter(b => !hidden.has(b.key))
    .map(b => ({ b, s: daily.stats[b.key] }))
    .sort((x, y) => (y.s?.exR ?? -99) - (x.s?.exR ?? -99))

  const th = { padding: '8px 8px', textAlign: 'right' as const, fontWeight: 600 }
  const td = { padding: '8px 8px', textAlign: 'right' as const }

  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>
        VWMA 신호 · 다음날 등락 누적
      </h2>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
        {daily.from} ~ {daily.to} · {daily.pairs}쌍 · 신호 뜬 날 종가 매수 → 다음 거래일 종가 매도 ·
        왕복 비용 {daily.cost}% 차감
        {daily.dropped > 0 && ` · 하루 −60%/+150% 밖 ${daily.dropped}건 제외(분할·데이터 오류)`}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="overflow-x-table">
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 680, width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 10 }}>
                <th style={{ ...th, textAlign: 'left' }}>신호</th>
                <th style={th}>초과R</th>
                <th style={th}>t</th>
                <th style={th}>백테스트 10년</th>
                <th style={th}>날짜별</th>
                <th style={th}>다음날</th>
                <th style={th}>평균 이김</th>
                <th style={th}>표본</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, s }) => (
                <tr key={b.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ fontWeight: 700 }}>{b.label}</div>
                    {s && <Verdict s={s} />}
                  </td>
                  <td style={td}>
                    {s?.exR != null
                      ? <span className={`num ${cls(s.exR)}`} style={{ fontWeight: 700 }}>{sgn(s.exR, 3)}</span>
                      : '—'}
                  </td>
                  <td className="num" style={{ ...td, color: 'var(--text-muted)' }}>
                    {s?.t != null ? sgn(s.t, 1) : '—'}
                  </td>
                  <td style={td}>
                    {ev[b.key] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className={`num ${cls(ev[b.key].d1)}`} style={{ fontSize: 11 }}>
                          1일 {sgn(ev[b.key].d1, 3)} <span style={{ opacity: 0.6 }}>(t {sgn(ev[b.key].t1, 1)})</span>
                        </span>
                        <span className={`num ${cls(ev[b.key].d20)}`} style={{ fontSize: 9, opacity: 0.85 }}>
                          20일 {sgn(ev[b.key].d20, 3)} (t {sgn(ev[b.key].t20, 1)})
                        </span>
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={td}>
                    {s && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <Bars days={s.perDay} />
                        <span className="num" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          {s.posDays}/{s.daysR}일 +
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    {s ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className={`num ${cls(s.avg)}`}>{sgn(s.avg)}%</span>
                        <span className={`num ${cls(s.exAvg)}`} style={{ fontSize: 9 }}>평균 {sgn(s.exAvg)}%p</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="num" style={{ ...td, color: 'var(--text-muted)' }}>
                    {s ? `${s.beat.toFixed(0)}%` : '—'}
                  </td>
                  <td className="num" style={{ ...td, color: 'var(--text-muted)' }}>
                    {s ? s.n.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {base && (
                <tr style={{ color: 'var(--text-muted)' }}>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ fontWeight: 700 }}>유니버스 평균</div>
                    <span style={{ fontSize: 9 }}>비교 기준</span>
                  </td>
                  <td className="num" style={td}>0</td>
                  <td style={td}>—</td>
                  <td style={td}>—</td>
                  <td style={td}>—</td>
                  <td className="num" style={td}>
                    <span className={cls(base.avg)}>{sgn(base.avg)}%</span>
                  </td>
                  <td style={td}>—</td>
                  <td className="num" style={td}>{base.n.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <div>· <b>초과R</b> = 같은 날 유니버스 평균보다 몇 R 더 벌었나(날짜별 평균).
          R은 규칙의 손절 거리(2×ATR) 기준이다</div>
        <div>· <b>t</b> = 날짜 단위 t값. ±2를 넘어야 우연과 구분된다.
          같은 날 종목들은 함께 움직여 독립이 아니라서 날짜로 묶었다</div>
        <div>· 화면 상한(25개)이 아니라 <b>신호에 걸린 종목 전부</b>를 잰다</div>
        <div>· <b>백테스트 10년</b> = 같은 방식(규칙 없이 h일 보유, 유니버스 평균 대비)으로 잰 10년치다.
          <b>1일 보유로 평균을 이기는 신호는 세 시장 모두 없다.</b>
          한국 nearW·nearD만 20일에서 플러스가 된다 — 짧게 끊으면 사라지는 우위다</div>
        <div>· <b>이 표는 규칙 판정을 대신하지 않는다.</b> 백테스트 규칙의 평균 보유는 약 21거래일이다 —
          다음날이 나빠도 20일 뒤에는 좋은 신호가 있을 수 있다</div>
      </div>
    </section>
  )
}
