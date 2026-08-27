import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        background: '#0a0e1a',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        gap: 3, paddingBottom: 7,
      }}>
        <div style={{ width: 5, height: 10, background: '#ef4444' }} />
        <div style={{ width: 5, height: 17, background: '#22c55e' }} />
      </div>
    ),
    size
  )
}
