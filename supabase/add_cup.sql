-- 컵 패턴(참고 영상 전략) 지금 상태 칸 — '컵 패턴' 메뉴(/pattern)가 읽는다. 2026-11-03.
--
-- lib/cup-fib.ts의 cupFibNow 결과를 그대로 담는다:
--   {"stage":"entry"|"watch","entry":..,"stop":..,"target":..,"rim":..,"bottom":..,"ago":..,"touched":..,"rr":..}
-- 패턴이 없는 종목은 null이다(대부분).
--
-- 기존 행은 null로 남는다. 다음 스캔부터 채워진다.
-- 이 칸이 없어도 스캔은 실패하지 않는다 — 스캔이 먼저 칸이 있는지 보고, 없으면 빼고 저장한다.
alter table screener_rows add column if not exists cup jsonb;
