'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink, TvLayoutSetting } from '../components/TvLink'

interface Row {
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null
}
interface Perf { avg: number; md: number; hit: number; n: number }
interface Ev { up: Perf; down: Perf; verdict?: string; note: string }
interface Data {
  regime: 'up' | 'down'
  spyChg20: number | null
  scanned: number
  universeSize: number
  categories: Record<CatKey, Row[]>
  evidence: {
    baseline: { up: Perf; down: Perf; note: string }
    momentum: Ev; turning: Ev; sustained: Ev; quiet: Ev
    caveats: string[]
  }
  fetchedAt: number
}

type CatKey = 'momentum' | 'turning' | 'sustained' | 'quiet'

const CATS: { key: CatKey; label: string; rule: string }[] = [
  { key: 'momentum',  label: '모멘텀 매집', rule: '20일 순자금 상위 + 20일 상승 10% 이상' },
  { key: 'turning',   label: '자금 전환',   rule: '60일 유출 → 20·5일 유입 전환' },
  { key: 'sustained', label: '지속 매집',   rule: '5·20·60일 모두 유입' },
  { key: 'quiet',     label: '조용한 매집', rule: '20일 순자금 상위 + 20일 등락 −5~+2%' },
]

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

/** 카테고리의 실측 성과를 기준선과 비교해 그대로 보여준다 */
function EvidenceBox({ ev, base, regime }: { ev: Ev; base: { up: Perf; down: Perf }; regime: 'up' | 'down' }) {
  const p = regime === 'up' ? ev.up : ev.down
  const b = regime === 'up' ? base.up : base.down
  const beatsAvg = p.avg > b.avg
  const beatsHit = p.hit > b.hit

  return (
    <div style={{
      background: 'var(--bg-base)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-muted)' }}>2년 백테스트 · 현재 국면 기준</span>
        <span className={`pill ${beatsAvg && beatsHit ? 'pill-up' : 'pill-stale'}`}>
          {ev.verdict ?? '미검증'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 8 }}>
        {[
          { k: '평균 초과', v: `${sgn(p.avg, 2)}%p`, hl: beatsAvg },
          { k: '중앙값', v: `${sgn(p.md, 2)}%p`, hl: p.md > b.md },
          { k: 'SPY 상회율', v: `${p.hit}%`, hl: beatsHit },
          { k: '표본', v: p.n.toLocaleString(), hl: false },
        ].map(x => (
          <div key={x.k}>
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{x.k}</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 700, color: x.hl ? 'var(--up)' : 'var(--text-secondary)' }}>
              {x.v}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
        기준선(전체 평균) {sgn(b.avg, 2)}%p · 상회율 {b.hit}%
      </div>
      <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', lineHeight: 1.5 }}>{ev.note}</p>
    </div>
  )
}

export default function ScreenerPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<CatKey>('momentum')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/screener')
      .then(r => r.json())
      .then(j => { if (j.error) setErr(j.error); else setData(j) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // 국면에 맞는 카테고리를 기본 선택 — 백테스트에서 하락장은 자금전환이 유일하게 상회했다
  useEffect(() => {
    if (data) setTab(data.regime === 'down' ? 'turning' : 'momentum')
  }, [data?.regime])

  const rows = data?.categories[tab] ?? []
  const ev = data?.evidence[tab]

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="수급 스크리너"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span>
            {data.regime === 'up' ? '상승 국면' : '하락 국면'}
            <span style={{ marginLeft: 4 }}>(SPY 20일 {sgn(data.spyChg20, 1)}%)</span>
            <span style={{ marginLeft: 8 }}>{data.scanned}/{data.universeSize}종목</span>
          </span>
        )}
      />

      <div className="card" style={{ padding: '10px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--warn)' }}>이건 추천이 아니라 필터다.</b> 순자금은 실제 순매수가 아니라
        상승일·하락일 거래대금 비교로 만든 <b>대리지표</b>다(미국은 기관 순매수를 실시간 공개하지 않는다).
        자체 백테스트에서 어떤 카테고리도 뚜렷한 예측력을 보이지 못했다. 각 탭의 실측치를 보고 직접 판단할 것.
        <br />스캔 비용이 커서 <b>12시간마다</b> 갱신된다. 유니버스는 거래대금 $100M·시총 $10B 이상.
        <div style={{ marginTop: 8 }}><TvLayoutSetting /></div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
        {CATS.map(c => {
          const n = data?.categories[c.key]?.length ?? 0
          const active = tab === c.key
          return (
            <button key={c.key} onClick={() => setTab(c.key)} style={{
              flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 19,
              border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
              background: active ? 'var(--info)' : 'var(--bg-card)',
              color: active ? '#fff' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
            }}>{c.label}{n > 0 && ` ${n}`}</button>
          )
        })}
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)' }}>
        조건: {CATS.find(c => c.key === tab)?.rule}
      </p>

      {data && ev && <EvidenceBox ev={ev} base={data.evidence.baseline} regime={data.regime} />}

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          705종목 스캔 중… 최초 조회는 몇 초 걸립니다
        </div>
      )}

      {data && !loading && rows.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          조건에 맞는 종목 없음
        </div>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="overflow-x-table">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>종목</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>20일 순자금</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>5일</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>60일</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>20일 등락</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>RVOL</th>
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
                    <td className="num" style={{ textAlign: 'right', padding: '9px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {r.rvol == null ? '—' : r.rvol.toFixed(2) + 'x'}
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
          {data.evidence.caveats.map((c, i) => <div key={i}>· {c}</div>)}
        </div>
      )}
    </div>
  )
}
