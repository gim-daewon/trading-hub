/**
 * 컵 + 돌파 실패 + 피보나치 되돌림 (2026-11-03 사용자가 준 참고 영상).
 *
 * 영상은 해설 없는 33초, 예시 한 장면이다. 아래 '영상' 표시 숫자는 프레임 판독이고,
 * '기본값' 표시는 영상에 없어 정한 값이다(결과를 보고 고치지 않는다).
 *
 * 흐름: 왼쪽 고점(테두리) → 바닥 → 테두리 위로 고가가 뚫림 → 종가가 다시 테두리 아래(돌파 실패)
 *   → 바닥~테두리 되돌림 0.5까지 내려옴 → 직전 봉 고가 위 종가(반등)에 진입.
 * 판정은 그 봉까지의 자료만 쓴다. 매매 결과(손절·목표 도달)를 셀 때만 뒤 봉을 본다.
 */
export interface OHLC { t: number; h: number; l: number; c: number }

export const CUP_FIB = {
  pivotK: 5,          // 기본값: 좌우 5봉보다 높으면 고점. 오른쪽 5봉이 지나야 확정된다
  minWidth: 20,       // 기본값: 테두리에서 돌파까지 최소 봉 수
  maxWidth: 300,      // 기본값
  minDepthAtr: 4,     // 기본값: 깊이(테두리-바닥) ≥ ATR14 × 4
  failWithin: 10,     // 기본값: 돌파 뒤 10봉 안에 종가가 테두리 아래로
  touchWithin: 40,    // 기본값: 실패 뒤 40봉 안에 되돌림 구간에 닿아야
  touch: 0.5,         // 영상: 0.5~0.618 상자의 위쪽 끝(1,120.2)
  stopAt: 0.7,        // 영상: 손절 1,070.2 = 테두리 - 0.696 × 깊이
  targetExt: 1.618,   // 영상: 바닥→돌파 고점 1.618 확장(1,524.0)
  maxHold: 60,        // 기본값: 이 봉 수가 지나면 종가로 나간다
  feePerSide: 0.001,  // 기본값: 수수료+미끄러짐 한쪽
  useStop: true,
}
export type CupFibParams = typeof CUP_FIB

/** A = 컵 돌파(테두리 위 종가), B = 돌파 실패 봉, C = 실패 뒤 Fib 반등(영상) */
export type Strategy = 'A' | 'B' | 'C'

export interface Trade {
  strategy: Strategy
  rimIndex: number; rim: number; bottom: number
  entryIndex: number; entryPrice: number; stop: number; target: number
  exitIndex: number; exitPrice: number
  /** open = 자료가 끝나 아직 안 끝난 매매. 통계에서 뺀다 */
  exit: 'target' | 'stop' | 'time' | 'open'
  /** 수수료 뺀 손익 ÷ (진입 - 손절) */
  r: number
}

/** 진입 뒤 손절·목표·기한 중 먼저 오는 것으로 나간다. 같은 봉에 둘 다면 손절(보수적) */
export function simulate(
  bars: OHLC[], e: number, entry: number, stop: number, target: number, p: CupFibParams,
): Pick<Trade, 'exitIndex' | 'exitPrice' | 'exit' | 'r'> {
  const last = Math.min(bars.length - 1, e + p.maxHold)
  let exitIndex = last, exitPrice = bars[last].c
  let exit: Trade['exit'] = e + p.maxHold <= bars.length - 1 ? 'time' : 'open'
  for (let k = e + 1; k <= last; k++) {
    const b = bars[k]
    // 봉 전체가 손절 아래면(갭 하락) 손절가가 아니라 그 봉 고가에 나간 것으로 본다
    if (p.useStop && b.l <= stop) { exitIndex = k; exitPrice = Math.min(stop, b.h); exit = 'stop'; break }
    if (b.h >= target) { exitIndex = k; exitPrice = target; exit = 'target'; break }
  }
  const net = exitPrice * (1 - p.feePerSide) - entry * (1 + p.feePerSide)
  return { exitIndex, exitPrice, exit, r: net / (entry - stop) }
}

