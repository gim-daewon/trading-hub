import { NextResponse } from 'next/server'

const RATING_KO: Record<string, string> = {
  'Extreme Fear': '극단 공포',
  'Fear':         '공포',
  'Neutral':      '중립',
  'Greed':        '탐욕',
  'Extreme Greed':'극단 탐욕',
}

export async function GET() {
  try {
    const res = await fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } }
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
      ratingKo: RATING_KO[fgi.rating] ?? fgi.rating,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
