/**
 * 스킬의 지점 정보를 **앱 데이터에서 만든다.**
 *
 * 회원 지적 (2026-08-11): "블로그 스킬에 앱 지점정보도 업데이트해서 스킬 다시 업그레이드
 * 해주면 문제 없는 거 아니야?" 맞는 말이다 — 스킬은 `references/stores.md` 를 읽고 앱은
 * 저장된 지점 정보를 읽으니, 두 곳이 어긋나면 채팅으로 쓴 글과 앱으로 쓴 글의 사실이
 * 달라진다.
 *
 * **손으로 맞추면 또 어긋난다.** 그래서 한 줄 명령으로 다시 만든다:
 *
 *     npm run skills:stores
 *
 * 앱 저장소(`lib/store.ts`)를 그대로 읽으므로, Upstash 가 설정된 환경에서 돌리면 **회원이
 * 앱에서 고친 실제 값**이 들어간다. 설정이 없으면 씨앗 데이터(`lib/seed/stores.ts`)를 쓴다 —
 * 어느 쪽을 읽었는지 실행할 때 화면에 밝힌다 (모르는 것을 아는 것처럼 만들지 않는다).
 *
 * 사람이 쓴 머리말(여성전용 축약 규칙 등)은 **건드리지 않는다.** 지점 블록만 갈아 끼운다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { compileLib } from './complib.mjs'

const ROOT = process.cwd()
const SKILLS = ['gym-blog-writer', 'gym-info-writer', 'gym-review-writer']
/** 이 표시 아래를 통째로 다시 만든다 */
const MARK = '<!-- 아래는 `npm run skills:stores` 가 앱 지점 정보에서 자동으로 만든다. 손으로 고치지 말 것 -->'

function bullet(list) {
  return (list ?? []).filter(Boolean).map((f) => `  - ${f}`).join('\n')
}

function numbered(list) {
  return (list ?? []).filter(Boolean).map((f, i) => `  ${i + 1}. ${f}`).join('\n')
}

/** 지점 하나를 스킬이 읽는 모양으로 */
function block(s) {
  const lines = [`## ${s.name}`, `- 정식 상호명: **${s.legalName || s.name}**`]
  lines.push(
    s.womenOnly
      ? '- **여성전용 지점** — 남성 대상 표현을 쓰지 않는다. 여성전용이라는 사실이 이 지점의 최대 강점이다.'
      : '- **남녀공용 (일반 헬스장)** — 여성전용 지점(착한헬스)의 표현·앵글을 그대로 가져오지 말 것.'
  )
  if (s.localKeywords?.length) {
    lines.push(
      `- 지역 키워드: ${s.localKeywords.join(', ')}`,
      `  (제목·본문 메인 키워드는 이 중 글의 초점에 맞는 것을 고른다. 기본은 "${s.localKeywords[0]}".)`
    )
  }
  if (s.location) lines.push(`- 위치: ${s.location}`)
  if (s.features?.length) lines.push('- 시설 특징:', bullet(s.features))
  lines.push(`- 24시간 운영: ${s.open24 ? '예' : '아니오'}`)
  if (s.strengths?.length) lines.push('- 고유 강점:', numbered(s.strengths))
  lines.push('- 트레이너: (미제공 — 지어내지 말 것)')
  const how = [s.phone ? `전화 ${s.phone}` : '', s.reserveUrl ? `예약 링크 ${s.reserveUrl}` : '']
    .filter(Boolean)
    .join(' / ')
  lines.push(`- 상담예약 방법: ${how || '(미제공 — 지어내지 말 것)'}`)
  if (s.blogUrl) lines.push(`- 블로그: ${s.blogUrl}`)
  if (s.placeId) lines.push(`- 플레이스 아이디: ${s.placeId}`)
  if (s.memo) lines.push(`- 메모: ${s.memo}`)
  return lines.join('\n')
}

async function main() {
  const compiled = compileLib(['lib/store.ts', 'lib/seed/stores.ts'], 'nbm-skills-')
  const require = createRequire(import.meta.url)
  const { readDB } = require(`${join(compiled.outDir, 'lib')}/store.js`)
  const db = await readDB()
  compiled.cleanup()

  /*
   * 어느 데이터를 읽었는지 밝힌다. 씨앗을 읽었는데 「앱 값으로 맞췄다」고 말하면
   * 회원이 앱에서 고친 내용이 반영된 줄 알게 된다.
   */
  const live = Boolean(
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_URL
  )
  const where = live ? '앱 저장소(Upstash)' : existsSync(join(ROOT, 'data/db.json')) ? '로컬 data/db.json' : '씨앗 데이터(lib/seed/stores.ts)'
  console.log(`지점 ${db.stores.length}곳을 ${where} 에서 읽었습니다.`)
  if (!live) {
    console.log(
      '  ⚠ 앱(Vercel)에서 고친 지점 정보를 넣으려면 Upstash 환경변수가 있는 곳에서 돌려야 합니다.'
    )
  }

  const body = [
    MARK,
    `<!-- 만든 시각 기준 지점 ${db.stores.length}곳 · 출처: ${where} -->`,
    '',
    db.stores.map(block).join('\n---\n\n'),
    '',
  ].join('\n')

  for (const name of SKILLS) {
    const path = join(ROOT, 'docs/skills', name, 'references/stores.md')
    if (!existsSync(path)) {
      console.log(`  – ${name}: references/stores.md 가 없어 건너뜁니다`)
      continue
    }
    const old = readFileSync(path, 'utf8')
    const head = old.includes(MARK) ? old.slice(0, old.indexOf(MARK)) : headOf(old)
    writeFileSync(path, `${head.trimEnd()}\n\n${body}`)
    console.log(`  ✅ ${name}/references/stores.md`)
  }
  console.log('\n계정 쪽 스킬에도 반영하려면: cp -r docs/skills/<이름> ~/.claude/skills/')
}

/**
 * 표시가 없는 옛 파일에서 **사람이 쓴 머리말만** 남긴다.
 * 첫 `## ` 지점 블록 앞까지가 머리말이다.
 */
function headOf(text) {
  const at = text.search(/^## /m)
  return at === -1 ? text : text.slice(0, at)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
