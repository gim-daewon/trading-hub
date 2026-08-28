import { NextResponse } from 'next/server'

const RATING_KO: Record<string, string> = {
  'Extreme Fear': '극단 공포',
  'Fear':         '공포',
  'Neutral':      '중립',
  'Greed':        '탐욕',
  'Extreme Greed':'극단 탐욕',
}

const CNN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.cnn.com/markets/fear-and-greed',
  'Origin': 'https://www.cnn.com',
}

// CNN이 'greed' / 'Greed' / 'extreme fear' 등 표기를 섞어 보낸다.
// 맵 키(Title Case)에 맞춰 정규화한 뒤 조회한다.
function toTitleCase(s: string): string {
  return s.trim().toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export async function GET() {
  try {
    const res = await fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      { headers: CNN_HEADERS, next: { revalidate: 300 } }
    )
    if (!res.ok) throw new Error(`CNN FGI ${res.status}`)

    const json = await res.json()
    const fgi  = json.fear_and_greed
    if (!fgi) throw new Error('no data')

    const score     = Math.round(fgi.score)
    const prevScore = Math.round(fgi.previous_close ?? fgi.score)
    const change    = score - prevScore

    return NextResponse.json({
      score,
      prevScore,
      change,
      rating:   fgi.rating ?? '',
      ratingKo: RATING_KO[toTitleCase(fgi.rating ?? '')] ?? fgi.rating ?? '',
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
