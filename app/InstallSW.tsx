'use client'
import { useEffect } from 'react'

// 서비스 워커 등록(public/sw.js) — 홈 화면 앱 설치 조건. 실패해도 화면은 그대로 돌아가니 기록만 남긴다
export default function InstallSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('서비스 워커 등록 실패', e))
  }, [])
  return null
}
