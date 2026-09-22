'use client'
import { fmtSector } from '@/lib/format'

/**
 * 신호에 걸린 종목의 업종 분포.
 *
 * 눌림목 10종목 중 7개가 제약이면 그건 **종목 신호가 아니라 업종 전체가 밀린 것**이다.
 * 10개를 사도 사실상 한 종목에 몰아넣는 것이라, 분산이 됐다고 착각하기 쉽다.
 *
 * 백테스트로도 업종 차이가 확인됐다(bt-sector):
 * 한국은 업종 자체 성적이 +0.34R ~ -0.37R로 갈린다. 신호가 더하는 몫보다 크다.
 */
const TOP = 3
/** 한 업종이 이 비율을 넘으면 경고 문구를 띄운다 */
const WARN_SHARE = 0.4

export default function SectorMix({ rows }: { rows: { sector?: string | null }[] }) {
  const known = rows.filter(r => r.sector)
  // 업종이 절반도 안 붙어 있으면 분포를 말할 수 없다 (크립토가 그렇다)
  if (rows.length < 4 || known.length < rows.length * 0.5) return null

  const count = new Map<string, number>()
  for (const r of known) {
    const k = fmtSector(r.sector, 40)
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  const sorted = [...count].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, TOP)
  const rest = sorted.slice(TOP).reduce((s, [, n]) => s + n, 0)
  const share = top[0][1] / known.length
  const heavy = share >= WARN_SHARE

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      margin: '0 0 8px', fontSize: 10, color: 'var(--text-muted)',
      ...(heavy ? { borderLeft: '3px solid var(--warn)', paddingLeft: 8 } : {}),
    }}>
      <span style={{ fontWeight: 700 }}>업종</span>
      {top.map(([sec, n]) => (
        <span key={sec} className="pill" style={{
          fontSize: 10, padding: '1px 7px',
          ...(sec === top[0][0] && heavy ? { color: 'var(--warn)' } : {}),
        }}>
          {sec} <span className="num">{n}</span>
        </span>
      ))}
      {rest > 0 && <span className="num">외 {rest}</span>}
      {heavy && (
        <span style={{ color: 'var(--warn)' }}>
          · {top[0][0]}가 {Math.round(share * 100)}%다 — 종목이 아니라 업종 전체가 움직였을 수 있다.
          여러 개를 사도 분산이 안 된다
        </span>
      )}
    </div>
  )
}
