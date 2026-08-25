/**
 * 검수 점수 신뢰도 검사 — 본체. (scripts/audit-checker.mjs 가 컴파일해서 부른다)
 *
 * 세 가지를 본다:
 *   ① **골든 글이 몇 점인가** — 기준을 다 맞춘 글이 실제로 높게 나오나
 *   ② **망가뜨리면 떨어지나** — 항목 하나씩 깨서 점수가 반응하는지. 안 떨어지면 그 항목은
 *      점수에 아무 일도 하지 않는 것이다 (있으나 마나)
 *   ③ **한 번도 안 걸리는 항목이 있나** — 모든 실험을 통틀어 한 번도 fail/warn 이 안 뜬
 *      항목은 「늘 통과」라 점수를 만들어줄 뿐이다
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const OUT = process.env.NBM_TEST_OUT

const { checkPost, PUBLISH_THRESHOLD, SPECS } = require(`${OUT}/writing/checker.js`)
const { GOLDEN_POSTS: GOLDEN } = await import('./golden.mjs')

const line = (s = '') => console.log(s)
const pct = (n) => `${n}점`

line('━━━ 검수 점수가 진짜인지 재본다 ━━━')
line(`발행선 ${PUBLISH_THRESHOLD}점 · 수정필요가 하나라도 있으면 79점에 묶인다`)
line()

/** 어떤 항목이 한 번이라도 걸렸는지 — ③번 확인용 */
const everFired = new Set()
const everSeen = new Set()
function score(input) {
  const r = checkPost(input)
  for (const i of r.items) {
    everSeen.add(i.id)
    if (i.level !== 'pass') everFired.add(i.id)
  }
  return r
}

// ── ① 골든 글 (기준을 다 맞춘 글)
line('① 기준을 다 맞춘 글은 몇 점인가')
const base = {}
for (const g of GOLDEN) {
  const r = score(g.input)
  base[g.input.type] = { input: g.input, score: r.score }
  const bad = r.items.filter((i) => i.level !== 'pass')
  line(`   ${g.label.padEnd(10)} ${pct(r.score)}  검사 ${r.items.length}개 · 걸린 것 ${bad.length}개`)
}
line()

/*
 * ── ② 망가뜨려 본다
 *
 * 정보글을 기준으로, 회원이 「이건 잡아야지」라고 생각할 만한 것들을 하나씩 깨뜨린다.
 * 점수가 안 움직이면 그 검사는 이름만 있는 것이다.
 */
line('② 하나씩 망가뜨렸을 때 점수가 반응하나 (정보글 기준)')
const info = base.info
const BREAKS = [
  {
    name: '본문을 절반으로 자름',
    fix: (p) => ({ ...p, body: p.body.slice(0, Math.floor(p.body.length / 2)) }),
  },
  {
    name: '메인 키워드를 전부 다른 말로',
    fix: (p) => ({
      ...p,
      title: p.title.split(p.mainKeyword).join('우리 센터'),
      body: p.body.split(p.mainKeyword).join('우리 센터'),
    }),
  },
  { name: '제목에서 키워드 뺌', fix: (p) => ({ ...p, title: p.title.split(p.mainKeyword).join('여기') }) },
  { name: '이미지 전부 제거', fix: (p) => ({ ...p, body: p.body.replace(/\[이미지:[^\]]*\]\n?/g, '') }) },
  { name: '소제목 전부 제거', fix: (p) => ({ ...p, body: p.body.replace(/^## .*$/gm, '') }) },
  { name: '태그 비움', fix: (p) => ({ ...p, tags: [] }) },
  {
    name: '위험 표현 넣음 (100% 보장)',
    fix: (p) => ({ ...p, body: `${p.body}\n\n한 달이면 100% 보장합니다. 부작용 없이 완치됩니다.` }),
  },
  {
    name: '정보글에 홍보 문구 넣음',
    fix: (p) => ({ ...p, body: `${p.body}\n\n지금 상담 예약하시면 3개월 9.9만원에 등록 가능합니다.` }),
  },
  {
    name: '문단을 한 덩어리로 (줄바꿈 제거)',
    fix: (p) => ({ ...p, body: p.body.replace(/\n{2,}/g, ' ') }),
  },
  {
    name: '같은 문장을 스무 번 반복 (내용 없이 길이만)',
    fix: (p) => ({ ...p, body: `${p.body}\n\n${'꾸준히 하시면 좋습니다. '.repeat(20)}` }),
  },
  {
    name: '본문 뒷부분을 통째로 복사해 붙임',
    fix: (p) => {
      const half = p.body.slice(Math.floor(p.body.length / 2))
      return { ...p, body: `${p.body}\n\n${half}` }
    },
  },
  {
    /*
     * **이건 안 떨어지는 것이 맞다.** 이 앱 실측(2026-08-06, 상위 글 161편)에서 숫자 밀도는
     * 1천자당 10개 이하가 4.91위, 35개 이상이 7.11위였다 — 숫자가 많을수록 순위가 나빴다.
     * 그러니 「숫자를 넣어라」를 점수로 강제하면 실측과 반대로 가는 규칙이 된다.
     * 대신 얼버무리는 부사(아래)는 잡는다 — 지시문이 이미 그걸 시키고 있다.
     */
    name: '구체 수치를 전부 지움 (일반론만 남김)',
    fix: (p) => ({ ...p, body: p.body.replace(/\d+/g, '몇') }),
    expected: 'same',
  },
  {
    name: '「많이·자주·대부분」으로 얼버무림',
    fix: (p) => ({
      ...p,
      body: `${p.body}\n\n많이 하시는 분들은 자주 오십니다. 대부분 꽤 만족하시고 종종 여러 번 오세요.`,
    }),
  },
  {
    name: '모든 문장 어미를 「~습니다」로 통일',
    fix: (p) => ({ ...p, body: p.body.replace(/(요|죠|네요|어요|세요)\./g, '습니다.') }),
  },
  {
    name: '본문을 한 문장만 남기고 지움 (극단)',
    fix: (p) => ({ ...p, body: '운동은 꾸준히 하는 것이 중요합니다.' }),
  },
]

let numb = 0
for (const b of BREAKS) {
  const r = score(b.fix(info.input))
  const drop = info.score - r.score
  const fails = r.items.filter((i) => i.level === 'fail').map((i) => i.id)
  const warns = r.items.filter((i) => i.level === 'warn').map((i) => i.id)
  const mark = drop > 0 ? '내려감' : b.expected === 'same' ? '그대로 (의도한 것)' : '그대로 ⚠'
  if (drop <= 0 && b.expected !== 'same') numb++
  line(
    `   ${b.name.padEnd(26)} ${pct(info.score)} → ${pct(r.score)} (${mark})` +
      (fails.length ? `\n       수정필요: ${fails.join(', ')}` : '') +
      (warns.length ? `\n       주의    : ${warns.join(', ')}` : '')
  )
}
line()

// ── ③ 한 번도 안 걸린 항목
line('③ 위 실험을 통틀어 한 번도 안 걸린 항목 (늘 통과 = 점수를 만들어줄 뿐)')
const never = [...everSeen].filter((id) => !everFired.has(id))
line(`   검사한 항목 ${everSeen.size}개 중 ${never.length}개`)
if (never.length) line(`   ${never.join(', ')}`)
line()

line('━━━ 요약 ━━━')
line(`반응하지 않은 망가뜨림: ${numb}/${BREAKS.length}건`)
line(`정보글 기준값: ${JSON.stringify(SPECS.info)}`)
