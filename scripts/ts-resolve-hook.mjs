// 확장자 없는 상대 import를 Node의 TS 로더가 해석하게 한다.
//
// 앱 코드는 Next 관례대로 `from './markets'` 로 쓴다. Node 24의 네이티브 TS
// 실행은 확장자를 요구하므로, 스크립트에서만 이 훅을 붙인다.
// 앱 코드를 Node에 맞춰 고치면 Next 쪽이 어색해진다 — 경계를 여기서 흡수한다.
//
//   node --import ./scripts/ts-resolve-hook.mjs scripts/scan.mjs
import { register } from 'node:module'
register('./ts-resolve-impl.mjs', import.meta.url)
