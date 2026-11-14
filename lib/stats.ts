/**
 * 평균·중앙값·손익비를 한 곳에 — 숫자가 아니면 0을 돌려준다.
 *
 * NaN·Infinity는 JSON에서 null로 나가고 타입은 number라 빌드는 통과한다.
 * 화면에서 null.toFixed()로 통째로 죽는다(29d5d64, 1537d73).
 * app/api/tracking/route.ts에 세 번 복사돼 있던 것을 뺐다(agent-trust-trading-hub.md 할 일 2).
 * 시험: lib/stats.test.ts
 */

const finiteOr0 = (v: number) => Number.isFinite(v) ? v : 0

/** 산술 평균. 빈 배열·비유한 결과는 0 */
export function mean(a: number[]): number {
  if (!a.length) return 0
  return finiteOr0(a.reduce((x, y) => x + y, 0) / a.length)
}

/** 중앙값. 입력을 바꾸지 않는다. 빈 배열은 0 */
export function median(a: number[]): number {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y), h = s.length >> 1
  return finiteOr0(s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2)
}

/**
 * 손익비 = 오른 것 평균 / |내린 것 평균|.
 *
 * 분모가 0이 되는 경로가 둘이다 — 둘 다 막는다.
 *   1) 오른(또는 내린) 것이 0개 -> 평균이 NaN
 *   2) 손실 평균이 정확히 0 -> 나누면 Infinity
 * 1)만 막았다가 2)로 다시 당했다 — 크립토 revD가 11건 중 10승, 나머지 1건이 정확히 0이었다.
 */
export function rrOf(wins: number[], losses: number[]): number {
  if (!wins.length || !losses.length) return 0
  const lossMean = Math.abs(mean(losses))
  if (!(lossMean > 0)) return 0
  return finiteOr0(mean(wins) / lossMean)
}
