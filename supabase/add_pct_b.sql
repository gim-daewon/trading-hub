-- 볼린저 %B 컬럼 추가 (눌림목 매집 카테고리용)
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run
-- 여러 번 실행해도 안전하다.
--
-- 배경: 2년 백테스트에서 "볼린저 하단권(%B<=0.2) + 수급 상위 30%" 조건이
-- 시총 3구간 × 국면 2가지 = 6개 조합 전부에서 기준선을 상회했다.
-- 검증한 조건 중 유일하게 일관적이었다.

alter table public.screener_rows
  add column if not exists pct_b numeric;

-- 하단권 종목을 자주 조회하므로 인덱스를 둔다
create index if not exists idx_rows_pctb
  on public.screener_rows (snapshot_id, pct_b);
