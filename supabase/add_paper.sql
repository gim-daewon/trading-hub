-- 모의투자 주문 — '모의투자' 메뉴(/paper)가 읽는다. 2026-11-03.
--
-- 매일 스캔(scripts/scan.mjs)이 규칙마다 그날 산 것으로 칠 종목을 한 줄씩 넣는다(그날 종가 진입·손절·목표).
-- 계좌(현금·수량·손익)는 저장하지 않는다. 화면이 이 주문과 일봉으로 처음부터 다시 계산한다(lib/paper.ts) —
-- 규칙을 고쳐도 지난 주문이 남아 있어 다시 돌려 볼 수 있다.
--   rule A = 추세 눌림 기법 통과(lib/today.ts pickTop)
--   rule B = 20일선 눌림(강세눌림 접근 일봉 신호, 손절 20일선 − ATR, 목표 2R)
--
-- 실행: SQL 편집기 또는 scripts/db-sql.mjs. 여러 번 실행해도 안전하다.
create table if not exists public.paper_orders (
  id      bigserial primary key,
  market  text    not null check (market in ('us', 'kr', 'crypto')),
  rule    text    not null check (rule in ('A', 'B')),
  date    date    not null,
  symbol  text    not null,
  name    text,
  entry   numeric not null,
  stop    numeric not null,
  target  numeric not null,
  created_at timestamptz not null default now(),
  unique (market, rule, date, symbol)
);
create index if not exists idx_paper_market_rule on public.paper_orders (market, rule, date);

-- 앱은 anon 키로 읽기만, 쓰기는 스캔(service_role, RLS 우회)
alter table public.paper_orders enable row level security;
drop policy if exists "read paper" on public.paper_orders;
create policy "read paper" on public.paper_orders for select to anon using (true);
