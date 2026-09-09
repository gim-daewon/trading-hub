// 데이터 소스 무결성 점검 — 스캔 워크플로우에서 매일 돈다.
//
// 잡으려는 것은 "조용히 절반만 주는 실패"다. 에러가 안 나고 개수만 줄어들어서
// 사람 눈으로는 못 찾는다. 이 프로젝트에서 실제로 겪은 것들:
//
//   PostgREST 1,000행 상한       3번 (스냅샷 행 / 코인게코 캐시 / 추적)
//   야후 spark 배치 20 상한       미국 등락률이 통째로 안 떴는데 로그는 조용
//   코인게코 페이지 실패 시 break  429 한 번에 뒤 페이지 누락
//   바이낸스 지역 차단            유니버스 555 -> 278인데 '성공'으로 끝남
//
// 스캔을 막지 않는다. 경고만 띄우고 사람이 판단한다 —
// 소스 하나가 흔들린다고 그날 스냅샷을 통째로 버릴 이유는 없다.
import { appendFileSync } from 'node:fs'

const URL_ = process.env.SOURCE_HEALTH_URL
  ?? 'https://trading-hub-nu-orcin.vercel.app/api/health/sources'

const out = []
const write = (s) => {
  out.push(s)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) appendFileSync(f, s + '\n')
  else console.log(s)
}

const ICON = { ok: '✓', warn: '!', fail: 'X' }

try {
  const res = await fetch(URL_, { signal: AbortSignal.timeout(180_000) })
  // 503은 '검사가 실패를 찾았다'는 뜻이라 본문을 읽어야 한다
  if (!res.ok && res.status !== 503) {
    console.log(`::warning::소스 점검 호출 실패 ${res.status}`)
    process.exit(0)
  }
  const d = await res.json()
  const checks = d.checks ?? []

  write('## 데이터 소스 무결성')
  write('')
  write(`${d.summary ?? ''}`)
  write('')
  write('| | 소스 | 요청 | 응답 | 비고 |')
  write('|---|---|---:|---:|---|')
  for (const c of checks) {
    write(`| ${ICON[c.level] ?? '?'} | ${c.source} | ${c.asked} | ${c.got} | ${c.note || ''} |`)
  }

  const bad = checks.filter(c => c.level === 'fail')
  const warn = checks.filter(c => c.level === 'warn')
  if (bad.length) {
    console.log(`::warning::소스 실패 ${bad.length}개 — ${bad.map(c => c.source).join(' / ')}`)
  } else if (warn.length) {
    console.log(`::warning::소스 경고 ${warn.length}개 — ${warn.map(c => c.source).join(' / ')}`)
  }
} catch (e) {
  console.log(`::warning::소스 점검 실패: ${e}`)
}
