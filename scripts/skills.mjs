/**
 * 스킬의 지점 정보를 **앱 데이터에서 만든다**, 그리고 **한 파일로 묶는다.**
 *
 *     npm run skills:stores    지점 정보를 앱 데이터에서 다시 만든다
 *     npm run skills:bundle    스킬을 계정에 붙여넣을 수 있는 한 파일로 묶는다
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
  /*
   * 트레이너는 있으면 그대로, 없으면 「미제공」이라고 밝힌다 (2026-08-19).
   * 앞 판은 무조건 「미제공」으로 찍고 있어서, 앱에 트레이너를 넣어도 스킬은 계속 없다고 했다.
   */
  if (s.trainers?.length) {
    lines.push('- 트레이너:', bullet(s.trainers))
    lines.push(
      '  (트레이너별로 상담·무료체험 신청을 받을 수 있으면 「트레이너가 안 맞을까봐」 걱정에 그 사실로 답한다 — 지정해서 먼저 만나볼 수 있다는 것이 답이다. 여기 없는 이름·경력·자격은 지어내지 않는다.)'
    )
  } else {
    lines.push('- 트레이너: (미제공 — 지어내지 말 것)')
  }
  const how = [s.phone ? `전화 ${s.phone}` : '', s.reserveUrl ? `예약 링크 ${s.reserveUrl}` : '']
    .filter(Boolean)
    .join(' / ')
  lines.push(`- 상담예약 방법: ${how || '(미제공 — 지어내지 말 것)'}`)
  if (s.blogUrl) lines.push(`- 블로그: ${s.blogUrl}`)
  if (s.placeId) lines.push(`- 플레이스 아이디: ${s.placeId}`)
  if (s.memo) lines.push(`- 메모: ${s.memo}`)
  return lines.join('\n')
}

/* ─────────────────────── 한 파일로 묶기 (skills:bundle) ─────────────────────── */

/**
 * 스킬은 폴더(SKILL.md + references/)다. 계정 화면에 **붙여넣으려면** 한 덩어리여야
 * 하므로 참고 파일을 부록으로 이어 붙이고, 본문의 `references/…` 언급을 부록 이름으로
 * 바꾼다. 바꾸지 않으면 스킬이 없는 파일을 읽으려 한다.
 */
const REF_TITLE = {
  'stores.md': '지점 정보',
  'naver-seo.md': '네이버 검색 기준',
  'safe-expressions.md': '위험 표현 치환',
  'post-log.md': '발행 기록',
  'info-topics.md': '정보글 주제',
  'image-prompts.md': '이미지 프롬프트',
}
/** 부록 순서 — 글 쓸 때 읽는 순서대로 */
const REF_ORDER = ['stores.md', 'safe-expressions.md', 'post-log.md', 'info-topics.md', 'image-prompts.md', 'naver-seo.md']
const LETTERS = 'ABCDEFGH'

/** 참고 파일의 제목 단계를 부록 아래로 내린다. 코드블록 안의 `#` 는 건드리지 않는다. */
function demote(text) {
  let fence = false
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) fence = !fence
      if (fence) return line
      return line.replace(/^(#{1,4}) /, (_, h) => `${'#'.repeat(Math.min(h.length + 2, 6))} `)
    })
    .join('\n')
}

function bundle(dir) {
  const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  const refDir = join(dir, 'references')
  const files = existsSync(refDir) ? readdirSync(refDir).filter((f) => f.endsWith('.md')) : []
  const ordered = [
    ...REF_ORDER.filter((f) => files.includes(f)),
    ...files.filter((f) => !REF_ORDER.includes(f)).sort(),
  ]
  const label = new Map(ordered.map((f, i) => [f, `부록 ${LETTERS[i]}`]))
  const title = new Map(ordered.map((f) => [f, REF_TITLE[f] ?? f.replace(/\.md$/, '')]))

  /*
   * 본문의 파일 경로 언급 → 부록 이름. 굵게 감싸지 않는다 — 원문이 이미 `**…를 읽고**`
   * 처럼 굵은 문장 안에서 파일을 부르는 곳이 있어, 안에 또 `**` 를 넣으면 표기가 깨진다.
   * 이미 괄호 안에 있는 경우는 제목을 빼서 `(부록 A(지점 정보))` 같은 겹괄호를 막는다.
   */
  let body = raw
  for (const [file, name] of label) {
    const full = `${name}(${title.get(file)})`
    body = body
      .replaceAll('(`references/' + file + '`)', `(${name})`)
      .replaceAll('(references/' + file + ')', `(${name})`)
      .replaceAll('`references/' + file + '`', full)
      .replaceAll('references/' + file, full)
  }
  /* 「부록 D(네이버 검색 기준)(C-Rank…)」 처럼 괄호가 잇달아 붙으면 제목을 뺀다 */
  body = body.replace(/(부록 [A-H])\([^)]*\)(?=\()/g, '$1')

  const left = body.match(/references\/[\w-]+\.md/g)
  if (left) throw new Error(`부록으로 못 바꾼 언급이 남았다: ${[...new Set(left)].join(', ')}`)

  const parts = [
    body.trimEnd(),
    '',
    '---',
    '',
    '# 부록 (원래 `references/` 파일들 — 이 스킬은 한 파일로 묶여 있다)',
    '',
    '아래 부록은 별도 파일이 아니라 이 문서 안에 있다. 「부록 A 를 읽어」라는 지시는 이 문서의 해당 절을 읽으라는 뜻이다.',
  ]
  for (const [file, name] of label) {
    parts.push(
      '',
      '---',
      '',
      `## ${name} — ${title.get(file)}`,
      '',
      demote(readFileSync(join(refDir, file), 'utf8')).trim()
    )
  }
  return `${parts.join('\n')}\n`
}

