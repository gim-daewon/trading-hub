import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        background: '#0a0e1a',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        gap: 14, paddingBottom: 46,
      }}>
        <div style={{ width: 22, height: 44, background: '#ef4444' }} />
        <div style={{ width: 22, height: 88, background: '#22c55e' }} />
        <div style={{ width: 22, height: 64, background: '#22c55e' }} />
      </div>
    ),
    size
  )
}
