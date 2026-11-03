// 지금 컵 패턴 신호가 뜬 종목을 바로 본다(메뉴가 채워지기 전 확인용, 2026-11-03).
// cup-fib-backtest.mjs가 받아 둔 OS 임시 폴더 cup-fib-cache를 읽는다. 없으면 그 스크립트를 먼저 돌린다.
// 사용: node --import ./scripts/ts-resolve-hook.mjs scripts/cup-fib-now.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cupFibNow, CUP_FIB } from '../lib/cup-fib.ts'
import { looksPegged } from '../lib/bars.ts'

const 최대묵음일 = 5   // 마지막 봉이 이보다 오래되면 상장 폐지·거래 중단으로 본다(BUSD가 2023년 봉으로 섞였다)

const CACHE = join(tmpdir(), 'cup-fib-cache')
const 파일 = readdirSync(CACHE).filter(f => /^(us_|bn_1d_)/.test(f))
if (!파일.length) { console.error('받아 둔 봉이 없다. cup-fib-backtest.mjs를 먼저 돌릴 것'); process.exit(1) }
const 줄 = []
for (const f of 파일) {
  const bars = JSON.parse(readFileSync(join(CACHE, f), 'utf8'))
  if (bars.length < 100 || looksPegged(bars)) continue
  if ((Date.now() / 1000 - bars.at(-1).t) / 86400 > 최대묵음일) continue
  const now = cupFibNow(bars, CUP_FIB)
  if (!now) continue
  줄.push({ sym: f.replace(/^(us_|bn_1d_)/, '').replace('.json', ''), 시장: f.startsWith('us_') ? '미국' : '코인', 날짜: new Date(bars.at(-1).t * 1000).toISOString().slice(0, 10), 가격: bars.at(-1).c, ...now })
}
// --json=경로: 화면 확인용으로 /api/pattern과 같은 모양을 저장한다
const jsonOut = process.argv.find(a => a.startsWith('--json='))?.slice(7)
if (jsonOut) {
  const { writeFileSync } = await import('node:fs')
  const byMarket = m => 줄.filter(x => x.시장 === m).map(x => ({ symbol: x.sym, display: x.sym.replace(/USDT$/, ''), name: x.sym, sector: null, marketCap: null, price: x.가격,
    cup: { stage: x.stage, entry: x.entry, stop: x.stop, target: x.target, rim: x.rim, bottom: x.bottom, ago: x.ago, touched: x.touched, rr: x.rr } }))
  writeFileSync(jsonOut, JSON.stringify({ us: byMarket('미국'), crypto: byMarket('코인') }))
}
const f2 = v => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toPrecision(3)
for (const stage of ['entry', 'watch']) {
  const xs = 줄.filter(x => x.stage === stage).sort((a, b) => a.ago - b.ago)
  console.log(`\n== ${stage === 'entry' ? '진입 신호(최근 3봉)' : '진입 준비(돌파 실패 뒤 되돌림 대기)'} ${xs.length}개`)
  for (const x of xs) console.log(`${x.시장} ${x.sym.padEnd(10)} ${x.날짜} 가격 ${f2(x.가격)}  ${stage === 'entry' ? '진입' : '0.5'} ${f2(x.entry)}  손절 ${f2(x.stop)}  목표 ${f2(x.target)}  손익비 ${x.rr.toFixed(1)}  ${x.ago}봉 전${stage === 'watch' && x.touched ? ' · 0.5 닿음' : ''}`)
}
