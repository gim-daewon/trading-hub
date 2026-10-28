// 섹터 부진 상자 실측(2026-10-29 다시 씀 — 09-04 원래 스크립트가 남아 있지 않았다).
// 기간 L(5·20·60·120·250일) 수익률 하위 3개 섹터가 다음 20거래일에 SPY보다 나았던 구간 비율(양수%).
// 겹치지 않는 20일 구간. 격자 시작점 하나로 결과가 흔들리므로(메모리 backtest-before-building-signals)
// 시작점 0~19 전부 돌려 평균과 범위를 낸다. 전체 10년과 최근 2년을 따로.
// 사용: node scripts/sector-laggard-backtest.mjs   (야후 무료 일봉, 48번 요청)
import { readFileSync } from 'node:fs'

// --보유=60 처럼 보유 기간을 바꿀 수 있다(구간 길이도 같이 바뀐다 — 겹치지 않게)
const 보유 = Number(process.argv.find(a => a.startsWith('--보유='))?.split('=')[1] ?? 20)
const 기간들 = [5, 20, 60, 120, 250], 하위수 = 3
const 섹터평균 = process.argv.includes('--섹터평균')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const 등록 = readFileSync(new URL('../lib/registry.ts', import.meta.url), 'utf8')
const 섹터 = [...new Set([...등록.matchAll(/etf:\s*'([A-Z.\-^]+)'/g)].map(m => m[1]))]
if (섹터.length < 30) { console.error('섹터 목록을 못 읽었다:', 섹터.length); process.exit(1) }

async function 일봉(기호) {
  for (const 호스트 of ['query1', 'query2']) {
    const r = await fetch(`https://${호스트}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(기호)}?range=10y&interval=1d`, { headers: { 'User-Agent': UA } })
    if (!r.ok) continue
    const res = (await r.json())?.chart?.result?.[0]
    if (!res?.timestamp) continue
    const 종가 = res.indicators?.adjclose?.[0]?.adjclose ?? res.indicators.quote[0].close
    const m = new Map()
    res.timestamp.forEach((t, i) => { if (종가[i] != null) m.set(new Date(t * 1000).toISOString().slice(0, 10), 종가[i]) })
    return m
  }
  return null
}

const SPY = await 일봉('SPY')
if (!SPY) { console.error('SPY를 못 받았다'); process.exit(1) }
const 날짜 = [...SPY.keys()]
const 자료 = {}
for (const s of 섹터) { const m = await 일봉(s); if (m) 자료[s] = m }
console.log(`섹터 ${Object.keys(자료).length}/${섹터.length}, 날짜 ${날짜[0]} ~ ${날짜.at(-1)} (${날짜.length}일)`)

const 수익 = (m, a, b) => { const x = m.get(날짜[a]), y = m.get(날짜[b]); return x && y ? (y / x - 1) * 100 : null }
const 최근시작 = 날짜.length - 1 - 504   // 최근 2년(약 504거래일)

function 재기(L, 시작점, 최근만) {
  let 양수 = 0, n = 0
  for (let t = 250 + 시작점; t + 보유 < 날짜.length; t += 보유) {
    if (최근만 && t < 최근시작) continue
    const 줄 = Object.entries(자료).map(([s, m]) => [s, 수익(m, t - L, t), 수익(m, t, t + 보유)]).filter(x => x[1] != null && x[2] != null)
    if (줄.length < 20) continue
    줄.sort((a, b) => a[1] - b[1])
    // 기준: SPY(기본) 또는 섹터 평균(--섹터평균) — 09-04 원래 기준이 어느 쪽이었는지 남아 있지 않다
    const 하위 = 줄.slice(0, 하위수)
    const 시장 = 섹터평균 ? 줄.reduce((a, x) => a + x[2], 0) / 줄.length : 수익(SPY, t, t + 보유)
    const 초과 = 하위.reduce((a, x) => a + x[2], 0) / 하위.length - 시장
    n++; if (초과 > 0) 양수++
  }
  return { pos: (양수 / n) * 100, n }
}

const z = (pos, n) => (pos / 100 - 0.5) / Math.sqrt(0.25 / n)
for (const [이름, 최근만] of [['10년', false], ['최근 2년', true]]) {
  console.log(`\n== ${이름} — 하위 ${하위수}개, 다음 ${보유}일 ${섹터평균 ? '섹터 평균' : 'SPY'} 초과 양수% (시작점 ${보유}가지)`)
  for (const L of 기간들) {
    const 판 = Array.from({ length: 보유 }, (_, k) => 재기(L, k, 최근만))
    const ps = 판.map(x => x.pos), 평균 = ps.reduce((a, b) => a + b, 0) / ps.length, n = 판[0].n
    console.log(`${String(L).padStart(3)}일  양수 평균 ${평균.toFixed(1)}%  범위 ${Math.min(...ps).toFixed(1)}~${Math.max(...ps).toFixed(1)}  구간 ${n}  z(평균) ${z(평균, n).toFixed(2)}  z 1.96 넘은 시작점 ${판.filter(x => Math.abs(z(x.pos, x.n)) >= 1.96).length}/${판.length}`)
  }
}
