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

-- ── 2026-09-05 추가 ────────────────────────────────────────────────────
-- 주봉 연속 유지 주수. 이게 없으면 "지난주 막 탈환"과 "몇 달 전에 넘어
-- 한참 위에 있음"을 구분할 수 없다. 실제로 바닥잡기 주봉 탭에
-- 20주선을 한참 통과한 종목들이 떴다.
alter table screener_rows add column if not exists w_above_run integer;

-- above_run / w_above_run 의미가 바뀌었다 (2026-09-05).
-- 이전: 0 = 아래 · N = N일째 위
-- 이후: +N = N일째 위 · -N = N일째 아래 (부호로 구분)
-- "위에 있던 주가가 선에 닿았다"를 판정하려면 '직전까지 위였나'가 필요한데
-- 0으로 뭉뚱그리면 아래에서 올라와 닿은 종목과 구분이 안 된다.
-- 컬럼 타입은 그대로라 SQL 변경은 없다. 스캔을 다시 돌리면 값이 갱신된다.

-- ── 2026-09-05 추가 2 ──────────────────────────────────────────────────
-- 직전 반대 구간의 길이. 돌파 전에 며칠(몇 주) 아래에 있었나.
-- "밑에 '있다가' 돌파"의 지속성을 판정한다.
-- 없으면 1~2주만 눌렸다 올라온 종목이 바닥으로 잡힌다
-- (실측: JEF 1주 아래인데 20주 등락 +16.0%, SNAP 1주에 +12.7%).
alter table screener_rows add column if not exists prev_run   integer;
alter table screener_rows add column if not exists w_prev_run integer;

-- ── 2026-09-05 추가 3 ──────────────────────────────────────────────────
-- 데이터 기준일. 스캔 시각과 다를 수 있다.
-- 야후가 당일 일봉을 늦게 내놓는 날이 있다 — 2026-09-04는 마감 4시간 뒤에도
-- 전 종목 일봉이 null이라 스캔이 09-03 종가로 돌았다.
-- 그 상태로 "9/4 종가 기준"이라고 띄우면 표시가 거짓말을 한다.
alter table screener_snapshots add column if not exists bar_date date;

-- ── 2026-09-05 추가 4 ──────────────────────────────────────────────────
-- 저가. 밑꼬리가 VWMA20을 뚫었는지 판정한다.
-- 사용자 관찰: "강세눌림에서 몸통이 20선을 뚫리면 주가도 계속 떨어진다.
-- 밑꼬리는 뚫려도 몸통은 20선 위에 있는 것으로 해달라."
-- 종가만으로는 '꼬리만 닿음'과 '몸통이 무너짐'을 구분할 수 없다.
alter table screener_rows add column if not exists low   double precision;
alter table screener_rows add column if not exists w_low double precision;
