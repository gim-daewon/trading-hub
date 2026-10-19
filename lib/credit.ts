/**
 * AI 신용 모니터 계산(순수 함수 — 네트워크 없음). 화면은 app/credit, 데이터는 app/api/credit.
 *
 * 가설(기획서 _보관/모니터링/AI_CREDIT_MONITOR_SPEC.md, 2026-08): AI 인프라 부채가 하류에서 상류로 번진다.
 *   코어위브(GPU 담보 차입) → 오라클(OpenAI 수주 의존) → 칩 회사(NVIDIA·Broadcom, 벤더 금융·보증)
 * 2026-10 중순 실제로 1·2단계가 났다: 코어위브 채권 수익률 약 15%(CNBC 10-14), 오라클 5년 CDS 288bp 사상 최고(S&P·LSEG 10-15).
 *
 * **예측이 아니라 '지금 어디까지 번졌나'를 기술한다** — 홈 위험 신호(app/api/risk)와 같은 원칙.
 * 단계 기준은 2026-10-19 사용자와 미리 정했다(결과를 보고 바꾸지 않는다). 백테스트하지 않았다 —
 * 코어위브가 2025-03 상장이라 위기 표본이 없다. 그래서 숫자는 '이 정도면 번졌다고 부르자'는 약속이다.
 */

export interface 종가점 { t: number; c: number }

/** 단계 기준 — 2026-10-19 미리 정함 */
export const 기준 = {
  /** 1단계 코어위브 악화: 20거래일 수익률 */
  코어위브20일: -0.25,
  /** 2단계 오라클 동반: 20거래일 수익률 − QQQ 20거래일 수익률 */
  오라클상대20일: -0.10,
  /** 3단계 칩 회사 동반: NVDA 또는 AVGO의 QQQ 대비 20거래일 */
  칩상대20일: -0.10,
  /** 4단계 시장 전이: HYG/IEF 20일 변화가 10년 중 하위 이 비율 안(홈 위험 신호의 '스트레스' 정의 — 하이일드 OAS와 상관 -0.66, n=731) */
  신용스트레스백분위: 0.10,
  /** 근접 표시(단계에는 안 셈, 2026-10-19 첫 실측 뒤 추가 — 기준은 그대로): 수익률 지표는 기준의 이 비율 이상 왔을 때 */
  근접비율: 0.9,
  /** 근접 표시: 신용 백분위는 이 안이면 */
  신용근접백분위: 0.15,
} as const

/** n거래일 수익률. 모자라면 null */
export function 수익률(c: number[], n: number): number | null {
  if (c.length < n + 1) return null
  const a = c[c.length - 1 - n], b = c[c.length - 1]
  return a > 0 ? b / a - 1 : null
}

/** 최근 n거래일 최고가 대비 */
export function 고점대비(c: number[], n = 252): number | null {
  if (!c.length) return null
  const 최고 = Math.max(...c.slice(-n))
  return 최고 > 0 ? c[c.length - 1] / 최고 - 1 : null
}

/** 여러 종목을 모두 값이 있는 날로만 맞춘다(상관을 같은 날끼리 재려고) */
export function 맞추기(줄들: 종가점[][]): { 날짜: number[]; 종가: number[][] } {
  const 지도 = 줄들.map(s => new Map(s.map(p => [p.t, p.c])))
  const 날짜 = 줄들[0].map(p => p.t).filter(t => 지도.every(m => m.has(t)))
  return { 날짜, 종가: 지도.map(m => 날짜.map(t => m.get(t)!)) }
}

const 일간 = (c: number[]) => c.slice(1).map((x, i) => x / c[i] - 1)

function 피어슨(a: number[], b: number[]): number | null {
  const n = a.length
  if (n < 3) return null
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null
}

