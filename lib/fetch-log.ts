/**
 * 최근 API 요청 기록 — **에러 화면에 무엇이 직전에 왔는지 붙이기 위한 것**이다.
 *
 * 화면이 죽었을 때 메시지만으로는 어느 데이터가 원인인지 못 찾는다.
 * 실제로 "Cannot read properties of null (reading 'toFixed')" 하나만 보고
 * 어느 화면인지부터 추측해야 했다 — 원인은 /api/tracking의 손익비 null이었다.
 *
 * 기록만 하고 동작은 바꾸지 않는다. 실패해도 원래 fetch 결과를 그대로 돌려준다.
 */
export interface FetchRec {
  /** 경로만 남긴다 (도메인·토큰이 화면에 찍히지 않게) */
  path: string
  status: number
  ms: number
  at: number
  note?: string
}

const MAX = 8
const recs: FetchRec[] = []
let patched = false

const pathOf = (input: unknown): string => {
  try {
    const raw = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request)?.url ?? String(input)
    const u = new URL(raw, location.origin)
    // 같은 출처면 경로+쿼리, 외부면 호스트까지만
    return u.origin === location.origin ? u.pathname + u.search : u.origin + u.pathname
  } catch { return '(주소 불명)' }
}

export function installFetchLog(): void {
  if (patched || typeof window === 'undefined') return
  patched = true
  const orig = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const t0 = performance.now()
    const path = pathOf(args[0])
    try {
      const res = await orig(...args)
      push({ path, status: res.status, ms: Math.round(performance.now() - t0), at: Date.now() })
      return res
    } catch (e) {
      push({ path, status: 0, ms: Math.round(performance.now() - t0), at: Date.now(), note: String(e).slice(0, 80) })
      throw e
    }
  }
}

function push(r: FetchRec): void {
  recs.push(r)
  if (recs.length > MAX) recs.shift()
}

export function recentFetches(): FetchRec[] {
  return [...recs].reverse()   // 최근 것이 위로
}
