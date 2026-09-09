/**
 * 바이낸스 호스트 폴백.
 *
 * GitHub Actions 러너는 미국 IP이고 바이낸스는 미국 IP를 차단한다(HTTP 451).
 * 로컬(한국)에서는 재현이 안 되는 종류의 실패라, 첫 크립토 스캔이 바이낸스
 * 없이 업비트만으로 278종목만 돌았는데 **에러 하나 없이 성공으로 끝났다.**
 *
 * data-api.binance.vision은 바이낸스가 공개 시장 데이터용으로 운영하는
 * 별도 호스트다. 지역 제한이 다르게 걸려 있어 1순위로 둔다.
 */
const HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
]

let chosen: string | null = null

/**
 * 한 번 통한 호스트를 기억한다. 종목마다 4개를 순회하면 스캔이 4배 느려진다.
 * 실패하면 다시 처음부터 찾는다.
 */
export async function binanceJson<T>(path: string, timeoutMs = 20_000): Promise<T | null> {
  const order = chosen ? [chosen, ...HOSTS.filter(h => h !== chosen)] : HOSTS
  let last = ''
  for (const host of order) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(host + path, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: ac.signal,
      })
      if (res.ok) { chosen = host; return (await res.json()) as T }
      // 451 = 지역 제한. 이 호스트는 이 러너에서 영영 안 된다
      last = `${host} HTTP ${res.status}`
      if (res.status === 429) await new Promise(r => setTimeout(r, 1500))
    } catch (e) {
      last = `${host} ${e instanceof Error ? e.message : e}`
    } finally {
      clearTimeout(timer)
    }
  }
  console.error(`[binance] 모든 호스트 실패 ${path} — 마지막: ${last}`)
  return null
}
