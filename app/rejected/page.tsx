'use client'
import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { REJECTED } from '@/lib/rejected'

// 기각한 아이디어 목록.
//
// 이 화면의 목적은 "무엇을 안 만들었는지"를 남기는 것이다.
// 근거 없이 지우면 몇 주 뒤 같은 아이디어를 다시 꺼내게 된다.
// 실측치를 같이 보여줘서 재검증 없이 판단할 수 있게 한다.

export default function RejectedPage() {
  const [open, setOpen] = useState<string | null>(REJECTED[0]?.id ?? null)

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader title="기각 기록" />

      <div className="card" style={{
        padding: '10px 12px', marginBottom: 14, fontSize: 11,
        color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        검증했다가 <b>근거가 없어 만들지 않은</b> 것들이다.
        목록이 길어지는 건 나쁜 신호가 아니라 검증을 했다는 뜻이다.
        <br />
        같은 아이디어가 다시 떠오르면 먼저 여기를 볼 것 — 대부분 이미 재봤다.
      </div>

      {REJECTED.map(r => {
        const isOpen = open === r.id
        return (
          <div key={r.id} className="card" style={{ marginBottom: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(isOpen ? null : r.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                minHeight: 48, padding: '8px 12px', cursor: 'pointer',
                background: 'transparent', border: 'none', textAlign: 'left',
                color: 'var(--text-primary)',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, display: 'block' }}>{r.title}</span>
                <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date}</span>
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 12px 14px', fontSize: 11, lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
                  <b style={{ color: 'var(--text-secondary)' }}>기대했던 것</b><br />
                  {r.hypothesis}
                </p>
                <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
                  <b style={{ color: 'var(--text-secondary)' }}>측정 방법</b><br />
                  {r.method}
                </p>
                <div style={{ margin: '0 0 8px' }}>
                  <b style={{ color: 'var(--text-secondary)' }}>실측</b>
                  <div style={{
                    marginTop: 4, padding: '8px 10px', borderRadius: 8,
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                  }}>
                    {r.findings.map((f, i) => (
                      <div key={i} className="num" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>· {f}</div>
                    ))}
                  </div>
                </div>
                <p style={{
                  margin: 0, padding: '8px 10px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
                  color: 'var(--warn)',
                }}>
                  <b>기각 사유</b><br />{r.verdict}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
