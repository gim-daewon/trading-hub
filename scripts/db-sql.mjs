// supabase/*.sql 파일을 운영 DB에 실행한다(2026-11-03 사용자 "SQL은 너가 직접 해").
// 접속 주소는 .env.local의 SUPABASE_DB_URL(비밀번호 포함)에서만 읽고, 화면에는 절대 찍지 않는다.
// 오류 문구에도 주소가 섞일 수 있어 가려서 출력한다(메모리 errors-carry-secrets).
//
// 사용: node --env-file=.env.local scripts/db-sql.mjs supabase/add_paper.sql [다른.sql ...]
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const url = (process.env.SUPABASE_DB_URL || '').trim()
if (!url) { console.error('SUPABASE_DB_URL이 없다 — .env.local에 넣을 것(값은 대화에 붙이지 않는다)'); process.exit(1) }
const files = process.argv.slice(2)
if (!files.length) { console.error('실행할 .sql 파일을 적을 것'); process.exit(1) }

const hide = s => String(s).split(url).join('[DB 주소]').replace(/postgres(ql)?:\/\/[^\s'"]+/g, '[DB 주소]')
const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => {} })
let failed = 0
try {
  for (const f of files) {
    try {
      await sql.unsafe(readFileSync(f, 'utf8'))
      console.log(`실행함: ${f}`)
    } catch (e) {
      failed++
      console.error(`실패: ${f} — ${hide(e.code ?? '')} ${hide(e.message ?? e)}`)
    }
  }
} finally {
  await sql.end({ timeout: 5 })
}
process.exit(failed ? 1 : 0)
