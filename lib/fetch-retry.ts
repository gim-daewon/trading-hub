/**
 * 재시도·백오프와 동시성 풀.
 *
 * 미국만 2,714종목에 약 1분이었다. 한국 전 종목과 크립토를 더하면
 * 약 7,500종목이 되어 야후·바이낸스 레이트리밋에 걸릴 수 있다.
 * 시장별로 워크플로 시간대를 벌리는 것과 별개로, 한 번 429가 나면
 * 그 종목이 조용히 빠지므로 재시도가 필요하다.
 *
 * 조용한 실패가 제일 위험하다. 실측으로 겪었다 — 페이지네이션이
 * 1,000행만 가져와 스냅샷이 라이브로 폴백했는데 화면에는 아무 표시가 없었다.
 * 그래서 여기서는 최종 실패를 반드시 남긴다.
 */

export interface RetryOpts {
  /** 총 시도 횟수 (첫 시도 포함) */
  tries?: number
  /** 첫 재시도 대기(ms). 이후 2배씩 늘린다 */
  baseDelayMs?: number
  /** 한 번의 시도에 허용할 시간 */
  timeoutMs?: number
  /** 실패를 어디에 남길지 — 기본은 console.error */
  onFail?: (url: string, why: string) => void
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** 재시도해도 의미 있는 상태코드만. 404·400은 다시 해도 같다 */
const isRetryable = (status: number) => status === 429 || status === 408 || status >= 500

/**
 * Retry-After는 초 또는 HTTP-date로 온다. 둘 다 처리하고,
 * 터무니없이 긴 값은 무시한다 (스캔 전체가 멈추면 안 된다).
 */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('retry-after')
  if (!h) return null
  const secs = Number(h)
  if (Number.isFinite(secs)) return secs > 0 && secs <= 60 ? secs * 1000 : null
  const at = Date.parse(h)
  if (!Number.isFinite(at)) return null
  const ms = at - Date.now()
  return ms > 0 && ms <= 60_000 ? ms : null
}

/**
 * 실패하면 null. 던지지 않는다 — 종목 하나가 스캔 전체를 죽이면 안 된다.
 * 대신 이유를 반드시 기록한다.
 */
export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOpts = {},
): Promise<Response | null> {
  const { tries = 3, baseDelayMs = 500, timeoutMs = 20_000 } = opts
  const fail = opts.onFail ?? ((u, why) => console.error(`[fetch] 실패 ${u} — ${why}`))
  let last = ''

  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ac.signal })
      if (res.ok) return res
      last = `HTTP ${res.status}`
      if (!isRetryable(res.status) || attempt === tries) break
      // 서버가 대기 시간을 지정하면 그걸 따른다. 지수 백오프보다 정확하다
      const wait = retryAfterMs(res) ?? baseDelayMs * 2 ** (attempt - 1)
      // 지터 — 여러 워커가 동시에 재시도하면 다시 429가 난다
      await sleep(wait + Math.random() * 250)
    } catch (e) {
      last = e instanceof Error ? (e.name === 'AbortError' ? `타임아웃 ${timeoutMs}ms` : e.message) : String(e)
      if (attempt === tries) break
      await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250)
    } finally {
      clearTimeout(timer)
    }
  }
  fail(url, `${tries}회 시도 실패 — ${last}`)
  return null
}

/** JSON까지 한 번에. 파싱 실패도 실패로 취급한다 */
export async function fetchJson<T>(
  url: string, init: RequestInit = {}, opts: RetryOpts = {},
): Promise<T | null> {
  const res = await fetchRetry(url, init, opts)
  if (!res) return null
  try {
    return (await res.json()) as T
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    ;(opts.onFail ?? ((u, w) => console.error(`[fetch] JSON 파싱 실패 ${u} — ${w}`)))(url, why)
    return null
  }
}

/**
 * 동시성 제한 풀. 결과 순서는 입력 순서를 지킨다 —
 * 순서가 섞이면 심볼과 결과가 어긋나는 버그가 조용히 생긴다.
 */
export async function pool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 10,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const n = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await worker(items[i], i)
      }
    }),
  )
  return out
}
