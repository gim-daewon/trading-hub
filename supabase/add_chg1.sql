-- 전일 대비 등락률(chg1) 컬럼.
--
-- '낙폭 반등 > 1일 낙폭' 탭이 쓴다. 지금까지 저장한 건 20일 등락(chg20)뿐이라
-- "어제보다 얼마나 빠졌나"를 알 수 없었다.
--
-- 기존 행은 null로 남는다 (과거 스냅샷은 되채울 방법이 없다).
-- 다음 스캔부터 채워지고, 그때부터 그 탭에 목록이 뜬다.
alter table screener_rows add column if not exists chg1 double precision;
