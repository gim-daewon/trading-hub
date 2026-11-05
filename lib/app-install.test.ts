/**
 * 홈 화면 '앱' 설치 조건 — 바로가기로만 추가되면 누를 때마다 브라우저에 새 탭이 쌓인다(2026-11-05 사용자 폰, 탭 83개).
 * 안드로이드는 SVG 아이콘 하나로는 앱 설치를 못 하고 바로가기로 넘어가는 일이 많아 PNG 192·512가 있어야 한다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const 루트 = new URL('../', import.meta.url)
const 크기 = (f: URL) => { const b = readFileSync(f); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` } // PNG 머리

test('manifest: standalone, PNG 192·512, maskable', () => {
  const m = JSON.parse(readFileSync(new URL('public/manifest.json', 루트), 'utf8'))
  assert.equal(m.display, 'standalone')
  assert.equal(m.start_url, '/')
  for (const 필요 of ['192x192', '512x512']) {
    const 아이콘 = m.icons.find((i: { sizes: string; type: string }) => i.sizes === 필요 && i.type === 'image/png')
    assert.ok(아이콘, `${필요} PNG 아이콘이 manifest에 없다`)
    assert.equal(크기(new URL('public' + 아이콘.src, 루트)), 필요)
  }
  assert.ok(m.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable')), 'maskable 아이콘이 없다')
})

test('서비스 워커가 있고 layout이 등록한다', () => {
  assert.ok(existsSync(new URL('public/sw.js', 루트)), 'public/sw.js가 없다')
  assert.match(readFileSync(new URL('app/layout.tsx', 루트), 'utf8'), /<InstallSW/)
})

test('Next 기본 세모 favicon.ico가 남아 있지 않다(app/icon.tsx를 쓴다)', () => {
  assert.equal(existsSync(new URL('app/favicon.ico', 루트)), false)
})
