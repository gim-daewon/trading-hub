/**
 * 모의투자 계좌 계산(2026-11-03, 사용자 "성과 추적보다 모의투자한 걸 보는 게 더 직관적").
 *
 * 매일 스캔이 남긴 '모의 매수 주문'(그날 종가 진입·손절·목표)과 일봉 고가·저가로 계좌를 처음부터 다시 돌린다.
 * 실제 계좌처럼: 시드에서 시작, 한 매매 위험 = 지금 자산의 riskPct%, 현금이 모자라면 살 수 있는 만큼만,
 * 동시 보유 maxOpen개, 같은 종목 중복 매수 없음. 순수 함수 — DB·네트워크를 부르지 않는다.
 *
 * 판정은 scripts/today-pick-backtest.mjs(lib/cup-fib.ts simulate)와 같다:
 *   산 날은 판정하지 않음(종가 진입) · 저가가 손절에 닿으면 손절(봉 전체가 아래면 그 봉 고가) ·
 *   같은 날 손절과 목표가 둘 다 닿으면 손절(보수적) · maxHold 봉이 지나면 그날 종가.
 */

import { gather, checksFor, preselect, pickTop, PICK, NOT_STOCK, type ScreenerPayload, type SignalLabels, type LevelPair } from './today'

export interface DayBar { d: string; h: number; l: number; c: number }
export interface PaperOrder { date: string; symbol: string; entry: number; stop: number; target: number; name?: string }
export interface PaperConfig {
  seed: number
  /** 한 매매 위험(지금 자산의 %) */
  riskPct: number
  maxOpen: number
  /** 한쪽 수수료·세금(%) */
  feePct: number
  maxHold: number
  /** 코인은 소수 수량을 살 수 있다 */
  fractional: boolean
}
export interface OpenPos extends PaperOrder { qty: number; held: number; last: number; pnl: number }
export interface ClosedTrade extends PaperOrder {
  qty: number; exitDate: string; price: number; exit: 'stop' | 'target' | 'time'; pnl: number; r: number
}
export interface PaperResult { equity: { date: string; equity: number }[]; open: OpenPos[]; closed: ClosedTrade[]; cash: number }

/**
 * 규칙 B(20일선 눌림) 주문 — 사용자 "추천 종목이 다 최고점이라 들어가기 부담스럽다"(11-03).
 * 후보는 '강세눌림 접근 일봉'(정배열 + 20일선 0~1% 위, lib/screener-shared.ts BREAKOUTS nearD).
 * 손절 = 20일선 − ATR14(20일선이 깨지고 하루 변동폭만큼 더 빠지면 나간다), 목표 = 손절폭 2배(2R).
 * 손절폭 최소 1%는 lib/today.ts PICK.minStopPct와 같은 이유(호가 한두 칸에 걸림).
 */
export const PULLBACK_RULE = { targetR: 2, minStopPct: 1 }
export function pullbackOrder(r: { price: number | null; vwma20?: number | null; atr14?: number | null }):
  { entry: number; stop: number; target: number } | null {
  if (r.price == null || !r.vwma20 || !r.atr14) return null
  const stop = Math.min(r.vwma20 - r.atr14, r.price * (1 - PULLBACK_RULE.minStopPct / 100))
  if (!(stop > 0) || stop >= r.price) return null
  return { entry: r.price, stop, target: r.price + PULLBACK_RULE.targetR * (r.price - stop) }
}

/**
 * 시장별 모의 계좌(사용자 11-03 "1" — 미국 $10,000 · 한국 1,000만 원 · 코인 $10,000).
 * 수수료·세금 한쪽: 미국 0.05%(백테스트와 같음), 한국 0.25%(매도 거래세 약 0.18% + 수수료를 한쪽에 나눠 넉넉히),
 * 코인 0.1%(cup-fib 백테스트와 같음). 위험 1%·동시 10종목·40봉은 오늘 후보 백테스트와 같은 값
 */
export const PAPER_ACCOUNTS = {
  us: { seed: 10_000, riskPct: 1, maxOpen: 10, feePct: 0.05, maxHold: 40, fractional: false },
  kr: { seed: 10_000_000, riskPct: 1, maxOpen: 10, feePct: 0.25, maxHold: 40, fractional: false },
  crypto: { seed: 10_000, riskPct: 1, maxOpen: 10, feePct: 0.1, maxHold: 40, fractional: true },
} satisfies Record<string, PaperConfig>

export const PAPER_RULES = {
  A: '추세 눌림 기법 통과 — 신고가권, 지지를 ATR로 묶은 손절, 저항 또는 2R 목표',
  B: '20일선 눌림 — 정배열에서 20일선 0~1% 위, 손절 20일선 − ATR, 목표 2R',
} as const

/** 규칙마다 하루 최대 주문 수. A는 화면 추천과 같은 PICK.count(10), B도 같게 맞춘다 */
export const DAILY_MAX = 10

