/**
 * 기한이 지나면 옛 값을 절대 주지 않는 작은 메모리 캐시(2026-10-29).
 *
 * Next 데이터 캐시(fetch next.revalidate)는 만료 뒤 첫 요청에 옛 값을 먼저 돌려주고 뒤에서 새로 받는다.
 * 섹터 화면을 한동안 아무도 안 열면 첫 방문자가 그 옛 숫자를 본다 — 로컬에서 9월 3일 자료(REMX 120일 -16%,
 * 실제 -49%)가 그대로 떴다. 여기서는 기한이 지나면 새로 받을 때까지 기다린다. 실패(null)는 저장하지 않는다.
 * 서버리스 인스턴스마다 따로 갖는다 — 새 인스턴스는 늘 새로 받는다.
 */
export function 신선캐시<T>(기한ms: number, 지금: () => number = Date.now) {
  const 저장 = new Map<string, { 시각: number; 값: T }>()
  return {
    async 가져오기(키: string, 받기: () => Promise<T | null>): Promise<T | null> {
      const 있음 = 저장.get(키)
      if (있음 && 지금() - 있음.시각 < 기한ms) return 있음.값
      const 값 = await 받기()
      if (값 != null) 저장.set(키, { 시각: 지금(), 값 })
      return 값
    },
  }
}