function bundleAll(outDir) {
  mkdirSync(outDir, { recursive: true })
  for (const name of SKILLS) {
    const dir = join(ROOT, 'docs/skills', name)
    if (!existsSync(join(dir, 'SKILL.md'))) {
      console.log(`  – ${name}: SKILL.md 가 없어 건너뜁니다`)
      continue
    }
    const text = bundle(dir)
    const out = join(outDir, `${name}.md`)
    writeFileSync(out, text)
    console.log(`  ✅ ${out} (${text.length.toLocaleString()}자)`)
  }
  console.log('\n한 파일이므로 계정 스킬 화면에 그대로 붙여넣을 수 있습니다.')
}

/* ─────────────────────────── 지점 정보 다시 만들기 ─────────────────────────── */

/**
 * 배포된 앱에서 지점 정보를 그대로 받아온다.
 *
 * **이게 없으면 실제로 어긋난다.** 2026-08-12 실측 — 씨앗에는 성정점이
 * 「여성전용 착한헬스 성정점」인데 앱에는 「성정동 착한 헬스장」이었다. 회원이 앱 화면에서
 * 고친 값이고, 스킬은 옛 이름을 들고 있었다. Upstash 환경변수가 없는 곳에서도 맞출 수 있는
 * 길이 필요하다 — 앱의 `/api/stores` 가 같은 저장소를 읽어 주므로 그걸 쓴다.
 */
async function fetchStores(url) {
  const base = url.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/stores`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${base}/api/stores → HTTP ${res.status}`)
  const json = await res.json()
  const stores = Array.isArray(json) ? json : json.stores
  if (!Array.isArray(stores) || !stores.length) throw new Error('지점이 하나도 안 왔습니다')
  return stores
}

function argOf(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

async function main() {
  if (process.argv[2] === 'bundle') {
    const out = process.argv.slice(3).find((a) => !a.startsWith('--'))
    bundleAll(out ? resolve(ROOT, out) : join(ROOT, 'docs/skills/bundled'))
    return
  }

  const url = argOf('url')
  let stores
  let where
  if (url) {
    stores = await fetchStores(url)
    where = `배포된 앱(${url})`
  } else {
    const compiled = compileLib(['lib/store.ts', 'lib/seed/stores.ts'], 'nbm-skills-')
    const require = createRequire(import.meta.url)
    const { readDB } = require(`${join(compiled.outDir, 'lib')}/store.js`)
    stores = (await readDB()).stores
    compiled.cleanup()
    const live = Boolean(
      process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_URL
    )
    where = live
      ? '앱 저장소(Upstash)'
      : existsSync(join(ROOT, 'data/db.json'))
        ? '로컬 data/db.json'
        : '씨앗 데이터(lib/seed/stores.ts)'
    if (!live) {
      console.log(
        '  ⚠ 씨앗 데이터를 읽었습니다. 앱에서 고친 값을 넣으려면:\n' +
          '     npm run skills:stores -- --url=https://<앱주소>'
      )
    }
  }
  const db = { stores }

  /*
   * 어느 데이터를 읽었는지 밝힌다. 씨앗을 읽었는데 「앱 값으로 맞췄다」고 말하면
   * 회원이 앱에서 고친 내용이 반영된 줄 알게 된다.
   */
  console.log(`지점 ${db.stores.length}곳을 ${where} 에서 읽었습니다.`)

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
