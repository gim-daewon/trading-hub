import { NextResponse } from 'next/server'
import { fetchDatedBars, type DatedBar } from '@/lib/flow'
import { 수익률, 고점대비, 맞추기, 평균상관, 백분위, 단계판정, type 종가점 } from '@/lib/credit'
import { 확인된사실 } from '@/lib/credit-facts'

// AI 신용 모니터 — 코어위브 → 오라클 → 칩 회사 → 시장 신용으로 번지는지 '지금 상태'를 기술한다(예측 아님).
// 계산은 lib/credit.ts(시험 lib/credit.test.ts), 사실 기록은 lib/credit-facts.ts.
// CDS·회사채 개별 호가는 무료 자동 수집이 없다 — 주가·ETF로 볼 수 있는 것만 자동, CDS는 확인된 사실 기록으로.
export const revalidate = 900 // 15분 — 홈 위험 신호와 같게

const 바스켓 = ['CRWV', 'ORCL', 'NVDA', 'AVGO', 'MRVL'] as const
const 상관바스켓 = ['CRWV', 'ORCL', 'NVDA', 'AVGO'] as const
/** 상관 백분위를 낼 과거 창 수 — 1년치 일봉에서 30일 창을 하루씩 밀어 잰다 */
const 상관과거창 = 180

const 점 = (b: DatedBar[] | null): 종가점[] => (b ?? []).filter(x => x.c > 0).map(x => ({ t: x.t, c: x.c }))
const 종가 = (p: 종가점[]) => p.map(x => x.c)

export async function GET() {
  const [묶음, qqq, hyg, ief] = await Promise.all([
    Promise.all(바스켓.map(s => fetchDatedBars(s, '1y').catch(() => null))),
    fetchDatedBars('QQQ', '1y').catch(() => null),
    fetchDatedBars('HYG', '10y').catch(() => null),
    fetchDatedBars('IEF', '10y').catch(() => null),
  ])
  const q20 = 수익률(종가(점(qqq)), 20)

  const 종목 = 바스켓.map((s, i) => {
    const c = 종가(점(묶음[i]))
    const r20 = 수익률(c, 20)
    return {
      심볼: s, 현재: c.at(-1) ?? null,
      일1: 수익률(c, 1), 일5: 수익률(c, 5), 일20: r20,
      qqq대비20: r20 != null && q20 != null ? r20 - q20 : null,
      고점대비: 고점대비(c, 252),
    }
  })
  const 값 = (s: string, k: 'qqq대비20' | '일20') => 종목.find(x => x.심볼 === s)?.[k] ?? null

  // 바스켓 30일 평균 상관과, 지난 1년 중 어디쯤인지
  let 상관: { 지금: number | null; 백분위: number | null } = { 지금: null, 백분위: null }
  const 줄들 = 상관바스켓.map(s => 점(묶음[바스켓.indexOf(s)]))
  if (줄들.every(z => z.length > 60)) {
    const m = 맞추기(줄들)
    const 지금 = 평균상관(m.종가, 30)
    const 과거: number[] = []
    for (let k = 1; k <= 상관과거창; k++) {
      const v = 평균상관(m.종가.map(c => c.slice(0, c.length - k)), 30)
      if (v != null) 과거.push(v)
    }
    상관 = { 지금, 백분위: 지금 != null && 과거.length > 30 ? 백분위(지금, 과거) : null }
  }

  // 시장 신용: HYG/IEF 20일 변화가 10년 중 어디쯤인가(낮을수록 하이일드가 국채보다 약함 = 스트레스)
  let 신용: { 변화20: number | null; 백분위: number | null } = { 변화20: null, 백분위: null }
  const hp = 점(hyg), ip = 점(ief)
  if (hp.length > 300 && ip.length > 300) {
    const m = 맞추기([hp, ip])
    const 비율 = m.종가[0].map((h, i) => h / m.종가[1][i])
    const 변화들 = 비율.slice(20).map((x, i) => x / 비율[i] - 1)
    const 지금 = 변화들.at(-1)!
    신용 = { 변화20: 지금, 백분위: 백분위(지금, 변화들) }
  }

  const 판정 = 단계판정({
    crwv20: 값('CRWV', '일20'), orclRel20: 값('ORCL', 'qqq대비20'),
    nvdaRel20: 값('NVDA', 'qqq대비20'), avgoRel20: 값('AVGO', 'qqq대비20'), 신용백분위: 신용.백분위,
  })

  // 하루 전 판정 — 아침 알림의 '단계 바뀜' 표시용. 저장 없이 마지막 봉 하나를 빼고 같은 계산을 다시 한다
  const 하루전 = (b: DatedBar[] | null) => 종가(점(b)).slice(0, -1)
  const q20어제 = 수익률(하루전(qqq), 20)
  const 상대어제 = (s: string) => {
    const r = 수익률(하루전(묶음[바스켓.indexOf(s as typeof 바스켓[number])]), 20)
    return r != null && q20어제 != null ? r - q20어제 : null
  }
  let 신용어제: number | null = null
  if (hp.length > 300 && ip.length > 300) {
    const m = 맞추기([hp, ip])
    const 비율 = m.종가[0].slice(0, -1).map((h, i) => h / m.종가[1][i])
    const 변화들 = 비율.slice(20).map((x, i) => x / 비율[i] - 1)
    신용어제 = 백분위(변화들.at(-1)!, 변화들)
  }
  const 어제판정 = 단계판정({
    crwv20: 수익률(하루전(묶음[0]), 20), orclRel20: 상대어제('ORCL'),
    nvdaRel20: 상대어제('NVDA'), avgoRel20: 상대어제('AVGO'), 신용백분위: 신용어제,
  })
  return NextResponse.json({ 기준시각: new Date().toISOString(), 종목, qqq20: q20, 상관, 신용, 판정, 어제판정, 사실: 확인된사실 })
}
