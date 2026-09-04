-- VWMA20 돌파 메뉴용 컬럼 추가.
--
-- above_run 하나로 돌파와 유지를 모두 표현한다:
--   0 = VWMA20 아래
--   1 = 오늘 종가로 상향 돌파 (전일은 아래였다)
--   N = N일째 위 유지
--
-- 주의: 이 지표는 성과 근거가 없다. 10년 검증에서 돌파 당일 51% ·
-- 재돌파 49% · 2~3일 유지 53%로 전부 기준선(55%) 아래였다.
-- 화면에는 "탐색용, 성과 근거 없음"으로 표시한다.

alter table screener_rows add column if not exists vwma20    double precision;
alter table screener_rows add column if not exists above_run integer;

-- 돌파 종목만 뽑는 쿼리가 잦으므로 부분 인덱스를 둔다
create index if not exists screener_rows_breakout_idx
  on screener_rows (snapshot_id, above_run)
  where above_run is not null and above_run between 1 and 5;
