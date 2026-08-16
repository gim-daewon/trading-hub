-- Trading Hub — Supabase 스키마
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행

-- ── 매매일지 ────────────────────────────────────────────────────────────
create table if not exists trades (
  id              uuid primary key default gen_random_uuid(),
  ticker          text not null,
  side            text not null check (side in ('buy', 'sell')),
  price           numeric(12, 4) not null,
  qty             numeric(12, 4) not null,
  date            date not null,
  type            text not null default 'other'
                    check (type in ('earnings', 'technical', 'momentum', 'news', 'hedge', 'other')),
  reason          text,
  note            text,
  linked_trade_id uuid references trades(id) on delete set null,
  created_at      timestamptz default now()
);

-- ── 포지션 (현재 보유 종목) ─────────────────────────────────────────────
create table if not exists positions (
  id         uuid primary key default gen_random_uuid(),
  ticker     text not null,
  side       text not null check (side in ('long', 'short')),
  qty        numeric(12, 4) not null,
  avg_price  numeric(12, 4) not null,
  opened_at  date not null,
  note       text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── AI 신용 리스크 수동 관측값 ──────────────────────────────────────────
create table if not exists observations (
  id          uuid primary key default gen_random_uuid(),
  metric_id   text not null,       -- 'ORCL_CDS_5Y', 'NVDA_CDS_5Y' 등
  value       numeric(12, 4) not null,
  ts          timestamptz not null default now(),
  source      text not null default 'manual' check (source in ('manual', 'auto')),
  citation    text,                -- 뉴스 URL
  note        text,
  supersedes  uuid references observations(id) on delete set null,
  created_at  timestamptz default now()
);

-- ── 리스크 이벤트 로그 ──────────────────────────────────────────────────
create table if not exists risk_events (
  id         uuid primary key default gen_random_uuid(),
  ts         timestamptz not null default now(),
  title      text not null,
  body       text,
  url        text,
  severity   text not null default 'info' check (severity in ('info', 'warn', 'critical')),
  affects    text[] default '{}',  -- metric_id 배열
  tickers    text[] default '{}',  -- ticker 배열
  created_at timestamptz default now()
);

-- ── 인덱스 ──────────────────────────────────────────────────────────────
create index if not exists trades_ticker_idx      on trades (ticker);
create index if not exists trades_date_idx        on trades (date desc);
create index if not exists positions_ticker_idx   on positions (ticker);
create index if not exists observations_metric_idx on observations (metric_id, ts desc);
create index if not exists risk_events_ts_idx     on risk_events (ts desc);

-- ── RLS (Row Level Security) ─────────────────────────────────────────────
-- 현재는 개인용이므로 anon 전체 허용. 나중에 auth 붙이면 변경.
alter table trades      enable row level security;
alter table positions   enable row level security;
alter table observations enable row level security;
alter table risk_events  enable row level security;

create policy "anon all trades"       on trades       for all to anon using (true) with check (true);
create policy "anon all positions"    on positions    for all to anon using (true) with check (true);
create policy "anon all observations" on observations for all to anon using (true) with check (true);
create policy "anon all risk_events"  on risk_events  for all to anon using (true) with check (true);
