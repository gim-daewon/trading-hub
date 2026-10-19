/**
 * AI 신용 모니터 — 확인된 사실 기록(손으로 적는다). **두 곳 이상에서 확인된 것만**, 출처를 같이.
 * 기획서(2026-08, 다른 AI 대화 압축)의 수치는 그대로 쓰지 않는다 — 2026-10-19 다시 확인했더니
 * 'NVIDIA OpenAI 보증 2,500억 달러'는 협상 단계 보도였고 공시 상한은 1,050억 달러, 'BofA Broadcom 하향·3,700억 달러'는 출처 하나뿐이었다(뺐다).
 * 새 사실을 넣을 때도 같은 기준. 최근 것이 위.
 */
export interface 사실 { 날짜: string; 무엇: string; 출처: { 이름: string; 주소: string }[] }

export const 확인된사실: 사실[] = [
  {
    날짜: '2026-10-15', 무엇: '오라클 5년 CDS 288bp 사상 최고(일주일 전 260bp) — S&P Global·LSEG 자료',
    출처: [
      { 이름: 'Securitas', 주소: 'https://www.securitasglobal.com/risk-perspectives/oracle-cds-record-288-basis-points-ai-debt/' },
      { 이름: 'GuruFocus', 주소: 'https://www.gurufocus.com/news/9124975/credit-default-swaps-surge-for-us-tech-firms-amid-ai-sector-strain-oracle-orcl-spreads-hit-record-high' },
    ],
  },
  {
    날짜: '2026-10-14', 무엇: '코어위브 채권 수익률 약 15%(2031년물 15.78%), 2032년물 액면가의 약 79% — 부실 영역',
    출처: [
      { 이름: 'CNBC', 주소: 'https://www.cnbc.com/2026/10/14/coreweave-stock-bond-yields-ai-debt.html' },
      { 이름: 'Forbes', 주소: 'https://www.forbes.com/sites/jimosman/2026/10/14/coreweave-bonds-are-warning-of-a-bigger-problem-for-ai-stocks/' },
    ],
  },
  {
    날짜: '2026-07-27', 무엇: 'NVIDIA 5년 CDS 82bp 사상 최고(ICE) — OpenAI 자금 보증 검토 보도 뒤',
    출처: [
      { 이름: 'Investing.com', 주소: 'https://www.investing.com/news/stock-market-news/nvidias-rising-cds-the-talk-of-wall-street-amid-circular-financing-fears-4816626' },
      { 이름: 'TNW', 주소: 'https://thenextweb.com/news/nvidia-announced-750bn-of-ai-deals-its-own-credit-market-flinched' },
    ],
  },
  {
    날짜: '2026-06', 무엇: 'Apollo·Blackstone, Broadcom 칩 금융(AI XPV)에 350억 달러 — 칩을 담보로 Anthropic에 임대, Broadcom이 대부분 보증',
    출처: [
      { 이름: 'Bloomberg', 주소: 'https://www.bloomberg.com/news/articles/2026-05-08/apollo-blackstone-weigh-35-billion-financing-for-broadcom' },
      { 이름: 'Yahoo Finance', 주소: 'https://finance.yahoo.com/sectors/technology/articles/apollo-blackstone-lend-35b-against-220610560.html' },
    ],
  },
]
