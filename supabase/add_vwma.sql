-- VWMA 돌파/눌림 메뉴용 컬럼.
--
-- Supabase → SQL Editor에 전체를 붙여넣고 Run 하면 된다.
-- 이미 실행했던 부분이 있어도 IF NOT EXISTS라 안전하게 다시 돌릴 수 있다.
--
-- ── 왜 이 컬럼들인가 ────────────────────────────────────────────────────
-- 값을 저장하고 신호는 조회 시점에 계산한다. 신호 정의가 바뀌어도
-- 재스캔 없이 화면만 고치면 되기 때문이다.
--
--   above_run  : 종가가 VWMA20 위에 연속으로 머문 일수
--                0 = 아래 · 1 = 오늘 상향 돌파 · N = N일째 유지
--                돌파와 유지를 이 하나로 다 표현한다
--   vwma20/60  : 일봉 거래량가중 이동평균
--   w_close    : 마지막 '완료된' 주의 종가
--                진행 중인 주를 쓰면 룩어헤드가 된다
--   w_vwma20/60: 주봉 VWMA
--
-- ── 신호 정의 (화면에서 계산) ──────────────────────────────────────────
--   바닥잡기   : vwma60 > vwma20  AND  above_run = 1
--                (역배열 = 약세 상태에서 20선을 아래→위로 탈환)
--   강세눌림   : vwma20 > vwma60  AND  종가가 vwma20 부근
--                접근 = 0~3% 위 · 터치 = 20선 아래로 이탈
--   주봉 버전은 w_ 컬럼으로 같은 판정을 한다
--
-- ── 성과 근거는 없다 ───────────────────────────────────────────────────
-- 10년 · 격자 시작점 10개 검증. 기준선(전체 종목 균등매수) 양수 57%:
--   바닥잡기 일봉 52% · 주봉 50%
--   강세눌림 접근 일봉 50% · 주봉 48%
--   강세눌림 터치 일봉 52% · 주봉 53%
-- 전부 기준선 아래다. 탐색 도구로만 쓰고 성과를 주장하지 않는다.

alter table screener_rows add column if not exists vwma20    double precision;
alter table screener_rows add column if not exists vwma60    double precision;
alter table screener_rows add column if not exists above_run integer;

-- 주봉 (마지막 완료 주 기준)
alter table screener_rows add column if not exists w_close   double precision;
alter table screener_rows add column if not exists w_vwma20  double precision;
alter table screener_rows add column if not exists w_vwma60  double precision;

-- 돌파 조회가 잦으므로 부분 인덱스를 둔다.
-- above_run 1~5만 걸어 인덱스 크기를 작게 유지한다
create index if not exists screener_rows_breakout_idx
  on screener_rows (snapshot_id, above_run)
  where above_run is not null and above_run between 1 and 5;

-- 정렬은 항상 20일 순자금 기준이라 같이 묶어둔다
create index if not exists screener_rows_snapshot_flow_idx
  on screener_rows (snapshot_id, f20 desc);

-- 확인용 — 실행 후 아래를 돌리면 컬럼이 다 생겼는지 볼 수 있다
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'screener_rows'
--    and column_name in ('vwma20','vwma60','above_run','w_close','w_vwma20','w_vwma60')
--  order by column_name;