function atr14(bars: OHLC[], t: number): number {
  let s = 0, n = 0
  for (let k = Math.max(1, t - 13); k <= t; k++) {
    s += Math.max(bars[k].h - bars[k].l, Math.abs(bars[k].h - bars[k - 1].c), Math.abs(bars[k].l - bars[k - 1].c))
    n++
  }
  return n ? s / n : Infinity
}

/** i가 좌우 K봉보다 높은 고점인가. 오른쪽 K봉이 필요하므로 i+K 봉에서야 알 수 있다 */
function isPivotHigh(bars: OHLC[], i: number, K: number): boolean {
  if (i - K < 0 || i + K >= bars.length) return false
  for (let j = i - K; j < i; j++) if (bars[j].h > bars[i].h) return false
  for (let j = i + 1; j <= i + K; j++) if (bars[j].h >= bars[i].h) return false
  return true
}

interface Cup { rimIndex: number; rim: number; bottom: number; depth: number; breakIndex: number }

/** t 봉 고가가 깨뜨린 고점 중 가장 오래된(가장 넓은) 조건 맞는 컵 */
function cupBrokenAt(bars: OHLC[], t: number, broken: number[], p: CupFibParams): Cup | null {
  for (const i of broken) {               // 오래된 것부터
    const width = t - i
    if (width < p.minWidth || width > p.maxWidth) continue
    let bottom = Infinity
    for (let k = i + 1; k <= t; k++) bottom = Math.min(bottom, bars[k].l)
    const depth = bars[i].h - bottom
    if (depth < p.minDepthAtr * atr14(bars, t)) continue
    return { rimIndex: i, rim: bars[i].h, bottom, depth, breakIndex: t }
  }
  return null
}

type Entry = Omit<Trade, 'exitIndex' | 'exitPrice' | 'exit' | 'r'>

/** 돌파 실패는 났는데 자료가 끝나 아직 되돌림·반등 결론이 안 난 셋업 */
interface Pending { rim: number; bottom: number; stop: number; target: number; touchLevel: number; failIndex: number; touched: boolean }

function entriesFor(bars: OHLC[], cup: Cup, p: CupFibParams): { out: Entry[]; pending: Pending | null } {
  const { rim, bottom, depth, rimIndex, breakIndex: t } = cup
  const stop = rim - p.stopAt * depth
  const base = { rimIndex, rim, bottom, stop }
  const out: Entry[] = []
  const end = Math.min(bars.length - 1, t + p.failWithin)

  for (let j = t; j <= end; j++) {
    if (bars[j].c > rim) {
      out.push({ ...base, strategy: 'A', entryIndex: j, entryPrice: bars[j].c, target: bottom + p.targetExt * depth })
      break
    }
  }

  let high = -Infinity, fail = -1
  for (let j = t; j <= end; j++) {
    high = Math.max(high, bars[j].h)
    if (bars[j].c < rim) { fail = j; break }
  }
  if (fail < 0) return { out, pending: null }
  const target = bottom + p.targetExt * (high - bottom)
  out.push({ ...base, strategy: 'B', entryIndex: fail, entryPrice: bars[fail].c, target })

  const touchLevel = rim - p.touch * depth
  const last = Math.min(bars.length - 1, fail + p.touchWithin)
  let touched = false
  for (let k = fail + 1; k <= last; k++) {
    const b = bars[k]
    if (b.l <= stop || b.c > high) return { out, pending: null }   // 손절선 아래로 / 진짜 돌파였다
    if (b.l <= touchLevel) touched = true
    if (touched && b.c > bars[k - 1].h) {
      out.push({ ...base, strategy: 'C', entryIndex: k, entryPrice: b.c, target })
      return { out, pending: null }
    }
  }
  // 기한 안인데 자료가 끝났다 = 지금 되돌림·반등을 기다리는 중
  const waiting = fail + p.touchWithin > bars.length - 1
  return { out, pending: waiting ? { rim, bottom, stop, target, touchLevel, failIndex: fail, touched } : null }
}