/** 최근 window일 일간 수익률의 쌍별 상관 평균. 1에 가까우면 시장이 '같은 위험'으로 값을 매긴다는 뜻 */
export function 평균상관(종가들: number[][], window = 30): number | null {
  const 수익들 = 종가들.map(c => 일간(c).slice(-window))
  if (수익들.some(r => r.length < window)) return null
  const 값: number[] = []
  for (let i = 0; i < 수익들.length; i++) for (let j = i + 1; j < 수익들.length; j++) {
    const r = 피어슨(수익들[i], 수익들[j]); if (r != null) 값.push(r)
  }
  return 값.length ? 값.reduce((s, x) => s + x, 0) / 값.length : null
}

/** 과거 값 중 이 값 이하인 비율(0~1) */
export function 백분위(값: number, 과거: number[]): number {
  return 과거.length ? 과거.filter(x => x <= 값).length / 과거.length : 0
}

export interface 단계입력 { crwv20: number | null; orclRel20: number | null; nvdaRel20: number | null; avgoRel20: number | null; 신용백분위: number | null }
export interface 단계조건 { 단계: 1 | 2 | 3 | 4; 이름: string; 켜짐: boolean; 근접: boolean; 근거: string }

const 퍼 = (x: number) => `${(x * 100).toFixed(1)}%`

/** 앞 단계가 켜져야 다음 단계로 센다 — 칩만 약한 건 '역류'가 아니다(조건별 표시는 따로 남긴다) */
export function 단계판정(x: 단계입력): { 단계: 0 | 1 | 2 | 3 | 4; 조건: 단계조건[] } {
  const 없음 = '데이터 없음'
  const 칩 = [x.nvdaRel20, x.avgoRel20].filter((v): v is number => v != null)
  const 칩최저 = 칩.length ? Math.min(...칩) : null
  /** 꺼져 있지만 기준 가까이 왔나 — 수익률은 기준의 90% 이상 */
  const 가까움 = (v: number | null, 기준값: number) => v != null && v > 기준값 && v <= 기준값 * 기준.근접비율
  const 조건: 단계조건[] = [
    { 단계: 1, 이름: '코어위브 악화', 켜짐: x.crwv20 != null && x.crwv20 <= 기준.코어위브20일, 근접: 가까움(x.crwv20, 기준.코어위브20일),
      근거: x.crwv20 == null ? 없음 : `CRWV 20일 ${퍼(x.crwv20)} (기준 ${퍼(기준.코어위브20일)} 이하)` },
    { 단계: 2, 이름: '오라클 동반', 켜짐: x.orclRel20 != null && x.orclRel20 <= 기준.오라클상대20일, 근접: 가까움(x.orclRel20, 기준.오라클상대20일),
      근거: x.orclRel20 == null ? 없음 : `ORCL QQQ 대비 20일 ${퍼(x.orclRel20)} (기준 ${퍼(기준.오라클상대20일)} 이하)` },
    { 단계: 3, 이름: '칩 회사 동반', 켜짐: 칩최저 != null && 칩최저 <= 기준.칩상대20일, 근접: 가까움(칩최저, 기준.칩상대20일),
      근거: 칩최저 == null ? 없음 : `NVDA·AVGO 중 약한 쪽 QQQ 대비 20일 ${퍼(칩최저)} (기준 ${퍼(기준.칩상대20일)} 이하)` },
    { 단계: 4, 이름: '시장 신용 전이', 켜짐: x.신용백분위 != null && x.신용백분위 <= 기준.신용스트레스백분위,
      근접: x.신용백분위 != null && x.신용백분위 > 기준.신용스트레스백분위 && x.신용백분위 <= 기준.신용근접백분위,
      근거: x.신용백분위 == null ? 없음 : `HYG/IEF 20일 변화가 10년 중 하위 ${퍼(x.신용백분위)} (기준 ${퍼(기준.신용스트레스백분위)} 이하)` },
  ]
  let 단계: 0 | 1 | 2 | 3 | 4 = 0
  for (const c of 조건) { if (c.켜짐 && c.단계 === 단계 + 1) 단계 = c.단계; else break }
  return { 단계, 조건 }
}
