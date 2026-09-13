'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'

/**
 * 데이터 소스 진단.
 *
 * 이 프로젝트에서 가장 오래 못 잡은 버그는 전부 **조용히 절반만 주는 실패**였다.
 * 에러가 안 나고 개수만 줄어서 화면만 봐서는 정상으로 보인다.
 * 4시간마다 자동 점검이 돌지만 결과가 깃허브 로그에만 남아 있었다 —
 * 이상하다 싶을 때 바로 볼 수 있는 자리가 필요하다.
 */
interface Check {
  source: string
  level: 'ok' | 'warn' | 'fail'
  asked: number
  got: number
  note: string
}
interface Data {
  ok: boolean
  summary: string
  checks: Check[]
  at: number
  error?: string
}

const TONE = {
  ok: { color: 'var(--up)', label: '정상' },
  warn: { color: 'var(--warn)', label: '경고' },
  fail: { color: 'var(--down)', label: '실패' },
} as const

export default function DiagPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    // 503도 정상 응답이다 — '검사가 실패를 찾았다'는 뜻이라 본문을 읽어야 한다
    fetch('/api/health/sources')
      .then(r => r.json())
      .then(j => setData(j))
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="소스 진단"
        fetchedAt={data?.at}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span className={`pill ${data.ok ? 'pill-up' : 'pill-stale'}`}>
            {data.summary}
          </span>
        )}
      />

      <div className="card" style={{
        padding: '11px 13px', marginBottom: 12, fontSize: 11, lineHeight: 1.6,
        color: 'var(--text-muted)',
      }}>
        <b style={{ color: 'var(--text-secondary)' }}>잡으려는 것은 “조용히 절반만 주는 실패”다.</b>
        {' '}에러가 안 나고 개수만 줄어들어 화면만 봐서는 정상으로 보인다.
        실제로 겪은 것들 — PostgREST 1,000행 상한(3번), 야후 배치 20 상한,
        코인게코 페이지 누락, 바이낸스 지역 차단.
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <b style={{ color: 'var(--text-secondary)' }}>요청 대비 응답</b>이 핵심이다.
          두 수가 다르면 그만큼 조용히 빠진 것이다.
        </div>
      </div>

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          점검 중… (소스를 직접 호출하므로 10초쯤 걸린다)
        </div>
      )}

      {data?.checks && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {data.checks.map(c => {
            const tone = TONE[c.level] ?? TONE.warn
            const short = c.got < c.asked
            return (
              <div key={c.source} style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
                borderLeft: `3px solid ${tone.color}`,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{c.source}</span>
                  <span className="num" style={{ fontSize: 11, marginLeft: 'auto', color: tone.color }}>
                    {c.asked.toLocaleString()} → {c.got.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 10, color: tone.color, fontWeight: 700 }}>{tone.label}</span>
                </div>
                {(c.note || short) && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    {c.note || `${(c.asked - c.got).toLocaleString()}개가 조용히 빠졌다`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        자동 점검은 4시간마다 돌고 스캔 직후에도 한 번 돈다.
        {' '}검사는 <b>코드의 설정값을 직접 읽는다</b> — 기대치를 따로 적어두면
        상수를 바꿀 때 검사가 뒤처져 “통과했는데 실제로는 깨진” 상태가 된다.
      </p>
    </div>
  )
}
