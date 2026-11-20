/**
 * 낙폭 반등 목록이 비었을 때의 안내.
 *
 * 목록이 비는 까닭이 둘이고 사용자가 할 일이 다르다(스크리너 API hasVwma와 같은 구분):
 *   컬럼 없음  스냅샷에 low·chg1이 아직 안 실림 → SQL·다음 스캔을 기다린다
 *   조건 없음  컬럼은 있는데 그날 맞는 종목이 없음 → 기다릴 것이 없다
 * 예전에는 늘 '컬럼 없음'만 띄웠다. d7cd0b4로 chg1이 실린 뒤로는 틀린 안내가 된다.
 */
import type { ReboundKey } from './screener-shared'

/** 문구 한곳. noColumn은 app/rebound/page.tsx에 있던 원래 문구 그대로 */
export const REBOUND_EMPTY: Record<'noColumn' | 'noMatch', Record<ReboundKey, string>> = {
  noColumn: {
    wick: '아직 스냅샷에 저가(low)가 없다. 다음 스캔에 채워진다.',
    drop1: '전일 대비(chg1) 컬럼이 아직 없다. SQL 실행 + 다음 스캔이면 채워진다.',
  },
  noMatch: {
    wick: '이번 스캔에 저가가 종가보다 아래인 종목이 유동성 기준 안에 없다.',
    drop1: '이번 스캔에 전일보다 내린 종목이 유동성 기준 안에 없다.',
  },
}

/** 탭마다 그 신호가 쓰는 컬럼이 한 행에라도 채워져 있나 */
export function reboundColumns(
  rows: { low?: number | null; chg1?: number | null }[],
): Record<ReboundKey, boolean> {
  return {
    wick: rows.some(r => r.low != null),
    drop1: rows.some(r => r.chg1 != null),
  }
}

/** hasColumn이 없으면(옛 응답) 예전처럼 '컬럼 없음'으로 둔다 */
export function reboundEmptyNote(kind: ReboundKey, hasColumn: boolean | undefined): string {
  return hasColumn ? REBOUND_EMPTY.noMatch[kind] : REBOUND_EMPTY.noColumn[kind]
}