/** 한 종목 전체를 훑는다. 전략마다 한 번에 한 매매만(끝나기 전엔 새 진입 안 함) */
export function scanCupFib(bars: OHLC[], p: CupFibParams = CUP_FIB): Trade[] {
  return walk(bars, p).trades
}

/** 메뉴용 지금 상태. entry = 최근 FRESH봉 안 C 진입이고 아직 손절·목표 전, watch = 돌파 실패 뒤 되돌림 대기 */
export interface CupNow {
  stage: 'entry' | 'watch'
  rim: number; bottom: number; stop: number; target: number
  /** entry: 진입가(신호 봉 종가) · watch: 되돌림 0.5 가격(여기 닿고 반등하면 진입) */
  entry: number
  /** entry: 진입 뒤 봉 수 · watch: 돌파 실패 뒤 봉 수 */
  ago: number
  /** watch에서 이미 0.5에 닿았나(다음은 반등 봉만 기다림) */
  touched: boolean
  /** 목표까지 ÷ 손절까지 */
  rr: number
}
export const CUP_NOW_FRESH = 3        // 기본값: 진입 신호를 며칠(봉)까지 '지금'으로 보나

export function cupFibNow(bars: OHLC[], p: CupFibParams = CUP_FIB, fresh = CUP_NOW_FRESH): CupNow | null {
  const { trades, pending } = walk(bars, p)
  const n = bars.length
  const c = trades.filter(t => t.strategy === 'C').at(-1)
  if (c && c.exit === 'open' && n - 1 - c.entryIndex <= fresh) {
    return { stage: 'entry', rim: c.rim, bottom: c.bottom, stop: c.stop, target: c.target, entry: c.entryPrice,
      ago: n - 1 - c.entryIndex, touched: true, rr: (c.target - c.entryPrice) / (c.entryPrice - c.stop) }
  }
  if (!pending) return null
  const { rim, bottom, stop, target, touchLevel, failIndex, touched } = pending
  return { stage: 'watch', rim, bottom, stop, target, entry: touchLevel, ago: n - 1 - failIndex, touched,
    rr: (target - touchLevel) / (touchLevel - stop) }
}

/** 진입 준비 중 화면에 띄울 만큼 가까운 것. 2026-11-03 실측 247개 중 대부분이 아직 한참 위라 목록이 쓸모없었다 */
export const CUP_WATCH_NEAR_PCT = 5   // 기본값
export function cupWatchNear(now: CupNow, price: number, nearPct = CUP_WATCH_NEAR_PCT): boolean {
  if (now.stage !== 'watch') return false
  return now.touched || (price / now.entry - 1) * 100 <= nearPct
}

function walk(bars: OHLC[], p: CupFibParams): { trades: Trade[]; pending: Pending | null } {
  let pending: Pending | null = null
  const trades: Trade[] = []
  const busyUntil: Record<Strategy, number> = { A: -1, B: -1, C: -1 }
  const unbroken: number[] = []           // 아직 안 깨진 확정 고점. 오래될수록 높다
  for (let t = 1; t < bars.length; t++) {
    const confirmed = t - 1 - p.pivotK    // t-1 봉까지로 확정되는 고점
    if (isPivotHigh(bars, confirmed, p.pivotK)) {     // 오른쪽 끝 = t-1, t 이후는 안 본다
      while (unbroken.length && bars[unbroken.at(-1)!].h <= bars[confirmed].h) unbroken.pop()
      unbroken.push(confirmed)
    }
    const broken: number[] = []
    while (unbroken.length && bars[unbroken.at(-1)!].h < bars[t].h) broken.unshift(unbroken.pop()!)
    if (!broken.length) continue
    const cup = cupBrokenAt(bars, t, broken, p)
    if (!cup) continue
    const got = entriesFor(bars, cup, p)
    if (got.pending) pending = got.pending
    for (const e of got.out) {
      if (e.entryIndex <= busyUntil[e.strategy]) continue
      const res = simulate(bars, e.entryIndex, e.entryPrice, e.stop, e.target, p)
      trades.push({ ...e, ...res })
      busyUntil[e.strategy] = res.exitIndex
    }
  }
  return { trades, pending }
}
