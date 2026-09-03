// 워치리스트 헬스체크 — 스캔 워크플로우에서 매일 돈다.
//
// 야후는 상장폐지 종목에도 몇 년 전 시세를 정상값처럼 계속 준다.
//   PBS: price 33.06 · chartPreviousClose 33.05 · regularMarketTime 2023-08-25
// 등락률이 +0.03%로 계산돼 사람 눈으로는 구분이 불가능하다.
// 실제로 419개 중 15개가 고장나 있었고(ANSS·CYBR·HOLX 등 피인수,
// 삼성전자·SK하이닉스 .KQ 오표기) 그중 하나는 섹터 화면에서
// "120일 부진 1위"를 차지하고 있었다.
//
// 스캔을 막지 않는다. 경고만 띄우고 사람이 판단한다.
import { appendFileSync } from 'node:fs'

const URL_ = process.env.HEALTH_URL ?? 'https://trading-hub-nu-orcin.vercel.app/api/health'

const out = []
const write = (s) => {
  out.push(s)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) appendFileSync(f, s + '\n')
  else console.log(s)
}

try {
  const res = await fetch(URL_, { signal: AbortSignal.timeout(240_000) })
  if (!res.ok) {
    console.log(`::warning::헬스체크 호출 실패 ${res.status}`)
    process.exit(0)
  }
  const d = await res.json()
  const bad = d.problems ?? []

  write('## 워치리스트 헬스체크')
  write('')
  write(`점검 ${d.total} · 정상 ${d.okCount} · 문제 **${bad.length}**`)
  write('')

  if (bad.length) {
    write('| 상태 | 티커 | 시세 기준일 | 사용처 |')
    write('|---|---|---|---|')
    for (const p of bad) {
      write(`| ${p.status} | \`${p.symbol}\` | ${p.quoteDate ?? '-'} | ${(p.usedBy ?? []).slice(0, 3).join(', ')} |`)
    }
    write('')
    write('`gap` = 시세는 최신인데 일봉이 빈다. 화면상 정상처럼 보여 가장 위험하다.')
    // 워크플로우 목록에 노란 경고로 뜬다
    console.log(`::warning::죽은 티커 ${bad.length}개 — ${bad.map(p => p.symbol).join(' ')}`)
  } else {
    write('문제 없음')
  }
} catch (e) {
  console.log(`::warning::헬스체크 실패: ${e}`)
}
