'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import PageHeader from '../components/PageHeader'
import { 포지션계산, 크기기준 } from '@/lib/position-size'

// 포지션 크기 계산기(2026-10-27) — 1R(시드의 1%)과 손절폭으로 크기를 구한다. 계산은 lib/position-size.ts.
// 시드·위험%·수수료는 이 기기에만 기억한다(서버로 보내지 않는다).
const 저장키 = 'th-size'
const 카드 = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 } as const
const 칸 = { width: '100%', boxSizing: 'border-box' as const, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 16 }
const 돈 = (x: number) => `$${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const 수 = (x: number, d = 4) => x.toLocaleString('en-US', { maximumFractionDigits: d })
/** 수량은 0.0001처럼 작아도 뭉개지지 않게 유효숫자 4자리 */
const 수량표시 = (x: number) => x.toLocaleString('en-US', { maximumSignificantDigits: 4 })

type 값 = { 시드: string; 위험퍼: string; 진입: string; 손절: string; 수수료퍼: string; 목표R: string }
const 처음: 값 = { 시드: '10000', 위험퍼: String(크기기준.권장위험퍼), 진입: '', 손절: '', 수수료퍼: String(크기기준.기본수수료퍼), 목표R: '3' }

/** 기기에 기억한 값 — 서버 그림에는 없고(null) 브라우저에서 읽는다. 바뀌면 계산기를 그 값으로 다시 그린다(key) */
const 읽기 = () => { try { return localStorage.getItem(저장키) } catch { return null } }
const 구독 = () => () => {}

export default function SizePage() {
  const 저장 = useSyncExternalStore(구독, 읽기, () => null)
  const 기억: 값 = (() => { try { const s = JSON.parse(저장 ?? 'null'); return s ? { ...처음, 시드: s.시드 ?? 처음.시드, 위험퍼: s.위험퍼 ?? 처음.위험퍼, 수수료퍼: s.수수료퍼 ?? 처음.수수료퍼, 목표R: s.목표R ?? 처음.목표R } : 처음 } catch { return 처음 } })()
  return <Calculator key={저장 === null ? '기본' : '기억'} 처음값={기억} />
}

function Calculator({ 처음값 }: { 처음값: 값 }) {
  const [v, setV] = useState<값>(처음값)
  useEffect(() => {
    try { localStorage.setItem(저장키, JSON.stringify({ 시드: v.시드, 위험퍼: v.위험퍼, 수수료퍼: v.수수료퍼, 목표R: v.목표R })) } catch { /* 무시 */ }
  }, [v.시드, v.위험퍼, v.수수료퍼, v.목표R])

  const 결과 = useMemo(() => {
    const n = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) as Record<keyof 값, number>
    if (!v.진입 || !v.손절) return null
    try { return { r: 포지션계산(n) } } catch (e) { return { 오류: e instanceof Error ? e.message : String(e) } }
  }, [v])

  const 입력 = (k: keyof 값, 이름: string, 도움?: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
      {이름}
      <input inputMode="decimal" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value.replace(/[^0-9.]/g, '') })} style={칸} />
      {도움 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{도움}</span>}
    </label>
  )

  return (
    <div style={{ padding: 16, maxWidth: 640, margin: '0 auto' }}>
      <PageHeader title="포지션 크기" showMarketStatus={false} />
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 14px' }}>
        안전은 레버리지 배수가 아니라 손절까지 잃는 돈이 정해요. 한 번에 시드의 {크기기준.권장위험퍼}%(최대 {크기기준.최대위험퍼}%)만 걸고, 손절폭으로 크기를 구해요. 수수료까지 넣어 손절 때 정확히 1R만 잃게 맞춰요.
      </p>
      <div style={{ ...카드, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {입력('시드', '시드($)')}
        {입력('위험퍼', '1R = 시드의 %', `권장 ${크기기준.권장위험퍼} · 최대 ${크기기준.최대위험퍼}`)}
        {입력('진입', '진입가')}
        {입력('손절', '손절가', '진입보다 아래면 롱, 위면 숏')}
        {입력('수수료퍼', '수수료(한쪽 %)', `바이낸스 선물 시장가 ${크기기준.기본수수료퍼}`)}
        {입력('목표R', '목표(R)')}
      </div>

      {결과 && 'r' in 결과 && 결과.r && (() => {
        const r = 결과.r
        const 줄 = (이름: string, 값: string, 강조 = false) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
            <span style={{ color: 'var(--text-secondary)', minWidth: 0 }}>{이름}</span>
            <span style={{ fontWeight: 강조 ? 800 : 600, fontSize: 강조 ? 18 : 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{값}</span>
          </div>
        )
        return (
          <div style={{ ...카드, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: r.방향 === '롱' ? 'var(--up)' : 'var(--down)' }}>{r.방향}</div>
            {줄('잡을 수량', 수량표시(r.수량), true)}
            {줄('1R(손절 때 잃는 돈, 수수료 포함)', 돈(r.손절시손실))}
            {줄('포지션 금액', 돈(r.포지션금액))}
            {줄('필요 레버리지', `${r.레버리지.toFixed(2)}배`)}
            {줄('왕복 수수료(손절 기준)', 돈(r.왕복수수료))}
            {줄(`목표가(${v.목표R}R)`, r.목표가 > 0 ? 수(r.목표가, 2) : '없음')}
            {r.목표가 > 0 && 줄('목표 도달 시 순이익', 돈(r.목표순이익), true)}
            {r.목표가 > 0 && 줄('수수료 뺀 실제 R', `${r.목표실제R.toFixed(2)}R`)}
            {r.경고.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--warn)', fontSize: 13, lineHeight: 1.6 }}>
                {r.경고.map(x => <li key={x}>{x}</li>)}
              </ul>
            )}
          </div>
        )
      })()}
      {결과 && '오류' in 결과 && <p style={{ ...카드, marginTop: 12, color: 'var(--down)', fontSize: 14 }}>{결과.오류}</p>}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 14 }}>
        손절 주문이 밀려 체결되면(급변·주말 갭) 1R보다 더 잃을 수 있어요. 레버리지가 높으면 청산가가 손절가보다 먼저 오지 않는지 거래소에서 확인하세요.
      </p>
    </div>
  )
}
