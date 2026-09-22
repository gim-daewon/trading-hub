// 배포된 화면이 **실제로 그려지는지** 확인한다.
//
// 지금까지의 점검은 전부 HTTP 200만 봤다. 그런데 이 앱이 죽는 방식은
// 서버가 200을 주고 브라우저에서 죽는 것이다 — 손익비 NaN이 JSON에서 null이 되어
// null.toFixed()로 추적 화면이 통째로 에러 바운더리로 넘어갔고,
// 그동안 /tracking은 계속 200이었다. 사용자가 폰으로 보고 알려줬다.
//
// 그래서 진짜 브라우저로 열어서 확인한다:
//   1) 에러 바운더리 화면이 떴나
//   2) 콘솔에 에러가 찍혔나
//   3) 그 화면이 보여줘야 할 내용이 실제로 있나 (빈 껍데기 구분)
import { chromium } from 'playwright'
import { appendFileSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'https://trading-hub-nu-orcin.vercel.app'

// 화면마다 '이게 보이면 그려진 것'을 하나씩 정한다.
// 없으면 로딩만 하고 멈춘 상태를 정상으로 셀 수 있다
const PAGES = [
  { path: '/',          expect: '미국 선물' },
  { path: '/picks',     expect: '눌림목' },
  { path: '/screener',  expect: '수급' },
  { path: '/breakout',  expect: 'VWMA' },
  { path: '/short',     expect: '숏' },
  { path: '/tracking',  expect: '스냅샷' },
  { path: '/sectors',   expect: '섹터' },
  { path: '/market',    expect: '금리' },
  { path: '/diag',      expect: '소스' },
  { path: '/rejected',  expect: '기각' },
]

// 에러 바운더리(app/error.tsx)가 띄우는 문구
const BOUNDARY = '화면을 그리지 못했습니다'
// 광고차단·확장·써드파티에서 나는 잡음은 실패로 치지 않는다
const IGNORE = [/favicon/i, /ERR_BLOCKED_BY_CLIENT/i, /net::ERR_ABORTED/i]

const browser = await chromium.launch()
const rows = []

for (const p of PAGES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },   // 폰에서 보는 화면이 기준이다
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (!IGNORE.some(re => re.test(t))) errors.push(t)
  })
  page.on('pageerror', e => errors.push(String(e.message ?? e)))

  let boundary = false, found = false, note = ''
  try {
    await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // 본문 텍스트를 직접 읽는다.
    //
    // getByText로 기다리면 하단 네비의 '더보기' 시트에 있는 같은 낱말(숨은 링크)까지
    // 잡혀서, 화면이 멀쩡한데도 타임아웃이 났다. 화면 전체 글을 읽고 찾는 게 확실하다
    // 여유를 크게 둔다. 추적 화면은 배포 직후 캐시가 비면 첫 응답이 40초 넘게 걸린다 —
    // 45초로 잡았더니 '안 그려짐'으로 잡혔는데 실제로는 느린 것뿐이었다
    const deadline = Date.now() + 90_000
    for (;;) {
      const text = await page.locator('body').innerText().catch(() => '')
      if (text.includes(BOUNDARY)) { boundary = true; break }
      if (text.includes(p.expect)) { found = true; break }
      if (Date.now() > deadline) { note = '기대 문구도 에러 화면도 안 떴다 (90초)'; break }
      await page.waitForTimeout(1000)
    }
    if (boundary) {
      note = (await page.locator('pre').first().textContent().catch(() => '')) || '메시지 없음'
    }
  } catch (e) {
    note = String(e).slice(0, 200)
  }

  rows.push({ path: p.path, ok: found && !boundary && errors.length === 0, boundary, found, errors, note })
  await ctx.close()
}
await browser.close()

const line = s => {
  console.log(s)
  // 요약에만 쓰면 실행 로그가 비어 무엇을 확인했는지 못 본다.
  // 반대로 require를 쓰면 ESM에서 터진다 — 로컬에선 이 분기를 안 타서 CI에서만 죽었다
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n')
}

const fails = rows.filter(r => !r.ok)

line('## 화면 렌더 점검')
line('')
line('| | 화면 | 내용 | 콘솔 에러 | 비고 |')
line('|---|---|---|---:|---|')
for (const r of rows) {
  line(`| ${r.ok ? '✓' : r.boundary ? 'X' : '!'} | ${r.path} | ${r.found ? '보임' : '없음'} | ${r.errors.length} | ${(r.note || r.errors[0] || '').slice(0, 120)} |`)
}

if (fails.length) {
  console.log(`::warning::화면 ${fails.length}개가 정상이 아니다 — ${fails.map(f => f.path).join(' / ')}`)
  process.exitCode = 1
}
