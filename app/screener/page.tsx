'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink, TvLayoutSetting } from '../components/TvLink'
import {
  TIERS, CATS, TIER_EVIDENCE, verdictOf,
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

/** 해당 시총 구간·국면에서 실제로 측정된 성과. 판정을 크게 앞세운다. */
function EvidenceBox({ tier, cat, regime }: { tier: TierId; cat: CatKey; regime: Regime }) {
  const p: Perf = TIER_EVIDENCE[tier][cat][regime]
  const b: Perf = TIER_EVIDENCE[tier].base[regime]
  const v = verdictOf(p, b)

  return (
    <div style={{
      background: 'var(--bg-base)',
      border: `1px solid ${v.strong ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
      borderLeft: `3px solid ${v.strong ? 'var(--up)' : 'var(--text-muted)'}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: v.strong ? 'var(--up)' : 'var(--text-muted)',
        }}>{v.text}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {TIERS.find(t => t.id === tier)?.label} · {regime === 'up' ? 'SPY 상승 구간' : 'SPY 하락 구간'} · 2년 실측
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))', gap: 8 }}>
        {[
          { k: '평균 초과', v: `${sgn(p.avg, 2)}%p`, base: `${sgn(b.avg, 2)}`, hl: p.avg > b.avg },
          { k: '중앙값',    v: `${sgn(p.md, 2)}%p`,  base: `${sgn(b.md, 2)}`,  hl: p.md > b.md },
          { k: 'SPY 상회율', v: `${p.hit}%`,          base: `${b.hit}%`,        hl: p.hit >= b.hit },
          { k: '표본',      v: p.n.toLocaleString(), base: '',                 hl: false },
        ].map(x => (
          <div key={x.k}>
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{x.k}</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 700, color: x.hl ? 'var(--up)' : 'var(--text-secondary)' }}>
              {x.v}
            </div>
            {x.base && <div className="num" style={{ fontSize: 9, color: 'var(--text-muted)' }}>기준 {x.base}</div>}
          </div>
        ))}
      </div>

      {p.avg > b.avg && p.md <= b.md && (
        <p style={{ margin: '8px 0 0', color: 'var(--warn)', lineHeight: 1.5 }}>
          평균은 기준선을 넘지만 중앙값은 못 넘는다. 소수 대박 종목이 평균을 끌어올린 것이므로,
          몇 종목만 골라 사면 손해 볼 확률이 더 높다.
        </p>
      )}
    </div>
  )
}

export default function ScreenerPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tier, setTier] = useState<TierId>('large')
  const [tab, setTab] = useState<CatKey>('momentum')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/screener')
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // 국면에 맞는 카테고리를 기본 선택. 하락장에서는 자금전환이 대형주에서 가장 강했다
  useEffect(() => {
    if (data) setTab(data.regime === 'down' ? 'turning' : 'momentum')
  }, [data?.regime])

  const rows = data?.categories?.[tier]?.[tab] ?? []

  // 근거가 약한 카테고리를 뒤로 민다 — 지우지는 않는다.
  // 지우면 "왜 없지?" 하고 나중에 또 만들게 되지만, 근거와 함께 남으면 그게 기록이 된다.
  const orderedCats = useMemo(() => {
    if (!data) return CATS
    return [...CATS].sort((a, b) => {
      const s = (k: CatKey) => {
        const p = TIER_EVIDENCE[tier][k][data.regime]
        const base = TIER_EVIDENCE[tier].base[data.regime]
        return verdictOf(p, base).strong ? 0 : 1
      }
      return s(a.key) - s(b.key)
    })
  }, [data, tier])

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
            <span>{data.regime === 'up' ? '상승 국면' : '하락 국면'} (SPY 20일 {sgn(data.spyChg20, 1)}%)</span>
          </span>
        )}
      />

      <div className="card" style={{ padding: '10px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--warn)' }}>이건 추천이 아니라 필터다.</b> 순자금은 실제 순매수가 아니라
        상승일·하락일 거래대금 비교로 만든 <b>대리지표</b>다(미국은 기관 순매수를 실시간 공개하지 않는다).
        <br />시총 구간마다 결과가 정반대라 <b>구간별로 따로 측정</b>했다. 각 탭의 실측치를 보고 직접 판단할 것.
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
          const strong = data
            ? verdictOf(TIER_EVIDENCE[tier][c.key][data.regime], TIER_EVIDENCE[tier].base[data.regime]).strong
            : false
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

      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)' }}>
        조건: {CATS.find(c => c.key === tab)?.rule}
      </p>

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
