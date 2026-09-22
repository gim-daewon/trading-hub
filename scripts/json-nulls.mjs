// "숫자여야 하는데 null"인 응답 필드를 찾는다.
//
// 이 앱을 죽인 버그가 정확히 그 모양이었다:
//   summarize()에서 mean([])가 NaN -> JSON.stringify가 NaN을 null로 바꿈
//   -> 타입은 number라 빌드는 통과 -> 화면에서 null.toFixed()로 통째로 죽음
//
// 판별 방법: 같은 이름의 필드가 응답 안 다른 곳에서는 숫자인데
// 여기서만 null이면 의심한다. 진짜 '없음'을 뜻하는 필드(exR, t 등)는
// 어디서도 숫자가 아닌 경우가 있어 오탐이 나므로, 아래 KNOWN_NULLABLE로 뺀다.
import { appendFileSync } from 'node:fs'

const BASE = process.env.NULLS_BASE ?? 'https://trading-hub-nu-orcin.vercel.app'

const ENDPOINTS = [
  '/api/tracking?market=us', '/api/tracking?market=kr', '/api/tracking?market=crypto',
  '/api/screener?market=us', '/api/screener?market=kr', '/api/screener?market=crypto',
  '/api/sectors', '/api/risk', '/api/fgi', '/api/health/sources',
]

// 값이 없는 게 정상인 필드 — 화면도 null을 전제로 그린다.
//
// 오탐을 남겨두면 경고가 무뎌져 진짜 하나를 놓친다. 그래서 확인한 것만 적는다:
//   max       구간 상한이 Infinity라 JSON에서 null이 된다. marketDef를 읽는
//             화면 코드가 없어서(전수 확인) 영향이 없다
//   w*        주봉 필드. 상장 60주가 안 된 종목은 값이 없다 (크립토에 특히 많다)
//   f5        5일 순자금. 신규 상장은 계산할 봉이 모자란다
const KNOWN_NULLABLE = new Set([
  'exR', 't', 'avgR', 'note', 'error', 'bar_date', 'changePct', 'change',
  'prev', 'chg', 'value', 'detail', 'from', 'to', 'atr14', 'high', 'low',
  'marketCap', 'price', 'sector', 'name', 'premium', 'display',
  'max', 'wClose', 'wVwma20', 'wVwma60', 'wLow', 'wAboveRun', 'wPrevRun', 'f5',
])

/** 필드 이름별로 '숫자였던 적'과 'null이었던 자리'를 모은다 */
function walk(node, path, seenNumber, nulls) {
  if (Array.isArray(node)) {
    // 배열은 앞 30개만 본다. 스크리너는 2,700행이라 전부 훑을 이유가 없다
    node.slice(0, 30).forEach((v, i) => walk(v, `${path}[${i}]`, seenNumber, nulls))
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'number') seenNumber.add(k)
      else if (v === null) nulls.push({ key: k, path: `${path}.${k}` })
      else walk(v, `${path}.${k}`, seenNumber, nulls)
    }
  }
}

const out = []
const line = s => {
  out.push(s)
  console.log(s)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n')
}

let bad = 0
const found = []

for (const ep of ENDPOINTS) {
  let json
  try {
    const res = await fetch(BASE + ep, { signal: AbortSignal.timeout(120_000) })
    json = await res.json()
  } catch (e) {
    found.push({ ep, key: '(응답 실패)', path: String(e).slice(0, 80), n: 0 })
    continue
  }
  const seenNumber = new Set(), nulls = []
  walk(json, '', seenNumber, nulls)
  // 같은 이름이 숫자로도 나온 적 있는 null만 남긴다
  const suspects = nulls.filter(n => seenNumber.has(n.key) && !KNOWN_NULLABLE.has(n.key))
  const byKey = new Map()
  for (const s of suspects) {
    const e = byKey.get(s.key) ?? { n: 0, path: s.path }
    e.n++
    byKey.set(s.key, e)
  }
  for (const [key, e] of byKey) { found.push({ ep, key, path: e.path, n: e.n }); bad++ }
}

line('## 숫자여야 하는데 null인 필드')
line('')
if (!found.length) {
  line('없음 — 검사한 엔드포인트 ' + ENDPOINTS.length + '개')
} else {
  line('| 엔드포인트 | 필드 | 건수 | 위치 |')
  line('|---|---|---:|---|')
  for (const f of found) line(`| ${f.ep} | \`${f.key}\` | ${f.n} | ${f.path} |`)
  line('')
  line('같은 이름이 다른 자리에서는 숫자였다. NaN이 JSON에서 null이 됐을 가능성이 높다.')
  console.log(`::warning::숫자여야 하는데 null인 필드 ${found.length}종 — ${found.map(f => f.key).join(' / ')}`)
  process.exitCode = 1
}
