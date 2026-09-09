-- 한국·암호화폐 시장 추가.
--
-- 실행: Supabase 대시보드 → SQL Editor에 전체를 붙여넣고 Run
-- 여러 번 실행해도 안전하다 (IF NOT EXISTS).
--
-- ── 왜 market 컬럼인가 ──────────────────────────────────────────────────
-- 시장마다 테이블을 나누지 않는다. 같은 지표·같은 신호 정의를 쓰고
-- 성과 추적도 같은 코드로 하므로, 테이블이 셋이면 모든 조회가 셋으로 갈라진다.
-- 컬럼 하나로 나누고 인덱스를 (market, scanned_at)으로 둔다.
--
-- 기본값을 'us'로 두는 이유: 기존 스냅샷이 전부 미국이다.
-- 이 마이그레이션 후에도 과거 데이터가 그대로 미국으로 읽힌다.

alter table public.screener_snapshots
  add column if not exists market text not null default 'us';

alter table public.screener_snapshots
  drop constraint if exists screener_snapshots_market_check;
alter table public.screener_snapshots
  add constraint screener_snapshots_market_check
  check (market in ('us', 'kr', 'crypto'));

-- 시장별 최신 스냅샷을 뽑는 게 가장 잦은 조회다
create index if not exists idx_snap_market_time
  on public.screener_snapshots (market, scanned_at desc);

-- ── 행에 추가되는 값 ────────────────────────────────────────────────────
--
--   display     화면에 쓰는 짧은 이름. BTCUSDT -> BTC, 005930.KS -> 005930
--               symbol은 봉 조회 키라 시장마다 형식이 달라 그대로 못 쓴다
--   dollar_vol  일 거래대금. 한국은 원, 미국·크립토는 USD.
--               한국은 거래대금 중앙값이 8,800만원이라 유동성 경고에 쓴다
--   cap_known   시총을 실제로 알아냈나. 크립토 555개 중 23개가 false다
--               (FTT 같은 사실상 죽은 코인, AMDB·CRCLB 같은 토큰화 주식).
--               false를 초소형으로 단정하면 '모르는 걸 작다고' 말하는 셈이다
--   premium     김치 프리미엄(%). 바이낸스·업비트 동시상장 코인만 (실측 189개)
--   bar_source  봉을 어디서 받았나. 같은 코인을 다른 거래소에서 받으면
--               거래량 기준이 달라지므로 기록해둔다

alter table public.screener_rows
  add column if not exists display    text;
alter table public.screener_rows
  add column if not exists dollar_vol numeric;
alter table public.screener_rows
  add column if not exists cap_known  boolean not null default true;
alter table public.screener_rows
  add column if not exists premium    numeric;
alter table public.screener_rows
  add column if not exists bar_source text;

-- ── 크립토 시총 캐시 ────────────────────────────────────────────────────
--
-- 코인게코 무료 티어 레이트리밋 때문에 시총 수집이 실측 123초 걸린다.
-- 1천억/1조 같은 구간 경계가 하루 만에 바뀔 값이 아니므로 주 1회만 갱신한다.
--
-- 심볼을 키로 쓴다. 심볼 충돌(같은 티커의 다른 코인)은 시총이 큰 쪽을
-- 남기는 규칙으로 이미 정리해서 넣는다.

create table if not exists public.crypto_market_caps (
  symbol     text        primary key,
  name       text,
  market_cap numeric     not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_caps_updated
  on public.crypto_market_caps (updated_at desc);

-- ── 보관 기간 정리 ──────────────────────────────────────────────────────
--
-- 스냅샷당 행이 약 2,100개에서 5,900개로 늘어난다 (미국 2,783 + 한국 2,555
-- + 크립토 555). 무료 티어가 500MB라 정리 없이는 몇 달 안에 찬다.
--
-- 성과 추적은 최근 90거래일만 본다(/api/tracking의 limit=90).
-- 그보다 오래된 스냅샷은 지운다. 행은 on delete cascade로 같이 지워진다.
--
-- 시장별로 세는 것이 중요하다 — 전체에서 최근 90개를 남기면
-- 스캔 빈도가 높은 시장이 낮은 시장의 이력을 밀어낸다.

create or replace function public.prune_snapshots(keep_per_market int default 120)
returns table (mkt text, n_deleted bigint)
language plpgsql
as $$
begin
  -- OUT 파라미터 이름을 market이 아니라 mkt로 둔다.
  -- plpgsql은 OUT 파라미터와 같은 이름의 컬럼 참조를 모호하다고 거부한다.
  return query
  with ranked as (
    select s.id, s.market as m,
           row_number() over (partition by s.market order by s.scanned_at desc) as rn
      from public.screener_snapshots s
  ),
  gone as (
    delete from public.screener_snapshots s
     using ranked r
     where s.id = r.id and r.rn > keep_per_market
    returning s.market as m
  )
  select g.m, count(*) from gone g group by g.m;
end;
$$;

comment on function public.prune_snapshots is
  '시장별로 최근 N개 스냅샷만 남기고 삭제한다. 스캔 워크플로 끝에서 호출한다.';

-- ── 기존 뷰 갱신 ────────────────────────────────────────────────────────
--
-- 앱은 이 뷰를 쓰지 않는다 (대시보드에서 직접 조회할 때만 쓴다).
-- 그래도 시장을 구분하지 않으면 세 시장이 섞여 나오므로 같이 고친다.
--
-- create or replace가 아니라 drop 후 create인 이유:
-- r.* 에 새 컬럼(display·dollar_vol 등)이 끼면서 뷰의 컬럼 순서가 바뀐다.
-- replace는 컬럼 이름·순서 변경을 거부한다.

drop view if exists public.screener_latest;

create view public.screener_latest as
select r.*, s.scanned_at, s.regime, s.spy_chg20, s.market
  from public.screener_rows r
  join public.screener_snapshots s on s.id = r.snapshot_id
 where s.id = (
   select s2.id from public.screener_snapshots s2
    where s2.market = s.market
    order by s2.scanned_at desc
    limit 1
 );

-- ── 손절·익절가 계산용 (2026-09-09 추가) ────────────────────────────────
--
--   high    당일 고가. 성과 추적에서 익절 도달을 판정한다.
--           없으면 손절은 저가로(정확) 익절은 종가로(보수적) 재게 되어
--           결과가 손실 쪽으로 치우친다.
--   atr14   ATR(14) = 갭 포함 평상시 하루 진폭.
--           손절폭을 종목 진폭에 비례해 잡는다. 실측으로 고정 -3%보다
--           ATR 2.0/6.0이 미국 +0.150R vs +0.099R, 한국(거래대금 10억원+)
--           +0.163R vs +0.055R로 확실히 나았다.

alter table public.screener_rows add column if not exists high  numeric;
alter table public.screener_rows add column if not exists atr14 numeric;
