'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink } from '../components/TvLink'
import { 단계제목, 단계행동, 지금행동, type 판정 } from '@/lib/credit'

// AI 신용 모니터 — 코어위브 → 오라클 → 칩 회사 → 시장 신용으로 번지는지. 예측이 아니라 '지금 어디까지'.
// 계산·기준은 lib/credit.ts, 확인된 사실은 lib/credit-facts.ts

interface 종목 { 심볼: string; 현재: number | null; 일1: number | null; 일5: number | null; 일20: number | null; qqq대비20: number | null; 고점대비: number | null }
interface 응답 {
  기준시각: string; 종목: 종목[]; qqq20: number | null
  상관: { 지금: number | null; 백분위: number | null }
  신용: { 변화20: number | null; 백분위: number | null }
  판정: 판정
  사실: { 날짜: string; 무엇: string; 출처: { 이름: string; 주소: string }[] }[]
}

const 퍼 = (x: number | null, d = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`)
const 색 = (x: number | null) => (x == null ? 'var(--text-muted)' : x < 0 ? 'var(--down)' : 'var(--up)')
const 카드 = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 } as const
const 단계색 = ['var(--up)', 'var(--warn)', 'var(--warn)', 'var(--down)', 'var(--down)']

export default function CreditPage() {
  const [data, setData] = useState<응답 | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch('/api/credit')
      if (!r.ok) throw new Error(`${r.status}`)
      setData(await r.json())
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: '0 auto' }}>
      <PageHeader title="AI 신용" fetchedAt={data?.기준시각} onRefresh={load} loading={loading}
        sub={<span>코어위브 → 오라클 → 칩 회사로 번지는지 · 예측이 아니라 지금 상태</span>} />
      {err && <p style={{ color: 'var(--down)', fontSize: 13 }}>불러오기 실패: {err}</p>}
      {data && (<>
        {/* 단계 게이지 */}
        {(() => {
          const 경계 = data.판정.조건.some(c => c.켜짐 || c.근접)
          const 제목 = 단계제목(data.판정)
          const 빛 = data.판정.단계 === 0 && 경계 ? 'var(--warn)' : 단계색[data.판정.단계]
          return (<>
        <section style={{ ...카드, marginBottom: 14, borderLeft: `4px solid ${빛}` }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>지금 단계</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 빛, marginTop: 2 }}>{제목}</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            할 일: <b>{지금행동(data.판정)}</b> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({단계행동.표시})</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
            {data.판정.조건.map(c => (
              <li key={c.단계} style={{ fontSize: 13, color: c.켜짐 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <span style={{ color: c.켜짐 ? 'var(--down)' : c.근접 ? 'var(--warn)' : 'var(--text-muted)' }}>{c.켜짐 ? '●' : c.근접 ? '◐' : '○'}</span> {c.단계}. {c.이름}{c.근접 ? ' (근접)' : ''} — {c.근거}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
            ◐ 근접 = 기준의 90% 이상(신용은 하위 15% 안)까지 왔지만 아직 안 넘음 — 단계에는 세지 않습니다. 앞 단계가 켜져야 다음 단계로 셉니다. 기준은 2026-10-19 미리 정했고 백테스트하지 않았습니다(코어위브가 2025년 상장이라 위기 표본이 없음) — '이 정도면 번졌다'는 약속입니다.
          </p>
        </section>
          </>)
        })()}

        {/* 종목 */}
        <section style={{ ...카드, marginBottom: 14, overflowX: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>바스켓 · QQQ 20일 {퍼(data.qqq20)}</div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', minWidth: 420 }}>
            <thead><tr style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'right' }}>
              <th style={{ textAlign: 'left', padding: '4px 0' }}>종목</th><th>1일</th><th>5일</th><th>20일</th><th>QQQ 대비</th><th>1년 고점 대비</th>
            </tr></thead>
            <tbody>
              {data.종목.map(s => (
                <tr key={s.심볼} style={{ borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                  <td style={{ textAlign: 'left', padding: '6px 0' }}><TvLink symbol={s.심볼} market="us">{s.심볼}</TvLink></td>
                  <td style={{ color: 색(s.일1) }}>{퍼(s.일1)}</td><td style={{ color: 색(s.일5) }}>{퍼(s.일5)}</td>
                  <td style={{ color: 색(s.일20) }}>{퍼(s.일20)}</td><td style={{ color: 색(s.qqq대비20) }}>{퍼(s.qqq대비20)}</td>
                  <td style={{ color: 색(s.고점대비) }}>{퍼(s.고점대비, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 같이 움직이나 · 시장 신용 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
          <section style={카드}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>같이 움직이나 (CRWV·ORCL·NVDA·AVGO 30일 평균 상관)</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{data.상관.지금 == null ? '—' : data.상관.지금.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {data.상관.백분위 == null ? '비교할 과거 부족' : `지난 1년 중 상위 ${Math.round((1 - data.상관.백분위) * 100)}%`} · 높을수록 시장이 '같은 위험'으로 값을 매긴다는 뜻
            </div>
          </section>
          <section style={카드}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>시장 신용 (HYG/IEF 20일 변화)</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: 색(data.신용.변화20) }}>{퍼(data.신용.변화20, 2)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {data.신용.백분위 == null ? '—' : `10년 중 하위 ${Math.round(data.신용.백분위 * 100)}%`} · 낮을수록 하이일드가 국채보다 약함(하이일드 OAS와 상관 -0.66)
            </div>
          </section>
        </div>

        {/* 확인된 사실 */}
        <section style={카드}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>확인된 사실 (두 곳 이상에서 확인한 것만)</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {data.사실.map(f => (
              <li key={f.날짜 + f.무엇} style={{ fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{f.날짜}</span> {f.무엇}
                <div style={{ fontSize: 11 }}>
                  {f.출처.map(s => <a key={s.주소} href={s.주소} target="_blank" rel="noreferrer" style={{ color: 'var(--info)', marginRight: 10 }}>{s.이름}</a>)}
                </div>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0' }}>CDS·회사채 개별 호가는 무료 자동 수집이 없어 보도된 숫자를 기록합니다.</p>
        </section>
      </>)}
    </div>
  )
}