/**
 * 하루치 모의 주문(규칙 A·B). 스캔(scripts/scan.mjs)이 부른다.
 * built = 스크리너 빌더 결과(categories·breakouts·rebound). 빌더는 확장자 없는 import라 node 시험에서 못 불러
 * 밖에서 만들어 넘긴다(lib/today.ts gather와 같은 이유). levelsOf = 종목의 그날 지지·저항(봉으로 계산).
 * 실적 일정은 스캔에 없어 A의 '실적 임박 제외'는 여기서 빠진다.
 */
export function dailyOrders(
  built: ScreenerPayload, tiers: string[], labels: SignalLabels,
  levelsOf: (symbol: string) => LevelPair | null, date: string,
): { A: PaperOrder[]; B: PaperOrder[] } {
  const items = gather(built, tiers, labels).map(g => ({ ...g, checks: checksFor(g.row), earnings: null }))
  const pre = preselect(items).slice(0, PICK.prefetch)
  const lv: Record<string, LevelPair | undefined> = {}
  for (const it of pre) lv[it.row.symbol] = levelsOf(it.row.symbol) ?? undefined
  const A = pickTop(pre, lv).map(p => ({
    date, symbol: p.item.row.symbol, name: p.item.row.name, entry: p.item.row.price as number,
    stop: p.stop as number, target: p.target as number,
  }))
  const seen = new Set<string>(), B: PaperOrder[] = []
  for (const t of tiers) {
    for (const r of built.breakouts?.[t]?.nearD ?? []) {
      if (B.length >= DAILY_MAX || seen.has(r.symbol) || NOT_STOCK.test(r.name)) continue
      const o = pullbackOrder(r)
      if (o) { seen.add(r.symbol); B.push({ date, symbol: r.symbol, name: r.name, ...o }) }
    }
  }
  return { A, B }
}

/**
 * 시세를 못 받은 종목(/api/paper의 failed) 안내. 그 종목은 봉이 없어 손절·목표 판정 없이 산 값 그대로 '보유'로 남고,
 * 보유 칸(maxOpen)을 차지해 뒤 주문까지 막을 수 있다 — 계좌 숫자를 믿기 전에 알아야 한다.
 */
export function failedNote(failed: number | undefined): string | null {
  if (!failed) return null
  return `${failed}종목 시세를 못 받았다. 그 종목은 손절·목표 판정 없이 보유로 남아 계좌 숫자가 틀릴 수 있다 — 새로고침해 다시 받아 보라.`
}

export function runAccount(orders: PaperOrder[], bars: Record<string, DayBar[]>, cfg: PaperConfig): PaperResult {
  const fee = cfg.feePct / 100
  const byDay = new Map<string, Map<string, DayBar>>()
  for (const [sym, list] of Object.entries(bars)) {
    for (const b of list) {
      if (!byDay.has(b.d)) byDay.set(b.d, new Map())
      byDay.get(b.d)!.set(sym, b)
    }
  }
  const dates = [...new Set([...byDay.keys(), ...orders.map(o => o.date)])].sort()
  let cash = cfg.seed
  const open: OpenPos[] = [], closed: ClosedTrade[] = [], equity: PaperResult['equity'] = []
  const worth = () => cash + open.reduce((s, p) => s + p.qty * p.last, 0)

  const close = (p: OpenPos, date: string, price: number, exit: ClosedTrade['exit']) => {
    cash += p.qty * price * (1 - fee)
    const pnl = p.qty * price * (1 - fee) - p.qty * p.entry * (1 + fee)
    closed.push({ ...p, exitDate: date, price, exit, pnl, r: pnl / (p.qty * (p.entry - p.stop)) })
  }

  for (const date of dates) {
    const today = byDay.get(date)
    // 1) 들고 있는 종목 판정 — 산 날은 건너뛴다
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i], b = today?.get(p.symbol)
      if (!b || date <= p.date) continue
      p.held++
      p.last = b.c
      let out: [number, ClosedTrade['exit']] | null = null
      if (b.l <= p.stop) out = [Math.min(p.stop, b.h), 'stop']
      else if (b.h >= p.target) out = [p.target, 'target']
      else if (p.held >= cfg.maxHold) out = [b.c, 'time']
      if (out) { close(p, date, out[0], out[1]); open.splice(i, 1) }
      else p.pnl = p.qty * (p.last - p.entry)
    }
    // 2) 오늘 주문 — 그날 종가에 산다
    for (const o of orders.filter(x => x.date === date)) {
      if (open.length >= cfg.maxOpen || open.some(p => p.symbol === o.symbol)) continue
      if (!(o.entry > o.stop) || !(o.target > o.entry)) continue
      const byRisk = worth() * cfg.riskPct / 100 / (o.entry - o.stop)
      const byCash = cash / (o.entry * (1 + fee))
      let qty = Math.min(byRisk, byCash)
      if (!cfg.fractional) qty = Math.floor(qty)
      if (!(qty > 0)) continue
      cash -= qty * o.entry * (1 + fee)
      open.push({ ...o, qty, held: 0, last: o.entry, pnl: 0 })
    }
    equity.push({ date, equity: worth() })
  }
  return { equity, open, closed, cash }
}
