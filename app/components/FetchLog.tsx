'use client'
import { useEffect } from 'react'
import { installFetchLog } from '@/lib/fetch-log'

/** 최근 API 요청을 기록해 둔다. 화면이 죽었을 때 에러 화면이 그걸 보여준다 */
export default function FetchLog() {
  useEffect(() => { installFetchLog() }, [])
  return null
}
