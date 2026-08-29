-- 수급 스크리너 스캔 결과 저장
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run
--
-- 목적: Vercel 함수는 10초 제한이라 705종목까지만 스캔 가능하다.
--       GitHub Actions(6시간 제한)에서 1,900종목을 스캔해 여기 저장하고,
--       앱은 읽기만 하면 유니버스를 넓히면서 응답도 즉시가 된다.
--
-- 텔레그램과는 무관하다. 알림을 안 쓸 거면 관련 설정은 필요 없다.

create table if not exists public.screener_snapshots (
  id            bigserial primary key,
  scanned_at    timestamptz not null default now(),
  -- 스캔 시점의 시장 국면. 카테고리별 성과가 국면에 따라 갈리므로 같이 저장한다
  regime        text        not null check (regime in ('up', 'down')),
  spy_chg20     numeric,
  universe_size int         not null,
  scanned_count int         not null,
  -- 스캔 조건을 남겨야 나중에 결과를 비교할 수 있다
  min_dollar_vol numeric    not null,
  min_market_cap numeric    not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.screener_rows (
  id          bigserial primary key,
  snapshot_id bigint      not null references public.screener_snapshots(id) on delete cascade,
  symbol      text        not null,
  name        text,
  sector      text,
  market_cap  numeric,
  -- 순자금 비율(-100~+100): 상승일 거래대금 - 하락일 거래대금, 총액 대비
  f5          numeric,
  f20         numeric,
  f60         numeric,
  rvol        numeric,
  chg20       numeric,
  -- 5·20·60일 방향 일치 여부
  persistence text check (persistence in ('sustained', 'turning', 'onceoff', 'unknown')),
  unique (snapshot_id, symbol)
);

create index if not exists idx_rows_snapshot on public.screener_rows (snapshot_id);
create index if not exists idx_rows_f20      on public.screener_rows (snapshot_id, f20 desc);
create index if not exists idx_rows_symbol   on public.screener_rows (symbol, snapshot_id desc);
create index if not exists idx_snap_time     on public.screener_snapshots (scanned_at desc);

-- 최신 스냅샷을 편하게 읽기 위한 뷰
create or replace view public.screener_latest as
select r.*, s.scanned_at, s.regime, s.spy_chg20
from public.screener_rows r
join public.screener_snapshots s on s.id = r.snapshot_id
where s.id = (select id from public.screener_snapshots order by scanned_at desc limit 1);

-- ── RLS ──────────────────────────────────────────────────────────────
-- 앱은 anon 키로 읽기만 한다. 쓰기는 GitHub Actions가 service_role 키로 하며
-- service_role은 RLS를 우회하므로 별도 정책이 필요 없다.
alter table public.screener_snapshots enable row level security;
alter table public.screener_rows      enable row level security;

drop policy if exists "read snapshots" on public.screener_snapshots;
create policy "read snapshots" on public.screener_snapshots
  for select using (true);

drop policy if exists "read rows" on public.screener_rows;
create policy "read rows" on public.screener_rows
  for select using (true);

-- ── 보관 정책 ────────────────────────────────────────────────────────
-- 하루 1회 × 1,900행이면 한 달에 약 5.7만 행. 무료 티어로 충분하지만
-- 90일 지난 스냅샷은 정리한다 (cascade로 rows도 함께 삭제된다).
create or replace function public.prune_screener_snapshots()
returns void language sql as $$
  delete from public.screener_snapshots where scanned_at < now() - interval '90 days';
$$;
