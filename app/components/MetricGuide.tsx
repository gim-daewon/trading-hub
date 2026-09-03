'use client'

// 지표 설명 공용 컴포넌트.
//
// 사용자 피드백: "ETF 레벨이라거나 퍼센트가 무슨 말인지 모르겠어".
// 섹터·스크리너·추천 화면이 전부 같은 지표(순자금·볼린저 %B)를 쓰면서
// 정의를 어디에도 안 적어놨다. 한 곳에 쓰고 세 화면이 같이 쓴다.

/**
 * 순자금 비율을 사람이 읽는 문장으로 바꾼다.
 *
 * f = (오른날 거래대금 − 내린날 거래대금) / 전체 × 100 이므로
 * 오른 날 비중은 (100 + f) / 2 다.
 * "+38%"보다 "거래대금 69%가 오른 날"이 훨씬 빨리 읽힌다.
 */
export function upShare(f: number | null): string {
  if (f == null) return ''
  return `거래대금 ${((100 + f) / 2).toFixed(0)}%가 오른 날`
}

/** %B를 위치 표현으로. 0=하단밴드, 0.5=중심선(20일선), 1=상단밴드 */
export function pctBLabel(v: number | null): string {
  if (v == null) return ''
  if (v <= 0)   return '하단밴드 아래'
  if (v <= 0.2) return '하단권 (눌림)'
  if (v < 0.45) return '중심선 아래'
  if (v <= 0.55) return '중심선 부근'
  if (v < 0.8)  return '중심선 위'
  if (v < 1)    return '상단권'
  return '상단밴드 위 (과열)'
}

interface Props {
  /** 어떤 지표를 설명할지. 화면마다 쓰는 게 다르다 */
  show?: ('flow' | 'pctB' | 'rvol')[]
}

export default function MetricGuide({ show = ['flow', 'pctB'] }: Props) {
  return (
    <details style={{ marginBottom: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--info)', minHeight: 24 }}>
        지표가 무슨 뜻인가?
      </summary>
      <div style={{
        marginTop: 6, padding: '10px 12px', borderRadius: 8,
        background: 'var(--bg-base)', border: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        {show.includes('flow') && (
          <>
            <b style={{ color: 'var(--text-secondary)' }}>순자금 (5·20·60일)</b>
            <br />
            그 기간의 거래대금을 <b>오른 날</b>과 <b>내린 날</b>로 나눠 비교한 값이다.
            <br />
            <span className="num">(오른 날 − 내린 날) ÷ 전체 × 100</span>
            <br />
            <b>+38%</b>면 거래대금의 <b>69%가 오른 날</b>에 발생했다는 뜻이다.
            0%면 반반, −38%면 69%가 내린 날에 몰렸다.
            <br />
            <span style={{ color: 'var(--warn)' }}>
              순매수가 아니다. 거래대금은 매수·매도가 이미 상쇄된 총량이라 누가 샀는지는
              알 수 없다. 미국은 기관 순매수를 실시간 공개하지 않아(13F 분기 지연)
              이게 무료로 얻을 수 있는 <b>대리지표</b>다.
            </span>
          </>
        )}

        {show.includes('pctB') && (
          <>
            <br /><br />
            <b style={{ color: 'var(--text-secondary)' }}>볼린저 %B (20일, 2σ)</b>
            <br />
            가격이 볼린저 밴드 안 어디에 있는지를 0~1로 나타낸다.
            <br />
            <span className="num">0 = 하단밴드 · 0.5 = 20일선 · 1 = 상단밴드</span>
            <br />
            0보다 작으면 하단밴드 아래로 밀린 것이고, 1보다 크면 상단밴드를 뚫은 것이다.
            눌림목 조건인 <b>%B ≤ 0.2</b>는 하단권까지 밀린 상태를 뜻한다.
            <br />
            트레이딩뷰 기본 설정(20, 2, 모집단 표준편차)과 같은 값이다.
          </>
        )}

        {show.includes('rvol') && (
          <>
            <br /><br />
            <b style={{ color: 'var(--text-secondary)' }}>RVOL</b>
            <br />
            당일 거래대금 ÷ 20일 평균 거래대금. <b>2.0</b>이면 평소의 두 배로 거래됐다는 뜻이다.
          </>
        )}
      </div>
    </details>
  )
}
