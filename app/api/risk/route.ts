import { NextResponse } from 'next/server'
import { fetchBars } from '@/lib/flow'

// 위험 신호 5개.
//
// 이건 예측이 아니라 "지금 시장이 어떤 상태인가"에 대한 현상 기술이다.
// 하루 뒤를 맞히지 못한다 — 자체 백테스트에서 예측 신호는 검증할수록 사라졌다.
// 대신 2026-08-28처럼 지수(-0.25%)만 보면 안 보이는 내부 붕괴를 드러내는 게 목적이다.
// 그날 실측: 개별종목 20%가 -3% 이하, 소형주 평균 -2.47%, 필수소비만 +1.16%.

export const revalidate = 900  // 15분

const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}

export type Level = 'ok' | 'warn' | 'alert'

export interface Signal {
  id: string
  label: string
  level: Level
  value: string       // 화면에 띄울 현재값
  detail: string      // 판정 근거
}

const toNum = (s: unknown) => parseFloat(String(s).replace(/[$,%]/g, '')) || 0
const pct = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`

/** 종목 등락 분포 — 지수가 방어돼도 내부가 무너지는 걸 잡는다 */
async function breadth(): Promise<Signal> {
  try {
    const res = await fetch(
      'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true',
      { headers: NASDAQ_HEADERS, cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`nasdaq ${res.status}`)
    const rows = (await res.json())?.data?.rows ?? []

    type R = { symbol: string; lastsale: string; volume: string; marketCap: string; pctchange: string }
    const live = (rows as R[])
      .filter(r => /^[A-Z]{1,5}$/.test(r.symbol))
      .map(r => ({ ret: toNum(r.pctchange), dv: toNum(r.lastsale) * toNum(r.volume) }))
      .filter(r => r.dv >= 2e7 && r.ret !== 0)

    if (live.length < 100) throw new Error('표본 부족')

    const down = live.filter(r => r.ret < 0).length
    const downRatio = (down / live.length) * 100
    const hardDown = live.filter(r => r.ret <= -3).length
    const hardRatio = (hardDown / live.length) * 100

    // 8/28 실측 기준: 하락 64%, -3%↓ 20%가 "내부 붕괴"였다
    const level: Level = hardRatio >= 15 ? 'alert' : hardRatio >= 8 || downRatio >= 65 ? 'warn' : 'ok'
    return {
      id: 'breadth',
      label: '시장 폭 (breadth)',
      level,
      value: `하락 ${downRatio.toFixed(0)}%`,
      detail: `${live.length}종목 중 −3% 이하 ${hardDown}개 (${hardRatio.toFixed(1)}%)`,
    }
  } catch (e) {
    return { id: 'breadth', label: '시장 폭 (breadth)', level: 'ok', value: '—', detail: `조회 실패: ${e}` }
  }
}

function ret(bars: { c: number }[] | null, days: number): number | null {
  if (!bars || bars.length < days + 1) return null
  const a = bars[bars.length - 1 - days].c, b = bars[bars.length - 1].c
  return ((b - a) / a) * 100
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const [bd, spy, iwm, xlp, xlu, xly, xlk, vix, macroRes] = await Promise.all([
    breadth(),
    fetchBars('SPY'), fetchBars('IWM'),
    fetchBars('XLP'), fetchBars('XLU'), fetchBars('XLY'), fetchBars('XLK'),
    fetchBars('^VIX'),
    fetch(`${origin}/api/macro`, { next: { revalidate: 43200 } })
      .then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  const signals: Signal[] = [bd]

  // 2. 소형주 열위 — 위험선호가 꺾이면 소형주가 먼저 빠진다
  const iwm5 = ret(iwm, 5), spy5 = ret(spy, 5)
  if (iwm5 != null && spy5 != null) {
    const gap = iwm5 - spy5
    signals.push({
      id: 'smallcap',
      label: '소형주 상대강도',
      level: gap <= -2 ? 'alert' : gap <= -0.7 ? 'warn' : 'ok',
      value: `${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%p`,
      detail: `5일 IWM ${pct(iwm5)} vs SPY ${pct(spy5)}`,
    })
  }

  // 3. 방어섹터 로테이션 — 필수소비·유틸이 경기소비·기술을 이기면 risk-off
  const def = [ret(xlp, 5), ret(xlu, 5)].filter((v): v is number => v != null)
  const cyc = [ret(xly, 5), ret(xlk, 5)].filter((v): v is number => v != null)
  if (def.length && cyc.length) {
    const gap = def.reduce((a, b) => a + b, 0) / def.length - cyc.reduce((a, b) => a + b, 0) / cyc.length
    signals.push({
      id: 'rotation',
      label: '방어섹터 로테이션',
      level: gap >= 2.5 ? 'alert' : gap >= 1 ? 'warn' : 'ok',
      value: `${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%p`,
      detail: `5일 방어(XLP·XLU) − 경기(XLY·XLK)`,
    })
  }

  // 4. VIX — 절대수준과 급등 여부를 같이 본다
  const vixNow = vix?.[vix.length - 1]?.c ?? null
  const vix5 = ret(vix, 5)
  if (vixNow != null) {
    signals.push({
      id: 'vix',
      label: 'VIX 변동성',
      level: vixNow >= 25 || (vix5 ?? 0) >= 30 ? 'alert' : vixNow >= 20 || (vix5 ?? 0) >= 15 ? 'warn' : 'ok',
      value: vixNow.toFixed(1),
      detail: vix5 == null ? '' : `5일 ${pct(vix5)}`,
    })
  }

  // 5. 신용스프레드 — 하이일드 OAS 확대는 실질적 스트레스 신호
  const hy = macroRes?.credit?.hyOas
  if (hy?.value != null) {
    const chg = hy.prev != null ? hy.value - hy.prev : null
    signals.push({
      id: 'credit',
      label: '하이일드 신용스프레드',
      level: hy.value >= 450 ? 'alert' : hy.value >= 380 || (chg ?? 0) >= 25 ? 'warn' : 'ok',
      value: `${hy.value.toFixed(0)}bp`,
      detail: chg == null ? '' : `직전 대비 ${chg >= 0 ? '+' : ''}${chg.toFixed(0)}bp`,
    })
  }

  const alerts = signals.filter(s => s.level === 'alert').length
  const warns  = signals.filter(s => s.level === 'warn').length
  const score  = alerts * 2 + warns   // 0 ~ 2N

  return NextResponse.json({
    signals,
    alerts, warns, total: signals.length, score,
    // 결론을 내리지 않는다. 몇 개가 켜졌는지만 알린다.
    headline: alerts >= 2 ? '위험 신호 다수' : alerts >= 1 || warns >= 3 ? '경계' : warns >= 1 ? '일부 주의' : '특이사항 없음',
    fetchedAt: Date.now(),
  })
}
