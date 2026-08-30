-- 성과 추적용 컬럼
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run
-- 여러 번 실행해도 안전하다.
--
-- 목적: 스크리너에 뜬 종목이 실제로 올랐는지 사후 확인.
-- 진입가만 저장해두면 최신 스냅샷의 가격과 비교해 수익률이 나온다.
-- 별도 갱신 잡이 필요 없다.

-- 진입가 (스캔 시점 종가)
alter table public.screener_rows
  add column if not exists price numeric;

-- 같은 시점 SPY 가격 (SPY 대비 초과수익 계산용)
alter table public.screener_snapshots
  add column if not exists spy_price numeric;
