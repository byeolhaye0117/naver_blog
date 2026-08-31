// lib/ 검수 로직 테스트. `npm test` 로 실행된다 (scripts/test.mjs 가 먼저 컴파일).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const OUT = process.env.NBM_TEST_OUT
if (!OUT) {
  console.error('직접 실행하지 말고 `npm test` 를 쓰세요.')
  process.exit(1)
}
const { checkPost, parseBody, summarize, PUBLISH_THRESHOLD, SPECS, reachableKeywordRange, findLatinWords, LATIN_ALLOWED } = require(`${OUT}/writing/checker.js`)
const { scanRisks, countLoose } = require(`${OUT}/writing/banned.js`)
const { buildTemplate, stripGuides } = require(`${OUT}/writing/templates.js`)
const { buildCopyPackage, keyPointsOf, toBlocks, blocksToText, blocksToHtml, mobileGroups, clauseLines, normalizeTag, stripBold, LINE_MIN, LINE_MAX, TAG_MAX_LEN } = require(`${OUT}/writing/export.js`)
const { parsePastedReviews, analyzeReviews, placeReviewUrl, verifyReviewQuotes } = require(`${OUT}/analysis/reviews.js`)
const { analyzeSerp, analyzePastedSerp } = require(`${OUT}/analysis/serp.js`)
const { parsePastedSerp, parseEditedList, parseTotalCount, toEditableText, parsePlaceList } = require(
  `${OUT}/analysis/paste.js`
)
const { parseManualRows, buildManualMetrics, buildMetric, areasFromStore, suffixesForStore, combineLocalKeywords, isRelevantKeyword, myRegionTokens, INTENT_SUFFIXES } = require(`${OUT}/analysis/keyword.js`)
const { parseSectionTotal, parseSectionPosts, monthlyFromWeek, resolveRecent, SECTION_CAP, normalizeBlogUrl, SECTION_PAGE_SIZE, isTrivialQuery, TRIVIAL_QUERY_MAX } = require(
  `${OUT}/naver/blogsection.js`
)
const { parsePlaceRecords, areasFromPlace, findMyPlaceIndex, extractPlaceId } = require(`${OUT}/naver/place.js`)
const { mockBlogSearch, mockBlogTotal } = require(`${OUT}/naver/search.js`)
const { mockKeywordTool, dedupeAdRows, toRate } = require(`${OUT}/naver/searchad.js`)
const { gradeKeyword, adNoteFor, adPressureOf, ctrNote, keywordVerdict, PLACE_ABOVE_BLOG, AD_HEAVY, AD_SOME } = require(`${OUT}/analysis/keyword.js`)
const { phaseOf, buildRankViews, autoRankTargets } = require(`${OUT}/analysis/rank.js`)
const { isPartialMonth, completedMonths, momentumOf } = require(`${OUT}/naver/datalab.js`)
const { prescriptionKey, upsertPrescription, findPrescription, prescriptionAgeDays, isPrescriptionStale } = require(
  `${OUT}/analysis/prescription.js`
)
import { GOLDEN_POSTS } from './golden.mjs'
let fails = 0
const ok = (cond, label, extra = '') => {
  if (!cond) fails++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
}

// ─────────────────────────────────────────────────────────────
console.log('\n[1] 본문 파싱')
const body1 = `[이미지: 대표]
후킹 문단입니다.

[이미지: 공감]
## 첫 소제목
내용입니다.

## 이미지 없는 소제목
내용.
`
const p1 = parseBody(body1)
ok(p1.images.length === 2, '이미지 2장 인식', `${p1.images.length}`)
ok(p1.headings.length === 2, '소제목 2개 인식', `${p1.headings.length}`)
ok(p1.headingsWithImageAbove === 1, '위에 이미지 있는 소제목 1개', `${p1.headingsWithImageAbove}`)
ok(!p1.prose.includes('[이미지'), '산문에서 이미지 지시문 제외')
ok(p1.intro.includes('후킹'), '도입부 추출')

// ─────────────────────────────────────────────────────────────
console.log('\n[2] 공백 무시 키워드 카운트')
ok(countLoose('쌍용동 헬스장 그리고 쌍용동헬스장', '쌍용동 헬스장') === 2, '띄어쓰기 달라도 같이 셈')
ok(countLoose('헬스장', '쌍용동 헬스장') === 0, '없으면 0')

// ─────────────────────────────────────────────────────────────
console.log('\n[3] 위험 표현 스캔')
const r1 = scanRisks('저희는 최고의 시설을 갖췄고 한 달 5kg 감량 보장합니다. 통증 치료도 해드려요.')
const cats = new Set(r1.map((r) => r.category))
ok(cats.has('A. 최상급·단정'), 'A 최상급 탐지')
ok(cats.has('B. 효과 보장'), 'B 효과보장 탐지')
ok(cats.has('C. 의료·치료성'), 'C 의료 탐지')

const r2 = scanRisks('저희는 최.고.의 시설입니다')
ok(r2.some((r) => r.category === 'E. 절대 금지'), '변칙 표기(최.고.의) 탐지', r2.map(r=>r.term).join(','))

const r3 = scanRisks('할ㅇl인 이벤트')
ok(r3.some((r) => r.fix.includes('자모')), '자모 분리 탐지')

const r4 = scanRisks('꾸준히 나오신 분들의 변화를 함께 기록해드립니다. 자세와 움직임을 함께 봐드립니다.')
ok(r4.length === 0, '안전한 문장은 0건', `${r4.length}건: ${r4.map(x=>x.term).join(',')}`)

// ─────────────────────────────────────────────────────────────
console.log('\n[4] 실제 홍보글 검수 (규칙을 지킨 글)')
const goodPromo = {
  type: 'promo',
  title: '쌍용동 헬스장 3개월 9.9만원, 새벽에도 갈 수 있을까?',
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시헬스장'],
  legalName: 'MTO 피트니스 쌍용점',
  womenOnly: false,
  // 이벤트가 있는 글이어야 「후킹에 이벤트 훅」이 재어진다 (없으면 항목 자체가 안 생긴다)
  eventText: '8월 등록분 3개월 이용권 99,000원 · 선착순 50명',
  tags: ['쌍용동 헬스장','쌍용동 24시헬스장','천안헬스장','쌍용동PT','새벽운동','교대근무','헬스장추천','MTO피트니스','쌍용동헬스','천안24시헬스장'],
  body: `[이미지: 새벽 시간대 시설 전경 + 이번 달 등록 혜택 배지]
안녕하세요, MTO 피트니스 쌍용점입니다.

쌍용동 헬스장 찾으시는 분들께 먼저 드릴 말씀이 있어요. 야간 근무 끝나고 집에 가는 길에 운동하려고 마음먹었는데, 문 열린 곳이 없어서 그냥 지나친 날이 있으셨을 거예요. 저한테 제일 먼저 물으시는 것도 늘 이 시간 문제입니다.

이번 달에는 그 시간대에 오시는 분들을 위한 혜택을 걸었어요. 3개월 이용권을 10만 원 아래로 맞췄고 인원은 정해뒀습니다. 정확한 조건은 아래에서 정리해 드릴게요.

[이미지: 새벽 시간대 운동하는 회원]
## 상담 때 가장 자주 듣는 첫마디
"제 시간에 문 여는 데가 없어요." 이 말을 정말 많이 듣습니다. 3교대로 근무하시는 분, 새벽에 퇴근하시는 분, 아이 재우고 나서야 겨우 한 시간이 나는 분.

그런데 상담해 보면 진짜 걸림돌은 다른 데 있었어요. 시간이 안 맞는 게 아니라, 어렵게 시간 내서 갔는데 기구 앞에서 기다리다 그냥 나온 날이 쌓여서 그만두시는 겁니다. 돈이 아까운 것보다 스스로에 대한 실망이 더 크다고 하시더라고요.

그래서 상담 오시면 저는 이 얘기부터 합니다. 몇 시에 오실 수 있는지가 아니라, 그 시간에 뭘 하실 건지요.

[이미지: 새벽에 유산소존에서 걷는 장면]
## 새벽 운동, 이 순서면 40분에 끝납니다
새벽에 오시는 분들께 드리는 순서가 하나 있어요. 몸이 덜 풀린 상태라 순서가 중요합니다. 잘못 잡으면 어깨가 안 열려요.

트레드밀에서 경사 3도로 15분 걷습니다. 속도는 옆 사람과 대화가 되는 정도면 맞아요. 숨이 차면 속도보다 경사를 먼저 낮추시고요.

그다음 스쿼트 세 세트. 무릎이 안쪽으로 말리면 무게가 무겁다는 신호니까 한 단계 내리고 자세부터 잡습니다. 마무리로 랫풀다운을 8회씩 세 세트, 팔로 당기지 말고 어깨뼈를 아래로 내리는 느낌으로 하면 등에 자극이 옵니다.

세트 사이에 호흡만 정리하면 여기까지 40분이면 끝나요. 늘리지 않아도 됩니다.

[영상: 랫풀다운 동작 — 어깨뼈가 내려가는 게 보이게 10~20초, 편집 없이 세로로]

[이미지: 프리웨이트실과 웨이트실 분리 구조]
## 기다리지 않게 공간을 나눴습니다
위 순서를 새벽에 그대로 할 수 있는 이유가 시설에 있습니다. 24시간 운영이라 새벽 세 시에 오셔도 불이 켜져 있어요.

프리웨이트실과 웨이트실을 아예 분리했습니다. 랙과 스미스머신은 프리웨이트실에, 케이블과 머신류는 웨이트실에 있어요. 스쿼트 하러 오신 분과 가볍게 도는 분이 섞이지 않아서 랙 앞에 줄 서는 일이 잘 없습니다.

인기 있는 펙덱플라이와 랫풀다운은 두 대 이상 놓았고 천국의 계단도 네 대입니다. 유산소는 무동력 트레드밀과 제로러너까지 있어서 무릎이 불편하신 분은 그쪽으로 고르시면 되고요. 쌍용동 24시헬스장 알아보시는 분은 예약하고 오시면 시간대별로 사람이 얼마나 있는지 직접 보실 수 있습니다.

[이미지: 샤워시설]
## 눈으로 확인되는 것만 말씀드립니다
운동하다 자세가 무너지면 무게를 먼저 내려서 다시 잡습니다. 무리해서 버티다 다치면 회복이 더 오래 걸리니까요.

쌍용동 헬스장 중에 이렇게 관리하는 곳이 많지는 않아요. 샤워실은 열 명이 동시에 쓸 수 있고 드라이기와 바디드라이기도 갖췄습니다. 청소업체가 주 세 번 들어와서 바닥과 머신 손잡이를 관리해요. 오셔서 직접 보시면 됩니다. 그게 제일 빠릅니다.

[이미지: 이벤트 안내]
## 이번 달 등록 혜택 — 3개월 9.9만원
3개월 이용권을 99,000원에 드립니다. 하루로 나누면 커피 한 잔 값이 안 됩니다.

선착순 50분까지만 받습니다. MTO 피트니스 쌍용점에서 이번 달 안에 시작하시는 분까지 적용됩니다. 쌍용동 헬스장 가격만 비교하다 시간대를 놓치는 경우가 많은데, 두 개를 같이 보셔야 오래 다니십니다. 이미 다니시던 분들의 재등록에도 같은 조건으로 넣어드리고 있어요.

쌍용동 24시헬스장 알아보시면서 이번 달에 시작을 고민하셨다면 지금이 타이밍입니다. 남은 자리는 상담 때 바로 확인해 드립니다.

[이미지: 상담 데스크]
## 상담 예약은 이렇게 하시면 됩니다
등록하실 마음이 없어도 괜찮습니다. 시설만 보고 가시는 분도 많아요. 저희가 붙잡지 않습니다.

쌍용동 헬스장 알아보시는 중이라면 편하게 들러서 보시고, 아니면 그냥 나가시면 됩니다. 전화나 예약 링크로 편하신 시간 말씀 주시면 대기 없이 둘러보실 수 있어요.

MTO 피트니스 쌍용점은 신협 뒷건물 4층입니다. 전화 010-2455-2896 으로 주시면 상담 예약 문의 바로 안내드립니다.
`,
}
const c1 = checkPost(goodPromo)
console.log(`  점수 ${c1.score} · ${c1.stats.charCount}자 · 메인KW ${c1.stats.mainKeywordCount}회 (밀도 ${c1.stats.mainKeywordDensity}%) · 상호명 ${c1.stats.legalNameCount}회 · 소제목 ${c1.stats.headings.length} · 이미지 ${c1.stats.imageCount} · 태그 ${c1.stats.tagCount}`)
console.log(`  전화 ${c1.stats.phoneCount}회 · 링크 ${c1.stats.linkCount}개 · 등간격 ${c1.stats.evenSpacing} · 어미 ${JSON.stringify(c1.stats.sentenceEndings)}`)
const sum1 = summarize(c1)
const failed = c1.items.filter(i => i.level === 'fail')
const warned = c1.items.filter(i => i.level === 'warn')
console.log(`  수정필요: ${failed.map(f=>`${f.label}(${f.value})`).join(' / ') || '없음'}`)
console.log(`  주의: ${warned.map(f=>`${f.label}(${f.value})`).join(' / ') || '없음'}`)
console.log(`  위험표현: ${c1.risks.map(r=>`${r.term}×${r.count}`).join(', ') || '없음'}`)
// 검수기가 세는 값이 독립 계산과 일치하는지 (정확성 검증)
const flatAll = (goodPromo.title + '\n' + goodPromo.body)
  .split(/\r?\n/).filter(l => !/^\s*\[이미지/.test(l)).join('\n')
  .replace(/^\s*##+\s*/gm, '').replace(/\s+/g, '')
const trueKw = (flatAll.match(/쌍용동헬스장/g) ?? []).length
const trueName = (flatAll.match(/MTO피트니스쌍용점/g) ?? []).length
ok(c1.stats.mainKeywordCount === trueKw, '메인 키워드 카운트 정확', `검수기 ${c1.stats.mainKeywordCount} = 실제 ${trueKw}`)
ok(c1.stats.legalNameCount === trueName, '상호명 카운트 정확', `검수기 ${c1.stats.legalNameCount} = 실제 ${trueName}`)
ok(c1.stats.phoneCount === 1, '전화번호 1회 인식')
ok(c1.stats.imageCount === 7 && c1.stats.headings.length === 6, '이미지 7 / 소제목 6 (홍보글은 구간이 8단계라 소제목 6개)')
/*
 * **기준 글은 통과해야 한다** (2026-08-10).
 *
 * 기준을 올리는 동안 이 예시 글을 안 고쳐서 1 fail · 10 warn 까지 낡아 있었다. 그때
 * 단정문을 `score <= 79` 로 느슨하게 바꿔 놓은 게 나였다 — 낡은 것을 덮은 셈이다.
 * 지금 기준(정보 5종류 · 상담 6회 · 첫 문장 인사+상호명 · 소제목 세기)에 맞게 다시 쓰고,
 * 단정문도 「좋은 글은 통과한다」로 되돌린다. 이게 이 글이 존재하는 이유다.
 */
ok(sum1.fail === 0, '기준 글에 수정필요가 없다', `수정필요 ${sum1.fail}`)
ok(c1.score >= PUBLISH_THRESHOLD, '기준 글은 발행 구간이다', `${c1.score}점 (기준 ${PUBLISH_THRESHOLD})`)
// 미달 항목을 정확히 지적하는지
// 하한을 실측에 맞춰 3회로 내렸으므로 4회는 통과다 (예전 5회 하한에서는 warn 이었다)
ok(c1.items.find(i => i.id === 'mainCount')?.level === 'pass', '메인KW 5회 pass', c1.items.find(i => i.id === 'mainCount')?.value)
// 통과 하한을 1,750자로 내렸으므로 1,558자는 fail 이 아니라 warn 이다 (하한-250 = 1,500)
ok(c1.items.find(i => i.id === 'charCount')?.level === 'pass', '통과 구간 안의 분량', c1.items.find(i => i.id === 'charCount')?.value)
ok(c1.items.find(i => i.id === 'titleKeyword')?.level === 'pass', '제목 앞쪽 키워드 pass')
ok(c1.items.find(i => i.id === 'first100')?.level === 'pass', '첫 100자 키워드 pass')
ok(c1.items.find(i => i.id === 'imagePlacement')?.level === 'pass', '이미지 배치 pass')

// ─────────────────────────────────────────────────────────────
console.log('\n[5] 위험한 글은 낮은 점수')
const badPromo = { ...goodPromo, title: '최고의 헬스장! 지역 1위!', body: '저희는 최고의 시설과 무조건 확실히 빠지는 프로그램으로 한 달 5kg 감량 보장합니다. 통증 치료도 가능하고 할인 할인 할인 특가 이벤트 이벤트 이벤트 무료 무료 혜택 혜택 혜택입니다. 010-1111-2222 010-3333-4444', tags: [] }
const c2 = checkPost(badPromo)
console.log(`  점수 ${c2.score} · 위험표현 ${c2.risks.length}건 (즉시수정 ${c2.risks.filter(r=>r.level==='fail').length}건)`)
/*
 * 화자 검사(가중치 5)가 새로 생겨서 이 글이 통과하는 항목이 하나 늘었다 —
 * 홍보글이고 방문자 말투는 없으니 화자는 맞다. 그래서 하한을 발행 기준 기준으로 표현한다.
 */
/*
 * **검사를 더하면 이 숫자가 조금 올라간다** (2026-08-24). 새 검사가 이 짧은 글에서는
 * 통과하기 때문이다 (같은 문장 되풀이·얼버무리는 수량 — 둘 다 이 글에는 없다). 45 →
 * 46 이 되어 이 줄이 깨졌다.
 *
 * 점수가 「몇 점인가」가 아니라 **발행 기준에서 한참 멀다**는 것이 이 검사의 뜻이므로 폭을
 * 30 으로 둔다. 다만 이 현상 자체는 기억해 둘 만하다 — 늘 통과하는 항목을 늘리면 나쁜
 * 글의 점수도 같이 올라간다 (scripts/audit-checker.mjs 의 ③번이 그걸 센다).
 */
ok(c2.score < PUBLISH_THRESHOLD - 30, '위험한 글은 발행 기준에서 한참 멀다', `${c2.score}점 / 기준 ${PUBLISH_THRESHOLD}점`)
ok(c2.risks.length >= 6, '위험표현 다수 탐지', `${c2.risks.length}건`)

// ─────────────────────────────────────────────────────────────
console.log('\n[6] 여성전용 지점 남성 표현')
const c3 = checkPost({ ...goodPromo, womenOnly: true, body: goodPromo.body + '\n남성분들도 환영합니다.' })
ok(c3.risks.some(r => r.term === '남성분'), '여성전용 지점 남성 표현 탐지')
const c3b = checkPost({ ...goodPromo, womenOnly: false, body: goodPromo.body + '\n남성분들도 환영합니다.' })
ok(!c3b.risks.some(r => r.term === '남성분'), '남녀공용 지점은 탐지 안 함')

// ─────────────────────────────────────────────────────────────
console.log('\n[7] 골격 → 안내 제거 → 복사 패키지')
for (const t of ['promo', 'info', 'review']) {
  const tpl = buildTemplate(t, { mainKeyword: '쌍용동 헬스장', subKeywords: ['A','B'], localKeyword: '쌍용동 헬스장' })
  const stripped = stripGuides(tpl)
  const pp = parseBody(tpl)
  ok(pp.headings.length >= 4 && pp.headings.length <= 6, `${t} 골격 소제목 ${pp.headings.length}개`)
  ok(pp.images.length >= 5, `${t} 골격 이미지 ${pp.images.length}장`)
  ok(!/^\s*>\s/m.test(stripped), `${t} 안내 줄 제거됨`)
}
const pkg = buildCopyPackage({ ...goodPromo, id:'x', status:'draft', storeId:'s', localKeyword: undefined, createdAt:'2026-07-31T00:00:00Z', updatedAt:'2026-07-31T00:00:00Z' }, { legalName:'MTO 피트니스 쌍용점', location:'신협 뒷건물 4층', phone:'010-2455-2896' })
ok(!pkg.body.includes('[이미지'), '복사 본문에 이미지 지시문 없음')
ok(!pkg.body.includes('##'), '복사 본문에 소제목 마크업 없음')
ok(pkg.body.includes('상담 때 가장 자주 듣는 첫마디'), '소제목 텍스트는 남음')
ok(pkg.imagePlan.length === 7, `이미지 배치표 ${pkg.imagePlan.length}행 (대표 1 + 소제목 6)`)
ok(pkg.imagePlan[0].slot.includes('대표'), '첫 이미지는 대표이미지')
ok(pkg.imagePlan[1].slot.includes('상담 때'), '2번째는 첫 소제목 위', pkg.imagePlan[1].slot)
/*
 * 태그 — 회원이 「#태그 #태그」 한 줄을 네이버 태그 칸에 붙이고 「태그가 안 먹힌다」고 했다.
 * 안 먹히는 게 맞다. 태그 칸은 한 칸에 하나씩이고, 공백이 든 태그는 거기서 끊긴다.
 */
ok(pkg.tags.startsWith('#'), '본문에 붙일 한 줄에는 # 이 붙는다')
ok(!pkg.tagsPlain.includes('#'), '붙여넣기용에는 # 없음')
ok(pkg.tagsPlain.includes(','), '붙여넣기용은 쉼표로 구분')
ok(pkg.tagList.every((t) => !/\s/.test(t)), '태그에 공백이 없다 (공백은 태그를 끊는 자리다)')
ok(pkg.tagList.includes('쌍용동헬스장'), `「쌍용동 헬스장」이 붙어서 들어간다 — ${pkg.tagList[0]}`)
ok(pkg.tagFixes.some((f) => f.from === '쌍용동 헬스장' && f.to === '쌍용동헬스장'), '무엇을 고쳤는지 알려준다')
ok(pkg.tagList.length === new Set(pkg.tagList).size, '공백을 붙인 뒤 생긴 중복을 지운다')
ok(normalizeTag('#MTO피트니스 쌍용점') === 'MTO피트니스쌍용점', `# 과 공백을 뗀다 — ${normalizeTag('#MTO피트니스 쌍용점')}`)
ok(normalizeTag('쌍용동·헬스') === '쌍용동헬스', '가운뎃점 같은 기호를 지운다')
ok(normalizeTag('  ') === '', '빈 태그는 빈 문자열')
// 긴 태그는 **자르지 않는다** — 잘린 태그는 틀린 태그다. 화면에서 경고만 한다
const longTag = 'ㄱ'.repeat(TAG_MAX_LEN + 5)
ok(normalizeTag(longTag).length === TAG_MAX_LEN + 5, '긴 태그를 조용히 자르지 않는다')
/*
 * ─── 순서로 나오는 핵심 문구 (2026-08-28 회원 요청) ────────────────────
 *
 * "정보글 작성하면 본문에 첫째, 둘째 같은 순서로 나오는 핵심 문구를 발행패키지에서 따로
 * 추려주면 좋겠어."
 *
 * 정보글은 순서가 곧 뼈대다. 그것만 모아 두면 요약 상자·고정 댓글에 그대로 쓸 수 있는데,
 * 지금은 본문을 다시 훑어 손으로 옮겨 적어야 했다.
 */
{
  const kp = keyPointsOf(
    [
      '## 순서를 이렇게 바꿔보세요',
      '첫째, 웨이트를 먼저 하세요. 40분이면 충분합니다. 둘째, 유산소를 뒤에 15분 붙입니다.',
      '① 큰 근육부터 갑니다.',
      '스쿼트, 데드리프트, 벤치프레스 순서면 됩니다.',
      '1) 세트 사이는 90초 쉬세요.',
      '2단계 호흡은 힘쓰는 구간에서 뱉습니다.',
    ].join('\n')
  )
  ok(kp.length === 5, '표시가 붙은 마디를 전부 뽑는다', JSON.stringify(kp))
  // 한 문단에 「첫째 … 둘째 …」가 이어 붙어도 나눈다
  ok(kp[0].text.startsWith('첫째') && kp[1].text.startsWith('둘째'), '한 줄 안에서도 마디로 나눈다', JSON.stringify(kp.slice(0, 2)))
  ok(kp[0].text === '첫째, 웨이트를 먼저 하세요.', '표시가 붙은 첫 문장이 문구다', kp[0].text)

  /*
   * ─── 부연설명도 함께 (2026-08-28 회원 추가 요청) ────────────────────
   *
   * "아니 문구만 나오면 안되고 그 밑에 부연설명도 같이 나오게 해줘."
   *
   * 첫 문장만 남기니 「두 번째는 큰 근육부터 순서대로 갑니다」로 끝나서 **무엇을 어떻게
   * 하라는지가 잘려 나갔다.** 순서만 있고 알맹이가 없으면 요약으로 쓸 수가 없다.
   */
  ok(kp[0].detail === '40분이면 충분합니다.', '같은 줄에 이어진 설명을 붙인다', kp[0].detail)
  ok(kp[2].text === '① 큰 근육부터 갑니다.', '동그라미 번호도 문구로 본다', kp[2].text)
  // 한 줄에 설명이 없으면 **바로 다음 문단**을 본다 — 그렇게 쓰인 글이 흔하다
  ok(kp[2].detail === '스쿼트, 데드리프트, 벤치프레스 순서면 됩니다.', '설명이 다음 문단에 있어도 붙인다', kp[2].detail)
  // 다음 문단이 또 순서 표시로 시작하면 그건 다음 항목이다 — 손대지 않는다
  ok(!kp[3].detail, '다음 항목을 설명으로 끌어오지 않는다', JSON.stringify(kp[3]))
  ok(kp.some((k) => k.text.startsWith('1)')), '괄호 번호도 본다', JSON.stringify(kp.map((k) => k.text)))
  ok(kp.some((k) => k.text.startsWith('2단계')), '「2단계」도 순서로 본다')

  /*
   * ─── 「첫 단계」를 놓쳤다 (2026-08-28 회원 지적) ────────────────────
   *
   * "첫번째는 어디가고 두번째부터 나오는거야?"
   *
   * 실제 글을 받아 보니 본문이 이렇게 쓰여 있었다:
   *   **첫 단계**는 워밍업입니다 … / **두 번째**는 큰 근육부터 … / 세 번째 … / 네 번째 …
   *
   * 첫 항목만 「단계」이고 나머지는 「번째」였다. 우리 목록에는 「1단계」처럼 숫자가 붙은
   * 것만 있어서 「첫 단계」가 빠졌고, 그래서 두 번째부터 나왔다.
   */
  {
    const mixed = keyPointsOf(
      ['첫 단계는 워밍업입니다. 5분 걸으세요.', '두 번째는 큰 근육부터 갑니다.', '세 번째는 마무리입니다.'].join('\n')
    )
    ok(mixed.length === 3, '「첫 단계」로 시작해도 셋 다 뽑는다', JSON.stringify(mixed.map((k) => k.text)))
    ok(mixed[0].text.startsWith('첫 단계'), '첫 항목이 빠지지 않는다', mixed[0].text)
    ok(keyPointsOf('두 단계는 무게를 올립니다.').length === 1, '「두 단계」도 본다')
    /*
     * 표현이 섞인 것 자체는 글 쪽 문제다 — 지시문에서도 막는다. 뽑는 쪽만 고치면 다음 글도
     * 「첫 단계 → 두 번째」로 나온다 (이 저장소가 반복해서 겪은 「한쪽만 고친 것」).
     */
    const { buildSystemPrompt: sysPrompt } = require(`${OUT}/ai/prompt.js`)
    for (const t of ['promo', 'info', 'review'])
      ok(sysPrompt(t).includes('순서를 매길 때는 한 가지 말로 통일하고 첫 항목부터 매긴다'),
        `${t} 지시문이 순서 표현을 통일하라고 한다`)
  }
  // 소제목·이미지 지시문은 본문이 아니다
  ok(!kp.some((k) => k.text.includes('순서를 이렇게')), '소제목은 뽑지 않는다')
  ok(keyPointsOf('[이미지: 1) 첫 화면]').length === 0, '이미지 지시문도 뽑지 않는다')
  /*
   * **문장 가운데 든 말은 순서가 아니다** — 「셋째 주에는」이 그렇다. 줄 맨 앞이거나
   * 문장이 끝난 다음에 온 것만 본다.
   */
  ok(keyPointsOf('운동은 셋째 주에는 강도를 올리세요.').length === 0, '문장 가운데 든 말은 안 뽑는다')
  ok(keyPointsOf('').length === 0, '본문이 없으면 빈 목록')
  // **지어내지 않는다** — 표시가 없는 글은 빈 목록이고, 화면도 그 칸을 만들지 않는다
  ok(keyPointsOf('그냥 줄글입니다. 순서 표시가 없습니다.').length === 0, '표시가 없으면 아무것도 안 뽑는다')
  /*
   * ─── 관련된 내용을 **끝까지** 가져온다 (2026-08-28 회원 요청) ──────────
   *
   * "내용이 전체적으로 안나와 핵심 문구와 관련된 전체 문장이 나오게 해줘."
   *
   * 앞 판은 「다음 한 문단까지, 220자까지」였다. 설명이 여러 문단에 걸쳐 있으면 앞쪽만
   * 나오고 뒤가 잘렸다 — 화면에 「…자료를 보면」에서 끊긴 줄이 그것이다.
   *
   * 이제 다음 순서 표시(또는 소제목·이미지)를 만날 때까지 이어 붙이고 **길이로는 자르지
   * 않는다.** 임의로 끊으면 또 「내용이 안 나온다」가 된다.
   */
  {
    const long = keyPointsOf(`첫째, 짧은 문장. ${'가'.repeat(400)}`)[0]
    ok(long.detail.length === 400 && !long.detail.endsWith('…'), '길다고 자르지 않는다', String(long.detail.length))

    const many = keyPointsOf(
      ['첫째, 문구입니다.', '설명 첫 문단입니다.', '설명 둘째 문단입니다.', '둘째, 다음 문구입니다.', '다음 설명입니다.'].join('\n')
    )
    ok(many.length === 2, '항목은 둘이다', JSON.stringify(many.map((k) => k.text)))
    ok(many[0].detail === '설명 첫 문단입니다.\n설명 둘째 문단입니다.', '여러 문단을 끝까지 잇는다', JSON.stringify(many[0].detail))
    ok(many[1].detail === '다음 설명입니다.', '다음 항목은 제 설명만 갖는다', JSON.stringify(many[1].detail))
    // 소제목·이미지에서 멈춘다 — 그 아래는 다른 이야기다
    const stop = keyPointsOf(['첫째, 문구입니다.', '설명입니다.', '## 다른 소제목', '딴 얘기입니다.'].join('\n'))
    ok(stop[0].detail === '설명입니다.', '소제목을 만나면 멈춘다', JSON.stringify(stop[0].detail))
    // 화면이 문단 나눔을 살려서 보여준다
    const ui = require('node:fs').readFileSync(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
    ok(/whitespace-pre-line[^]{0,40}k\.detail|k\.detail[^]{0,80}whitespace-pre-line/.test(ui), '화면이 줄바꿈을 살린다')
  }
  /*
   * 소수점을 순서 표시로 보지 않는다 — 「체중 1kg당 1.6~2.2g」의 「1.」이 걸리면 설명이
   * 거기서 잘린다.
   */
  ok(keyPointsOf('첫째, 문구입니다. 체중 1kg당 1.6~2.2g이 필요합니다.')[0].detail === '체중 1kg당 1.6~2.2g이 필요합니다.',
    '소수점을 순서 표시로 보지 않는다', JSON.stringify(keyPointsOf('첫째, 문구입니다. 체중 1kg당 1.6~2.2g이 필요합니다.')[0].detail))
  ok(Array.isArray(pkg.keyPoints), '발행 패키지가 그 목록을 들고 있다')

  /*
   * ─── 소제목에서 멈추는지 **패키지에서** 확인한다 (2026-08-28) ─────────
   *
   * 회원: "세번째가 왜 이렇게 길어."
   *
   * keyPointsOf 자체는 소제목에서 멈추고 있었다. 그런데 buildCopyPackage 가 넘긴 본문이
   * **붙여넣기용**이어서 `##` 가 이미 떨어져 있었다 — 소제목이 그냥 문단으로 보이니
   * 마지막 항목이 「흔히 하는 실수들」·「오늘부터 시작한다면」까지 통째로 삼켰다.
   * 항목 하나가 글의 절반이 됐다.
   *
   * 조각(keyPointsOf)만 보면 멀쩡한데 이어 붙이면 틀리는 종류라, **패키지 결과로** 잡는다.
   */
  {
    const pkgKp = buildCopyPackage({
      id: 'kp', type: 'info', status: 'draft', storeId: '', mainKeyword: 'k', subKeywords: [], tags: [],
      createdAt: '', updatedAt: '', title: '제목',
      body: [
        '## 순서',
        '첫째, 워밍업입니다.',
        '5분 걸으세요.',
        '[이미지: 워밍업 장면]',
        '## 흔히 하는 실수',
        '매일 같은 부위만 하는 겁니다.',
        '## 오늘부터',
        '오늘 당장 할 수 있는 건 5분입니다.',
      ].join('\n'),
    })
    ok(pkgKp.keyPoints.length === 1, '항목은 하나다', JSON.stringify(pkgKp.keyPoints))
    ok(pkgKp.keyPoints[0].detail === '5분 걸으세요.', '소제목 아래는 삼키지 않는다', JSON.stringify(pkgKp.keyPoints[0].detail))
    ok(!pkgKp.keyPoints[0].detail.includes('흔히'), '다음 소제목 내용이 딸려 오지 않는다')
    ok(!pkgKp.keyPoints[0].detail.includes('오늘 당장'), '그 다음 소제목도 마찬가지')
  }
  /*
   * ─── 어떤 글이든 성하게 뽑는다 (2026-08-30 회원 지적) ────────────────
   *
   * 회원: "문장이 제대로 안나왔어 어떤 글이든 오류가 없이 뽑아 낼 수 있게 점검해서
   * 업데이트해줘."
   *
   * **회원이 보낸 화면을 프로덕션 글로 재현했다** (post_nzv84s596r, 남자 가슴운동 순서).
   * 발행 패키지가 이렇게 나왔다:
   *
   *   ① 두 번째 단계는 인클라인이나 디클라인처럼 각도를 바꾼 덤벨 프레스입니다.  (설명 없음)
   *   ② 첫 번째에서 쓰지 않은 각도를 골라서 3~4세트, 8~12회 반복으로 넣어주세요.
   *   ③ 세 번째 단계가 고립 운동입니다.
   *   ④ 두 번째는 사전 피로법이라고 해서 …
   *
   * 세 가지가 겹쳐 있었다. 하나씩 아래에서 지킨다.
   */
  {
    const { keyPointFlaws, markNumber } = require(`${OUT}/writing/keypoints.js`)

    /*
     * ① **문장 속 「첫 번째」를 항목으로 올리면 안 된다.**
     *
     * 「첫 번째에서 쓰지 않은 각도를」은 앞 항목을 가리키는 말이지 새 항목이 아니다.
     * 그런데 그 앞이 마침표라 「문장이 끝난 다음」 조건을 통과했고, 그 바람에 앞 항목은
     * 설명을 통째로 빼앗겨 빈 줄이 됐다 (화면의 ①이 그것이다).
     */
    const back = keyPointsOf(
      '두 번째 단계는 각도를 바꾼 덤벨 프레스입니다. 첫 번째에서 쓰지 않은 각도를 골라서 3~4세트 넣어주세요.'
    )
    ok(back.length === 1, '문장 속 「첫 번째」는 새 항목이 아니다', JSON.stringify(back.map((k) => k.text)))
    ok(
      back[0].detail?.includes('첫 번째에서 쓰지 않은'),
      '앞 항목이 제 설명을 잃지 않는다',
      JSON.stringify(back[0].detail)
    )
    // 「첫째」·「①」처럼 순서에만 쓰는 표시는 문장 끝 뒤에서도 그대로 본다 (위 테스트가 지킨다)
    ok(keyPointsOf('첫째, 하나입니다. 둘째, 둘입니다.').length === 2, '전용 표시는 한 문단 안에서도 나뉜다')
    /*
     * **문장 끝에 단 순번은 항목이다** (2026-08-30에 뒤집었다 — 아래 ㉰ 참고).
     *
     * 처음에는 이것도 항목이 아니라고 봤다. 그런데 그 규칙 때문에 실제 글의 첫 항목이
     * 통째로 사라졌고, **없는 흠을 짚느라 고쳐 쓰기가 헛돌았다.** 문장이 거기서 끝나므로
     * 앞을 가리키는 말(「첫 번째에서」)과 헷갈리지 않는다.
     */
    ok(keyPointsOf('복합 운동 먼저 하는 방식이 첫 번째입니다.').length === 1, '문장 끝에 단 순번도 항목이다')
    ok(keyPointsOf('복합 운동 먼저 하는 방식이 첫 번째입니다.')[0].n === 1, '그 번호도 읽는다')
    // 뒤에 말이 이어지면 아니다 — 그건 앞을 가리키는 말이다
    ok(keyPointsOf('처음이라면 첫 번째 방식부터 시작하세요.').length === 0, '뒤에 말이 이어지면 항목이 아니다')

    /*
     * ② **표시 자체의 마침표에서 문구를 끊으면 안 된다.**
     *
     * 「1. 폭식 시간 2시간 전 미리 먹기 — …」에서 문장 끝을 맨 앞부터 찾으면 「1.」이
     * 먼저 걸린다. 실제로 프로덕션 글(post_zqn9qa8wku) 네 항목이 전부 문구가 「1.」·「2.」
     * 한 조각으로만 떴다.
     */
    const dotted = keyPointsOf('1. 폭식 시간 2시간 전 미리 먹기 — 견과류 한 줌을 드세요. 배가 덜 고파집니다.')
    ok(dotted.length === 1, '「1.」은 표시 하나다', JSON.stringify(dotted.map((k) => k.text)))
    ok(dotted[0].text.includes('폭식 시간'), '문구가 「1.」로 잘리지 않는다', dotted[0].text)
    ok(dotted[0].detail === '배가 덜 고파집니다.', '나머지가 설명으로 간다', JSON.stringify(dotted[0].detail))

    /*
     * ③ **한 글에 목록이 둘 이상이면 나눠 센다.**
     *
     * 실제 글에 「실제로 어떻게 배치하면 될까」 아래 1·2·3 이 있고 「고를 때 기준」 아래
     * 또 1·2 가 있었다. 한 줄로 이으면 1·2·3·2 가 되어 **번호가 되돌아간 것처럼** 보인다.
     *
     * 소제목으로 나누지 않는 이유: 질문마다 소제목을 달고 그 아래에서 번호를 이어 가는
     * 글도 있다 (프로덕션의 「갱년기다이어트」 글). 소제목마다 끊으면 그 목록이 한
     * 항목짜리 묶음 셋으로 조각난다. **번호가 늘어나는 동안은 한 목록**으로 본다.
     */
    const two = keyPointsOf(
      ['첫 번째는 하나입니다.', '두 번째는 둘입니다.', '## 다른 기준', '첫 번째는 이것입니다.', '두 번째는 저것입니다.'].join('\n')
    )
    ok(two.length === 4, '네 항목을 다 뽑는다', JSON.stringify(two.map((k) => k.text)))
    ok(two[0].group === two[1].group && two[2].group === two[3].group, '앞뒤가 각각 한 묶음')
    ok(two[1].group !== two[2].group, '번호가 되돌아가면 새 목록이다', `${two[1].group}/${two[2].group}`)
    ok(keyPointFlaws(two).length === 0, '둘 다 1번부터라 성한 목록이다', JSON.stringify(keyPointFlaws(two)))
    // 소제목을 사이에 두고 번호가 이어지면 **한 목록**이다 (조각내지 않는다)
    const across = keyPointsOf(['첫 번째는 하나입니다.', '## 두 번째 질문', '두 번째는 둘입니다.'].join('\n'))
    ok(across.length === 2 && across[0].group === across[1].group, '소제목을 넘어가도 번호가 늘면 한 목록')

    /*
     * ④ **어긋난 자리는 숨기지 않고 말한다.**
     *
     * 뽑는 쪽을 아무리 고쳐도 본문에 첫 항목 표시가 없으면 첫 항목은 나올 수 없다.
     * 실제 글이 그랬다 — 1단계를 「제가 이 순서에서 가장 먼저 강조하고 싶은 부분은」으로
     * 열어서 표시가 아예 없었다.
     */
    ok(markNumber('두 번째') === 2 && markNumber('①') === 1 && markNumber('3단계') === 3 && markNumber('셋째') === 3,
      '본문이 매긴 번호를 읽는다')
    ok(markNumber('첫 단계') === 1 && markNumber('1)') === 1, '「첫 단계」·「1)」도 읽는다')
    const gap = keyPointsOf(['두 번째 단계는 둘입니다.', '세 번째 단계는 셋입니다.'].join('\n'))
    ok(keyPointFlaws(gap).some((f) => f.includes('2번부터 시작')), '2번부터 시작하면 짚는다', JSON.stringify(keyPointFlaws(gap)))
    const skip = keyPointsOf(['첫째, 하나입니다.', '넷째, 넷입니다.'].join('\n'))
    ok(keyPointFlaws(skip).some((f) => f.includes('사이가 비었습니다')), '건너뛰면 짚는다', JSON.stringify(keyPointFlaws(skip)))
    ok(keyPointFlaws(keyPointsOf('첫째, 하나입니다.')).length === 0, '성한 목록에는 아무 말도 안 한다')
    // 한 항목짜리라도 1번이 아니면 짚는다 — 「둘째는 …」만 혼자 뜬 글이 실제로 있었다
    ok(keyPointFlaws(keyPointsOf('둘째는 보충제를 같이 쓰는 방법이에요.')).length === 1, '혼자 뜬 「둘째」도 짚는다')

    /*
     * ⑤ **본문을 고치게 한다.** 뽑는 쪽만 고치면 다음 글도 두 번째부터 나온다
     * (이 저장소가 반복해서 겪은 「한쪽만 고친 것」). 검수가 **같은 규칙**으로 본다 —
     * 그래서 규칙을 keypoints.ts 한 벌에 두고 양쪽이 부른다.
     */
    const broken = checkPost({
      type: 'info', title: '순서 정리 헬스 초보 루틴', mainKeyword: '헬스 초보 루틴', subKeywords: [], tags: [],
      body: ['## 순서', '두 번째 단계는 둘입니다. 설명입니다.', '세 번째 단계는 셋입니다. 설명입니다.'].join('\n'),
    })
    const order = broken.items.find((i) => i.id === 'key-point-order')
    ok(!!order, '검수에 「순서 표시」 항목이 있다')
    ok(order.level === 'warn', '어긋나면 수정필요', order.level)
    ok(order.hint.includes('첫 번째 단계는'), '무엇으로 열어야 하는지 알려준다')
    const fine = checkPost({
      type: 'info', title: '순서 정리 헬스 초보 루틴', mainKeyword: '헬스 초보 루틴', subKeywords: [], tags: [],
      body: ['## 순서', '첫 번째 단계는 하나입니다. 설명입니다.', '두 번째 단계는 둘입니다. 설명입니다.'].join('\n'),
    })
    ok(fine.items.find((i) => i.id === 'key-point-order')?.level === 'pass', '성하면 통과')
    // 순서를 안 쓰는 글에는 항목을 만들지 않는다 — 없는 순서를 지어내게 하면 안 된다
    const none = checkPost({
      type: 'info', title: '그냥 줄글 헬스 초보 루틴', mainKeyword: '헬스 초보 루틴', subKeywords: [], tags: [],
      body: '## 소제목\n순서 표시가 없는 줄글입니다. 그냥 설명입니다.',
    })
    ok(!none.items.some((i) => i.id === 'key-point-order'), '표시가 없으면 항목 자체가 없다')
    // 굵게 쓴 표시도 본다 — 「**첫 번째 단계는**」이 흔하다
    const bold = checkPost({
      type: 'info', title: '순서 정리 헬스 초보 루틴', mainKeyword: '헬스 초보 루틴', subKeywords: [], tags: [],
      body: ['**첫 번째 단계는** 하나입니다. 설명입니다.', '**두 번째 단계는** 둘입니다. 설명입니다.'].join('\n'),
    })
    ok(bold.items.find((i) => i.id === 'key-point-order')?.level === 'pass', '굵게 쓴 표시도 센다')

    /*
     * ─── "그래서 왜 안고치는거야?" (2026-08-30 회원) ──────────────────
     *
     * 앞 판은 어긋난 것을 **알려주기만** 했다. 회원이 그 화면을 보고 물었고, 맞는 지적이라
     * 프로덕션에서 실제로 고쳐 쓰기를 돌려 봤다 — 본문이 **한 글자도 안 바뀌고** 돌아왔다
     * (`revised: false`, 3,229자 → 3,229자). 원인 셋을 여기서 지킨다.
     */
    {
      const { buildFixPrompt } = require(`${OUT}/ai/prompt.js`)
      /*
       * ㉮ **고쳐 쓰기 지시문이 [주의] 를 「안 해도 되는 일」로 말하고 있었다.**
       *
       * 「[주의] 는 남아도 발행할 수 있으니」— 그 문장 자체는 옳지만 **[수정필요] 가 있을
       * 때만** 옳다. 걸린 것이 [주의] 하나뿐인 호출에서는 아무것도 하지 말라는 말이 된다.
       */
      const warnOnly = buildFixPrompt(['[주의] 순서 표시: 지금 2번부터 / 기준 첫 항목부터'], 2000, { charMin: 1500, charMax: 3000 })
      ok(warnOnly.includes('이번에는 [수정필요] 가 없다'), '주의만 걸린 호출은 그것이 이번 일이라고 말한다')
      ok(!warnOnly.includes('[주의] 는 남아도 발행할 수 있으니'), '「안 고쳐도 된다」는 말을 빼야 실제로 고친다')
      const withFail = buildFixPrompt(['[수정필요] 분량: 지금 900자', '[주의] 순서 표시: 지금 2번부터'], 900, { charMin: 1500, charMax: 3000 })
      ok(withFail.includes('[수정필요] 부터 반드시 해결한다'), '수정필요가 있으면 그것이 먼저다 (예전 말 그대로)')
      ok(withFail.includes('[주의] 를 하나 늘리는 것은 괜찮다'), '그때는 주의를 늘려도 된다고 말한다')
      // 문단을 나눠야 고쳐지는 항목이 있다 — 「문단 구성을 그대로」와 부딪히던 자리를 풀었다
      ok(warnOnly.includes('걸린 항목이 문단을 나누라고 하면 그 자리는 나눠도 된다'), '문단을 나눠야 하는 항목에 길을 열어 둔다')

      /*
       * ㉯ **고친 글이 점수로 이겨야 채택된다.** 라우트의 판정은 「수정필요가 적은 쪽 →
       * 같으면 점수가 높은 쪽 → 동점이면 원래 글」이다. 순서 표시가 [주의] 라 수정필요
       * 개수는 그대로이므로, 고치면 **점수가 올라야** 새 글이 채택된다.
       */
      const body = ['## 순서', '첫 번째 단계는 하나입니다. 설명입니다.', '두 번째 단계는 둘입니다. 설명입니다.'].join('\n')
      const broke = body.replace('첫 번째 단계는 하나입니다.', '가장 먼저 강조하고 싶은 것은 하나입니다.')
      const base = { type: 'info', title: '순서 정리 헬스 초보 루틴', mainKeyword: '헬스 초보 루틴', subKeywords: [], tags: [] }
      const worse = checkPost({ ...base, body: broke })
      const better = checkPost({ ...base, body })
      ok(better.score > worse.score, '고치면 점수가 오른다 (안 그러면 라우트가 고친 글을 버린다)', `${worse.score} → ${better.score}`)

      /*
       * ㉰ **문단 끝에 단 첫 항목도 찾아 준다.**
       *
       * 「크게 두 가지 방식으로 나뉘는데, … 방식이 첫 번째입니다」처럼 첫 항목을 문단
       * 끝에 단 글이 실제로 있었다. 줄 맨 앞만 인정하면 그 항목이 통째로 사라져서, 고쳐
       * 써도 계속 「2번부터 시작합니다」가 남는다.
       *
       * 그렇다고 문장 끝 뒤를 전부 인정하면 「덤벨 프레스입니다. 첫 번째에서 쓰지 않은
       * 각도를」이 다시 항목으로 올라온다. 가르는 것은 **뒤에 붙은 조사**다 — 항목을 여는
       * 말은 주어 자리에 서고(「첫 번째는」), 앞을 가리키는 말은 아니다(「첫 번째에서」).
       */
      ok(keyPointsOf('두 가지로 나뉩니다. 첫 번째는 복합 운동입니다.').length === 1, '「첫 번째는」은 문장 끝 뒤에서도 항목이다')
      ok(keyPointsOf('덤벨 프레스입니다. 첫 번째에서 쓰지 않은 각도를 고르세요.').length === 0, '「첫 번째에서」는 앞을 가리키는 말이다')
      ok(keyPointsOf('이렇게 합니다. 첫 번째로 쓰지 않은 각도를 고르세요.').length === 0, '「첫 번째로」도 마찬가지')
      ok(keyPointsOf('정리하면 이렇습니다. 두 번째 단계는 각도를 바꿉니다.').length === 1, '「두 번째 단계는」도 항목이다')
      ok(keyPointsOf('세 가지입니다. 첫 번째, 워밍업입니다.').length === 1, '쉼표가 붙어도 항목이다')

      /*
       * ㉰ **없는 흠을 짚으면 고칠 방법이 없다.**
       *
       * 프로덕션에서 고쳐 쓰기를 세 번 돌렸는데 세 번 다 본문이 한 글자도 안 바뀌었다
       * (revised: false, 3,229자 → 3,229자). 지시문을 고친 뒤에도 그랬다.
       *
       * 이유는 **우리가 없는 흠을 짚고 있었기** 때문이다. 그 글의 두 번째 목록은 첫 항목을
       * 문장 끝에 달아 뒀는데(「… 고립 운동 나중 방식이 첫 번째입니다.」) 우리가 그걸 못
       * 찾아서, 남은 「두 번째는 사전 피로법」 하나만 보고 「2번부터」라고 짚었다. 그러면
       * 앞 목록을 제대로 고쳐도 지적이 남고, 점수가 그대로라 라우트가 고친 글을 버린다
       * (판정: 수정필요가 같으면 점수가 높은 쪽).
       */
      ok(keyPointsOf('두 가지로 나뉩니다. 고립 운동 나중 방식이 첫 번째입니다.').length === 1, '문장 끝에 단 순번을 찾는다')
      {
        const both = keyPointsOf(['고립 운동 나중 방식이 첫 번째입니다.', '두 번째는 사전 피로법입니다.'].join('\n'))
        ok(both.length === 2 && both[0].n === 1 && both[1].n === 2, '앞뒤가 1·2 로 이어진다', JSON.stringify(both.map((k) => k.n)))
        ok(keyPointFlaws(both).length === 0, '성한 목록을 어긋났다고 하지 않는다', JSON.stringify(keyPointFlaws(both)))
      }
      // **문구가 「첫 번째입니다」 조각이 되면 안 된다** — 잡는 자리는 그 문장이 시작하는 곳이다
      ok(
        keyPointsOf('고립 운동 나중 방식이 첫 번째입니다.')[0].text.startsWith('고립 운동'),
        '문구는 문장 처음부터다',
        keyPointsOf('고립 운동 나중 방식이 첫 번째입니다.')[0].text
      )
      // 이미 표시가 잡힌 문장을 두 번 세지 않는다
      ok(keyPointsOf('첫 번째는 복합 운동이 첫 번째입니다.').length === 1, '한 문장을 두 번 세지 않는다')

      /*
       * ㉲ **안 고쳐졌으면 왜인지 말한다** (2026-08-30).
       *
       * 화면은 여태 「고쳐 써도 나아지지 않아 원래 글을 두었습니다」 한 마디만 했다.
       * 그 한 마디가 서로 다른 세 가지를 덮고 있었다 — ①응답을 못 읽었다 ②모델이 같은
       * 글을 그대로 돌려줬다 ③고친 글이 채점에서 졌다. 셋은 회원이 할 일이 다르다
       * (다시 누른다 / 손으로 고친다 / 본문을 줄인다). 실제로 프로덕션에서 네 번을
       * 돌려도 안 고쳐졌는데, 그 한 마디로는 셋 중 무엇인지 알 길이 없었다.
       */
      const wapi = require('node:fs').readFileSync(new URL('../app/api/write/route.ts', import.meta.url), 'utf8')
      ok(wapi.includes('모델 응답을 읽지 못했습니다'), '응답을 못 읽은 경우를 따로 말한다')
      ok(wapi.includes('모델이 같은 글을 그대로 돌려줬습니다'), '그대로 돌아온 경우도 따로 말한다')
      ok(wapi.includes('고친 글이 채점에서 졌습니다'), '채점에서 진 경우는 점수까지 보여준다')
      ok(/fixChars: fixed \? fixed\.body\.length : 0/.test(wapi), '돌아온 본문 길이도 넘긴다 (잘렸는지 알 수 있게)')
      const ed2 = require('node:fs').readFileSync(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
      ok(ed2.includes('원래 글을 두었습니다: '), '화면이 그 이유를 그대로 보여준다')
      ok(ed2.includes('자만 돌아왔습니다'), '크게 짧게 돌아왔으면 잘렸다고 말한다')

      /*
       * ㉱ **고칠 버튼을 그 자리에 둔다.** 무엇이 틀렸는지 알면서 「검수 화면에 가서
       * 누르세요」라고만 하면 안 된다.
       */
      const ed = require('node:fs').readFileSync(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
      ok(ed.includes('본문 순서 고쳐 쓰기'), '어긋난 카드에서 바로 고칠 수 있다')
      ok(/onFix=\{/.test(ed) && /issues: liveFixIssues/.test(ed), '검수 항목 고쳐 쓰기와 같은 길로 보낸다')
      ok(ed.includes('누르면 AI 가 그 문단을 다시 씁니다'), '무슨 일이 일어나는지 미리 말한다')
    }

    /*
     * ⑥ **지시문도 함께 고친다.** 앞 판에도 「첫 항목부터 매긴다」가 있었는데 실제 글은
     * 「가장 먼저 강조하고 싶은 부분은」으로 열었다 — 규칙을 지킨 척 넘어간 것이다.
     * 그래서 **어디에 쓰는가**까지 못박았다.
     */
    const { buildSystemPrompt: sys2 } = require(`${OUT}/ai/prompt.js`)
    for (const t of ['promo', 'info', 'review']) {
      ok(sys2(t).includes('순서 항목은 문단 맨 앞에서 시작한다'), `${t} 지시문이 항목을 문단 맨 앞에 두라고 한다`)
      ok(sys2(t).includes('앞에서 쓰지 않은 각도를'), `${t} 지시문이 문장 속 순번을 쓰지 말라고 한다`)
    }
  }

  const kpEditor = require('node:fs').readFileSync(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
  ok(kpEditor.includes('핵심 문구 (순서)'), '발행 패키지 화면에 따로 칸이 있다')
  /*
   * **화면이 번호를 새로 매기지 않는다** (2026-08-30). 본문이 2번부터 시작해도 화면이
   * 1·2·3 을 붙여 버리면 회원 눈에는 멀쩡한 목록으로 보인다 — 알 방법이 없어진다.
   */
  ok(/\{k\.n \?\? i \+ 1\}/.test(kpEditor), '본문이 매긴 번호를 그대로 보여준다')
  ok(kpEditor.includes('pkg.keyPointFlaws.length > 0'), '어긋난 목록이면 그 사실을 화면에 적는다')
  ok(kpEditor.includes('본문의 순서가 어긋나 있습니다'), '무엇이 어긋났는지 말한다')
  ok(/\$\{k\.n \?\? i \+ 1\}\. \$\{k\.text\}/.test(kpEditor), '복사한 글에도 본문 번호가 간다')
  ok(/pkg\.keyPoints\.length > 0 &&/.test(kpEditor), '뽑을 것이 없으면 칸을 만들지 않는다')
  // 화면에도 설명이 함께 나와야 한다 — 문구만 보여주면 회원이 다시 본문을 훑는다
  ok(/\{k\.detail && \(/.test(kpEditor), '화면이 부연설명도 보여준다')
  ok(kpEditor.includes('${k.text}${k.detail'), '복사에도 설명이 함께 담긴다')
}

const dupTags = buildCopyPackage({ ...goodPromo, id:'x', status:'draft', storeId:'s', createdAt:'', updatedAt:'', tags:['쌍용동 헬스장','쌍용동헬스장','#쌍용동 헬스장'] })
ok(dupTags.tagList.length === 1, `같은 태그 세 형태가 하나로 합쳐진다 — ${dupTags.tagList.join(',')}`)
/*
 * **한 번에 전부 붙이는 길이 먼저다** (2026-08-26 회원 요청: "지금 태그 붙일려면 하나씩
 * 클릭해서 해야 하는데, 전체 복사해서 붙여넣으면 해시태그로 인식되게 해줘").
 *
 * 태그 **칸**이 한 칸에 하나씩인 것은 그대로다. 대신 **본문 맨 아래**는 `#낱말`이
 * 해시태그로 잡히는 자리라, 거기 한 줄을 붙이면 열한 번 누를 일이 없다. 안 잡히는
 * 에디터가 있을 수 있으니 하나씩 넣는 길도 남겨 두고, 화면이 둘을 순서대로 알려준다.
 */
ok(pkg.tags.split(' ').length === pkg.tagList.length, '한 줄에 태그가 전부 들어간다', pkg.tags)
ok(pkg.tags.split(' ').every((t) => t.startsWith('#')), '낱말마다 # 이 붙는다 (하나만 붙으면 태그 하나로 잡힌다)')
/*
 * **태그는 태그 칸의 것이다** (2026-08-26 회원 결정: "태그는 본문 복사에 넣을 게 아니라
 * 태그 칸에 넣을 키워드들을 추려줘야 하고, 복사버튼 누르면 태그칸에 자동으로 하나씩
 * 인식되어 들어갈 수 있게 해줘야 해").
 *
 * 태그 칸이 무엇으로 태그를 나누는지는 화면마다 다르다 — 쉼표로 나누는 곳, 줄바꿈으로
 * 나누는 곳이 있다. **우리가 지어내지 않는다.** 둘 다 주고 되는 쪽을 쓰게 한다.
 */
/*
 * **재보니 하나씩밖에 안 된다** (2026-08-26 회원 확인: "하나씩 붙이고 엔터를 해야 태그로
 * 인식이 되고 있어"). 쉼표도 줄바꿈도 안 나뉜다.
 *
 * 그래서 한 줄 복사 버튼을 뺐다 — **안 되는 버튼을 남겨 두면 그걸 먼저 눌러 본다.**
 * 실제로 그게 「#쌍용동헬스장,쌍용동헬스장PT…」 태그 하나로 뭉친 원인이었다.
 */
ok(!pkg.tagsPlain.includes('#'), '태그 칸용에는 # 이 없다 (# 이 글자로 들어가면 그것도 태그가 된다)')
/*
 * ── 실측: 네이버 태그 칸은 한 번에 안 받는다 (2026-08-26) ──────
 *
 * 회원이 세 가지를 직접 붙여 보고 전부 한 덩어리로 들어갔다고 알려줬다 —
 * `#`+공백, `#`+쉼표+공백, 그리고 **순수 쉼표**("순수 쉼표도 안나눠져").
 *
 * 그러니 담는 글자의 문제가 아니라 입력칸의 성격이다. 「한 번에 붙이기」 버튼을 세 번
 * 만들고 세 번 다 되돌렸으므로 **다시 만들지 않는다** — 아래 검사가 그 울타리다.
 */
ok(!/[#\s]/.test(pkg.tagsPlain), '보여주는 형태에는 # 도 공백도 없다', pkg.tagsPlain)
ok(pkg.tagsPlain.split(',').length === pkg.tagList.length, '쉼표로만 나뉜다', pkg.tagsPlain)
ok(pkg.checklist.some((c) => c.label.includes('「태그 편집」 칸에 하나씩 붙이고 Enter')), '체크리스트가 붙일 자리와 누를 것을 말한다')
ok(
  pkg.checklist.some((c) => c.detail?.includes('한 번에 여러 개를 받지 않습니다')),
  '왜 하나씩인지도 적는다 (실측이다)'
)
/*
 * **회원이 넣은 태그를 조용히 빼지 않는다** (2026-08-26 회원 요청: "이거 두개는 삭제해줘" —
 * 화면의 「겹치는 태그를 뺐습니다」 안내를 가리켰다).
 *
 * 한때 「쌍용동」처럼 긴 태그에 통째로 들어 있는 것을 뺐다. 그 안내를 지우면서 **빼는 것도
 * 함께 껐다** — 안내만 지우고 빼기를 남기면 태그가 조용히 사라진다.
 */
{
  const dup = buildCopyPackage({
    ...goodPromo, id:'y', status:'draft', storeId:'s', createdAt:'', updatedAt:'',
    tags: ['쌍용동', '쌍용동헬스장', '천안헬스장'],
  })
  ok(dup.tagList.length === 3, '넣은 태그는 그대로 다 남는다', dup.tagList.join(','))
  ok(dup.tagList.includes('쌍용동'), '긴 태그에 들어 있어도 빼지 않는다')
}
{
  // 화면도 같은 순서로 말해야 한다 — 한쪽만 고치면 체크리스트와 카드가 서로 다른 말을 한다
  const { readFileSync: rf } = require('node:fs')
  const ed = rf(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
  // 본문에는 태그를 넣지 않는다 (2026-08-26 회원 결정) — 태그는 태그 칸의 것이다
  const edCode = ed.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok(!edCode.includes('withTags') && !edCode.includes('tagLine'), '본문 복사에 태그 줄을 붙이지 않는다')
  /*
   * **복사 버튼 하나로 줄인다** (2026-08-26 회원 요청: "이 이미지에 있는 기능 다 필요 없고
   * 복사 버튼 누르면 태그편집칸에 인식될 수 있도록 원하는거야").
   *
   * 안 되는 것을 여러 번 고치다 보니 버튼 두 개·순서 세는 칸·번호 붙은 칩이 쌓였다.
   * 회원이 원하는 것은 복사 버튼 하나다.
   */
  ok(ed.includes('label="태그 복사"') && ed.includes('text={pkg.tagsPlain}'), '복사 버튼 하나로 태그를 담는다')
  ok(!edCode.includes('setNext') && !edCode.includes('처음부터 다시'), '순서 세는 장치를 두지 않는다')
  /*
   * 2026-08-28: 핵심 문구 복사 버튼이 하나 늘었다 (회원 요청). **태그 쪽은 그대로 하나다** —
   * 이 검사가 지키려던 것은 「태그 칸에 버튼이 늘어나지 않는 것」이므로 태그 것만 센다.
   */
  ok((ed.match(/<CopyButton/g) ?? []).length === 5, '제목·본문·기록 셋 + 태그 하나 + 핵심 문구 하나', String((ed.match(/<CopyButton/g) ?? []).length))
  ok((ed.match(/label="태그 복사"/g) ?? []).length === 1, '태그 복사 버튼은 하나뿐이다')
  ok(ed.includes('「태그 편집」 칸에 붙여넣고 Enter'), '어디에 붙이고 무엇을 누르는지 한 줄로 말한다')
  ok(ed.includes('눌러서 이 태그만 복사'), '한 번에 안 되면 눌러서 하나만 복사할 수 있다')
  /*
   * **화면 어디서도 여러 태그가 한 줄로 복사되지 않게 한다** (2026-08-26 회원 지적: "태그
   * 아직도 이렇게 나와 — 하나씩 인식이 안된단말이야". 캡처는 `#쌍용동헬스장,MTO피트니…`).
   *
   * 복사 카드에서 한 줄 버튼을 없앴는데도 같은 것이 나왔다. 남은 경로는 **글쓰기 화면의
   * 태그 적는 칸**이다 — 모델이 `#쌍용동헬스장` 꼴로 돌려주면 그 줄이 그대로 뜨고, 회원이
   * 그걸 통째로 복사해 붙이면 태그 하나가 된다.
   */
  ok(/replace\(\/\^#\+\/, ''\)/.test(ed), '태그 칸에 `#` 를 붙여 보여주지 않는다')
  ok(ed.includes('이 줄을 복사해서 네이버에 붙이지 마세요'), '적는 칸을 복사하면 안 된다고 그 자리에서 말한다')
  {
    const write = rf(new URL('../app/api/write/route.ts', import.meta.url), 'utf8')
    ok(/\.map\(\(t\) => t\.replace\(\/\^#\+\/, ''\)\.trim\(\)\)/.test(write), '들어오는 자리에서 `#` 를 뗀다 (모델이 붙여 보낼 때가 있다)')
  }
}
console.log(`  파일명 예: ${pkg.imagePlan[0].fileName} / alt: ${pkg.imagePlan[0].altText}`)

/*
 * 모바일 붙여넣기 — 회원이 그대로 붙여넣고 「문단 정리·가독성이 떨어진다」고 했다.
 * 문단 하나가 한 줄이면 모바일에서 덩어리가 된다. 회원이 손으로 고친 결과물이 기준이다:
 * 한 줄 15~25자, 마디에서 끊고, 두세 줄마다 빈 줄, 소제목 위아래 구분선.
 */
const mobLines = pkg.bodyMobile.split('\n').filter((l) => l.trim() && !/^─+$/.test(l.trim()))
const tooLong = mobLines.filter((l) => l.length > LINE_MAX)
ok(mobLines.length > pkg.blocks.length * 2, `모바일 본문이 잘게 끊긴다 (${pkg.blocks.length}덩어리 → ${mobLines.length}줄)`)
ok(tooLong.length === 0, `상한(${LINE_MAX}자) 넘는 줄 없음 — 가장 긴 줄 ${Math.max(...mobLines.map((l) => l.length))}자`)
ok(pkg.bodyMobile.includes('\n\n'), '덩어리 사이에 빈 줄이 있다')
ok(!pkg.bodyMobile.includes('[이미지'), '모바일 본문에도 이미지 지시문 없음')
ok(!pkg.bodyMobile.includes('##'), '모바일 본문에 소제목 마크업 없음')
ok(pkg.bodyMobile.includes('상담 때 가장 자주 듣는 첫마디'), '모바일 본문에 소제목 텍스트 남음')
ok(/─{5,}\n상담 때/.test(pkg.bodyMobile), '글자만 붙일 때도 소제목 위에 구분선 글자가 있다')

// 마디에서 끊는다 — 글자수로만 끊으면 「여쭤보는 / 게 있어요」처럼 마디 중간이 잘린다
const sample = '쌍용동헬스장 상담 오시는 분들한테 제가 8월 들어서 꼭 여쭤보는 게 있어요.'
ok(clauseLines(sample)[0] === '쌍용동헬스장 상담 오시는 분들한테', `조사 뒤에서 끊는다 — ${clauseLines(sample)[0]}`)
const sample2 = '더워지면 운동복 입기도 귀찮고, 여름 다 갈 때까지 미루다가 가을 되면 또 겨울 준비하자며 미루는 패턴, 실제로 자주 봅니다.'
ok(clauseLines(sample2)[0].endsWith('귀찮고,'), `쉼표 뒤에서 끊는다 — ${clauseLines(sample2)[0]}`)
ok(clauseLines(sample2)[1] === '여름 다 갈 때까지 미루다가', `연결어미 뒤에서 끊는다 — ${clauseLines(sample2)[1]}`)
ok(clauseLines('짧은 문장입니다.').length === 1, '짧은 문장은 안 끊는다')
// 인용 한복판에서 갈리면 누가 한 말인지 눈으로 안 잡힌다
const quoted = clauseLines('"작년에도 이맘때 등록하려고 하셨죠?" 하면 대부분 웃으시더라고요.')
ok(quoted[0] === '"작년에도 이맘때 등록하려고 하셨죠?" 하면', `따옴표가 열린 채로는 안 끊는다 — ${quoted[0]}`)
ok(clauseLines(sample).every((l) => l.length <= LINE_MAX), '모든 줄이 상한 안')

// 문장을 자르지 않는다 — 원문 글자가 그대로 있어야 한다
const squash = (s) => s.replace(/\s+/g, '')
ok(squash(pkg.bodyMobile.replace(/─/g, '')) === squash(pkg.body), '줄만 바꾸고 글자는 그대로다')

// 서식 포함 복사 — 구분선 + 인용구 (회원이 손으로 만들던 모양)
ok((pkg.bodyHtml.match(/<hr/g) ?? []).length === 12, `소제목 6개 위아래로 구분선 ${(pkg.bodyHtml.match(/<hr/g) ?? []).length}개`)
ok((pkg.bodyHtml.match(/<blockquote/g) ?? []).length === 6, `소제목이 인용구로 나간다 (${(pkg.bodyHtml.match(/<blockquote/g) ?? []).length}개)`)
ok(pkg.bodyHtml.includes('border-top:1px solid'), '구분선을 인라인으로도 박았다 (컴포넌트로 안 바뀌어도 보이게)')
ok(pkg.bodyHtml.includes('font-weight:700'), '소제목 굵기를 직접 박았다')
/*
 * ─── 줄마다 문단 하나 (2026-08-31 회원 지적) ────────────────────────
 *
 * 회원: "서식 복사해서 블로그에 붙여넣기 하면 줄바꿈이 안된채로 와."
 *
 * 앞 판은 덩어리를 `<p>` 하나로 내고 줄바꿈을 `<br />` 로 넣었다. 문법으로는 맞는데
 * **네이버 에디터에는 문단 안 줄바꿈이라는 자리가 없다** — 붙여넣기에서 문단 단위로
 * 자기 컴포넌트를 만들고 `<br>` 은 버린다. 애써 끊은 줄이 다시 한 덩어리로 붙었다.
 *
 * 그래서 버려질 수 있는 표시에 기대지 않고, 확실히 남는 블록 요소만 쓴다.
 */
ok(!pkg.bodyHtml.includes('<br'), 'br 에 기대지 않는다 (네이버가 버린다)')
ok((pkg.bodyHtml.match(/<p /g) ?? []).length > pkg.blocks.length, '줄마다 p 하나 — 문단이 잘게 나뉘어 붙는다')
/*
 * **빈 줄도 문단으로 낸다.** 덩어리 사이 간격을 여태 `margin:0 0 26px` 로 줬는데, 네이버는
 * 붙여넣기에서 인라인 스타일을 떼는 경우가 많다 — 그러면 간격이 통째로 사라진다.
 * 빈 문단(`&nbsp;`)은 글자가 있어 지워지지 않고, 스타일이 살든 죽든 같은 모양이 된다.
 */
ok(pkg.bodyHtml.includes('>&nbsp;</p>'), '덩어리 사이 빈 줄을 문단으로 낸다 (여백에 기대지 않는다)')
{
  // 화면도 같은 말을 해야 한다 — 왜 이렇게 보내는지 모르면 안 될 때 손쓸 수가 없다
  const ed = require('node:fs').readFileSync(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
  ok(ed.includes('줄마다 문단 하나'), '왜 줄마다 문단으로 보내는지 화면에 적는다')
  ok(ed.includes('「글자만」'), '그래도 안 되면 어떻게 하는지도 적는다')
}
// 여백과 빈 문단을 같이 쓰면 간격이 두 배가 된다 — 한쪽만 쓴다
ok(!/<p style="[^"]*margin:0 0 \d/.test(pkg.bodyHtml), '아래 여백은 안 준다 (빈 문단이 그 일을 한다)')
{
  // 줄 수가 글자 복사와 맞아야 한다 — 두 모드가 다른 모양이면 어느 쪽이 맞는지 알 수 없다
  const htmlLines = (pkg.bodyHtml.match(/<p [^>]*>(?!&nbsp;)/g) ?? []).length
  const textLines = blocksToText(pkg.blocks, true)
    .split('\n')
    .filter((l) => l.trim() && !/^─+$/.test(l)).length
  // 소제목은 HTML 에서 blockquote 라 p 로 세지 않는다
  const headings = pkg.blocks.filter((b) => b.kind === 'heading').length
  ok(htmlLines === textLines - headings, '서식 복사와 글자 복사의 줄 수가 같다', `${htmlLines} vs ${textLines - headings}`)
}
ok(!/<blockquote[^>]*>\s*##/.test(pkg.bodyHtml), 'HTML 소제목에 ## 이 남지 않음')

// 도망갈 구멍 — 붙여넣기가 이상한 환경에서 예전 모양으로
const boldHtml = blocksToHtml(pkg.blocks, 'bold')
ok(!boldHtml.includes('<hr') && (boldHtml.match(/<h3/g) ?? []).length === 6, '「굵은 글씨」를 고르면 구분선 없이 h3 로 낸다')

ok(blocksToText(toBlocks('## 소제목\n[이미지: 설명]\n본문입니다.'), false) === '소제목\n\n본문입니다.', '이미지 줄은 버리고 소제목·문단만 남는다')
ok(blocksToHtml(toBlocks('<b>꺾쇠</b> 있는 문단')).includes('&lt;b&gt;'), 'HTML 특수문자를 이스케이프한다')
ok(pkg.checklist.some((c) => c.label.includes('모바일 미리보기')), '체크리스트에 모바일 확인이 있다')

// 덩어리 나누기 — 두세 줄마다 빈 줄, 긴 문장 하나는 혼자 한 덩어리
const para = '안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동헬스장 상담 오시는 분들한테 제가 8월 들어서 꼭 여쭤보는 게 있어요. "작년에도 이맘때 등록하려고 하셨죠?" 하면 대부분 웃으시더라고요. 더워지면 운동복 입기도 귀찮고, 여름 다 갈 때까지 미루다가 가을 되면 또 겨울 준비하자며 미루는 패턴, 실제로 자주 봅니다.'
const gs = mobileGroups(para)
ok(gs.length >= 3, `한 문단이 ${gs.length}덩어리로 나뉜다`)
ok(gs.every((g) => g.length <= 4), '한 덩어리가 4줄을 넘지 않는다')
ok(squash(gs.flat().join(' ')) === squash(para), '덩어리로 나눠도 글자는 그대로다')

// 글자가 사라지면 안 된다 — 문장 쪼개기는 짧은 조각을 버리는데, 발행 본문에서는 그게 사고다
const oddPara = '짧다. ? 그래도 남아야 한다.'
ok(squash(mobileGroups(oddPara).flat().join(' ')) === squash(oddPara), '못 끊어도 글자는 안 버린다')

// ─────────────────────────────────────────────────────────────
console.log('\n[8] 후기글 협찬 표기')
const rev = { type:'review', title:'쌍용동 헬스장 3개월 다녀본 후기', mainKeyword:'쌍용동 헬스장', subKeywords:['쌍용동PT'], tags:['쌍용동 헬스장','쌍용동PT'], body:'쌍용동 헬스장을 알아보다 다녀왔습니다.', sponsorship:'sponsored' }
const c4 = checkPost(rev)
ok(c4.items.find(i=>i.id==='sponsorship')?.level === 'fail', '협찬인데 표기 없으면 fail')
/*
 * **태그만으로는 통과가 아니게 바뀌었다** (2026-08-11). 회원 요청으로 표기 자리를 「맨
 * 아래」로 정했고(공정위 지침: 게시물의 처음 또는 끝), 검사가 **위치까지** 본다.
 * 태그에만 있으면 주의 — 본문 맨 마지막에 한 줄이 있어야 통과다.
 */
const c5 = checkPost({ ...rev, tags:[...rev.tags,'협찬후기'] })
ok(c5.items.find(i=>i.id==='sponsorship')?.level === 'warn', '#협찬후기 만 있으면 주의')
const c5b = checkPost({ ...rev, tags:[...rev.tags,'협찬후기'], body: `${rev.body}\n이 글은 제공받아 작성했습니다.` })
ok(c5b.items.find(i=>i.id==='sponsorship')?.level === 'pass', '본문 맨 아래에 한 줄까지 있으면 pass')
const c6 = checkPost({ ...rev, sponsorship:'unset' })
ok(c6.items.find(i=>i.id==='sponsorship')?.level === 'warn', '미지정이면 warn')
ok(checkPost({...rev, title:'쌍용동 헬스장 3개월 다녀본 기록'}).items.find(i=>i.id==='reviewWord')?.level === 'warn', '제목에 "후기" 없으면 warn')

// ─────────────────────────────────────────────────────────────
console.log('\n[20] 후기글 이벤트 정보')
const EV = '3개월 등록 시 1개월 추가, 이번 달까지'
const revTpl = buildTemplate('review', { mainKeyword: '쌍용동 헬스장', subKeywords: ['A', 'B'], eventText: EV })
ok(revTpl.includes(EV), '후기글 골격에 이벤트 정보 반영')
ok(/혜택 소제목/.test(revTpl), '혜택 구간 유지')
ok(revTpl.includes('제가 등록할 때'), '방문객 시점으로 쓰라는 지시 포함')
ok(stripGuides(revTpl).indexOf(EV) === -1, '이벤트 안내는 복사 본문에 남지 않음')

const revNoEv = buildTemplate('review', { mainKeyword: '쌍용동 헬스장', subKeywords: ['A', 'B'] })
ok(revNoEv.includes('이벤트 정보'), '안 넣으면 어디에 적으라고 안내')

// 홍보글 동작은 그대로
ok(
  buildTemplate('promo', { mainKeyword: 'k', subKeywords: ['A', 'B'], eventText: EV }).includes(EV),
  '홍보글 이벤트 반영 유지'
)
// 정보글에는 이벤트가 끼어들지 않는다 (홍보로 넘어가면 목적이 깨진다)
ok(
  !buildTemplate('info', { mainKeyword: 'k', subKeywords: ['A'], eventText: EV }).includes(EV),
  '정보글 골격에는 이벤트를 넣지 않음'
)

// 발행 전 체크리스트 — 지난 이벤트가 살아 있는 글에 남으면 안 된다
const evPkg = buildCopyPackage({
  ...rev, id: 'x', status: 'draft', storeId: 's', body: '쌍용동 헬스장 다녀왔습니다.',
  tags: rev.tags, eventText: EV, createdAt: '', updatedAt: '',
})
// 협찬 표기는 법적 의무라 맨 위를 유지하고, 이벤트 확인이 그 바로 다음에 온다
ok(evPkg.checklist[0].label.includes('대가성'), '협찬 표기가 여전히 맨 위', evPkg.checklist[0].label)
ok(evPkg.checklist[1].label.includes('이벤트 조건'), '이벤트 확인이 그 다음', evPkg.checklist[1].label)
ok(evPkg.checklist[1].detail.includes('1개월 추가'), '입력한 조건을 그대로 보여줌')
const evOwn = buildCopyPackage({
  ...rev, id: 'x', status: 'draft', storeId: 's', sponsorship: 'own',
  tags: rev.tags, eventText: EV, createdAt: '', updatedAt: '',
})
ok(evOwn.checklist[0].label.includes('이벤트 조건'), '협찬이 아니면 이벤트 확인이 맨 위')
ok(
  !buildCopyPackage({ ...rev, id: 'x', status: 'draft', storeId: 's', tags: rev.tags, createdAt: '', updatedAt: '' })
    .checklist.some((c) => c.label.includes('이벤트 조건')),
  '이벤트가 없으면 항목을 넣지 않음'
)

// ─────────────────────────────────────────────────────────────
console.log('\n[9] 등간격 패턴 탐지')
const seg = 'ㄱ'.repeat(120)
const even = Array.from({length:6},()=>`쌍용동 헬스장${seg}`).join('')
ok(checkPost({...goodPromo, body: even}).stats.evenSpacing === true, '완전 등간격 → 탐지')
ok(c1.stats.evenSpacing === false, '자연스러운 배치 → 통과')

// ─────────────────────────────────────────────────────────────
console.log('\n[10] SERP 분석')
const ms = mockBlogSearch('쌍용동 헬스장', 15)
const a = analyzeSerp('쌍용동 헬스장', ms.items, ms.total, true, 15)
ok(a.items.length === 15, 'SERP 15개')
ok(a.items.every(i=>i.keywordPos >= 0), '목업 제목엔 키워드 포함')
ok(a.prescription.length >= 4, `처방 ${a.prescription.length}줄`)
ok(a.stats.commonTokens.every(t => !t.token.includes('쌍용동')), '공통 토큰에서 키워드 자체 제외')
ok(a.stats.datedCount === 15, 'API 결과는 날짜를 다 안다', `${a.stats.datedCount}`)
ok(a.source === 'api', 'source=api')

// ─────────────────────────────────────────────────────────────
console.log('\n[11] 키워드 등급 분포 (목업 캘리브레이션)')
// 임계값이 한쪽으로 쏠리면 도구가 쓸모없어진다.
// 목업이 아니라 **실측 데이터**로 지킨다 — 검색광고 API 월 검색량 +
// 블로그 섹션 검색 최근 30일 발행량 (천안·아산·동탄권 16개, 2026-08-02 측정).
const REAL = [
  ['불당동헬스장', 1900, 504], ['천안헬스장', 3010, 2871], ['두정동헬스장', 1740, 575],
  ['성정동헬스장', 800, 362], ['쌍용동헬스장', 1430, 437], ['동탄헬스장', 3620, 2678],
  ['다리찢기', 2580, 4285], ['천안피부관리', 1460, 4285], ['관저동헬스장', 1410, 229],
  ['천안필라테스', 1240, 1410], ['청당동헬스장', 1190, 145], ['용암동헬스장', 1130, 262],
  ['아산헬스장', 1120, 1465], ['동탄역헬스장', 1040, 895], ['송탄필라테스', 1000, 220],
  ['배방헬스장', 960, 192],
]
const dist = {}
for (const [, vol, recent] of REAL) {
  const g = gradeKeyword(vol, recent).grade
  dist[g] = (dist[g] ?? 0) + 1
}
const n = REAL.length
const pctOf = (g) => ((dist[g] ?? 0) / n) * 100
console.log(`  n=${n} ` + Object.entries(dist).map(([g, c]) => `${g}=${((c/n)*100).toFixed(0)}%`).join(' '))
ok(pctOf('gold') >= 20 && pctOf('gold') <= 60, '황금 키워드 20~60%', `${pctOf('gold').toFixed(0)}%`)
ok(pctOf('good') >= 10, '노려볼 만함 10% 이상', `${pctOf('good').toFixed(0)}%`)
ok(pctOf('hard') >= 10, '경쟁 과열 10% 이상 (전부 쉬워 보이면 안 됨)', `${pctOf('hard').toFixed(0)}%`)
ok(!dist.unknown, '실측값이 다 있으면 판정 불가가 없어야 함')

// 등급 경계 (경쟁률 = 30일 발행량 ÷ 월 검색량, 임계 0.35 / 1.0)
ok(gradeKeyword(1430, 437).grade === 'gold', '1,430회 / 30일 437개 = 0.31 → 황금')
ok(gradeKeyword(1430, 500).grade === 'gold', '0.35 는 황금 경계 포함')
ok(gradeKeyword(1430, 520).grade === 'good', '0.36 → 노려볼 만함')
ok(gradeKeyword(1430, 1430).grade === 'good', '1.0 는 아직 과열 아님')
ok(gradeKeyword(1430, 1500).grade === 'hard', '1.05 → 과열')
ok(gradeKeyword(120, 30).grade === 'toosmall', '검색량 120 → 검색량 부족')
ok(gradeKeyword(50000, 1000).grade === 'toobig', '검색량 5만 → 대형 키워드')
// 검색량이 적정 구간 밖이면 경쟁률이 낮아도 황금은 아니다
ok(gradeKeyword(400, 50).grade === 'good', '검색량 400 + 경쟁률 0.13 → 황금 아님(적정 구간 밖)')
// 사람이 읽는 문장으로 번역되는지
ok(gradeKeyword(1430, 437).reason.includes('검색 3회당 새 글 1개'), '경쟁률을 말로 풀어줌',
  gradeKeyword(1430, 437).reason.slice(0, 60))

// ─────────────────────────────────────────────────────────────
console.log('\n[12] 순위 구간 판정 (발행 후 경과일)')
const cases = [
  [0, null, 'indexing', 'info'],
  [3, null, 'indexing', 'info'],
  [4, null, 'earlyResponse', 'info'],
  [7, null, 'earlyResponse', 'info'],
  [8, null, 'settling', 'warn'],
  [21, null, 'settling', 'warn'],
  [22, null, 'settled', 'bad'],
  [60, null, 'settled', 'bad'],
  [1, 5, 'indexing', 'info'],
  [10, 5, 'settling', 'good'],
  [30, 5, 'settled', 'good'],
]
for (const [age, rank, expPhase, expTone] of cases) {
  const p = phaseOf(age, rank)
  ok(
    p.phase === expPhase && p.tone === expTone,
    `${age}일차 / ${rank === null ? '순위밖' : rank + '위'} → ${expPhase}(${expTone})`,
    `실제 ${p.phase}(${p.tone}) "${p.label}"`
  )
}
ok(phaseOf(null, null) === null, '발행일 없으면 구간 판정 안 함')

console.log('\n[13] 같은 순위밖도 시점에 따라 해석이 달라야 함')
const early = phaseOf(2, null)
const late = phaseOf(30, null)
ok(early.tone === 'info' && late.tone === 'bad', '3일차는 정상 안내 / 30일차는 실패 경고')
ok(/정상/.test(early.note), '3일차 안내에 "정상" 포함', early.note.slice(0, 40))
ok(/실패/.test(late.note), '30일차 안내에 "실패" 포함', late.note.slice(0, 40))

console.log('\n[14] 발행일 출처 우선순위')
const today = new Date()
const iso = (d) => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10)

const posts = [{ id: 'p1', publishedAt: iso(30) }]
const v1 = buildRankViews([{ id: 't1', keyword: 'k', url: 'u', postId: 'p1', createdAt: '' }], [], posts)[0]
ok(v1.ageDays === 30, '연결된 글의 발행일에서 경과일 계산', `${v1.ageDays}일`)
ok(v1.phase?.phase === 'settled', '30일 → settled')

const v2 = buildRankViews(
  [{ id: 't2', keyword: 'k', url: 'u', postId: 'p1', publishedAt: iso(1), createdAt: '' }],
  [],
  posts
)[0]
ok(v2.ageDays === 1, '추적 항목에 적은 발행일이 우선', `${v2.ageDays}일`)

const v3 = buildRankViews([{ id: 't3', keyword: 'k', url: 'u', createdAt: '' }], [], posts)[0]
ok(v3.ageDays === null && v3.phase === null, '발행일 없으면 null')

console.log('\n[15] 순위 변동 계산 (기존 동작 유지)')
const snaps = [
  { id: 's1', targetId: 't4', date: iso(2), rank: 12 },
  { id: 's2', targetId: 't4', date: iso(1), rank: 7 },
]
const v4 = buildRankViews([{ id: 't4', keyword: 'k', url: 'u', publishedAt: iso(10), createdAt: '' }], snaps)[0]
ok(v4.current === 7 && v4.previous === 12, '현재/직전 순위')
ok(v4.delta === 5, '변동 = 12 → 7 = 5칸 상승', `${v4.delta}`)
ok(v4.best === 7, '최고 순위')
ok(v4.phase?.tone === 'good', '10일차 + 7위 → good')

// ─────────────────────────────────────────────────────────────
console.log('\n[16] 검색 결과 붙여넣기 파싱')
// 실제 화면을 긁으면 블로거명·제목·요약·날짜가 순서대로 섞여 들어온다
const glued = `블로그
관련도순
천안 운동일기
쌍용동 헬스장 3개월 다녀본 솔직 후기
직접 다녀오고 정리한 내용입니다. 시설과 운영시간을 순서대로 적어봤어요...
2026. 7. 28.
공감 12
직장인 운동루틴
쌍용동 헬스장 등록 전에 꼭 확인할 것들
가격보다 중요한 부분들을 짚어봤습니다...
2026.07.11.
https://blog.naver.com/blog12345
1-10 / 2,345건`
const pp = parsePastedSerp(glued)
ok(pp.items.length === 3, `제목 후보 ${pp.items.length}개 추출`)
ok(pp.items.some((i) => i.title.includes('3개월 다녀본')), '제목 줄을 골라냄')
ok(!pp.items.some((i) => i.title === '관련도순'), 'UI 텍스트는 버림')
ok(!pp.items.some((i) => /^https?:/.test(i.title)), 'URL 줄은 버림')
ok(!pp.items.some((i) => i.title.includes('직접 다녀오고')), '"..." 로 끝나는 본문 발췌는 버림')
ok(!pp.items.some((i) => i.title.includes('2,345건')), '숫자만 있는 줄(1-10 / 2,345건)은 버림')
ok(pp.items[0].date === '2026-07-28', `가까운 날짜를 붙임 — ${pp.items[0].date}`)
ok(pp.dropped > 0, `제목 아닌 줄 ${pp.dropped}개 버림`)
// 키워드를 주면 제목 위의 짧은 블로거명 줄을 제목과 구분한다
const pk = parsePastedSerp(glued, '쌍용동 헬스장')
ok(pk.items.length === 2, `키워드를 주면 제목만 ${pk.items.length}개`, pk.items.map((i) => i.title).join(' / '))
ok(pk.items[0].blogger === '천안 운동일기', `블로거명을 짝지음 — ${pk.items[0].blogger}`)
ok(pk.items[1].blogger === '직장인 운동루틴', `두 번째도 짝지음 — ${pk.items[1].blogger}`)
ok(!pk.items.some((i) => i.title === '직장인 운동루틴'), '블로거명을 제목으로 세지 않음')
ok(pk.items[1].date === '2026-07-11', `두 번째 날짜 — ${pk.items[1].date}`)

ok(parseTotalCount('1-10 / 2,345건') === 2345, '발행량 "2,345건" → 2345')
ok(parseTotalCount('건수 없음') === null, '발행량 없으면 null')
ok(toEditableText(pp.items).split('\n').length === pp.items.length, '편집용 텍스트 한 줄 = 한 항목')

console.log('\n[17] 편집한 목록은 그대로 신뢰한다')
// 사용자가 눈으로 확인·수정한 목록은 "제목 같지 않다"는 이유로 버리면 안 된다
const edited = parseEditedList(`짧은글 | 2026-07-28 | 천안 운동일기
날짜없는 제목입니다

이상한날짜 | 어쩌구`)
ok(edited.length === 3, `빈 줄만 빼고 3개 유지 — ${edited.length}개`)
ok(edited[0].date === '2026-07-28' && edited[0].blogger === '천안 운동일기', '날짜·블로거 읽음')
ok(edited[1].date === null, '날짜 없어도 버리지 않음')
ok(edited[2].date === null, '못 읽는 날짜는 null')

console.log('\n[18] 붙여넣기 분석 — 모르는 값을 0으로 계산하지 않는다')
const pasteItems = [
  { title: '쌍용동 헬스장 3개월 다녀본 솔직 후기', date: '2026-07-28', blogger: '천안 운동일기' },
  { title: '쌍용동 헬스장 등록 전에 꼭 확인할 것들', date: null, blogger: null },
  { title: '초보도 편했던 쌍용동 헬스장 시설 정리', date: null, blogger: null },
  { title: '쌍용동 헬스장 가격보다 중요한 3가지', date: null, blogger: null },
]
const pa = analyzePastedSerp('쌍용동 헬스장', pasteItems, 0)
ok(pa.source === 'paste' && pa.mock === false, '붙여넣기 결과는 mock 이 아니다')
ok(pa.items.length === 4 && pa.items[0].rank === 1, '붙여넣은 순서 = 순위')
ok(pa.stats.datedCount === 1, `날짜 아는 항목만 1개 — ${pa.stats.datedCount}`)
ok(pa.stats.avgAgeDays > 0, '평균 나이를 0일로 만들지 않음', `${pa.stats.avgAgeDays}일`)
ok(
  pa.prescription.some((p) => p.includes('최신성은 판단하지 않았습니다')),
  '근거 부족하면 최신성 처방을 빼고 그 사실을 알림'
)
ok(
  !pa.prescription.some((p) => p.includes('7일 이내 글')),
  '근거 부족하면 7일 기준도 말하지 않는다'
)

/*
 * ─── 「한 주 안에 뚫린 자리가 있나」 ──────────────────────────────
 *
 * 회원 제안 (2026-08-18): "7일 이내 7% 정도가 상위노출되는데 왜 노출되는지 분석해서 그에
 * 맞는 글쓰기를 할 수 있게 업데이트해보는 건 어떨까?"
 *
 * 재보니 **글의 형태로는 안 갈렸다** (7일 이내 진입 글 vs 31일 이상 글: 글자수 1,649 대
 * 1,711 · 이미지 14 대 18 · 정보 낱말 6 대 7 · 홍보 낱말 3 대 3). 그래서 글쓰기 규칙을
 * 새로 만들지 않고, **고를 수 있는 것**(어느 키워드를 잡느냐)을 재서 알려준다.
 */
{
  const day = (n) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const withDates = (ages) =>
    ages.map((a, i) => ({ title: `쌍용동 헬스장 ${i + 1}번째 글입니다`, date: day(a), blogger: `b${i}` }))

  const open = analyzePastedSerp('쌍용동 헬스장', withDates([3, 40, 55, 60, 70, 80, 90, 100, 120, 140]), 0)
  ok(open.stats.freshWithin7d === 1, '7일 이내 글을 센다', String(open.stats.freshWithin7d))
  ok(open.stats.youngestAgeDays === 3, '가장 어린 글의 나이를 남긴다', String(open.stats.youngestAgeDays))
  ok(
    open.prescription.some((p) => p.includes('뚫고 들어오는 자리')),
    '한 주 안에 들어온 글이 있으면 기회라고 말한다'
  )

  const shut = analyzePastedSerp('쌍용동 헬스장', withDates([31, 40, 55, 60, 70, 80, 90, 100, 120, 140]), 0)
  ok(shut.stats.freshWithin7d === 0, '없으면 0편', String(shut.stats.freshWithin7d))
  ok(
    shut.prescription.some((p) => p.includes('자리가 굳어')),
    '한 편도 없으면 굳은 자리라고 말하고 세부 키워드를 권한다'
  )
  ok(
    shut.prescription.some((p) => p.includes('발행량이 더 적은 세부 키워드')),
    '굳은 자리에서는 다음 행동을 준다'
  )
}
ok(
  !pa.prescription.some((p) => p.includes('누적 발행량 0건')),
  '발행량 모르면 0건이라고 말하지 않음'
)
ok(pa.stats.repeatBloggers.length === 0, '이름 모르는 항목끼리 같은 블로거로 묶지 않음')
ok(pa.stats.keywordInTitleRate === 100, '제목 키워드 포함율은 그대로 계산')

const paDated = analyzePastedSerp(
  '쌍용동 헬스장',
  pasteItems.map((p, i) => ({ ...p, date: `2026-07-${String(10 + i).padStart(2, '0')}`, blogger: '천안 운동일기' })),
  2345
)
ok(paDated.stats.datedCount === 4, '날짜를 다 넣으면 4개')
ok(paDated.stats.repeatBloggers[0]?.count === 4, '같은 블로거 선점 탐지')
ok(
  paDated.prescription.some((p) => p.includes('최근 30일에 새 글 2,345개')),
  '발행량이 처방에 반영 (30일 기준)',
  paDated.prescription.find((p) => p.includes('2,345'))?.slice(0, 50)
)

console.log('\n[21] 못 읽은 값으로 등급을 만들지 않는다')
// 검색 권한이 없는 계정에서 발행량 조회가 실패하면 total 이 비어 온다.
// 이걸 0 으로 대신 쓰면 경쟁률 0 → "황금 키워드" 라는 거짓 판정이 나왔다.
const gNoTotal = gradeKeyword(1870, null)
ok(gNoTotal.grade === 'unknown', `발행량 없음 → unknown (0으로 계산 안 함) — ${gNoTotal.grade}`)
ok(gNoTotal.competition === 999, `경쟁률은 계산 불가 표시 — ${gNoTotal.competition}`)
ok(gNoTotal.reason.includes('30일 발행량'), '무엇이 없어서 못 했는지 알림')
ok(gNoTotal.reason.includes('직접 넣으면'), '어디서 채우면 되는지 알림')
ok(gradeKeyword(1870, 0).grade === 'unknown', '발행량 0 도 unknown 취급')
ok(gradeKeyword(0, 437).grade === 'unknown', '검색량 없음 → unknown')
ok(gradeKeyword(0, null).reason.includes('검색량과 발행량'), '둘 다 없으면 둘 다 언급')
// 검색량만으로 판정되는 것은 발행량 없이도 그대로 판정한다
ok(gradeKeyword(120, null).grade === 'toosmall', '검색량 부족은 발행량 없이도 판정')
ok(gradeKeyword(50000, null).grade === 'toobig', '대형 키워드도 발행량 없이 판정')
// 정상 경로는 그대로
ok(gradeKeyword(1500, 400).grade === 'gold', '정상 입력은 그대로 판정')

// 검색광고 API 실측 검색량 + 눈으로 본 발행량을 합치는 경로 (표에서 발행량만 채우기)
console.log('\n[22] 실측 검색량 + 직접 넣은 발행량')
const apiRow = buildMetric({
  keyword: '쌍용동 헬스장', monthlySearch: 1430, monthlyPc: 460, monthlyMobile: 970,
  blogRecent: null, compIdx: '높음', mock: false,
})
ok(apiRow.grade === 'unknown', '발행량 전에는 판정 불가')
ok(apiRow.mobileShare === 68, `모바일 비중은 실측으로 계산 — ${apiRow.mobileShare}%`)

const filled = buildMetric({
  keyword: apiRow.keyword, monthlySearch: apiRow.monthlySearch, monthlyPc: apiRow.monthlyPc,
  monthlyMobile: apiRow.monthlyMobile, blogRecent: 437, compIdx: apiRow.compIdx,
  mock: apiRow.mock, source: apiRow.source,
})
ok(filled.competition === 0.31, `경쟁률 437÷1,430 = 0.31 — ${filled.competition}`)
ok(filled.grade === 'gold', `등급이 바로 나옴 — ${filled.grade}`)
ok(filled.mock === false, '실측 검색량이므로 샘플 아님')
ok(filled.monthlySearch === 1430, '검색량은 다시 적지 않아도 유지')
ok(
  buildMetric({ ...apiRow, blogRecent: 3000 }).grade === 'hard',
  '발행량을 크게 넣으면 과열로 바뀜'
)

console.log('\n[25] 네이버 플레이스 정보 읽기')
// 스마트플레이스(사업주 콘솔)는 로그인이 필요하지만, 누구나 보는 통합검색 결과에
// 플레이스 정보가 JSON 으로 들어 있다. 실제 응답에서 가져온 형태를 그대로 픽스처로 쓴다.
const PLACE_HTML = `<script>window.x = {"a":[{"id":"11716617","name":"쌍용동헬스장 \u003Cmark\u003EMTO피트니스 쌍용점\u003C/mark\u003E PT","normalizedName":"쌍용동헬스장 MTO피트니스 쌍용점 PT","category":"헬스장","dbType":"drt","roadAddress":"미라7길 26 쌍봉빌딩 4층","address":"쌍용동 1149","fullAddress":"충청남도 천안시 서북구 미라7길 26 쌍봉빌딩 4층","commonAddress":"충남 천안시 서북구 쌍용동","bookingUrl":"https:\u002F\u002Fm.booking.naver.com\u002Fbooking\u002F13\u002Fbizes\u002F752510","phone":null,"virtualPhone":"0507-1360-4284","businessHours":null},{"id":"2010888683","name":"\u003Cmark\u003E여성전용착한헬스\u003C/mark\u003E&amp;PT 두정점","normalizedName":"여성전용착한헬스&PT 두정점","category":"헬스장","roadAddress":"두정중11길 62 101, 201호","address":"두정동 1561","commonAddress":"충남 천안시 서북구 두정동","bookingUrl":null,"phone":null,"virtualPhone":null}]};</script>`

const pr = parsePlaceRecords(PLACE_HTML)
ok(pr.length === 2, `업체 ${pr.length}곳 추출`)
ok(pr[0].id === '11716617', 'place id 추출')
ok(pr[0].name === '쌍용동헬스장 MTO피트니스 쌍용점 PT', `강조 태그 제거 — ${pr[0].name}`)
ok(pr[1].name === '여성전용착한헬스&PT 두정점', `HTML 엔티티 복원 — ${pr[1].name}`)
ok(pr[0].commonAddress === '충남 천안시 서북구 쌍용동', '시·구·동 주소')
ok(pr[0].roadAddress === '미라7길 26 쌍봉빌딩 4층', '도로명 상세')
ok(pr[0].phone === '0507-1360-4284', '전화가 비어 있으면 안심번호를 쓴다')
ok(pr[1].phone === null, '둘 다 없으면 null')
ok(pr[0].bookingUrl?.includes('m.booking.naver.com'), `예약 링크 — ${pr[0].bookingUrl}`)
ok(pr[1].bookingUrl === null, '예약 링크 없으면 null')
ok(pr[0].placeUrl === 'https://m.place.naver.com/place/11716617/home', '플레이스 주소 생성')
ok(parsePlaceRecords('플레이스가 없는 페이지').length === 0, '없으면 빈 배열')
ok(parsePlaceRecords('{"commonAddress":"깨진 JSON').length === 0, '깨진 JSON 은 건너뜀')

// 같은 업체가 페이지에 여러 번 나와도 한 번만
ok(parsePlaceRecords(PLACE_HTML + PLACE_HTML).length === 2, '중복 업체 제거')

const placeAreas1 = areasFromPlace(pr[0])
ok(placeAreas1.includes('쌍용동'), `플레이스 주소에서 동네 — ${placeAreas1.join(',')}`)
ok(!placeAreas1.some((a) => a.includes('시') || a.includes('구')), '시·구는 동네로 안 셈', placeAreas1.join(','))
ok(areasFromPlace(pr[1]).includes('두정동'), '두정동 추출')

// 플레이스 노출 목록에서 내 지점 찾기 — 등록 이름에 키워드가 덧붙어 있어 단순 비교로는 안 된다
console.log('\n[28] 연관 키워드 — 내 지역 ∧ 헬스 업종만')
// 이 앱은 헬스장 블로그 도구다. 검색광고 API 가 준 것을 그대로 흘리면 천안테니스·
// 세종피부관리·다리찢기까지 나와서 정작 볼 키워드가 묻힌다.
// 아래 목록은 실제로 배포 서버에서 나왔던 것들이다.
const REGION_STORES = [
  { location: '쌍용동 먹자골목 인근', localKeywords: ['쌍용동 헬스장', '쌍용동PT', '봉명동 헬스장', '쌍용동 24시헬스장'] },
  { location: '성정동 뚜쥬르에서 도보 10분', localKeywords: ['성정동 헬스장', '천안 성정동 헬스장', '성정동 여성전용'] },
  { location: '용곡동 파리바게뜨 건물 2층', localKeywords: ['용곡동 헬스장', '신방동 헬스장'] },
  { location: '천주교 두정동성당 아래', localKeywords: ['두정동 헬스장', '천안 두정동 헬스장'] },
]
const MYREGION = myRegionTokens(REGION_STORES)
ok(MYREGION.has('쌍용동') && MYREGION.has('두정동'), `동네를 뽑음 — ${[...MYREGION].slice(0, 6).join(',')}`)
ok(MYREGION.has('천안'), '시 이름도 뽑음')
ok(!MYREGION.has('헬스장') && !MYREGION.has('PT'), '업종은 지역이 아님')
ok(!MYREGION.has('여성전용'), '의도 단어도 지역이 아님')

const keep = (k) => isRelevantKeyword(k, MYREGION)
// 남겨야 하는 것 — 내 지역 + 헬스 업종
ok(keep('쌍용동헬스장'), '내 동네 헬스장 통과')
ok(keep('두정동헬스장'), '다른 지점 동네도 통과')
ok(keep('신방동헬스장'), '인접 동네 통과')
ok(keep('천안헬스장'), '내 시 헬스장 통과')
ok(keep('천안PT'), '내 시 PT 통과')
ok(keep('쌍용동 헬스장 새벽'), '의도가 붙어도 통과')
ok(keep('천안다이어트'), '다이어트는 헬스 업종으로 본다')
// 다른 지역
ok(!keep('대전헬스장'), '대전헬스장 제외')
ok(!keep('세종헬스장'), '세종헬스장 제외')
ok(!keep('월평동헬스장'), '월평동(대전) 제외')
ok(!keep('배방헬스장'), '배방(아산) 제외')
ok(!keep('아산탕정'), '아산탕정 제외')
// 같은 동 이름이 다른 도시에 있는 경우 — 이게 지난 필터가 놓친 것
ok(!keep('대전봉명동헬스장'), '"대전 봉명동" 은 내 봉명동이 아니다')
ok(!keep('대전 유성구 봉명동 헬스장'), '시·구가 다르면 제외')
// 다른 업종
ok(!keep('천안필라테스'), '필라테스 제외')
ok(!keep('천안요가'), '요가 제외')
ok(!keep('천안테니스'), '테니스 제외')
ok(!keep('천안크로스핏'), '크로스핏 제외')
ok(!keep('세종피부관리'), '피부관리 제외')
ok(!keep('천안다이어트한의원'), '한의원은 다이어트가 붙어도 제외')
// 업종·지역이 없는 것
ok(!keep('다리찢기'), '업종·지역 없는 말 제외')
ok(!keep('실내운동'), '지역 없는 말 제외')
ok(!keep('팀터틀랫'), '남의 상호 제외')
ok(!keep('대전포레스핏'), '다른 지역 브랜드 제외')
ok(!keep('바디앤솔필라테스'), '남의 브랜드 제외')

console.log('\n[27] 플레이스 목록 붙여넣기 — 번호 세기')
// 통합검색은 7곳까지만 주고 플레이스 API 는 캡차로 막혀 있다. 8위 이후는 사람이 목록을
// 봐야 하는데 눈으로 세면 틀린다. 붙여넣으면 순서대로 업체명만 뽑아 번호를 매긴다.
const PLACE_PASTE = `거리순
365짐 천안두정점
헬스장
영업 중
리뷰 128
1공단1길 52 센트하임 2층
0.4km
드래곤짐 그린점
헬스장
영업 종료
오성로 47 현대철건물 2층
365짐 여성전용 헬스
피트니스
예약
미라온휘트니스 천안두정점
필라테스
여성전용착한헬스&PT 두정점
헬스장
두정중11길 62 101, 201호`
const pls = parsePlaceList(PLACE_PASTE)
ok(pls.length === 5, `업체 5곳 추출 — ${pls.length}곳: ${pls.join(' / ')}`)
ok(pls[0] === '365짐 천안두정점', '첫 업체')
ok(pls[4] === '여성전용착한헬스&PT 두정점', `5번째가 내 지점 — ${pls[4]}`)
ok(!pls.includes('헬스장'), '업종만 적힌 줄은 업체가 아니다')
ok(!pls.includes('피트니스'), '업종 줄 제외 (피트니스)')
ok(!pls.some((x) => /영업/.test(x)), '영업 상태 줄 제외')
ok(!pls.some((x) => /^리뷰/.test(x)), '리뷰 줄 제외')
ok(!pls.some((x) => /길 \d/.test(x)), '주소 줄 제외', pls.filter((x) => /길 \d/.test(x)).join(','))
ok(!pls.includes('0.4km'), '거리 줄 제외')
ok(!pls.includes('거리순'), '정렬 옵션 제외')
ok(parsePlaceList('').length === 0, '빈 입력은 빈 배열')
// 같은 이름이 연달아 나오는 화면도 한 번만
ok(parsePlaceList('365짐 천안두정점\n365짐 천안두정점\n드래곤짐 그린점').length === 2, '연속 중복 제거')

console.log('\n[26] 플레이스 목록에서 내 지점 찾기')
const LIST = [
  { id: '1', name: '미녀와야수짐 봉명점 헬스&PT' },
  { id: '2', name: '청년헬스 천안1호점' },
  { id: '3', name: '천안 쌍용동 헬스&PT 24시 짐그로우' },
  { id: '11716617', name: '쌍용동헬스장 MTO피트니스 쌍용점 PT' },
]
const MY = [
  { name: '쌍용점', legalName: 'MTO 피트니스 쌍용점' },
  { name: '용곡점', legalName: '여성전용 착한헬스 용곡점' },
]
const f1 = findMyPlaceIndex(LIST, MY)
ok(f1.index === 3, `이름으로 4번째에서 찾음 — ${f1.index + 1}번째`)
ok(f1.storeName === '쌍용점', `어느 지점인지 알려줌 — ${f1.storeName}`)

// placeId 가 있으면 이름이 달라도 정확히 맞춘다 (성정점처럼 등록 이름이 다른 경우)
const f2 = findMyPlaceIndex(
  [{ id: '1860572727', name: '성정동 착한 헬스장' }],
  [{ name: '성정점', legalName: '여성전용 착한헬스 성정점', placeId: '1860572727' }]
)
ok(f2.index === 0 && f2.storeName === '성정점', 'placeId 로 정확히 맞춤')
ok(
  findMyPlaceIndex([{ id: 'x', name: '성정동 착한 헬스장' }], [{ name: '성정점', legalName: '여성전용 착한헬스 성정점' }]).index === -1,
  'placeId 없고 이름이 다르면 못 찾는다고 말한다'
)

// 어절이 &·공백으로 갈라져 있어도 맞춘다
ok(
  findMyPlaceIndex([{ id: 'y', name: '여성전용착한헬스&PT 용곡점' }], MY).index === 0,
  '"여성전용착한헬스&PT 용곡점" 도 맞춤'
)
// 한 어절만 겹치는 다른 업체를 내 지점으로 착각하면 안 된다
ok(
  findMyPlaceIndex([{ id: 'z', name: '다른브랜드 용곡점' }], MY).index === -1,
  '어절 하나만 겹치면 내 지점이 아니다'
)
ok(findMyPlaceIndex([], MY).index === -1, '빈 목록은 -1')
ok(findMyPlaceIndex(LIST, []).index === -1, '지점이 없으면 -1')

console.log('\n[24] 지점 정보에서 동네 뽑기')
// 스마트플레이스는 로그인이 필요하고 지도 검색은 서버 IP 에 캡차가 걸려 자동 수집이 안 된다.
// 대신 이미 적어둔 주소·지역 키워드에서 뽑는다 — 네트워크를 안 타니 항상 성공한다.
const S1 = {
  location: '쌍용동 먹자골목 인근 도보 5분, 신협 바로 뒷건물 4층 (맛나감자탕 앞건물 4층)',
  localKeywords: ['쌍용동 헬스장', '쌍용동PT', '봉명동 헬스장', '봉명동 PT', '쌍용동 24시헬스장'],
  open24: true, womenOnly: false,
}
const a1 = areasFromStore(S1)
ok(a1.includes('쌍용동') && a1.includes('봉명동'), `주소·키워드에서 동네 추출 — ${a1.join(',')}`)
ok(!a1.some((a) => a.includes('골목') || a.includes('건물')), '주소의 다른 말은 안 걸림', a1.join(','))
ok(a1.length === new Set(a1).size, '중복 없음')

// "두정동성당" 처럼 동으로 끝나지 않는 말을 동네로 착각하면 안 된다
const S2 = {
  location: '천주교 두정동성당 바로 아래 도보 1분 / 두정로지오3차 도보 2~3분 / 두정역 1번 출구',
  localKeywords: ['두정동 헬스장', '천안 두정동 헬스장'],
  open24: true, womenOnly: true,
}
const a2 = areasFromStore(S2)
ok(a2.includes('두정동'), `지역 키워드에서 두정동 — ${a2.join(',')}`)
ok(!a2.includes('두정동성당'), '"두정동성당"을 동네로 보지 않음')
ok(!a2.some((a) => a.includes('역')), '"두정역"도 동네로 보지 않음', a2.join(','))
ok(areasFromStore({}).length === 0, '정보가 없으면 빈 배열')

// 지점 성격에 맞는 의도가 앞에 온다
const sf2 = suffixesForStore(S2)
ok(sf2[0].includes('여성전용'), `여성전용 지점은 여성전용이 먼저 — ${sf2[0]}`)
ok(sf2.some((x) => x.includes('24시')), '24시간 운영이면 24시 포함')
ok(!sf2.includes('헬스 초보'), '여성전용에는 초보 접미사를 안 넣음')
const sf1 = suffixesForStore(S1)
ok(!sf1.some((x) => x.includes('여성전용')), '남녀공용 지점에는 여성전용을 안 넣음')
ok(sf1.length <= 12, `접미사 12개 이하 — ${sf1.length}개`)

const combos = combineLocalKeywords(a1, sf1)
ok(combos.length === a1.length * sf1.length, `조합 ${combos.length}개 = ${a1.length}동네 × ${sf1.length}의도`)
ok(combos.includes('쌍용동 24시 헬스장'), '지점 강점이 조합에 반영')

console.log('\n[23] 발행량 자동 조회 — 1,000 캡 처리')
// 이 엔드포인트의 totalCount 는 1,000 에서 잘린다. 잘린 값을 실제 값처럼 쓰면
// "헬스장"과 "쌍용동 헬스장"이 똑같이 1,000 으로 보여 경쟁률이 거짓이 된다.
ok(parseSectionTotal(`)]}',\n{"result":{"totalCount":437,"searchList":[]}}`) === 437, '건수 파싱')
ok(parseSectionTotal('{"totalCount": 1000 }') === 1000, '공백 있어도 파싱')
ok(parseSectionTotal('건수가 없는 응답') === null, '못 읽으면 null')
ok(parseSectionTotal('') === null, '빈 응답도 null')
ok(SECTION_CAP === 1000, '캡은 1,000')
ok(monthlyFromWeek(103) === 441, '7일 103개 → 30일 441개 환산', `${monthlyFromWeek(103)}`)

const rExact = resolveRecent(437, null)
ok(rExact.count === 437 && rExact.note === 'exact', '30일이 캡 아래면 그대로 씀')
const rEst = resolveRecent(1000, 670)
ok(rEst.count === monthlyFromWeek(670) && rEst.note === 'estimated', '30일이 잘리면 7일 환산', `${rEst.count}`)
const rAtLeast = resolveRecent(1000, 1000)
ok(rAtLeast.note === 'atLeast', '7일도 잘리면 하한으로만 말함')
ok(rAtLeast.count === monthlyFromWeek(1000), `하한값 ${rAtLeast.count}`)
ok(resolveRecent(null, null).count === null, '조회 실패는 null (0 으로 바꾸지 않음)')
ok(resolveRecent(1000, null).note === 'atLeast', '7일 조회까지 실패하면 하한 처리')
// 실측 사례: 천안헬스장 검색량 3,010 / 30일 캡 → 7일 670 → 환산 2,871 → 0.95 = good.
// 잘린 1,000 을 그대로 썼다면 0.33 으로 "황금 키워드" 라는 거짓 판정이 나왔다.
const gEst = gradeKeyword(3010, resolveRecent(1000, 670).count)
ok(gEst.competition === 0.95 && gEst.grade === 'good', '환산값으로 등급이 나온다', `${gEst.competition} / ${gEst.grade}`)
ok(gradeKeyword(3010, 1000).grade === 'gold', '캡 값을 그대로 썼다면 거짓 황금이 됐을 상황', '이래서 환산이 필요하다')

console.log('\n[19] 직접 입력 → 경쟁률 등급')
const mr = parseManualRows(`쌍용동 헬스장, 1,430, 437
성정동 여성전용 헬스장 | 800회 | 362건
두정동 헬스장\t1740\t575
다리찢기, 2,580, 4,285
이건 숫자가 없음
봉명동 헬스장, 1200`)
ok(mr.rows.length === 4, `읽은 줄 4개 — ${mr.rows.length}개`)
ok(mr.bad.length === 2, `못 읽은 줄 2개 — ${mr.bad.length}개`)
ok(mr.rows[0].keyword === '쌍용동 헬스장', '천단위 콤마를 구분자로 착각하지 않음', mr.rows[0].keyword)
ok(mr.rows[0].monthlySearch === 1430 && mr.rows[0].blogRecent === 437, '숫자 두 개 파싱')
ok(mr.rows[1].monthlySearch === 800 && mr.rows[1].blogRecent === 362, '| 구분 + 회/건 단위 허용')
ok(mr.rows[2].blogRecent === 575, '탭 구분 허용')
ok(mr.rows[3].blogRecent === 4285, '발행량 쪽 천단위 콤마도 파싱', `${mr.rows[3].blogRecent}`)

const mm = buildManualMetrics(mr.rows)
ok(mm.every((m) => m.mock === false && m.source === 'manual'), '직접 입력은 실측값으로 표시')
ok(mm[0].competition === 0.31, `경쟁률 437÷1,430 = 0.31 — ${mm[0].competition}`)
ok(mm[0].grade === 'gold', `등급 gold — ${mm[0].grade}`)
ok(mm[1].grade === 'good', `800회·경쟁률 0.45 → good — ${mm[1].grade}`)
ok(mm[2].grade === 'gold', `1,740회·경쟁률 0.33 → gold — ${mm[2].grade}`)
ok(mm[3].grade === 'hard', `2,580회·경쟁률 1.66 → hard — ${mm[3].grade}`)
ok(
  buildManualMetrics([{ keyword: 'k', monthlySearch: 1000, blogRecent: 2000 }])[0].grade === 'hard',
  '경쟁률 2.0 → hard'
)

console.log('\n[29] 상위노출 분석 — 붙여넣기 없이 상위 글 목록 읽기')
// 실제 응답 모양 그대로 (프리픽스 `)]}',` 포함, 제목에 <b> 강조, addDate 는 epoch 밀리초).
// 이 파싱이 되면 사용자가 검색 결과를 복사·붙여넣을 이유가 없어진다.
const SECTION_BODY = `)]}',
{"result":{"totalCount":437,"searchList":[
 {"postUrl":"https://blog.naver.com/heenu/223001","title":"천안헬스장 추천 <b>두정동</b> 미라온휘트니스 여름준비","noTagTitle":"천안헬스장 추천 두정동 미라온휘트니스 여름준비","nickName":"헤누","blogName":"헤누가 간다!","addDate":1785293520000},
 {"postUrl":"https://blog.naver.com/gym2/223002","title":"두정동 헬스장 3개월 후기 &amp; 가격 정리","noTagTitle":"두정동 헬스장 3개월 후기 &amp; 가격 정리","nickName":"운동하는곰","blogName":"","addDate":1782701520000},
 {"postUrl":"https://blog.naver.com/x/3","noTagTitle":"","nickName":"이름만","blogName":"제목없음","addDate":1782701520000},
 {"postUrl":"https://blog.naver.com/y/4","noTagTitle":"날짜가 없는 글","blogName":"어떤블로그"}
]}}`

const sp = parseSectionPosts(SECTION_BODY)
ok(sp.length === 3, `제목 있는 글만 3개 — ${sp.length}개`)
ok(sp[0].title === '천안헬스장 추천 두정동 미라온휘트니스 여름준비', `<b> 태그 제거 — ${sp[0].title}`)
ok(sp[1].title === '두정동 헬스장 3개월 후기 & 가격 정리', `HTML 엔티티 복원 — ${sp[1].title}`)
ok(sp[0].date === '2026-07-29', `addDate epoch → 날짜 — ${sp[0].date}`)
ok(sp[0].blogger === '헤누가 간다!', `블로그명 — ${sp[0].blogger}`)
ok(sp[1].blogger === '운동하는곰', 'blogName 이 비면 nickName 으로 대체', `${sp[1].blogger}`)
ok(sp[0].url === 'https://blog.naver.com/heenu/223001', '글 링크를 그대로 들고 온다')
ok(sp[2].date === null, '날짜가 없으면 null (0 으로 채우지 않음)')
ok(parseSectionPosts('건수만 있고 목록이 없는 응답').length === 0, '못 읽으면 빈 배열')
ok(parseSectionPosts(`)]}',\n{"result":{"totalCount":0,"searchList":[]}}`).length === 0, '결과 0건도 빈 배열')

// 같은 목록을 붙여넣기 분석기에 그대로 넣으면 source 만 'section' 으로 달라진다
const sa = analyzePastedSerp('두정동 헬스장', sp, 437, 30, 'section')
ok(sa.source === 'section', `출처 표시 — ${sa.source}`)
ok(sa.mock === false, '실제 화면 기준이므로 mock 아님')
ok(sa.items[0].link === sp[0].url, '결과 목록에서 글 링크를 누를 수 있다')
ok(sa.items[1].rank === 2, '읽어온 순서가 곧 순위')
ok(sa.stats.datedCount === 2, `날짜를 아는 항목만 최신성에 씀 — ${sa.stats.datedCount}개`)
ok(
  sa.prescription.some((p) => p.includes('437')),
  '처방에 최근 30일 발행량이 들어간다'
)
ok(
  analyzePastedSerp('두정동 헬스장', sp, 437).source === 'paste',
  '출처를 안 넘기면 기존 붙여넣기 경로 그대로'
)

console.log('\n[30] 지금 할 일 — 순서에서 막힌 첫 곳 하나')
const { nextActions } = require(`${OUT}/writing/next-action.js`)
const OKB = { level: 'good', ratio: '2 : 1', info: 2, promo: 1, review: 1 }
const OKC = { level: 'good', last14: 5 }
const KEYS = { search: true, searchAd: true }
const base = { stores: [{ id: 's' }], posts: [], rankTargets: [], fallen: [], stuck: [], balance: OKB, cadence: OKC, keys: KEYS }

// 순서: 지점 → 첫 키워드 → 초안 → 검수완료 → 순위 등록
const noStore = nextActions({ ...base, stores: [] })
ok(noStore[0].id === 'store', `지점이 없으면 지점 등록부터 — ${noStore[0].id}`)
ok(noStore[0].tone === 'bad', '지점 없음은 조치 수준')

const empty = nextActions(base)
ok(empty[0].id === 'first-keyword', `지점만 있으면 키워드부터 — ${empty[0].id}`)
ok(empty[0].href === '/keywords', '키워드 화면으로 보낸다')

const draft = nextActions({ ...base, posts: [{ status: 'draft' }] })
ok(draft[0].id === 'draft', `초안이 있으면 검수 마무리 — ${draft[0].id}`)
ok(draft[0].title.includes('1편'), '몇 편인지 제목에 넣는다')

const reviewed = nextActions({ ...base, posts: [{ status: 'reviewed' }] })
ok(reviewed[0].id === 'reviewed', `검수 끝났으면 발행 — ${reviewed[0].id}`)

const pub = nextActions({ ...base, posts: [{ status: 'published' }] })
ok(pub[0].id === 'rank', `발행했으면 순위 등록 — ${pub[0].id}`)

// 초안과 발행이 함께 있으면 초안 마무리가 먼저다 (쓰던 것을 끝내는 게 우선)
const both = nextActions({ ...base, posts: [{ status: 'draft' }, { status: 'published' }] })
ok(both[0].id === 'draft', `쓰던 것부터 끝낸다 — ${both[0].id}`)
ok(both.some((a) => a.id === 'rank'), '순위 등록은 뒤에 남는다')

/*
 * **오늘 자동 초안은 맨 위에 따로 낸다** (2026-08-21). 아래 「초안 N편」에 섞이면 어제 것과
 * 구별이 안 되고, 그러면 매일 준비해 두는 의미가 없다 — 오늘 것을 오늘 올려야 간격이 붙는다.
 */
{
  const TODAY = '2026-08-21'
  const autoPost = { id: 'a1', status: 'draft', type: 'info', auto: true, mainKeyword: '쌍용동 헬스장', autoTopic: '새벽 운동 시작하기', createdAt: `${TODAY}T20:00:00.000Z` }
  const withAuto = nextActions({ ...base, today: TODAY, posts: [autoPost] })
  ok(withAuto[0].id === 'auto-draft', `오늘 자동 초안이 맨 위 — ${withAuto[0].id}`)
  ok(withAuto[0].href === '/write?id=a1', '그 글을 바로 연다')
  ok(withAuto[0].why.includes('쌍용동 헬스장') && withAuto[0].why.includes('새벽 운동'), '무엇으로 썼는지 밝힌다')
  ok(withAuto[0].why.includes('자동 발행을 열어두지'), '발행은 회원이 눌러야 한다고 알린다')
  // 같은 글을 「초안 N편」이 다시 가리키지 않는다
  ok(!withAuto.some((a) => a.id === 'draft'), '오늘 초안 하나뿐이면 「초안 N편」을 또 내지 않는다')

  // 어제 자동 초안은 오늘 것이 아니다 — 평범한 초안으로 센다
  const yday = nextActions({ ...base, today: TODAY, posts: [{ ...autoPost, createdAt: '2026-08-20T20:00:00.000Z' }] })
  ok(yday[0].id === 'draft', `어제 자동 초안은 맨 위가 아니다 — ${yday[0].id}`)

  // 오늘 것 + 다른 초안이 함께 있으면 둘 다 나오되 개수가 겹치지 않는다
  const mixed = nextActions({ ...base, today: TODAY, posts: [autoPost, { id: 'b1', status: 'draft' }] })
  ok(mixed[0].id === 'auto-draft' && mixed.some((a) => a.id === 'draft'), '오늘 것과 나머지가 따로 나온다')
  ok(mixed.find((a) => a.id === 'draft').title.includes('1편'), '나머지 개수에서 오늘 것을 뺀다')

  // today 를 안 넘기면 예전처럼 동작한다 (화면이 못 넘겨도 터지지 않는다)
  ok(nextActions({ ...base, posts: [autoPost] })[0].id === 'draft', 'today 가 없으면 평범한 초안으로 센다')
}

// 순위 하락은 균형·주기보다 급하다
const fallen = nextActions({
  ...base,
  posts: [{ status: 'published' }],
  rankTargets: [{ id: 't' }],
  fallen: [{ keyword: '쌍용동 헬스장' }, { keyword: '두정동 헬스장' }],
  stuck: [],
  balance: { level: 'warn', ratio: '0 : 1', info: 0, promo: 1, review: 0 },
})
ok(fallen[0].id === 'fallen', `밀린 키워드가 먼저 — ${fallen[0].id}`)
ok(fallen[0].title.includes('2개'), '몇 개가 밀렸는지 밝힌다')
/*
 * **키워드를 링크에 실어야 한다** (2026-08-23). 회원: "밀린키워드 분석을 원해서
 * 상위노출분석을 눌렀는데 정작 분석 창이 아니라 상위 노출 키워드 분석탭으로 가고 있어."
 *
 * `/serp` 는 키워드가 있으면 **열자마자 스스로 분석**하고, 없으면 빈 입력칸만 띄운다.
 * 앱이 이미 아는 키워드를 회원이 다시 타이핑하게 만들고 있었다.
 */
ok(fallen[0].href === '/serp?keyword=%EC%8C%8D%EC%9A%A9%EB%8F%99%20%ED%97%AC%EC%8A%A4%EC%9E%A5',
  `분석할 키워드를 링크에 담는다 — ${fallen[0].href}`)
ok(fallen[0].cta.includes('쌍용동 헬스장'), '버튼에도 어느 키워드인지 적는다', fallen[0].cta)
ok(fallen[0].why.includes('나머지 1개'), '나머지가 있으면 그것도 알려준다')
ok(
  nextActions({ ...base, posts: [{ status: 'published' }], rankTargets: [{ id: 't' }], fallen: [{ keyword: '두정동 헬스장' }] })[0].why.includes('나머지') === false,
  '하나뿐이면 「나머지」를 붙이지 않는다'
)
// 빈 키워드가 섞여 들어와도 링크가 깨지지 않는다
ok(
  nextActions({ ...base, posts: [{ status: 'published' }], rankTargets: [{ id: 't' }], fallen: [{ keyword: '  ' }] }).every((a) => a.id !== 'fallen'),
  '키워드가 비어 있으면 분석하라고 하지 않는다'
)
/*
 * **앱 안의 「상위노출 분석」 링크는 전부 키워드를 실어야 한다.** 이번에 대시보드
 * 하나만 빠져 있었다 — 나머지 여덟 곳은 처음부터 제대로 하고 있었다.
 */
{
  const { readFileSync: rf } = require('node:fs')
  const bare = ['../lib/writing/next-action.ts'].filter((f) => {
    const t = rf(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    return /href: '\/serp'/.test(t)
  })
  ok(bare.length === 0, '키워드 없이 /serp 로 보내는 곳이 없다', bare.join(' · '))
}

// 균형이 깨졌으면 무엇을 쓸지까지 정해 준다
const unbal = nextActions({
  ...base,
  posts: [{ status: 'published' }],
  rankTargets: [{ id: 't' }],
  balance: { level: 'warn', ratio: '0 : 1', info: 0, promo: 1, review: 0 },
})
ok(unbal[0].id === 'balance', `균형이 깨지면 그 유형을 쓰게 — ${unbal[0].id}`)
ok(unbal[0].title.includes('정보글'), `정보글이 모자라면 정보글 — ${unbal[0].title}`)
ok(unbal[0].href === '/write?type=info', '유형까지 링크에 담는다')

// 키가 없으면 알려주되, 글 흐름보다 뒤에 둔다
const noKey = nextActions({ ...base, keys: { search: false, searchAd: false } })
ok(noKey[0].id === 'first-keyword', '키 안내가 글 흐름을 앞지르지 않는다')
ok(noKey.some((a) => a.id === 'ad-key'), '검색광고 키 안내는 목록에 있다')

// 다 잘 되고 있으면 빈손으로 두지 않는다
const fine = nextActions({
  ...base,
  posts: [{ status: 'published' }],
  rankTargets: [{ id: 't' }],
})
ok(fine.length === 1 && fine[0].id === 'next', `막힌 곳이 없으면 다음 키워드 — ${fine[0].id}`)
ok(fine[0].tone === 'good', '이때는 양호 표시')
ok(
  nextActions(base).every((a) => a.title && a.why && a.href && a.cta),
  '모든 항목에 무엇을·왜·어디로·버튼글자가 있다'
)

console.log('\n[31] AI 글쓰기 — 응답 파싱과 지시문')
const { extractJson, extractText, pickModel, searchTools } = require(`${OUT}/ai/llm.js`)
const { buildSystemPrompt, buildUserPrompt, buildFixPrompt } = require(`${OUT}/ai/prompt.js`)

// 모델이 코드펜스·설명을 붙여 보내도 JSON 만 뽑아야 한다
ok(extractJson('{"title":"ㄱ","body":"ㄴ"}').title === 'ㄱ', '맨 JSON 파싱')
ok(extractJson('```json\n{"title":"ㄱ"}\n```').title === 'ㄱ', '코드펜스 안 JSON 파싱')
ok(extractJson('설명입니다.\n{"title":"ㄱ"}\n끝.').title === 'ㄱ', '앞뒤 설명이 있어도 파싱')
ok(extractJson('{"a":{"b":1},"title":"ㄱ"}').title === 'ㄱ', '중첩 객체도 끝까지 읽음')
ok(extractJson('{"body":"중괄호 } 가 문자열 안에 있음","title":"ㄱ"}').title === 'ㄱ', '문자열 속 중괄호에 속지 않음')
ok(extractJson('JSON 이 없는 응답') === null, 'JSON 이 없으면 null')
ok(extractJson('{"깨진 JSON"') === null, '깨진 JSON 은 null')

// 회사마다 응답 모양이 달라도 본문을 뽑아야 한다
ok(extractText(JSON.stringify({ content: [{ type: 'text', text: 'ㄱ' }] })) === 'ㄱ', 'Anthropic 응답 파싱')
ok(extractText(JSON.stringify({ choices: [{ message: { content: 'ㄱ' } }] })) === 'ㄱ', 'OpenAI 호환 응답 파싱')
ok(
  extractText(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ㄱ' }, { text: 'ㄴ' }] } }] })) === 'ㄱㄴ',
  'Gemini 응답 파싱 (조각 이어붙이기)'
)
ok(extractText(JSON.stringify({ result: { message: { content: 'ㄱ' } } })) === 'ㄱ', 'CLOVA 응답 파싱')
ok(extractText('JSON 이 아님') === '', '못 읽으면 빈 문자열')

// 모델 이름은 회사마다 바뀌므로 목록에서 선호 순서대로 고른다
ok(pickModel('openai', ['gpt-3.5-turbo', 'gpt-4o', 'text-embedding-3']) === 'gpt-4o', '더 좋은 모델을 고른다')
ok(pickModel('openai', ['gpt-4o', 'gpt-5.1']) === 'gpt-5.1', '더 새 세대를 먼저 고른다')
ok(pickModel('openai', ['text-embedding-3', 'whisper-1', 'my-chat']) === 'my-chat', '임베딩·음성 모델은 피한다')
ok(pickModel('gemini', ['gemini-2.0-flash', 'gemini-2.5-pro']) === 'gemini-2.5-pro', 'Gemini 선호 순서')
ok(pickModel('anthropic', ['claude-3-5-haiku', 'claude-sonnet-5']) === 'claude-sonnet-5', 'Claude 선호 순서')
ok(pickModel('openai', []) === null, '목록이 비면 null (기본값으로 넘어간다)')

// 지시문에 검수 기준이 그대로 들어가야 한다 (기준이 바뀌면 지시도 바뀐다)
const sysReview = buildSystemPrompt('review')
/*
 * AI 응답 파싱 — 모델이 JSON 규격을 어기는 두 경우를 고쳐 쓴다.
 * 실제로 회원 화면에 「글 형식을 읽지 못했습니다」가 떴고, 원인은 본문 안의 진짜 줄바꿈이었다.
 * 「문단을 12개 이상으로 쪼개라」를 지시에 넣은 뒤 줄바꿈이 늘어 더 잦아졌다.
 */
{
  const j = (raw) => extractJson(raw)
  const good = j('{"title":"제목","body":"본문\\n둘째","tags":["가","나"]}')
  ok(good?.title === '제목' && good?.tags.length === 2, '정상 JSON 은 그대로 읽는다')
  const nl = j('{"title":"쌍용동 헬스장 후기","body":"첫 문단.\n둘째 문단.\n\n셋째 문단.","tags":["쌍용동 헬스장"]}')
  ok(nl?.title === '쌍용동 헬스장 후기', '본문에 진짜 줄바꿈이 와도 살린다', nl ? '살림' : '실패')
  ok(nl?.body.includes('\n'), '줄바꿈을 문단 경계로 보존한다')
  const cut = j('{"title":"쌍용동 헬스장","body":"문단 하나\n문단 둘\n문단 셋')
  ok(cut?.title === '쌍용동 헬스장' && cut?.body.length > 0, '토큰 한계로 잘려도 건진다', cut ? '살림' : '실패')
  const cutTag = j('{"title":"제목","body":"본문","tags":["쌍용동 헬스장","쌍용동 PT"')
  ok(cutTag?.tags?.length === 2, '태그 배열에서 잘려도 태그를 건진다', String(cutTag?.tags?.length))
  const quoted = j('{"title":"제목","body":"상담에서 \\"자세를 봐드립니다\\" 라고 하셨어요.\n다음 문단.","tags":[]}')
  ok(quoted?.body.includes('"자세를 봐드립니다"'), '본문 안 인용부호를 망가뜨리지 않는다', quoted?.body?.slice(0, 24))
  ok(j('설명입니다.\n```json\n{"title":"제목","body":"본문","tags":[]}\n```')?.title === '제목', '코드펜스·앞말은 예전처럼 건너뛴다')
  ok(j('JSON 이 아예 없는 응답') === null, 'JSON 이 없으면 null 이다')
}

/*
 * 저장된 처방의 커트라인 문장을 꺼낼 때 다시 계산한다.
 * 목표 규칙을 고쳐도 이미 저장된 처방은 옛 문장을 들고 있어서, 「글에 반영」을 켜면
 * 「이미지 19장 이상」(실측 최악 구간)이 AI 지시문으로 갔다.
 */
{
  const stored = {
    key: '쌍용동헬스장', keyword: '쌍용동 헬스장', date: '2026-08-01', sampled: 15,
    items: [
      '제목은 38~40자로 맞추세요.',
      '상위 글 15개를 실제로 읽어 재보니 본문 중간값이 1,933자, 이미지 18장입니다. 이 키워드의 목표는 본문 2,200자 이상, 이미지 19장 이상입니다.',
    ],
  }
  const fresh = findPrescription([stored], '쌍용동헬스장')
  const line = fresh.items.find((l) => l.includes('중간값'))
  ok(!line.includes('19장 이상'), '옛 이미지 목표(19장)를 더 이상 내보내지 않는다', line.slice(-70))
  ok(line.includes('6~10장'), '지금 규칙(6~10장)으로 갈아끼운다')
  ok(line.includes('1,933자'), '관측값은 그대로 둔다 — 사실이다')
  ok(fresh.items[0] === '제목은 38~40자로 맞추세요.', '커트라인이 아닌 처방은 건드리지 않는다')
  const noCut = findPrescription([{ ...stored, items: ['제목은 38~40자로 맞추세요.'] }], '쌍용동헬스장')
  ok(noCut.items.length === 1, '커트라인 문장이 없으면 그대로 돌려준다')
}

/*
 * 화자 검사 — 회원이 홍보글을 요청했는데 제목에 「후기」가 박히고 본문이 방문자 말투로
 * 나왔다. 검수에 화자를 보는 항목이 없어서 그대로 통과했다.
 */
{
  const paras = Array.from({ length: 14 }, () => '가'.repeat(130)).join('\n\n')
  const base = { mainKeyword: '쌍용동 헬스장', subKeywords: [], tags: [], legalName: '천안점' }
  // 홍보글인데 제목에 「후기」
  const t1 = checkPost({ ...base, type: 'promo', title: '쌍용동 헬스장 24시간 운영 시설 후기', body: paras })
  const v1 = t1.items.find((i) => i.id === 'voice')
  ok(v1.level === 'fail', '홍보글 제목에 「후기」가 있으면 걸린다', v1.value)
  ok(v1.weight === 5, '화자는 무겁게 본다 (겪지 않은 일을 겪은 척하는 문제다)', String(v1.weight))
  /*
   * 낱말만 보면 안 된다 — 홍보글의 공감 구간은 **독자의 경험을 대신 말해주는 자리**다.
   * 「새벽에 운동하러 갔는데 문이 닫혀 있으면」은 센터가 독자 사정을 말하는 문장이고
   * 방문자 후기가 아니다. 실제로 잘 쓴 홍보글이 이것 때문에 걸렸다.
   */
  const empathy = checkPost({
    ...base, type: 'promo', title: '쌍용동 헬스장 어디가 좋을까요',
    body: `${paras}\n\n남들 다 자는 새벽에 운동하러 갔는데 문이 닫혀 있으면 그날 하루가 꼬여버리니까요.`,
  })
  ok(empathy.items.find((i) => i.id === 'voice').level === 'pass', '독자 경험을 대신 말하는 문장은 걸리지 않는다', empathy.items.find((i) => i.id === 'voice').value)
  const firstPerson = checkPost({
    ...base, type: 'promo', title: '쌍용동 헬스장 어디가 좋을까요',
    body: `${paras}\n\n제가 직접 가봤는데 시설이 좋았습니다.`,
  })
  ok(firstPerson.items.find((i) => i.id === 'voice').level === 'fail', '1인칭이 붙으면 방문자 서술로 잡는다', firstPerson.items.find((i) => i.id === 'voice').value)

  /*
   * **「다녀온」은 뒤의 이름씨를 꾸미는 꼴이라 대개 남의 이야기다** (2026-08-13).
   * 회원 지적 "정보글 유형이 맞는데 화자가 어긋났대" — 정보글이 「다녀온」 하나로 즉시수정을
   * 맞았다. 「병원에 다녀온 뒤」·「다녀온 회원님들」은 센터가 쓰는 정상 문장이다.
   */
  const infoBase = { ...base, type: 'info', title: '다이어트 정체기 왜 오는지 정리했습니다' }
  const long = Array.from({ length: 22 }, () => '가'.repeat(130)).join('\n\n')
  const others = checkPost({
    ...infoBase,
    body: `${long}\n\n병원에 다녀온 뒤에는 무게를 먼저 내립니다. 상담 다녀온 회원님들 보면 대체로 그렇습니다.`,
  })
  ok(
    others.items.find((i) => i.id === 'voice').level === 'pass',
    '남의 방문을 말하는 「다녀온」은 걸리지 않는다',
    others.items.find((i) => i.id === 'voice').value
  )
  const mine = checkPost({
    ...infoBase,
    body: `${long}\n\n제가 다녀온 곳은 시설이 좋았습니다.`,
  })
  ok(
    mine.items.find((i) => i.id === 'voice').level === 'fail',
    '내가 갔다는 「다녀온」은 그대로 걸린다',
    mine.items.find((i) => i.id === 'voice').value
  )
  const past = checkPost({ ...infoBase, body: `${long}\n\n어제 다녀왔어요. 시설이 좋았습니다.` })
  ok(
    past.items.find((i) => i.id === 'voice').level === 'fail',
    '주어가 없어도 「다녀왔어요」는 걸린다',
    past.items.find((i) => i.id === 'voice').value
  )

  /*
   * **「좋더라고요」는 어미일 뿐이다** (2026-08-25 회원 지적: "화자가 정보글이 맞는데 자꾸
   * 어긋났다고 떠. 왜 그런 거야?").
   *
   * 지시문(lib/ai/prompt.ts)이 정보글에 「"~하시더라고요", "~되더라고요"를 쓴다」고 시키는데
   * 검수는 「좋더라고요」를 즉시수정으로 막고 있었다 — **우리가 시켜서 쓴 말을 우리가 막은
   * 것**이다. 막아야 하는 것은 어미가 아니라 「센터가 체험자인 척하는 것」이다.
   */
  const tone = checkPost({
    ...infoBase,
    body: `${long}\n\n무릎이 아프신 분들은 자전거부터 하시는 게 좋더라고요. 회원님들 반응도 좋더라고요.`,
  })
  ok(
    tone.items.find((i) => i.id === 'voice').level === 'pass',
    '센터가 겪어 알게 된 「좋더라고요」는 걸리지 않는다',
    tone.items.find((i) => i.id === 'voice').value
  )
  // 「저희 센터」가 앞에 붙으면 자기 얘기다 — 방문자 말투가 아니다
  const ours = checkPost({ ...infoBase, body: `${long}\n\n저희 센터 회원님들 반응이 좋더라고요.` })
  ok(
    ours.items.find((i) => i.id === 'voice').level === 'pass',
    '「저희 센터 …좋더라고요」는 걸리지 않는다',
    ours.items.find((i) => i.id === 'voice').value
  )
  // 그 장소를 평가하는 꼴이면 그대로 걸린다 — 이게 막으려던 것이다
  const rated = checkPost({ ...infoBase, body: `${long}\n\n여기 시설이 깔끔하고 좋더라고요.` })
  ok(
    rated.items.find((i) => i.id === 'voice').level === 'fail',
    '장소를 평가하는 「좋더라고요」는 걸린다',
    rated.items.find((i) => i.id === 'voice').value
  )
  /*
   * **지시문과 검수가 같은 말을 하는지** 한 자리에서 본다. 여태 이 검사에서 난 오탐 다섯
   * 건이 전부 「한쪽만 고친 것」이었다.
   */
  const infoTone = buildSystemPrompt('info')
  ok(infoTone.includes('되더라고요'), '지시문은 정보글에 「되더라고요」를 쓰라고 한다')
  ok(
    checkPost({ ...infoBase, body: `${long}\n\n집에서 멀면 결국 발길이 뜸해지더라고요.` })
      .items.find((i) => i.id === 'voice').level === 'pass',
    '지시문이 시킨 말투를 검수가 막지 않는다'
  )

  /*
   * **「체험」은 센터가 파는 것이다** (2026-08-26).
   *
   * 제목 목록이 `/후기|내돈내산|체험단?/` 이라 **「체험」만 있어도** 걸렸다. 그런데 우리
   * 지시문은 이벤트 정보가 없는 홍보글에 제목에 「체험」을 넣으라고 시키고 예시까지 준다 —
   * 「쌍용동 헬스장 체험 먼저 해보고 정하세요」. 시켜서 쓴 제목을 즉시수정으로 막고 있었다.
   */
  const trial = checkPost({ ...base, type: 'promo', title: '쌍용동 헬스장 체험 먼저 해보고 정하세요', body: paras })
  ok(trial.items.find((i) => i.id === 'voice').level === 'pass', '제목의 「체험」은 걸리지 않는다', trial.items.find((i) => i.id === 'voice').value)
  ok(
    buildSystemPrompt('promo').includes('체험'),
    '지시문은 홍보글 제목에 「체험」을 쓰라고 한다 (검수가 막으면 안 된다)'
  )
  const crew = checkPost({ ...base, type: 'promo', title: '쌍용동 헬스장 체험단 모집 후기', body: paras })
  ok(crew.items.find((i) => i.id === 'voice').level === 'fail', '「체험단」은 그대로 걸린다', crew.items.find((i) => i.id === 'voice').value)

  /*
   * **제목만 걸렸으면 고칠 곳은 제목 한 줄이다** (2026-08-26 회원 지적: "이거 자꾸 화자가
   * 어긋났대. 수정 좀 해줘"). 여태 화면이 「본문 비우고 새로 쓰기」를 큰 버튼으로 내밀어
   * 멀쩡한 본문을 버리게 만들었다.
   */
  const titleOnly = checkPost({ ...infoBase, title: '다이어트 정체기 후기, 3주 기록', body: long })
  const tv = titleOnly.items.find((i) => i.id === 'voice')
  ok(tv.level === 'fail' && tv.scope === 'title', '제목만 걸리면 scope 가 title 이다', String(tv.scope))
  ok(tv.hint.includes('제목 한 줄만 고치면 됩니다'), '제목 한 줄만 고치면 된다고 말해준다')
  const bodyOnly = checkPost({ ...infoBase, body: `${long}\n\n어제 다녀왔어요.` })
  ok(bodyOnly.items.find((i) => i.id === 'voice').scope === 'body', '본문만 걸리면 body 다')
  const bothHit = checkPost({ ...infoBase, title: '다이어트 정체기 후기', body: `${long}\n\n어제 다녀왔어요.` })
  ok(bothHit.items.find((i) => i.id === 'voice').scope === 'both', '둘 다면 both 다')
  // 화면이 그 값을 실제로 쓴다 — 안 쓰면 배너가 예전처럼 본문을 새로 쓰라고 한다
  {
    const { readFileSync: rf } = require('node:fs')
    const ed = rf(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
    ok(/voiceMismatch\.scope === 'title'/.test(ed), '배너가 제목만 걸린 경우를 가른다')
    ok(/voiceMismatch\.scope !== 'title' && \(/.test(ed), '제목만 걸리면 본문 새로 쓰기 버튼을 내밀지 않는다')
  }
  // 정보글 지시문도 같은 것을 시킨다 — 한쪽만 있으면 모델이 계속 「후기」 제목을 낸다
  ok(
    buildSystemPrompt('info').includes('제목에 「후기」·「내돈내산」·「체험단」을 쓰지 않는다'),
    '정보글 지시문도 제목의 「후기」를 막는다'
  )

  // 홍보글인데 본문이 방문자 말투
  const t2 = checkPost({ ...base, type: 'promo', title: '쌍용동 헬스장 어디가 좋을까요', body: `${paras}\n\n직접 가봤더니 시설이 괜찮더라고요.` })
  ok(t2.items.find((i) => i.id === 'voice').level === 'fail', '홍보글 본문의 방문자 말투도 걸린다', t2.items.find((i) => i.id === 'voice').value)
  // 제대로 쓴 홍보글은 통과
  const t3 = checkPost({ ...base, type: 'promo', title: '쌍용동 헬스장 어디가 좋을까요', body: paras })
  ok(t3.items.find((i) => i.id === 'voice').level === 'pass', '센터 말투 홍보글은 통과', t3.items.find((i) => i.id === 'voice').value)
  // 후기글은 반대 — 소속 1인칭이 걸린다
  const t4 = checkPost({ ...base, type: 'review', title: '쌍용동 헬스장 등록 후기', body: `${paras}\n\n저희 센터는 24시간 운영합니다.` })
  ok(t4.items.find((i) => i.id === 'voice').level === 'fail', '후기글에 소속 1인칭이 있으면 걸린다', t4.items.find((i) => i.id === 'voice').value)
  const t5 = checkPost({ ...base, type: 'review', title: '쌍용동 헬스장 등록 후기', body: `${paras}\n\n상담만 받고 나왔는데 부담이 없었어요.` })
  ok(t5.items.find((i) => i.id === 'voice').level === 'pass', '방문자 말투 후기글은 통과', t5.items.find((i) => i.id === 'voice').value)
}

/*
 * 처방을 유형에 맞게 걸러야 한다 — 「우리도 방문 후기 형태로 맞붙어라」가 홍보글
 * 지시문으로 가서 실제로 후기 톤 글이 나왔다.
 */
{
  const { prescriptionForType } = require(`${OUT}/analysis/prescription.js`)
  const RX = [
    '제목은 38~40자로 맞추세요.',
    '상위 제목에 반복되는 말: PT, 후기, 추천, 시설. 검색하는 사람이 실제로 알고 싶은 게 이쪽이라는 신호이니 소제목에 반영하세요.',
    '상위 제목에 다른 업체 이름("미녀와야수짐")이 반복됩니다 — 그 업체 후기 글이 이 키워드를 먹고 있다는 뜻입니다. 우리도 방문 후기 형태로 맞붙거나, 세부 의도를 붙여 우회하세요. (그 이름을 우리 글에 쓰면 남의 가게를 홍보하는 셈이니 쓰지 마세요.)',
  ]
  const promo = prescriptionForType(RX, 'promo')
  ok(!promo.some((l) => l.includes('방문 후기 형태로 맞붙')), '홍보글에 후기로 맞붙으라고 하지 않는다')
  ok(promo.some((l) => l.includes('후기로 맞붙지 않습니다')), '왜 안 되는지와 대안을 알려준다')
  const words = promo.find((l) => l.includes('반복되는 말'))
  ok(!words.includes('후기'), '반영할 낱말 목록에서 「후기」를 뺀다', words)
  ok(words.includes('PT') && words.includes('추천'), '나머지 낱말은 그대로 둔다', words)
  ok(promo[0] === '제목은 38~40자로 맞추세요.', '관계없는 처방은 건드리지 않는다')
  ok(prescriptionForType(RX, 'review').join() === RX.join(), '후기글에는 그대로 넘긴다')
}

ok(sysReview.includes('방문객'), '후기글 화자는 방문객')
/*
 * 작성 주체는 운영자다 — 화자(방문객)와 작성자(센터)가 다르다는 것을 지시문이 밝혀야 한다.
 * 밝히지 않으면 모델이 없는 체험을 지어내고, 그건 문체 문제가 아니라 기만적 광고가 된다.
 */
ok(sysReview.includes('센터 운영자가 쓴다'), '작성 주체가 운영자임을 밝힌다')
// 홍보글 단계 이름이 후기글 지시문으로 새지 않는다
ok(!sysReview.includes('해결 구간 1회 + 이벤트 구간 1회'), '후기글에 홍보글 단계 이름을 쓰지 않는다')
ok(sysReview.includes('방문·상담 후기 구간'), '후기글 단계 이름으로 말한다')
{
  // 분량 근거의 세기가 유형마다 다르다 — 후기글에서는 가장 뚜렷한 신호였다
  const rv = checkPost({ type:'review', title:'쌍용동 헬스장 후기', body:'가'.repeat(1200), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  const pr = checkPost({ type:'promo', title:'쌍용동 헬스장 어디', body:'가'.repeat(1200), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  const rvT = rv.items.find((i) => i.id === 'charCount').target
  const prT = pr.items.find((i) => i.id === 'charCount').target
  ok(!rvT.includes('근거 약함'), '후기글 분량은 「근거 약함」이 아니다', rvT.slice(0, 46))
  ok(rvT.includes('69%'), '후기글 분량 근거를 숫자로 보여준다')
  ok(prT.includes('근거 약함'), '홍보글 분량은 여전히 근거가 약하다', prT)
}
ok(sysReview.includes('내돈내산'), '「내돈내산」을 쓰지 말라고 지시한다')
/*
 * 지시문이 서로 반대말을 하지 않는지 — 실제로 이 모순 때문에 모델이 해시태그에
 * #내돈내산 을 넣었다. 화자 지시는 「쓰지 마라」인데 대가성 줄은 「대가성: 내돈내산」이었다.
 */
{
  const { buildUserPrompt } = require(`${OUT}/ai/prompt.js`)
  const own = buildUserPrompt({ type: 'review', mainKeyword: '쌍용동 헬스장', subKeywords: [], sponsorship: 'own', store: null })
  ok(!/대가성: 내돈내산/.test(own), '모델에게 「내돈내산」을 상태값으로 주지 않는다')
  ok(own.includes('대가를 받지 않은 글이다'), '대가 없음을 사실대로만 말한다')
  ok(own.includes('해시태그에 쓰지 않는다'), '해시태그에도 쓰지 말라고 막는다')
  const spon = buildUserPrompt({ type: 'review', mainKeyword: '쌍용동 헬스장', subKeywords: [], sponsorship: 'sponsored', store: null })
  ok(spon.includes('#협찬후기'), '협찬이면 표기를 지시한다')
}

/*
 * 200 인데 글이 없을 때 — 무엇이었는지 증거를 담아야 한다.
 * 회원이 「글 생성 응답을 읽지 못했습니다」만 세 번 보고 원인을 알 수 없었다.
 */
/*
 * **회원이 막혀 있던 실제 원인**: claude-sonnet-5 는 thinking 을 안 보내면 생각하기가
 * 켜진 상태로 돌고, max_tokens 는 생각 + 본문을 합쳐서 센다. 8,192 를 전부 생각에 쓰고
 * 글은 한 글자도 못 썼다 (중단 이유 max_tokens · 받은 블록 thinking · 출력 8192).
 */
{
  const { supportsDisabledThinking } = require(`${OUT}/ai/llm.js`)
  ok(supportsDisabledThinking('claude-sonnet-5'), 'sonnet-5 는 생각하기를 끌 수 있다')
  ok(supportsDisabledThinking('claude-opus-5'), 'opus-5 도 끌 수 있다 (effort 를 올리지 않으므로)')
  ok(supportsDisabledThinking('claude-haiku-4-5'), 'haiku 도 끌 수 있다')
  ok(!supportsDisabledThinking('claude-fable-5'), 'fable 은 끄면 400 이므로 보내지 않는다')
  ok(!supportsDisabledThinking('claude-mythos-5'), 'mythos 도 보내지 않는다')
}

{
  const { describeEmpty } = require(`${OUT}/ai/llm.js`)
  const cut = describeEmpty(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'thinking' }], usage: { input_tokens: 3200, output_tokens: 8192 } }), 'anthropic', 'claude-sonnet-5')
  ok(cut.includes('max_tokens'), '중단 이유를 적는다', cut.slice(0, 60))
  ok(cut.includes('thinking'), '어떤 블록을 받았는지 적는다')
  ok(cut.includes('출력 8192'), '토큰 사용량을 적는다')
  ok(cut.includes('출력 한도에 먼저 걸렸습니다'), '한도 문제면 그렇게 해석해 준다')
  ok(cut.includes('claude-sonnet-5'), '어느 모델이었는지 적는다')
  const empty = describeEmpty(JSON.stringify({ content: [] }), 'anthropic', 'claude-sonnet-5')
  ok(empty.includes('비어 있었습니다'), '블록이 없으면 없다고 적는다', empty)
  const odd = describeEmpty(JSON.stringify({ id: 'x', object: 'y' }), 'openai', 'gpt-4o')
  ok(odd.includes('아는 응답 모양이 아닙니다'), '모르는 모양이면 키를 보여준다', odd)
  const notJson = describeEmpty('<html>Gateway Timeout</html>', 'anthropic', 'claude-sonnet-5')
  ok(notJson.includes('JSON 이 아니었습니다'), 'JSON 이 아니면 그렇게 적는다', notJson)
  const err = describeEmpty(JSON.stringify({ error: { message: '한도 초과' } }), 'anthropic', 'claude-sonnet-5')
  ok(err.includes('한도 초과'), '오류 메시지가 있으면 그대로 보여준다')
}

/*
 * **AI 회사 오류를 「그래서 무엇을 하면 되나」로 바꾼다** (2026-08-26).
 *
 * 회원이 이 줄을 보고 물었다 — "이거 왜 이래?":
 *   글 생성 실패 (400, Anthropic (Claude) · claude-sonnet-5). Your credit balance is too
 *   low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
 *
 * 앱이 고장난 것이 아니라 키의 잔액이 0 이 된 것인데, 화면에는 영어 원문만 있고 어디서
 * 충전하는지는 아무 데도 없었다. 매일 새벽 크론도 같은 줄을 실패 기록에 남긴다.
 */
{
  const { explainProviderError } = require(`${OUT}/ai/llm.js`)
  const real =
    'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'
  const money = explainProviderError('anthropic', 400, real)
  ok(money.includes('잔액이 없습니다'), '잔액 문제라고 한국어로 말해준다', money)
  ok(money.includes('console.anthropic.com'), '어디서 충전하는지 적는다')
  ok(money.includes('앱 문제가 아닙니다'), '앱 고장이 아니라는 것을 밝힌다 (회원이 그걸 물었다)')
  ok(
    explainProviderError('openai', 429, 'You exceeded your current quota, please check your plan and billing details.')
      .includes('platform.openai.com'),
    '회사마다 충전하는 자리가 다르다'
  )
  const key = explainProviderError('anthropic', 401, 'invalid x-api-key')
  ok(key.includes('키가 잘못됐거나'), '키 문제는 키 문제라고 말한다', key)
  ok(key.includes('환경변수'), '어디서 고치는지 적는다')
  ok(explainProviderError('anthropic', 429, 'rate_limit_error').includes('1~2분 뒤'), '너무 자주 부른 것은 기다리면 된다')
  ok(explainProviderError('anthropic', 529, 'overloaded_error').includes('잠시 뒤'), '서버가 몰린 것도 기다리면 된다')
  // **모르는 오류는 지어내지 않는다** — 빈 값이면 부르는 쪽이 원문을 그대로 보여준다
  ok(explainProviderError('anthropic', 500, '알 수 없는 무엇') === '', '모르는 오류는 해석하지 않는다')
  /*
   * **원문을 지우지 않는다.** 우리가 못 알아본 오류를 삼키면 원인을 영영 못 찾는다 —
   * 이 저장소에서 조용한 실패로 이미 며칠을 잃었다.
   */
  const { readFileSync: rf } = require('node:fs')
  const llm = rf(new URL('../lib/ai/llm.ts', import.meta.url), 'utf8')
  ok(/todo\s*\?[\s\S]{0,200}\$\{said\}/.test(llm), '해석을 앞에 세우고 원문은 뒤에 남긴다')
  ok(/explainProviderError\(c\.provider, res\.status, said\)/.test(llm), '실제 호출 자리에서 쓴다')
}

/*
 * JSON 이 아닌 응답의 원인을 이름으로 찍어준다.
 * 회원이 두 번 연달아 「응답을 읽지 못했습니다」만 보고 원인을 알 수 없었다 —
 * 라우트는 오류도 전부 JSON 으로 내므로, JSON 이 아니면 플랫폼이 끊은 것이다.
 */
{
  const { explainNonJson } = require(`${OUT}/ai/httperror.js`)
  const res = (status, code) => ({ status, headers: { get: (k) => (k === 'x-vercel-error' ? code : null) } })
  const t = explainNonJson(res(504, 'FUNCTION_INVOCATION_TIMEOUT'), '')
  ok(t.includes('시간 초과') && t.includes('Max Duration'), '시간초과면 그렇게 말하고 어디를 고칠지 알려준다', t.slice(0, 40))
  ok(t.includes('FUNCTION_INVOCATION_TIMEOUT'), '원인 코드를 그대로 남긴다 (다음에 검색할 수 있게)')
  const f = explainNonJson(res(500, 'FUNCTION_INVOCATION_FAILED'), '')
  ok(f.includes('Logs'), '함수가 죽었으면 어디를 볼지 알려준다')
  const big = explainNonJson(res(413, 'FUNCTION_PAYLOAD_TOO_LARGE'), '')
  ok(big.includes('글에 반영'), '요청이 크면 처방을 끄라고 안내한다')
  // 헤더가 없으면 추측하지 않고 사실만 보여준다
  const raw = explainNonJson(res(500, null), '<html><body>An error occurred: 무언가 잘못됐습니다</body></html>')
  ok(raw.includes('상태 500'), '헤더가 없으면 상태코드를 보여준다', raw)
  ok(raw.includes('무언가 잘못됐습니다'), '응답 본문 앞부분을 보여준다 — 추측하지 않는다')
  ok(!raw.includes('<html>'), 'HTML 태그는 걷어낸다')
  const empty = explainNonJson(res(502, null), '')
  ok(empty.includes('비어 있었습니다'), '본문이 비면 비었다고 말한다', empty)
}

/*
 * 고쳐 쓰기 지시문은 한 번의 호출로 끝나야 한다 — 쓰기와 고치기를 한 요청에 합치면
 * 1~3분이 걸려 배포 환경의 함수 실행 한도를 넘긴다 (회원 화면에 응답이 아예 안 왔다).
 */
{
  const { buildFixPrompt } = require(`${OUT}/ai/prompt.js`)
  const fx = buildFixPrompt(['문단 쪼개기: 지금 6개 / 기준 12개 이상'], 1800, { charMin: 1750, charMax: 2400 })
  ok(fx.includes('문단 쪼개기'), '걸린 항목을 그대로 알려준다')
  ok(fx.includes('JSON'), '같은 출력 형식을 다시 요구한다')
}
ok(sysReview.includes('없는 상담 대화'), '없는 체험을 만들지 말라고 구체적으로 막는다')
ok(sysReview.includes('한 어미가 55%를 넘지 않게'), '후기글에도 어미 배합 지시가 간다')
ok(sysReview.includes('12개 문단 이상'), '후기글에도 문단 쪼개기 지시가 간다')
ok(sysReview.includes('"후기"'), '후기글은 제목에 후기 명시 지시')
/*
 * 후기글 기준을 실측으로 다시 잡았다 (2026-08-06, 방문자 화자 글 88편).
 *   분량   1,700~2,200 이 1~3위 69% · 2,200~3,000 이 54% · 1,200~1,700 은 28%
 *   횟수   0~1회 28% · 2회 36% · 3~4회 33% · 5회 30% · 6~8회 15% → 무관
 *   밀도   1~3위 중간값 0.39% (「1~1.5%」 구간은 1~3위 11%로 오히려 나빴다)
 */
ok(sysReview.includes('1,700') && sysReview.includes('2,800'), '후기글 글자수 기준이 지시문에 있다')
ok(SPECS.review.charMin === 1700 && SPECS.review.charMax === 2800, '후기 분량 1,700~2,800자', `${SPECS.review.charMin}~${SPECS.review.charMax}`)
ok(SPECS.review.mainMin === 2, '후기 키워드 하한 2회 (1~3위 중간값이 2회였다)', String(SPECS.review.mainMin))
ok(SPECS.review.mainTarget === 3, '후기 키워드 목표 3회', String(SPECS.review.mainTarget))
ok(SPECS.review.densityMax === 1.5, '후기 밀도 상한 1.5% — 안전선으로 남긴다', String(SPECS.review.densityMax))
ok(SPECS.review.requireReviewWord === true, '제목에 「후기」 유지 (있음 4.77위 / 없음 5.81위)')
{
  // 1,835자(1~3위 중간값) 글이 통과해야 한다 — 예전 창(1,900~2,100)에서는 걸렸다
  const r = checkPost({ type:'review', title:'쌍용동 헬스장 등록 후기', body:'가'.repeat(1835), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  ok(r.items.find((i) => i.id === 'charCount').level === 'pass', '1,835자가 통과한다 (상위권 중간값)', r.items.find((i) => i.id === 'charCount').value)
  const r2 = checkPost({ type:'review', title:'쌍용동 헬스장 등록 후기', body:'가'.repeat(2500), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  ok(r2.items.find((i) => i.id === 'charCount').level === 'pass', '2,500자도 통과한다 (2,200~3,000 구간 1~3위 54%)', r2.items.find((i) => i.id === 'charCount').value)
}
ok(sysReview.includes('정확히 3회'), '후기글 메인 키워드 3회 지시')
const sysPromo = buildSystemPrompt('promo')
ok(sysPromo.includes('센터'), '홍보글 화자는 센터')
ok(sysPromo.includes('정확히 5회'), '홍보글은 메인 키워드 정확히 5회를 겨냥하게 한다')
ok(sysPromo.includes('7회까지는 통과하지만'), '상한을 알려주되 더 넣지 말라고 한다')
ok(sysPromo.includes('**2회** (해결 구간 1회 + 이벤트 구간 1회)'), '함께 찾는 키워드 2회 배치를 지시')
ok(sysPromo.includes('하나만 쓴다'), '함께 찾는 키워드는 하나만 쓰라고 지시')
// 서브 1개면 합산 밀도가 더 내려간다 (메인 본문 4회 + 서브 2회)
const comb1 = (chars) => Math.round(((4 * 6 + 2 * 5) / chars) * 10000) / 100
const comb2 = (chars) => Math.round(((4 * 6 + 2 * 2 * 5) / chars) * 10000) / 100
ok(comb1(1915) < comb2(1915), '서브 1개가 2개보다 밀도 여유가 있다', `${comb1(1915)}% < ${comb2(1915)}%`)
ok(comb1(1750) < 2, '짧은 분량에서도 합산 2% 안 (서브 1개)', `${comb1(1750)}%`)
ok(sysPromo.includes('3회 이상'), '홍보글은 상호명 3회 이상 지시')
const sysInfo = buildSystemPrompt('info')
ok(sysInfo.includes('지역 키워드'), '정보글은 지역 키워드 조연 지시')
ok(!sysInfo.includes('제목에 "후기"'), '정보글에 후기 지시는 없다')
ok(sysReview.includes('최고의') || sysReview.includes('최고'), '위험 표현 예시가 지시문에 들어간다')
ok(sysReview.includes('첫째, 둘째'), 'AI 티 금지 패턴이 지시문에 들어간다')

const STORE = {
  id: 's', name: '쌍용점', legalName: 'MTO 피트니스 쌍용점', womenOnly: false, open24: true,
  localKeywords: ['쌍용동 헬스장'], location: '쌍용동 먹자골목 인근', features: ['프리웨이트실 분리'],
  strengths: ['천국의 계단 4대'], phone: '010-0000-0000', reserveUrl: 'https://x.test/r',
}
const u1 = buildUserPrompt({
  type: 'review', store: STORE, mainKeyword: '쌍용동 헬스장', subKeywords: ['천안 쌍용동 헬스장'],
  sponsorship: 'sponsored', eventText: '3개월 등록 시 1개월 추가',
})
ok(u1.includes('MTO 피트니스 쌍용점'), '정식 상호명을 넘긴다')
ok(u1.includes('천국의 계단 4대'), '강점을 넘긴다')
ok(u1.includes('3개월 등록 시 1개월 추가'), '이벤트를 그대로 넘긴다')
ok(u1.includes('#협찬후기'), '협찬이면 표기 지시가 들어간다')
ok(u1.includes('트레이너'), '트레이너 정보 없음을 명시한다')

const u2 = buildUserPrompt({ type: 'review', store: STORE, mainKeyword: 'k', subKeywords: [], sponsorship: 'own' })
ok(u2.includes('내돈내산'), '내돈내산은 그렇게 넘긴다')
ok(!u2.includes('#협찬후기'), '내돈내산에 협찬 표기를 넣지 않는다')
ok(u2.includes('이벤트 구간을 쓰지 말고'), '이벤트가 없으면 구간을 빼라고 지시한다')

const u3 = buildUserPrompt({
  type: 'promo', store: STORE, mainKeyword: 'k', subKeywords: [],
  recent: [{ type: 'promo', title: '지난 글', mainKeyword: 'k', introType: '④상황묘사', angle: '시간' }],
  prescription: ['제목은 31~39자로 맞추세요.'],
})
ok(u3.includes('지난 글') && u3.includes('④상황묘사'), '최근 글을 유사문서 방지용으로 넘긴다')
ok(u3.includes('제목은 31~39자'), '상위노출 분석 처방을 넘긴다')

/*
 * ─── 도입 로테이션이 **AI 에게 전달되는가** ──────────────────────
 *
 * 회원 지적 (2026-08-11): "후기글 거의 처음이 등록 망설인 이유로 시작하고 있어. 이러면
 * 유사성에 겹칠 것 같아. 서로 다르게 도입부를 시작할 수 있게 해줘."
 *
 * **장치는 진작 있었고 선이 안 이어져 있었다.** 화면에 「도입 유형」 고르는 칸이 있고
 * 최근에 안 쓴 것을 권하기까지 했는데, 그 값이 `/api/write` 로 넘어가지 않았다. 글에
 * 저장만 하고 AI 에게는 말하지 않았으니 모델은 골격에 박힌 「망설임·고민으로 시작」만
 * 보고 매번 같은 도입을 썼다.
 */
const rotPrompt = buildUserPrompt({
  type: 'review',
  store: { legalName: 'MTO 피트니스 쌍용점', location: '천안 쌍용동', phone: '041-000-0000' },
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동PT'],
  introType: '③ 비교형 — 몇 군데 알아보다가',
  angle: '시간',
})
ok(rotPrompt.includes('이번 글의 도입·전개'), '도입·전개 묶음을 넘긴다')
ok(rotPrompt.includes('도입 방식: ③ 비교형'), '지정한 도입 방식을 그대로 적는다')
ok(rotPrompt.includes('다른 방식으로 열지 않는다'), '그 방식으로만 열라고 못 박는다')
ok(rotPrompt.includes('주력 앵글: 시간'), '앵글도 넘긴다')
// 지정이 없으면 그 묶음을 만들지 않는다 (빈 제목만 있는 묶음은 소음이다)
const noRot = buildUserPrompt({
  type: 'review',
  store: { legalName: 'MTO 피트니스 쌍용점', location: '천안 쌍용동', phone: '041-000-0000' },
  mainKeyword: '쌍용동 헬스장',
  subKeywords: [],
})
ok(!noRot.includes('이번 글의 도입·전개'), '지정이 없으면 묶음이 없다')
// 정보글은 형식·소재도 넘긴다
const infoRot = buildUserPrompt({
  type: 'info',
  store: { legalName: 'MTO 피트니스 쌍용점', location: '천안 쌍용동', phone: '041-000-0000' },
  mainKeyword: '폭식 멈추는 방법',
  subKeywords: [],
  format: '② Q&A형 — 자주 받는 질문 3~4개에 답',
  topicGroup: 'B. 다이어트',
})
ok(infoRot.includes('서술 형식: ② Q&A형'), '정보글 형식을 넘긴다')
ok(infoRot.includes('소재 묶음: B. 다이어트'), '소재 묶음을 넘긴다')

/*
 * **골격에서 「망설임·고민으로 시작」을 뺐다.** 여기 한 줄이 원인이었다 — 골격이 도입을
 * 한 가지로 못 박아 뒀으니 로테이션이 무슨 값을 넘겨도 모델은 매번 망설임으로 열었다.
 */
const revSys = buildSystemPrompt('review')
ok(!revSys.includes('화자 본인의 망설임·고민으로 시작'), '골격이 도입을 한 가지로 못 박지 않는다')
ok(revSys.includes('도입 방식은 위 「이번 글의 도입·전개」에 지정된 것을 따른다'), '도입은 로테이션을 따르라고 한다')
ok(revSys.includes('지정이 없을 때만 화자의 고민으로 연다'), '지정이 없을 때의 기본값은 남겨둔다')
ok(revSys.includes('어느 방식이든 화자는 방문객 1인칭이다'), '도입이 바뀌어도 화자는 안 바뀐다')

// 후기글 도입 다섯 가지가 서로 다른 방식이어야 로테이션이 의미가 있다
const { REVIEW_INTRO_TYPES, INTRO_TYPES, adviseRotation } = require(`${OUT}/writing/rotation.js`)
ok(REVIEW_INTRO_TYPES.length === 5 && new Set(REVIEW_INTRO_TYPES).size === 5, '후기 도입 5가지')
ok(!REVIEW_INTRO_TYPES.some((t) => t.includes('망설')), '「망설임」이 유일한 도입이 아니다')
// 최근에 쓴 것을 피해 고른다 (같은 도입이 연달아 나오지 않게)
const usedPosts = [
  { id: '1', storeId: 's', type: 'review', mainKeyword: 'a', body: '', createdAt: '2026-08-01', introType: REVIEW_INTRO_TYPES[0] },
  { id: '2', storeId: 's', type: 'review', mainKeyword: 'b', body: '', createdAt: '2026-08-02', introType: REVIEW_INTRO_TYPES[1] },
]
const advised = adviseRotation(usedPosts, 's', 'review')
ok(advised.introType && !advised.introType.includes(REVIEW_INTRO_TYPES[0]), '최근에 쓴 도입은 다시 권하지 않는다', advised.introType)
ok(REVIEW_INTRO_TYPES.includes(advised.introType), '후기글에는 후기 도입 목록에서 고른다')
ok(!INTRO_TYPES.includes(advised.introType), '홍보글 도입 목록을 후기에 쓰지 않는다')

/*
 * ─── 정보글은 지점을 가리지 않는다 (2026-08-27) ────────────────────
 *
 * 회원: "정보성글에는 구지 지점정보가 필요하지 않을것 같아 … 유사문서 방지는 지금 내가
 * 발행 완료한 글을 기준으로 따지면 되지 않을까?"
 *
 * 맞는 정리다. **유사문서 판정은 블로그 안에서 일어난다** — 지점이 여럿이어도 글은 전부
 * 같은 네이버 블로그 하나에 올라간다. 지점으로 나눠 세면 겹침을 놓친다 (지점만 바꿔 쓴 글이
 * 90.4% 겹쳤던 그 일이다).
 *
 * 게다가 08-27 부터 정보글은 지점을 아예 안 고른다. 지점으로 거르면 **아무것도 안 걸러져서
 * 로테이션이 통째로 죽는다** — 매번 같은 형식이 나온다.
 */
{
  const { INFO_FORMATS, TOPIC_GROUPS } = require(`${OUT}/writing/rotation.js`)
  const infoPost = (patch) => ({
    id: patch.id, type: 'info', status: 'published', storeId: patch.storeId ?? 'other',
    mainKeyword: 'k', body: '', createdAt: patch.createdAt ?? '2026-08-20',
    publishedAt: patch.publishedAt ?? '2026-08-20', ...patch,
  })
  // 다른 지점(또는 지점 없음)에서 쓴 형식도 피한다 — 같은 블로그에 올라간 글이니까
  const elsewhere = [
    infoPost({ id: '1', storeId: 'A', format: INFO_FORMATS[0], topicGroup: TOPIC_GROUPS[0], publishedAt: '2026-08-26' }),
    infoPost({ id: '2', storeId: '', format: INFO_FORMATS[1], topicGroup: TOPIC_GROUPS[1], publishedAt: '2026-08-25' }),
  ]
  const infoAdv = adviseRotation(elsewhere, '', 'info')
  ok(infoAdv.format !== INFO_FORMATS[0] && infoAdv.format !== INFO_FORMATS[1],
    '다른 지점에서 쓴 형식도 피한다', infoAdv.format)
  ok(infoAdv.topicGroup !== TOPIC_GROUPS[0] && infoAdv.topicGroup !== TOPIC_GROUPS[1],
    '소재 묶음도 마찬가지')
  ok(infoAdv.recentSummaries.length === 2, '최근 글 기록도 블로그 전체로 보여준다')

  /*
   * **발행 완료한 글만 센다** (회원이 말한 기준). 유사문서는 네이버에 올라간 글끼리 붙는
   * 것이므로 초안은 아직 그 판에 없다.
   */
  const draftOnly = [infoPost({ id: '3', status: 'draft', format: INFO_FORMATS[0], topicGroup: TOPIC_GROUPS[0] })]
  ok(adviseRotation(draftOnly, '', 'info').recentSummaries.length === 0, '초안은 세지 않는다')

  /*
   * **발행 간격 경고는 정보글에 붙이지 않는다.** 그 경고는 같은 지점 홍보글이 서로
   * 잡아먹는 자기잠식을 막는 것이다. 블로그 전체로 세면 매일 쓰는 회원에게 날마다 뜬다.
   */
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  ok(adviseRotation([infoPost({ id: '4', publishedAt: yesterday })], '', 'info').warnings.length === 0,
    '어제 발행했어도 정보글에는 간격 경고를 안 낸다')

  // 홍보글·후기글은 그대로 지점별이다 — 그 글들은 지점이 주인공이다
  const promoElsewhere = [{ id: '5', type: 'promo', status: 'published', storeId: 'A', mainKeyword: 'k', body: '', createdAt: '2026-08-26', publishedAt: '2026-08-26', introType: INTRO_TYPES[0] }]
  ok(adviseRotation(promoElsewhere, 'B', 'promo').recentSummaries.length === 0, '홍보글은 다른 지점 글을 보지 않는다')
  ok(adviseRotation(promoElsewhere, 'A', 'promo').warnings.some((w) => w.includes('2~3주')), '같은 지점 홍보글에는 간격 경고가 그대로 뜬다')
}

const fix = buildFixPrompt(['본문 글자수: 지금 1,500자 / 기준 1,900~2,100자'], 1500, { charMin: 1900, charMax: 2100 })
ok(fix.includes('1,500') && fix.includes('1,900'), '고쳐 쓰기 지시에 현재값과 기준이 들어간다')
ok(fix.includes('JSON'), '고쳐 쓸 때도 JSON 으로 받는다')


// ─────────────────────────────────────────────────────────────
console.log('\n[32] 키워드 시너지 세트')
const { splitKeyword, pairSynergy, buildKeywordSets, writeHrefForSet, subValue, INTENT_META } = require(
  `${OUT}/analysis/synergy.js`
)

// 지역 + 의도로 쪼갠다
const sp1 = splitKeyword('쌍용동 헬스장 가격', ['쌍용동'])
ok(sp1.area === '쌍용동', '지역명을 뗀다', sp1.area)
ok(sp1.intent === '헬스장 가격', '남은 의도', sp1.intent)
ok(sp1.meta?.postType === 'promo', '가격은 홍보글')
ok(splitKeyword('쌍용동헬스장', ['쌍용동']).meta?.family === 'gym', '띄어쓰기 없어도 의도를 알아본다')
ok(splitKeyword('두정동 헬스장').area === '두정동', '지역 목록 없이도 동 이름을 찾는다')
ok(splitKeyword('천안 쌍용동 헬스장', ['쌍용동', '천안 쌍용동']).area === '천안 쌍용동', '겹치면 긴 지역을 쓴다')
ok(splitKeyword('다이어트 정체기 극복').area === '', '지역 없는 정보 키워드')

// 조합 생성기가 만드는 접미사는 전부 성격표에 있어야 한다 (하나라도 빠지면 세트가 안 묶인다)
const metaFlat = new Set(INTENT_META.map((m) => m.suffix.replace(/\s+/g, '')))
ok(
  INTENT_SUFFIXES.every((s) => metaFlat.has(s.replace(/\s+/g, ''))),
  'INTENT_SUFFIXES 전부 성격표에 있다',
  INTENT_SUFFIXES.filter((s) => !metaFlat.has(s.replace(/\s+/g, ''))).join(',')
)
ok(
  suffixesForStore({ open24: true, womenOnly: true }).every((s) => metaFlat.has(s.replace(/\s+/g, ''))),
  '지점 맞춤 접미사도 전부 성격표에 있다'
)

// 궁합 판정
const AR = ['쌍용동', '봉명동']
ok(pairSynergy('쌍용동 헬스장', '봉명동 헬스장', AR).strength === 'never', '지역이 다르면 같이 못 쓴다')
ok(pairSynergy('쌍용동 헬스장', '봉명동 헬스장', AR).why.includes('나누세요'), '무엇을 하라고 말해준다')
ok(pairSynergy('쌍용동 헬스장', '쌍용동 헬스장', AR).strength === 'never', '같은 키워드는 세트가 아니다')
const ext = pairSynergy('쌍용동 헬스장', '쌍용동 헬스장 가격', AR)
ok(ext.strength === 'strong' && ext.score >= 80, '확장 키워드는 시너지 강함', String(ext.score))
const head = pairSynergy('쌍용동 헬스장 후기', '쌍용동 헬스장', AR)
ok(head.strength === 'strong', '넓은 키워드를 서브로 얹는 것은 유형이 달라도 이득')
const fam = pairSynergy('쌍용동 24시 헬스장', '쌍용동 헬스장 새벽', AR)
ok(fam.strength === 'strong', '같은 의도군은 시너지 강함')
const conflict = pairSynergy('쌍용동 헬스장', '쌍용동 헬스장 후기', AR)
ok(conflict.strength === 'split', '홍보글 + 후기 키워드는 나눈다')
ok(conflict.why.includes('홍보글') && conflict.why.includes('후기글'), '어느 유형끼리 어긋나는지 밝힌다')
ok(pairSynergy('쌍용동 헬스장', '쌍용동 다이어트', AR).strength === 'split', '홍보글 + 정보 키워드도 나눈다')
ok(pairSynergy('쌍용동 헬스장', '쌍용동 PT', AR).strength === 'ok', '같은 유형 다른 의도군은 함께 가능')

// 세트 만들기
const mk = (keyword, monthlySearch, blogRecent) =>
  buildMetric({ keyword, monthlySearch, monthlyPc: 0, monthlyMobile: monthlySearch, blogRecent, mock: false })
const METRICS = [
  mk('쌍용동 헬스장', 1430, 430),        // 황금
  mk('쌍용동 헬스장 가격', 320, 80),      // 검색량 부족이지만 서브로는 쓴다
  mk('쌍용동 24시 헬스장', 210, 40),
  mk('쌍용동 헬스장 후기', 260, 60),      // 유형이 달라 따로
  mk('봉명동 헬스장', 880, 300),          // 다른 지역 → 다른 세트
]
const plan = buildKeywordSets(METRICS, { areas: ['쌍용동', '봉명동'], store: { open24: true, womenOnly: false } })
ok(plan.sets.length >= 2, '지역마다 세트를 만든다', String(plan.sets.length))
const s0 = plan.sets[0]
ok(s0.main.keyword === '쌍용동 헬스장', '검색량 큰 진입 가능 키워드가 메인', s0.main.keyword)
ok(s0.subs.length === 2, '서브는 2개까지', String(s0.subs.length))
ok(s0.subs.every((s) => s.metric.monthlySearch <= s0.main.monthlySearch), '서브가 메인보다 크지 않다')
ok(s0.subs.every((s) => s.metric.keyword.startsWith('쌍용동')), '세트 안은 같은 지역')
ok(!s0.subs.some((s) => s.metric.keyword.includes('후기')), '후기 키워드는 홍보 세트에 안 넣는다')
ok(s0.postType === 'promo', '세트의 글 유형')
ok(s0.reach === 1430 + 320 + 210, '합계 검색량', String(s0.reach))
ok(s0.headline.includes('3개 검색어') && s0.headline.includes('1,960'), '한 줄 요약', s0.headline)
ok(s0.local === '쌍용동', '정보글 조연으로 쓸 지역 키워드')
ok(plan.splits.some((x) => x.keyword === '쌍용동 헬스장 후기' && x.postType === 'review'), '후기는 따로 쓰라고 알려준다')
ok(plan.sets.some((s) => s.main.keyword === '봉명동 헬스장'), '다른 지역은 별도 세트')
ok(plan.sets.every((s) => !(s.area === '쌍용동' && s.subs.some((x) => x.metric.keyword.includes('봉명동')))), '지역이 섞이지 않는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[33] 상위 글 본문 실측 · 커트라인')
const { postViewUrl, parsePostMetrics, parsePostTitle } = require(`${OUT}/naver/blogpost.js`)
const { buildCutline, cutlineLine, median, CUTLINE_MIN_SAMPLE } = require(`${OUT}/analysis/cutline.js`)

// 본문은 PostView.naver 에만 실려 온다 (blog.naver.com/id/logNo 는 프레임 껍데기)
ok(
  postViewUrl('https://blog.naver.com/hyoni2_/224361842417') ===
    'https://blog.naver.com/PostView.naver?blogId=hyoni2_&logNo=224361842417',
  '기본 주소를 본문 주소로 바꾼다'
)
ok(
  postViewUrl('https://m.blog.naver.com/hyoni2_/224361842417').includes('blogId=hyoni2_&logNo=224361842417'),
  '모바일 주소도 바꾼다'
)
ok(
  postViewUrl('https://blog.naver.com/PostView.naver?blogId=a&logNo=1&from=search') ===
    'https://blog.naver.com/PostView.naver?blogId=a&logNo=1',
  '이미 본문 주소면 군더더기를 뗀다'
)
ok(postViewUrl('https://blog.naver.com/hyoni2_') === '', '글 번호가 없으면 못 읽는다')
ok(postViewUrl('') === '', '빈 주소')

// 스마트에디터 구조에서 수치를 뽑는다. post_footer 뒤(댓글·이웃추가)는 본문이 아니다.
const HTML = [
  '<html><body><div class="wrap">',
  '<div class="se-main-container">',
  '<div class="se-component se-text"><p>가나다라마바사아자차카타파하</p></div>',
  '<div class="se-component se-image"><img src="a.jpg"></div>',
  '<div class="se-component se-text"><p>두 번째 문단입니다 여기도 글자</p></div>',
  '<div class="se-component se-image"><img src="b.jpg"></div>',
  '<div class="se-component se-video"><video></video></div>',
  '<script>var x = "se-component se-image"</script>',
  '</div>',
  '<div class="post_footer"><div class="se-component se-image">댓글 영역 이미지</div>댓글 100개</div>',
  '</body></html>',
].join('')
const PM = parsePostMetrics(HTML)
ok(PM.imageCount === 2, 'post_footer 뒤 이미지는 안 센다', String(PM.imageCount))
ok(PM.videoCount === 1, '영상 개수', String(PM.videoCount))
ok(!/댓글/.test(String(PM.charCount)) && PM.charCount === 27, '본문 글자수만 센다(공백 제외)', String(PM.charCount))
ok(parsePostMetrics('<html><body>본문 컨테이너가 없음</body></html>') === null, '못 읽으면 null')
ok(PM.text.includes('두 번째 문단'), '본문 평문도 함께 돌려준다 (상위권 단어 대조용)')
ok(!PM.text.includes('댓글'), '평문에도 댓글 영역은 없다')

// 제목은 본문 안이 아니라 og:title 에 있다 — 이미 발행한 글을 진단하려면 이게 필요하다
ok(
  parsePostTitle('<meta property="og:title" content="쌍용동 헬스장 3개월 후기" />') === '쌍용동 헬스장 3개월 후기',
  'og:title 에서 제목을 읽는다'
)
ok(
  parsePostTitle('<title>쌍용동 헬스장 후기 : 네이버 블로그</title>') === '쌍용동 헬스장 후기',
  'title 태그면 " : 네이버 블로그" 를 뗀다'
)
ok(parsePostTitle('<html></html>') === '', '제목이 없으면 빈 문자열')

// 커트라인은 평균이 아니라 중간값 — 상위권에 이미지 40장짜리가 섞이면 평균이 망가진다
ok(median([1, 2, 3]) === 2, '중간값 (홀수)')
ok(median([1, 2, 3, 4]) === 3, '중간값 (짝수 — 반올림)', String(median([1, 2, 3, 4])))
ok(median([]) === 0, '빈 배열은 0')
const MET = [
  { charCount: 2200, imageCount: 17, videoCount: 8, url: 'a' },
  { charCount: 1800, imageCount: 9, videoCount: 1, url: 'b' },
  { charCount: 2000, imageCount: 11, videoCount: 0, url: 'c' },
  { charCount: 9000, imageCount: 40, videoCount: 0, url: 'd' },
]
const CUT = buildCutline(MET)
ok(CUT.charMedian === 2100, '글자수 중간값', String(CUT.charMedian))
ok(CUT.imageMedian === 14, '이미지 중간값', String(CUT.imageMedian))
/*
 * **목표를 중간값보다 올리지 않는다** (2026-08-06 실측으로 고쳤다).
 * 예전에는 본문 +10% · 이미지 +1장이었는데, 그 논리가 반대로 갔다.
 *   이미지  6~10장 1~3위 54% / 11~15장 18% / 16장 이상 25%
 *   분량    홍보글은 무관, 후기글은 3,000자 이상에서 7.50위
 * 이미지 14장인 판에서 15장을 목표로 주면 가장 나쁜 구간으로 밀어넣는 셈이었다.
 */
ok(CUT.charTarget === 2100, '본문 목표는 중간값에 맞춘다 (예전엔 ×1.1)', String(CUT.charTarget))
ok(CUT.imageTarget === 10, '이미지 목표는 6~10장으로 묶는다', String(CUT.imageTarget))
ok(CUT.imageOvershoot === true, '상위 글이 10장을 넘기면 맞추지 말라고 표시한다')
{
  // 상위 글이 적게 쓰면 하한(6장)으로 올린다
  const few = buildCutline([
    { url: 'a', charCount: 1800, imageCount: 3, videoCount: 0 },
    { url: 'b', charCount: 1900, imageCount: 4, videoCount: 0 },
    { url: 'c', charCount: 2000, imageCount: 2, videoCount: 0 },
  ])
  ok(few.imageTarget === 6, '상위 글이 적게 써도 6장은 채운다', String(few.imageTarget))
  ok(few.imageOvershoot === false, '넘치지 않으면 표시하지 않는다')
  // 중간값이 검수 구간보다 짧아도 처방이 검수와 부딪히지 않게 눌러 담는다
  const short = buildCutline([
    { url: 'a', charCount: 900, imageCount: 8, videoCount: 0 },
    { url: 'b', charCount: 1000, imageCount: 8, videoCount: 0 },
    { url: 'c', charCount: 1100, imageCount: 8, videoCount: 0 },
  ])
  ok(short.charTarget === 1700, '중간값이 짧아도 1,700자 아래로는 안 내려간다', String(short.charTarget))
}
ok(CUT.charMedian < 9000, '이미지 40장짜리 특이값에 끌려가지 않는다')
ok(CUT.videoExpected === false, '영상 넣은 글이 절반뿐이면 기대 안 함 (중간값 반올림에 속지 않는다)')
ok(
  buildCutline([
    { charCount: 2000, imageCount: 9, videoCount: 2, url: 'a' },
    { charCount: 2000, imageCount: 9, videoCount: 1, url: 'b' },
    { charCount: 2000, imageCount: 9, videoCount: 0, url: 'c' },
  ]).videoExpected === true,
  '3개 중 2개가 영상을 넣었으면 기대한다'
)
ok(buildCutline(MET.slice(0, 2)) === null, `${CUTLINE_MIN_SAMPLE}개 미만이면 커트라인을 만들지 않는다`)
const LINE = cutlineLine(CUT)
ok(LINE.includes('2,100자'), '처방 문장에 실측값이 들어간다', LINE.slice(0, 60))
ok(LINE.includes('늘려서 이기는 항목이 아닙니다'), '분량을 늘리라고 하지 않는다')
ok(LINE.includes('6~10장'), '이미지는 6~10장으로 지시한다')
ok(LINE.includes('상위 글이 14장을 쓰지만'), '상위 글보다 적게 쓰는 이유를 설명한다', LINE.slice(-120))

// 크론이 밤에 진단해 처방을 만들어 두면, 순위 화면에 안 들어가도 알려줘야 한다
const STUCK = nextActions({
  ...base,
  posts: [{ id: 'p', status: 'published', type: 'promo', storeId: 's' }],
  rankTargets: [{ id: 'rt', keyword: '쌍용동 헬스장', url: 'u', createdAt: '' }],
  stuck: [{ keyword: '쌍용동 헬스장', rank: 14, days: 15 }],
})
ok(STUCK.some((a) => a.id === 'stuck'), '진단 준비됨을 대시보드에서 알려준다', STUCK.map((a) => a.id).join(','))
const stuckAct = STUCK.find((a) => a.id === 'stuck')
ok(stuckAct.title.includes('쌍용동 헬스장'), '어느 키워드인지 밝힌다')
ok(stuckAct.why.includes('15일째') && stuckAct.why.includes('14위'), '며칠째 몇 위인지 밝힌다', stuckAct.why)
ok(stuckAct.href === '/rank', '순위 화면으로 보낸다')
const idxStuck = STUCK.findIndex((a) => a.id === 'stuck')
const idxFallen = STUCK.findIndex((a) => a.id === 'fallen')
ok(idxFallen === -1 || idxStuck < idxFallen, '답이 준비된 것을 먼저 보여준다')

// ─────────────────────────────────────────────────────────────
console.log('\n[34] 상위권 층별 단어 (공통·빈틈)')
// 상위 1~3위가 다 쓴 말과, 상위 10위 안에는 없는 말을 갈라낸다
const LAYER = analyzePastedSerp(
  '쌍용동 헬스장',
  [
    { title: '쌍용동 헬스장 가격 후기 정리', date: '', blogger: 'a' },
    { title: '쌍용동 헬스장 후기 가격 비교', date: '', blogger: 'b' },
    { title: '쌍용동 헬스장 후기 가격 상담', date: '', blogger: 'c' },
    { title: '쌍용동 헬스장 시설 둘러봄', date: '', blogger: 'd' },
    { title: '쌍용동 헬스장 주차 편함', date: '', blogger: 'e' },
    { title: '쌍용동 헬스장 추천 4', date: '', blogger: 'f' },
    { title: '쌍용동 헬스장 추천 5', date: '', blogger: 'g' },
    { title: '쌍용동 헬스장 추천 6', date: '', blogger: 'h' },
    { title: '쌍용동 헬스장 추천 7', date: '', blogger: 'i' },
    { title: '쌍용동 헬스장 추천 8', date: '', blogger: 'j' },
    { title: '쌍용동 헬스장 새벽 운동 자리', date: '', blogger: 'k' },
    { title: '쌍용동 헬스장 새벽 다녀옴', date: '', blogger: 'l' },
  ],
  500,
  15,
  'section'
)
const shared3 = LAYER.stats.sharedTop3.map((t) => t.token)
ok(shared3.includes('후기') && shared3.includes('가격'), '상위 1~3위 공통 단어', shared3.join(','))
ok(!shared3.includes('시설'), '4위에만 있는 말은 공통이 아니다')
const gap = LAYER.stats.gapTokens.map((t) => t.token)
ok(gap.includes('새벽'), '상위 10위 밖에서만 쓰이는 말을 빈틈으로 잡는다', gap.join(','))
ok(!gap.includes('후기'), '상위권이 쓰는 말은 빈틈이 아니다')
const rx = LAYER.prescription.join(' | ')
ok(rx.includes('상위 1~3위가 모두 쓴 말'), '처방이 공통 단어를 먼저 말한다')
ok(rx.includes('아직 안 다룬 자리'), '처방이 빈틈도 알려준다')

// ─────────────────────────────────────────────────────────────
console.log('\n[35] 통합검색 스마트블록')
const { parseUnifiedBlocks, findUnifiedRank, countByBlogger, unifiedHasPost } = require(`${OUT}/naver/unified.js`)

// 네이버는 블록마다 api_subject_bx 를 붙이고, 컨테이너가 겹쳐 같은 묶음이 두 번 잡힌다
const UNI = [
  '<div class="api_subject_bx"><h2>광고</h2><a href="https://ader.naver.com/x">광고</a></div>',
  '<div class="api_subject_bx"><h2>스포츠 인기글</h2>',
  '<a href="https://blog.naver.com/aaa/111">1</a>',
  '<a href="https://blog.naver.com/aaa/111">중복</a>',
  '<a href="https://blog.naver.com/bbb/222">2</a>',
  '<a href="https://blog.naver.com/ccc/333">3</a></div>',
  // 같은 묶음이 한 번 더 (컨테이너 중첩)
  '<div class="api_subject_bx"><a href="https://blog.naver.com/aaa/111">1</a>',
  '<a href="https://blog.naver.com/bbb/222">2</a><a href="https://blog.naver.com/ccc/333">3</a></div>',
  '<div class="api_subject_bx"><h2>블로그</h2><a href="https://blog.naver.com/ddd/444">x</a>',
  '<a href="https://blog.naver.com/eee/555">y</a></div>',
].join('')
const BLOCKS = parseUnifiedBlocks(UNI)
ok(BLOCKS.length === 2, '겹친 컨테이너를 한 블록으로 본다', String(BLOCKS.length))
ok(BLOCKS[0].name === '스포츠 인기글', '블록 이름을 읽는다', BLOCKS[0].name)
ok(BLOCKS[0].posts.length === 3, '중복 링크는 한 번만 센다', String(BLOCKS[0].posts.length))
ok(BLOCKS[0].posts[0].blogId === 'aaa', '나온 순서를 지킨다')
ok(BLOCKS[1].name === '블로그', '두 번째 블록')
ok(parseUnifiedBlocks('<html>블록 없음</html>').length === 0, '블록이 없으면 빈 배열')

// 글이 한 편뿐인 묶음은 블록이 아니다 (광고·채널 카드)
ok(
  parseUnifiedBlocks('<div class="api_subject_bx"><a href="https://blog.naver.com/z/9">1</a></div>').length === 0,
  '한 편뿐인 묶음은 제외'
)

// 내 글 위치 — 주소 형태가 달라도 찾는다
ok(findUnifiedRank(BLOCKS, 'https://blog.naver.com/bbb/222').rank === 2, '블록 안 순서', String(findUnifiedRank(BLOCKS, 'https://blog.naver.com/bbb/222')?.rank))
ok(findUnifiedRank(BLOCKS, 'https://m.blog.naver.com/bbb/222').rank === 2, '모바일 주소로도 찾는다')
ok(
  findUnifiedRank(BLOCKS, 'https://blog.naver.com/PostView.naver?blogId=bbb&logNo=222').rank === 2,
  'PostView 주소로도 찾는다'
)
ok(findUnifiedRank(BLOCKS, 'https://blog.naver.com/ddd/444').blockOrder === 2, '몇 번째 블록인지도 준다')
ok(findUnifiedRank(BLOCKS, 'https://blog.naver.com/none/1') === null, '없으면 null')
ok(findUnifiedRank(BLOCKS, '') === null, '빈 주소')

const CNT = countByBlogger(BLOCKS)
ok(CNT.length === 5 && CNT[0].count === 1, '블로거별 편수를 센다', String(CNT.length))

// 색인 검사는 블록 파서로 하면 안 된다 — 결과가 한 편뿐인 게 정상이라 블록이 버려진다
ok(unifiedHasPost('<a href="https://blog.naver.com/z/9">1</a>', 'https://blog.naver.com/z/9'),
  '글이 한 편뿐이어도 주소로는 찾는다')
ok(unifiedHasPost('<a href="https://BLOG.naver.com/Hyoni2_/224361842417">x</a>', 'blog.naver.com/hyoni2_/224361842417'),
  '대소문자가 달라도 같은 글')
ok(
  unifiedHasPost('<a href="https%3A%2F%2Fblog.naver.com%2Faaa%2F111">x</a>', 'https://blog.naver.com/aaa/111'),
  '클릭 추적 주소 안에 인코딩돼 있어도 찾는다'
)
ok(
  unifiedHasPost('<a href="/PostView.naver?logNo=111&blogId=aaa">x</a>', 'https://blog.naver.com/aaa/111'),
  'PostView 파라미터 순서가 뒤바뀌어도 찾는다'
)
ok(!unifiedHasPost('<a href="https://blog.naver.com/aaa/999">x</a>', 'https://blog.naver.com/aaa/111'),
  '같은 블로그의 다른 글은 아니다')
ok(!unifiedHasPost('<html>없음</html>', 'https://blog.naver.com/aaa/111'), '없으면 없다고 한다')
ok(!unifiedHasPost('<a href="https://blog.naver.com/aaa/111">x</a>', 'https://blog.naver.com/aaa'),
  '글 번호가 없는 주소로는 판정하지 않는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[36] 블로그 성격 판별 · 추정 힘')
const { blogIdFromInput, parseBlogRss, rssDate } = require(`${OUT}/naver/blogrss.js`)
const {
  buildBlogProfile,
  classifyBlogger,
  queryFromTitle,
  meaningForUs,
  gradeBlog,
  measureExposure,
  competitionOf,
  sampleCap,
  KIND_LABEL,
  GRADE_LABEL,
  GRADE_LADDER,
  GRADE_SHARE,
} = require(`${OUT}/analysis/blogscore.js`)

// 아이디는 아무 형태로 넣어도 받는다
ok(blogIdFromInput('jiyun0361') === 'jiyun0361', '아이디만')
ok(blogIdFromInput('https://blog.naver.com/jiyun0361') === 'jiyun0361', '블로그 주소')
ok(blogIdFromInput('https://m.blog.naver.com/jiyun0361/224352038257') === 'jiyun0361', '모바일 글 주소')
ok(
  blogIdFromInput('https://blog.naver.com/PostView.naver?blogId=jiyun0361&logNo=1') === 'jiyun0361',
  'PostView 주소'
)
ok(blogIdFromInput('') === '', '빈 값')
ok(blogIdFromInput('한글아이디') === '', '아이디 형식이 아니면 빈 값')

ok(rssDate('Tue, 04 Aug 2026 01:04:53 +0900') === '2026-08-03', 'pubDate 를 날짜로 (UTC 기준)', rssDate('Tue, 04 Aug 2026 01:04:53 +0900'))
ok(rssDate('없는날짜') === '', '못 읽으면 빈 값')

const RSS = `<?xml version="1.0"?><rss><channel><title><![CDATA[해우소]]></title>
<item><title><![CDATA[천안 쌍용동 헬스장 후기]]></title><link><![CDATA[https://blog.naver.com/me/1?fromRss=true]]></link><pubDate>Mon, 03 Aug 2026 10:00:00 +0900</pubDate><category><![CDATA[각종리뷰]]></category></item>
<item><title><![CDATA[천안 맛집 파스타 추천]]></title><link><![CDATA[https://blog.naver.com/me/2]]></link><pubDate>Sun, 02 Aug 2026 10:00:00 +0900</pubDate><category><![CDATA[각종리뷰]]></category></item>
<item><title><![CDATA[강릉 여행 숙소 후기]]></title><link><![CDATA[https://blog.naver.com/me/3]]></link><pubDate>Sat, 01 Aug 2026 10:00:00 +0900</pubDate><category><![CDATA[각종리뷰]]></category></item>
<item><title><![CDATA[네일 뷰티 샵 다녀왔어요]]></title><link><![CDATA[https://blog.naver.com/me/4]]></link><pubDate>Fri, 31 Jul 2026 10:00:00 +0900</pubDate><category><![CDATA[각종리뷰]]></category></item>
</channel></rss>`
const FEED = parseBlogRss(RSS)
ok(FEED.blogName === '해우소', '블로그 이름을 읽는다', FEED.blogName)
ok(FEED.items.length === 4, '글 4편', String(FEED.items.length))
ok(FEED.items[0].link === 'https://blog.naver.com/me/1', 'fromRss 꼬리를 뗀다', FEED.items[0].link)
ok(parseBlogRss('<html>rss 아님</html>') === null, 'RSS 가 아니면 null')

// 카테고리 이름 하나에 여러 업종을 몰아넣은 블로그에 속지 않아야 한다
const PROF = buildBlogProfile({ ...FEED, blogId: 'me' }, '2026-08-04')
ok(PROF.kind === 'mixed', '여러 업종이면 잡식 리뷰로 본다', PROF.kind)
ok(PROF.topShare === 100, '카테고리 비율로는 100%')
ok(PROF.topTradeShare < 100, '업종 비율로는 100% 가 아니다 (실측에서 이걸로 만점이 나왔다)', String(PROF.topTradeShare))
ok(PROF.tradeGroups.length >= 3, '섞인 업종을 센다', PROF.tradeGroups.join(','))
ok(PROF.kindReason.includes('업종'), '근거를 함께 준다')
ok(meaningForUs(PROF).includes('편수'), '우리에게 무엇을 뜻하는지 알려준다')

// 업체 본인 블로그
const OWNER = classifyBlogger(
  [{ name: '피앤피짐 ', count: 34 }, { name: '이벤트', count: 13 }, { name: '시설소개', count: 2 }],
  { topShare: 68, tradeGroups: ['운동·건강'] }
)
ok(OWNER.kind === 'owner', '카테고리가 상호·이벤트·시설이면 업체 본인 블로그', OWNER.kind)
ok(OWNER.reason.includes('경쟁 업체'), '경쟁 업체라고 밝힌다')
ok(KIND_LABEL[OWNER.kind] === '업체 본인 블로그', '한국어 이름')

// 한 주제에 집중된 블로그
const TOPICAL = classifyBlogger([{ name: '운동일기', count: 45 }, { name: '식단', count: 5 }], {
  topShare: 90,
  tradeGroups: ['운동·건강'],
})
ok(TOPICAL.kind === 'topical', '한 주제면 주제 집중 블로그', TOPICAL.kind)

// 노출력을 못 재면 그 항목을 빼고 환산한다 (0점으로 넣으면 점수가 거짓이 된다)
ok(!PROF.scoreParts.some((s) => s.label === '노출력'), '안 재면 항목이 없다')
const WITH = buildBlogProfile({ ...FEED, blogId: 'me' }, '2026-08-04', 100)
ok(WITH.scoreParts.some((s) => s.label === '노출력'), '재면 항목이 붙는다')
ok(WITH.score > PROF.score - 30, '환산이 무너지지 않는다', `${PROF.score} → ${WITH.score}`)

// ── 검색어 경쟁 강도 ────────────────────────────────────────
ok(competitionOf(0) === 'none' && competitionOf(29) === 'none', '30편 미만은 경쟁 없음')
ok(competitionOf(30) === 'low' && competitionOf(299) === 'low', '30~300편은 약함')
ok(competitionOf(300) === 'mid' && competitionOf(999) === 'mid', '300~1,000편은 보통')
ok(competitionOf(1000) === 'high' && competitionOf(50000) === 'high', '1,000편 이상은 강함')
ok(competitionOf(null) === 'unknown', '못 읽으면 못 잼')

// ── 표본으로 노출 지표 만들기 ────────────────────────────────
const mkS = (n, rank, total) => Array.from({ length: n }, () => ({ rank, total }))
const GB_MIX = measureExposure([...mkS(5, 1, 2000), ...mkS(5, null, 2000)])
ok(GB_MIX.real === 10 && GB_MIX.trivial === 0, '경쟁 있는 표본 10편')
ok(GB_MIX.exposureRate === 50 && GB_MIX.firstPageRate === 50, '절반이 1위', `${GB_MIX.exposureRate}/${GB_MIX.firstPageRate}`)
ok(GB_MIX.weightedExposure === 50, '경쟁 강한 검색어는 가중치 1 이라 그대로', String(GB_MIX.weightedExposure))

// **핵심**: 쉬운 검색어에서만 걸리면 100% 라도 가중 점수가 낮다 (등급이 부풀지 않게 하는 장치)
const GB_EASY = measureExposure(mkS(10, 1, 50))
ok(GB_EASY.exposureRate === 100 && GB_EASY.weightedExposure === 45, '경쟁 약한 검색어 100% 는 가중 45점', String(GB_EASY.weightedExposure))
const GB_HARD = measureExposure(mkS(10, 1, 5000))
ok(GB_HARD.weightedExposure === 100, '경쟁 강한 검색어 100% 는 가중 100점', String(GB_HARD.weightedExposure))
ok(GB_EASY.weightedExposure < GB_HARD.weightedExposure, '같은 100% 라도 쉬운 쪽이 낮다')

// 경쟁 없는 표본은 아예 뺀다 (0편짜리 검색어에서 1위 하는 것은 힘의 증거가 아니다)
const GB_TRIV = measureExposure([...mkS(3, 1, 0), ...mkS(3, null, 2000)])
ok(GB_TRIV.trivial === 3 && GB_TRIV.real === 3, '0편짜리 3편을 뺀다', `${GB_TRIV.trivial}/${GB_TRIV.real}`)
ok(GB_TRIV.exposureRate === 0, '남은 표본으로만 센다', String(GB_TRIV.exposureRate))
ok(measureExposure(mkS(3, 1, 0)).weightedExposure === undefined, '전부 경쟁 없으면 노출률을 내지 않는다')
// 30위에 걸렸지만 1페이지는 아닌 표본
const GB_P2 = measureExposure(mkS(4, 15, 2000))
ok(GB_P2.exposureRate === 100 && GB_P2.firstPageRate === 0, '11~30위는 1페이지가 아니다')

// ── 표본 수 상한 ────────────────────────────────────────────
ok(sampleCap(25) === null, '표본 20편 이상이면 상한 없음')
ok(sampleCap(12).cap === 'optimal1' && sampleCap(7).cap === 'semi6', '표본이 적으면 위 칸을 잠근다')
ok(sampleCap(2).cap === 'semi3', '2편은 준최 3 까지만')

// ── 등급 판정 ───────────────────────────────────────────────
ok(gradeBlog({ samples: 0 }).grade === 'unknown', '표본이 없으면 판정하지 않는다')

// 색인부터 본다 — 제목 완전일치인데도 안 나오면 그게 "저품질" 의 실체다
const GB_DROP = gradeBlog({ indexedRate: 0, samples: 5 })
ok(GB_DROP.grade === 'dropped', '제목 그대로 검색해도 안 나오면 저품질 의심', GB_DROP.grade)
ok(GB_DROP.reason.includes('색인 전일 수 있'), '방금 올린 글일 수 있다는 여지를 남긴다')

// 표본 20편 전부 경쟁 강한 검색어에서 1위 — 여기서만 최적 3 이 나온다
const GB_TOP = gradeBlog({ indexedRate: 100, exposure: measureExposure(mkS(20, 1, 3000)), samples: 23 })
ok(GB_TOP.grade === 'optimal3' && GB_TOP.score === 100, '경쟁 강한 검색어를 다 1페이지로 먹으면 최적 3', `${GB_TOP.grade}/${GB_TOP.score}`)
ok(!GB_TOP.cappedAt, '표본이 충분하면 상한이 안 걸린다')

// 같은 성적인데 표본이 10편이면 최적 1 까지만 (표본 하나에 한 칸이 움직이는 폭이다)
const GB_FEW = gradeBlog({ indexedRate: 100, exposure: measureExposure(mkS(10, 1, 3000)), samples: 13 })
ok(GB_FEW.score === 100 && GB_FEW.grade === 'optimal1', '표본 10편이면 최적 1 로 잠근다', `${GB_FEW.grade}/${GB_FEW.score}`)
ok(GB_FEW.cappedAt === 'optimal1' && GB_FEW.reason.includes('표본 10편'), '왜 잠겼는지 문장에 적는다')

// 보통 블로그 — 30위 안 40%, 1페이지 10%, 경쟁 보통. 실제 분포에서 61% 가 여기(준최 2)다
const GB_MID = gradeBlog({
  indexedRate: 100,
  exposure: measureExposure([...mkS(2, 3, 500), ...mkS(6, 15, 500), ...mkS(12, null, 500)]),
  samples: 23,
})
ok(GB_MID.grade === 'semi2', '보통 성적은 준최 2', `${GB_MID.grade}/${GB_MID.score}`)

// 색인이 새면 노출이 완벽해도 위 칸으로 안 올린다
const GB_PART = gradeBlog({ indexedRate: 67, exposure: measureExposure(mkS(20, 1, 3000)), samples: 23 })
ok(GB_PART.grade === 'semi4' && GB_PART.cappedAt === 'semi4', '색인 67% 면 준최 4 로 잠근다', GB_PART.grade)
ok(GB_PART.reason.includes('색인 67%'), '색인율을 문장에 적는다')
const GB_HALF = gradeBlog({ indexedRate: 50, exposure: measureExposure(mkS(20, 1, 3000)), samples: 23 })
ok(GB_HALF.grade === 'normal', '색인이 절반이면 일반까지 내린다', GB_HALF.grade)

// **핵심**: 노출률 0% 를 저품질로 읽지 않게 한다 (hyoni2_ 는 0% 였는데 우리 키워드 1위였다)
const GB_LOW = gradeBlog({ indexedRate: 100, exposure: measureExposure(mkS(20, null, 3000)), samples: 23 })
ok(GB_LOW.grade !== 'dropped', '색인 정상이면 저품질이 아니다', GB_LOW.grade)
ok(GB_LOW.reason.includes('저품질이 아닙니다'), '저품질이 아니라고 분명히 말한다')

// 경쟁 있는 표본이 없으면 노출을 아예 안 잰다 (없는 값을 0점으로 넣지 않는다)
const GB_NOEXP = gradeBlog({ indexedRate: 100, exposure: measureExposure(mkS(4, 1, 0)), samples: 4 })
ok(GB_NOEXP.grade === 'normal' && GB_NOEXP.score === undefined, '못 재면 점수를 내지 않는다', String(GB_NOEXP.score))
ok(GB_NOEXP.reason.includes('경쟁이 거의 없는 검색어'), '왜 못 쟀는지 밝힌다')
ok(gradeBlog({ indexedRate: 100, samples: 3 }).grade === 'normal', '노출력을 못 재면 색인만으로 일반')

// 판정 근거를 항목별로 돌려준다 (숫자만 주면 믿거나 못 믿거나 뿐이다)
ok(GB_TOP.axes.length === 3 && GB_TOP.axes.every((a) => a.label && a.note), '세 축을 근거와 함께 돌려준다')
ok(GB_TOP.axes.reduce((s, a) => s + a.max, 0) === 100, '배점 합이 100', String(GB_TOP.axes.reduce((s, a) => s + a.max, 0)))

// 사다리는 **업계 표기 방향**이어야 한다 — 숫자가 클수록 강하다 (전에는 반대였다)
ok(GRADE_LADDER[0] === 'optimal3' && GRADE_LADDER[GRADE_LADDER.length - 1] === 'dropped', '사다리 순서')
ok(GRADE_LADDER.length === 12, '12칸', String(GRADE_LADDER.length))
ok(GRADE_LADDER.every((g) => GRADE_LABEL[g]), '모든 칸에 한국어 이름이 있다')
ok(GRADE_LABEL['optimal3'] === '최적 3' && GRADE_LABEL['semi2'] === '준최 2', '이름 표기')
ok(GRADE_LABEL['dropped'] === '저품질 의심', '저품질 표기')
ok(
  GRADE_LADDER.indexOf('optimal3') < GRADE_LADDER.indexOf('optimal1') &&
    GRADE_LADDER.indexOf('semi7') < GRADE_LADDER.indexOf('semi2'),
  '숫자가 클수록 강하다 (업계 표기)'
)
ok(GRADE_SHARE.semi2 > GRADE_SHARE.semi3 && GRADE_SHARE.semi2 > 50, '준최 2 가 가장 흔한 칸이다')
// 사다리 순서가 실제 판정 강도와 맞는지 (위 칸이 더 좋은 조건에서 나와야 한다)
ok(GRADE_LADDER.indexOf(GB_TOP.grade) < GRADE_LADDER.indexOf(GB_MID.grade), '좋은 조건이 사다리 위쪽에 온다')
ok(GRADE_LADDER.indexOf(GB_MID.grade) < GRADE_LADDER.indexOf(GB_LOW.grade), '노출 0% 는 더 아래에 온다')

// 제목에서 검색어 만들기
ok(queryFromTitle('천안 쌍용동 헬스장 미녀와야수짐 봉명점 후기') === '천안 쌍용동 헬스장', '앞 세 낱말', queryFromTitle('천안 쌍용동 헬스장 미녀와야수짐 봉명점 후기'))
ok(queryFromTitle('[협찬] 강릉, 여행!') === '협찬 강릉 여행', '기호를 털어낸다', queryFromTitle('[협찬] 강릉, 여행!'))
ok(queryFromTitle('') === '', '빈 제목')

// ─────────────────────────────────────────────────────────────
console.log('\n[37] 발행하면 순위 추적에 자동 등록')
const PUBLISHED = {
  id: 'p9', status: 'published', mainKeyword: '쌍용동 헬스장',
  publishedUrl: 'https://blog.naver.com/me/224352038257', publishedAt: '2026-07-20T00:00:00.000Z',
}
ok(autoRankTargets(PUBLISHED, []).length === 1, '발행 주소가 있으면 등록한다')
ok(autoRankTargets(PUBLISHED, [])[0].keyword === '쌍용동 헬스장', '메인 키워드로 등록')
ok(autoRankTargets(PUBLISHED, [])[0].publishedAt === '2026-07-20', '발행일을 넘겨 첫날부터 구간 판정이 되게')
ok(autoRankTargets({ ...PUBLISHED, status: 'draft' }, []).length === 0, '초안은 등록하지 않는다')
ok(autoRankTargets({ ...PUBLISHED, publishedUrl: '' }, []).length === 0, '발행 주소가 없으면 등록하지 않는다')
ok(autoRankTargets({ ...PUBLISHED, mainKeyword: '' }, []).length === 0, '메인 키워드가 없으면 등록하지 않는다')
// 같은 글을 다시 저장해도 중복으로 쌓이지 않아야 한다
const EXIST = [{ id: 'rt1', keyword: '쌍용동헬스장', url: 'https://m.blog.naver.com/me/224352038257', createdAt: '' }]
ok(autoRankTargets(PUBLISHED, EXIST).length === 0, '띄어쓰기·모바일 주소만 달라도 중복으로 안 넣는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[37-2] 순위 목록 — 같은 키워드를 어떻게 구분하나 (2026-08-24)')
/*
 * 회원: "같은 키워드가 많으니까 제목을 붙여서 구분해주던가 하면 좋겠고 순위추적하는게 계속
 * 아래로 쌓이면 보기 불편하니까 제목을 클릭하면 그것만 보이던게 하던가 해서 디자인을
 * 수정해주면 좋겠어."
 */
{
  const { rankItemName, sortRankViews, staleTitleTargets } = require(`${OUT}/analysis/rank.js`)
  const v = (patch) => ({
    target: { id: patch.id ?? 't', keyword: patch.keyword ?? '쌍용동 헬스장', url: patch.url ?? 'https://blog.naver.com/x/1', label: patch.label },
    postTitle: patch.postTitle,
    current: patch.current ?? null,
    // 목록 순서를 발행일로 매기므로(2026-08-28) 이 값이 있어야 순서를 잴 수 있다
    publishedAt: patch.publishedAt,
  })

  // ── 무엇으로 이 항목을 알아보나
  ok(rankItemName(v({ postTitle: '쌍용동 헬스장 다이어트 정체기' })) === '쌍용동 헬스장 다이어트 정체기',
    '연결된 글 제목이 가장 먼저')
  ok(rankItemName(v({ label: '8월 홍보글' })) === '8월 홍보글', '제목이 없으면 적어둔 이름표')
  ok(rankItemName(v({ url: 'https://blog.naver.com/sulliha8277/224374111837' })) === '글 224374111837',
    '둘 다 없으면 글 번호라도 — 「연결된 글 없음」 열두 줄보다 낫다')
  ok(rankItemName(v({ postTitle: '   ' , label: '이름표' })) === '이름표', '빈 제목은 없는 것으로 친다')

  /*
   * **제목이 안 보이던 줄을 고친다** (2026-08-24 회원 지적: "글 제목이 안보이는 것도 있는데").
   *
   * 프로덕션에서 「신방동 헬스장」 항목이 postId 없이 다른 블로그 주소로 등록돼 있었다.
   * 이어질 글이 없으니 번호만 떴다. 두 가지로 채운다:
   *   ① 같은 주소의 글이 앱에 있으면 그걸로 잇는다 (m.blog·PostView 형태가 달라도)
   *   ② 앱에 없으면 순위 크론이 네이버에서 제목을 한 번 읽어 항목에 적어 둔다
   */
  {
    const post = (patch) => ({ id: 'p1', type: 'info', status: 'published', storeId: 's', title: '제목입니다', body: 'x', mainKeyword: 'k', subKeywords: [], tags: [], createdAt: '2026-08-01', updatedAt: '2026-08-01', ...patch })
    const target = (patch) => ({ id: 't1', keyword: '신방동 헬스장', url: 'https://blog.naver.com/j2h2896/224382220243', createdAt: '2026-08-01', ...patch })

    // ① postId 가 없어도 주소가 같으면 잇는다 (m. 이 붙어 있어도)
    const byUrl = buildRankViews([target()], [], [post({ publishedUrl: 'https://m.blog.naver.com/j2h2896/224382220243' })])
    ok(byUrl[0].postTitle === '제목입니다', '주소가 같으면 앱의 글과 잇는다', String(byUrl[0].postTitle))
    // 다른 글을 끌어오지 않는다
    const other = buildRankViews([target()], [], [post({ publishedUrl: 'https://blog.naver.com/j2h2896/999' })])
    ok(other[0].postTitle === undefined, '주소가 다르면 잇지 않는다')
    // ② 앱에 글이 없으면 항목에 적어둔 제목을 쓴다
    const stored = buildRankViews([target({ title: '네이버에서 읽어온 제목' })], [], [])
    ok(stored[0].postTitle === '네이버에서 읽어온 제목', '읽어온 제목을 쓴다')
    ok(rankItemName(stored[0]) === '네이버에서 읽어온 제목', '목록에도 그 제목이 뜬다')

    const rankCron = require('node:fs').readFileSync(new URL('../app/api/cron/rank/route.ts', import.meta.url), 'utf8')
    ok(/needTitle/.test(rankCron) && rankCron.includes('found.title = title'), '순위 크론이 빠진 제목을 채운다')

    /*
     * **실제로 올라간 제목이 먼저다** (2026-08-27 회원 지적: "실제 업로드된 제목과 다르게
     * 나와"). 화면 사진으로 확인한 실제 사례다:
     *   앱 초안  「쌍용동 헬스장 초보도 지금 등록해도 될까? 8월 3개월 9.9만원」
     *   네이버   「쌍용동 헬스장 지금 등록해도 될까? 8월무료 3개월 9.9만원」
     * 회원이 올리기 직전에 제목을 손본 것이다. 순위는 실제로 올라간 글에 붙으므로 목록도
     * 그것을 보여야 한다 — 예전에는 앱 초안이 이겨서 **올라가지도 않은 제목**이 떴다.
     */
    {
      const DRAFT = '쌍용동 헬스장 초보도 지금 등록해도 될까? 8월 3개월 9.9만원'
      const LIVE = '쌍용동 헬스장 지금 등록해도 될까? 8월무료 3개월 9.9만원'
      const v = buildRankViews(
        [target({ title: LIVE })],
        [],
        [post({ title: DRAFT, publishedUrl: 'https://blog.naver.com/j2h2896/224382220243' })]
      )[0]
      ok(v.postTitle === LIVE, '네이버에서 읽어온 제목이 앱 초안보다 먼저다', String(v.postTitle))
      ok(rankItemName(v) === LIVE, '목록 줄에도 실제 제목이 뜬다')
      // 다르다는 사실 자체를 알려준다 — 검수는 초안 제목으로 봤다
      ok(v.draftTitle === DRAFT, '초안 제목이 다르면 그것도 함께 준다', String(v.draftTitle))
      const same = buildRankViews(
        [target({ title: DRAFT })],
        [],
        [post({ title: DRAFT, publishedUrl: 'https://blog.naver.com/j2h2896/224382220243' })]
      )[0]
      ok(same.draftTitle === undefined, '같으면 굳이 알리지 않는다')
    }

    /*
     * **연결된 글도 읽는다.** 예전에는 앱과 이어진 항목을 통째로 건너뛰어서(「앱에서 쓴
     * 글은 제목이 이어져 오니까」) 위 어긋남을 영영 못 고쳤다. 한 번 읽고 끝내지도 않는다 —
     * 제목이 잘 안 바뀌는 것은 맞지만 안 바뀐다고 볼 근거는 없다.
     */
    {
      const T = (patch) => ({ id: patch.id, keyword: 'k', url: 'https://blog.naver.com/x/1', createdAt: '2026-08-01', ...patch })
      const NOW = '2026-08-27T00:00:00.000Z'
      const picked = staleTitleTargets(
        [
          T({ id: 'fresh', title: '읽은 지 얼마 안 됨', titleAt: '2026-08-26T00:00:00.000Z' }),
          T({ id: 'stale', title: '오래됨', titleAt: '2026-07-01T00:00:00.000Z' }),
          T({ id: 'never' }),
        ],
        NOW,
        5
      )
      ok(picked.map((t) => t.id).join() === 'never,stale', '한 번도 못 읽은 것 → 오래된 것 순서', picked.map((t) => t.id).join())
      ok(!picked.some((t) => t.id === 'fresh'), '방금 읽은 것은 다시 읽지 않는다')
      ok(staleTitleTargets([T({ id: 'a' }), T({ id: 'b' })], NOW, 1).length === 1, '한 번에 몇 개만 읽는다')
      // 앱과 이어진 항목이라고 건너뛰지 않는다 (그게 바로 어긋나던 줄이다)
      ok(staleTitleTargets([T({ id: 'linked', postId: 'p1' })], NOW, 5).length === 1, '앱과 이어진 항목도 읽는다')
      ok(rankCron.includes('staleTitleTargets'), '순위 크론이 같은 기준을 쓴다')
      const checkRoute = require('node:fs').readFileSync(new URL('../app/api/rank/check/route.ts', import.meta.url), 'utf8')
      // 화면에서 「지금 확인」을 눌렀는데 제목이 그대로면 회원은 안 고쳐졌다고 본다
      ok(checkRoute.includes('staleTitleTargets') && checkRoute.includes('found.titleAt'), '손으로 조회할 때도 제목을 다시 읽는다')
    }

    /*
     * **주소를 누르면 그 글로 간다** (2026-08-27 회원 요청: "url클릭하면 해당 블로그로 갈
     * 수 있도록 해줘"). 글자로만 적혀 있으면 복사해서 주소창에 붙여야 한다.
     */
    {
      const tracker = require('node:fs').readFileSync(new URL('../app/rank/RankTracker.tsx', import.meta.url), 'utf8')
      ok(/<a[^>]*href=\{v\.target\.url\}/.test(tracker), '추적 목록의 주소가 링크다')
      ok(/href=\{v\.target\.url\}[\s\S]{0,200}rel="noopener noreferrer"/.test(tracker), '새 탭으로 열되 opener 를 넘기지 않는다')
      ok(tracker.includes('v.draftTitle'), '초안 제목과 다르면 화면이 밝힌다')
    }
  }

  /*
   * ─── 최근에 올린 글부터 (2026-08-28 회원 요청) ────────────────────
   *
   * "날짜 순으로 정리해서 보이게 해줘."
   *
   * 2026-08-24 에는 **같은 키워드끼리** 붙여 놨었다 (회원: "같은 키워드가 많으니까…").
   * 그 뒤 글이 쌓이면서 화면이 이렇게 됐다 — 1일차 · 0일차 · 1일차 · 0일차 · 4일차 ·
   * 11일차 · 10일차 · 8일차 · 2일차. **오늘 올린 글과 열흘 지난 글이 뒤섞여 있다.**
   * 순위는 발행 직후에 가장 많이 움직이므로 볼 순서는 새 글부터다.
   */
  const byDate = sortRankViews([
    v({ id: 'old', keyword: '천안 헬스장', current: 3, publishedAt: '2026-08-18' }),
    v({ id: 'new', keyword: '쌍용동 헬스장', current: 74, publishedAt: '2026-08-28' }),
    v({ id: 'mid', keyword: '가나 헬스장', current: 12, publishedAt: '2026-08-22' }),
  ])
  ok(byDate.map((x) => x.target.id).join() === 'new,mid,old', `최근 글부터 — ${byDate.map((x) => x.target.id).join()}`)

  /*
   * **같은 날 글끼리는 예전 규칙 그대로다** — 같은 키워드끼리 묶고, 그 안에서 순위가
   * 좋은 것부터. 등록 순서대로 흩어져 있으면 비교하려고 위아래로 스크롤해야 한다.
   */
  const sameDay = sortRankViews([
    v({ id: 'b', keyword: '천안 헬스장', current: 3, publishedAt: '2026-08-28' }),
    v({ id: 'a2', keyword: '쌍용동 헬스장', current: 74, postTitle: '나', publishedAt: '2026-08-28' }),
    v({ id: 'a1', keyword: '쌍용동 헬스장', current: 12, postTitle: '가', publishedAt: '2026-08-28' }),
  ])
  ok(sameDay.map((x) => x.target.id).join() === 'a1,a2,b', `같은 날은 키워드끼리 붙고 순위 좋은 것부터 — ${sameDay.map((x) => x.target.id).join()}`)

  /*
   * **발행일을 모르는 것은 맨 뒤로.** 오늘로 치면 맨 앞에 오고, 그러면 정작 새 글이 밀린다
   * — 모르는 것을 유리하게 쓰지 않는다 (순위 밖을 0위로 치지 않는 것과 같은 이유다).
   */
  const noDate = sortRankViews([
    v({ id: 'none', keyword: '가', current: 1 }),
    v({ id: 'dated', keyword: '나', current: 90, publishedAt: '2026-08-01' }),
  ])
  ok(noDate.map((x) => x.target.id).join() === 'dated,none', '발행일을 모르면 뒤로', noDate.map((x) => x.target.id).join())

  // 순위 밖(null)을 0 위로 치면 맨 앞에 온다 — 모르는 것을 유리하게 쓰지 않는다
  const withNull = sortRankViews([
    v({ id: 'none', current: null, publishedAt: '2026-08-28' }),
    v({ id: 'has', current: 90, publishedAt: '2026-08-28' }),
  ])
  ok(withNull[0].target.id === 'has', '순위 밖은 뒤로', withNull.map((x) => x.target.id).join())
  ok(sortRankViews([]).length === 0, '빈 목록에도 터지지 않는다')

  /*
   * **화면이 실제로 그렇게 그려야 한다.** 규칙만 만들고 화면이 안 쓰면 아무것도 달라지지 않는다 —
   * 이 저장소에서 「한쪽만 고친 것」이 반복된 자리다.
   */
  const { readFileSync: rf } = require('node:fs')
  const ui = rf(new URL('../app/rank/RankTracker.tsx', import.meta.url), 'utf8')
  ok(ui.includes('rankItemName(v)'), '목록에 제목을 적는다')
  ok(ui.includes('sortRankViews(initialViews)'), '화면도 같은 순서로 그린다 (최근 글부터)')
  // 조회 뒤에도 같은 순서여야 한다 — 안 그러면 한 번 누를 때마다 목록이 뒤집힌다
  ok(!/setViews\(json\.views\)/.test(ui), '서버에서 받은 목록도 같은 규칙으로 정렬한다')
  // 한 번에 하나만 펼친다
  ok(ui.includes('const [openId, setOpenId]'), '펼친 항목을 하나만 기억한다')
  ok(/setOpenId\(open \? null : v\.target\.id\)/.test(ui), '누르면 그것만 펼쳐지고 다시 누르면 접힌다')
  ok(ui.includes('aria-expanded={open}'), '펼침 상태를 화면 낭독기에도 알린다')
  ok(/initialViews\[0\]\?\.target\.id \?\? null/.test(ui), '처음 열 때 첫 항목은 펼쳐 둔다 (전부 접히면 「아무것도 없나」로 읽힌다)')
}

console.log('\n[37-3] 점수가 진짜인가 — 망가뜨리면 반응하는가 (2026-08-24)')
/*
 * 회원 질문: "패키지 보면 점수는 높은데 실제도 잘 점검되서 그렇게 나오는건지도 확인해줘."
 *
 * 점수가 높은 데는 두 가지 이유가 있을 수 있다 — 글이 실제로 좋거나, **검수가 무르거나.**
 * 가려내는 방법은 일부러 망가뜨려 보는 것이다 (scripts/audit-checker.mjs 가 열다섯 가지를
 * 돌린다). 그때 찾은 두 구멍을 여기서 고정해 둔다.
 */
{
  const golden = GOLDEN_POSTS.find((g) => g.input.type === 'info')
  const baseScore = checkPost(golden.input).score
  ok(baseScore === 100, `골든 정보글은 100점 — ${baseScore}`)

  /*
   * **구멍 ①: 같은 문장 되풀이.** 「꾸준히 하시면 좋습니다.」를 스무 번 붙여도 100점이었다.
   * 분량·문단·리듬 검사를 전부 통과하기 때문이다. 유사문서로 묶이는 가장 단순한 경로이고,
   * AI 가 분량을 채우려 할 때 가장 먼저 하는 일이다.
   */
  const padded = checkPost({ ...golden.input, body: `${golden.input.body}\n\n${'꾸준히 하시면 좋습니다. '.repeat(20)}` })
  ok(padded.score < baseScore, `되풀이로 채운 글은 점수가 떨어진다 — ${padded.score}점`)
  ok(padded.items.find((i) => i.id === 'repetition')?.level === 'fail', '같은 문장 되풀이를 잡는다')
  // 한 번 되풀이는 주의까지 (사람이 쓴 글에도 있을 수 있다)
  const once = checkPost({ ...golden.input, body: `${golden.input.body}\n\n꾸준히 하시면 정말로 좋습니다. 꾸준히 하시면 정말로 좋습니다.` })
  ok(once.items.find((i) => i.id === 'repetition')?.level === 'warn', '한 종류만 되풀이되면 주의')
  ok(checkPost(golden.input).items.find((i) => i.id === 'repetition')?.level === 'pass', '멀쩡한 글은 통과')

  /*
   * **구멍 ②: 얼버무리는 수량.** 지시문은 「수량은 숫자로 적는다 — 「많이」·「자주」·
   * 「대부분」·「꽤」로 넘어가지 않는다」고 시키는데 검수는 한 번도 보지 않았다.
   * 지시문·골격·검수 세 판이 어긋나 있던 자리다.
   */
  const vague = checkPost({
    ...golden.input,
    body: `${golden.input.body}\n\n많이 하시는 분들은 자주 오십니다. 대부분 꽤 만족하시고 종종 여러 번 오세요.`,
  })
  ok(vague.items.find((i) => i.id === 'vague-amount')?.level === 'fail', '얼버무리는 수량을 잡는다')
  ok(vague.score < baseScore, `얼버무리면 점수가 떨어진다 — ${vague.score}점`)
  ok(checkPost(golden.input).items.find((i) => i.id === 'vague-amount')?.level === 'pass', '멀쩡한 글은 통과')
  // 지시문이 실제로 그렇게 시키고 있는지 — 검수만 있고 지시문에 없으면 고칠 방법을 안 알려주는 셈이다
  ok(buildSystemPrompt('info').includes('수량은 숫자로 적는다'), '지시문도 같은 것을 시킨다')
  /*
   * **숫자가 답이 아닌 자리를 함께 알려줘야 한다** (2026-08-26 회원 지적: "새벽에 자동으로
   * 올리는거 왜 갑자기 검수를 안하고 작성까지만 됐어?").
   *
   * 검수도 고쳐 쓰기도 돌았는데 고쳐 쓰기가 **한 글자도 못 고치고** 돌아왔다. 힌트가
   * 「숫자로 바꿔라」만 시켜 놓고 바로 뒤에 「지어내지 마라」고 해서, 숫자를 붙일 수 없는
   * 자리(「필요 이상으로 많이 드시게 되고」)에서 모델이 갇힌 것이다.
   *
   * 같은 초안·같은 모델로 재봤다 — 이 힌트로는 79점(고친 것 0개), 「말을 바꾸거나 빼라」를
   * 함께 준 힌트로는 95점(수정필요 0개)이 나왔다.
   */
  {
    const vague = checkPost({
      ...golden.input,
      body: `${golden.input.body}\n\n많이 드시고 많이 쉬고 많이 걸으세요. 자주 오시고 대부분 그렇습니다.`,
    }).items.find((i) => i.id === 'vague-amount')
    ok(vague.hint?.includes('숫자로'), '숫자로 바꾸라고 한다')
    ok(vague.hint?.includes('말을 바꾸거나 뺍니다'), '숫자를 못 붙이는 자리는 말을 바꾸라고 함께 알려준다')
  }
  ok(
    buildSystemPrompt('info').includes('숫자를 붙일 수 없는 자리는 말을 바꾸거나 뺀다'),
    '지시문도 같은 두 갈래를 말한다 (한쪽만 고치면 또 갇힌다)'
  )

  /*
   * **숫자를 지워도 점수가 안 떨어지는 것은 의도한 것이다.** 이 앱 실측(2026-08-06, 상위 글
   * 161편)에서 숫자 밀도는 1천자당 10개 이하 4.91위 · 35개 이상 7.11위였다 — 숫자가 많을수록
   * 순위가 나빴다. 「숫자를 넣어라」를 점수로 강제하면 실측과 반대로 가는 규칙이 된다.
   */
  const noNumbers = checkPost({ ...golden.input, body: golden.input.body.replace(/\d+/g, '몇') })
  ok(noNumbers.score === baseScore, '숫자를 지운 것만으로는 깎지 않는다 (실측이 그 반대였다)', `${noNumbers.score}점`)

  // 망가뜨림 검사 자체가 저장소에 남아 있어야 한다 — 다음에 또 물어볼 때 바로 돌린다
  const { existsSync } = require('node:fs')
  ok(existsSync(new URL('../scripts/audit-checker.mjs', import.meta.url)), '점수 신뢰도 검사가 저장소에 있다')
}

console.log('\n[38] 상위 제목 단어 가르기')
const { classifyToken, splitTokens } = require(`${OUT}/analysis/tokens.js`)

// 실제 진단에서 나온 문제: "미녀와야수짐"·"필라테스" 를 소제목에 넣으라고 지시했다
ok(classifyToken('미녀와야수짐') === 'rival', '다른 업체 상호는 지시로 쓰지 않는다', classifyToken('미녀와야수짐'))
ok(classifyToken('피앤피짐') === 'rival', '짐으로 끝나면 상호로 본다')
ok(classifyToken('필라테스') === 'otherTrade', '안 하는 종목', classifyToken('필라테스'))
ok(classifyToken('요가') === 'otherTrade', '다른 종목 (요가)')
ok(classifyToken('추천') === 'useful', '검색 의도는 쓸 수 있다')
ok(classifyToken('가격') === 'useful', '가격')
ok(classifyToken('24시') === 'useful', '운영시간')
ok(classifyToken('PT') === 'useful', '서비스')
ok(classifyToken('프리웨이트') === 'useful', '시설')
ok(classifyToken('3개월') === 'useful', '숫자+단위는 소재가 된다')
ok(classifyToken('5kg') === 'useful', 'kg 도 소재')
ok(classifyToken('다녀본') === 'noise', '문체 조각은 지시로 못 쓴다')
ok(classifyToken('솔직') === 'noise', '문체 조각 (솔직)')
// 우리 상호는 남의 상호가 아니다
ok(classifyToken('미라클짐', ['미라클짐 쌍용점']) === 'noise', '우리 상호는 남의 상호로 보지 않는다')

const SPL = splitTokens(
  [
    { token: '미녀와야수짐', count: 5 },
    { token: '추천', count: 4 },
    { token: '필라테스', count: 3 },
    { token: '가격', count: 2 },
    { token: '다녀본', count: 2 },
  ],
  []
)
ok(SPL.usable.map((t) => t.token).join(',') === '추천,가격', '쓸 수 있는 말만 남긴다', SPL.usable.map((t) => t.token).join(','))
ok(SPL.rivals[0].token === '미녀와야수짐', '남의 상호는 따로 모은다 (정보로 쓴다)')
ok(SPL.otherTrades[0].token === '필라테스', '다른 종목도 따로')
ok(SPL.usable.length + SPL.rivals.length + SPL.otherTrades.length === 4, '문체 조각은 어디에도 안 들어간다')

// ─────────────────────────────────────────────────────────────
console.log('\n[39] 발행 후 실패 진단')
const { diagnose, diagnosisToPrescription, shouldDiagnose, fromAppPost, fromPublished, actionPlan, pickMyPost, OUT_OF_RANGE, FIRST_PAGE, SETTLE_DAYS } =
  require(`${OUT}/analysis/diagnose.js`)

// 발행 직후의 낮은 순위는 실패가 아니다
ok(!shouldDiagnose(45, 3), '발행 3일째는 진단하지 않는다')
ok(!shouldDiagnose(null, 10), '10일째도 아직 기다린다')
ok(shouldDiagnose(null, 20), '20일째 순위 밖이면 진단한다')
ok(shouldDiagnose(45, 20), '20일째 45위도 진단한다')
ok(!shouldDiagnose(8, 40), '1페이지 안이면 먼저 권하지 않는다')
// 실제 사례: 13위인 글에서 30위 기준으로 잡았더니 버튼이 아예 안 보였다
ok(shouldDiagnose(13, 15), '13위·15일째면 진단을 권한다 (1페이지 밖)')
ok(shouldDiagnose(11, 20), '11위도 1페이지 밖')
ok(!shouldDiagnose(10, 20), '10위는 1페이지')
ok(SETTLE_DAYS === 14 && OUT_OF_RANGE === 30 && FIRST_PAGE === 10, '기준값')

const MY_POST = {
  id: 'p1', type: 'promo', status: 'published', storeId: 's', title: '헬스장 등록했어요',
  body: '[이미지: 대표]\n짧은 본문입니다.\n\n## 소제목 하나\n내용.',
  mainKeyword: '쌍용동 헬스장', subKeywords: [], tags: [], createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z', publishedAt: '2026-07-01T00:00:00.000Z',
}
const SERP_FOR_DX = {
  keyword: '쌍용동 헬스장', total: 437, items: [],
  stats: {
    avgTitleLength: 43, keywordInTitleRate: 90, keywordFrontRate: 67, avgAgeDays: 21,
    freshWithin30dRate: 70, freshWithin7d: 0, youngestAgeDays: 9, datedCount: 12, bloggerKnownCount: 12,
    commonTokens: [{ token: '후기', count: 5 }, { token: '가격', count: 4 }, { token: 'PT', count: 3 }],
    usableTokens: [{ token: '후기', count: 5 }, { token: '가격', count: 4 }, { token: 'PT', count: 3 }],
    rivalTokens: [{ token: '미녀와야수짐', count: 4 }],
    otherTradeTokens: [],
    repeatBloggers: [{ name: '천안 운동일기', count: 4 }],
  },
  prescription: [], cutline: CUT, mock: false, source: 'section',
}
const MINE = fromAppPost(MY_POST)
ok(MINE.source === 'app' && MINE.headingCount === 1, '앱 글은 소제목을 셀 수 있다', String(MINE.headingCount))
ok(MINE.imageCount === 1, '앱 글 이미지 수', String(MINE.imageCount))
const DX = diagnose({ post: MINE, serp: SERP_FOR_DX, rank: null, daysSincePublish: 34 })
const ids = DX.fixes.map((f) => f.id)
ok(ids.includes('title-short'), '제목이 짧은 것을 잡는다')
ok(ids.includes('title-no-keyword'), '제목에 메인 키워드가 없는 것을 잡는다')
ok(ids.includes('body-short'), '본문이 짧은 것을 잡는다')
ok(ids.includes('body-images'), '이미지 부족을 잡는다')
ok(ids.includes('headings'), '소제목 부족을 잡는다')
ok(ids.includes('tokens'), '상위권이 쓰는 말이 빠진 것을 잡는다')
ok(ids.includes('dominated'), '선점 상태를 알려준다')
ok(ids.includes('rival-brands'), '다른 업체가 먹고 있다는 사실을 알려준다')
const rivalFix = DX.fixes.find((f) => f.id === 'rival-brands')
ok(rivalFix.action.includes('이름은 절대 쓰지 마세요'), '남의 상호를 쓰라고 하지 않는다')
const tokenFix = DX.fixes.find((f) => f.id === 'tokens')
ok(!tokenFix.action.includes('미녀와야수짐'), '지시에 남의 상호가 안 들어간다', tokenFix.action.slice(0, 60))
ok(DX.fixes[0].severity === 'high', '먼저 고칠 것을 앞에 둔다')
ok(DX.verdict.includes(`${OUT_OF_RANGE}위 안에 안 잡힙니다`) && DX.verdict.includes('고칠 곳'), '한 줄 판정', DX.verdict)
// "고칠 곳 3개" 가 3개만 검사한 것처럼 보이면 안 된다 — 통과·건너뜀도 함께 돌려준다
ok(Array.isArray(DX.passed) && Array.isArray(DX.skipped), '통과·건너뜀 목록을 돌려준다')
ok(DX.fixes.length + DX.passed.length + DX.skipped.length >= 8, '검사한 항목 수가 고친 항목 수보다 많다',
  `고침 ${DX.fixes.length} + 통과 ${DX.passed.length} + 못잼 ${DX.skipped.length}`)

/*
 * **지금 고칠 것과 다음 글에 할 것을 가른다** (2026-08-23 회원 요청).
 *
 * 회원: "발행한 우리 글에 정확이 부족한점 그래서 발행한 후 어떻게해야하고 앞으로발행할건
 * 어떻게 해야하는지 알려주면 좋겠어."
 *
 * 고칠 것을 한 줄로 늘어놓기만 하면 성격이 정반대인 것이 섞인다. 「제목이 짧다」는 그 글을
 * 열어 고치면 되지만, 「상위가 최근 글로 계속 교체된다」는 그 글을 아무리 고쳐도 안 된다
 * (발행일은 고쳐지지 않는다). 섞어 두면 안 되는 일에 시간을 쓰거나 되는 일을 넘긴다.
 */
{
  // 갈래를 안 정한 항목이 하나라도 있으면 그 항목은 화면에서 **사라진다** — 둘 다 아닌 곳으로 간다
  ok(DX.fixes.every((f) => f.when === 'now' || f.when === 'next'), '모든 항목이 갈래를 밝힌다',
    DX.fixes.filter((f) => !f.when).map((f) => f.id).join(' · '))

  const plan = actionPlan(DX)
  ok(plan.now.length + plan.next.length === DX.fixes.length, '나눠도 하나도 잃지 않는다',
    `${plan.now.length} + ${plan.next.length} = ${DX.fixes.length}`)

  const nowIds = plan.now.map((f) => f.id)
  const nextIds = plan.next.map((f) => f.id)
  // 그 글을 열어 고치면 되는 것
  for (const id of ['title-short', 'title-no-keyword', 'body-short', 'body-images', 'headings', 'tokens']) {
    ok(nowIds.includes(id), `「${id}」 는 지금 그 글에서 고친다`)
  }
  /*
   * 그 글로는 안 되는 것. **최신성이 특히 중요하다** — 발행일은 수정해도 바뀌지 않는데
   * 「지금 고치세요」에 넣으면 회원이 고치고 나서 왜 최신 글로 안 쳐주는지 묻게 된다.
   */
  for (const id of ['freshness', 'dominated', 'rival-brands']) {
    ok(nextIds.includes(id), `「${id}」 는 그 글을 고쳐서 되는 일이 아니다`)
  }
  ok(plan.nowNote.includes('발행일은 고쳐도 바뀌지 않습니다'), '발행일은 못 고친다는 것을 함께 말한다')
  ok(plan.nextNote.includes('다음 글'), '다음 글 이야기임을 밝힌다')

  // 고칠 게 없을 때도 두 줄 다 말이 되게 (빈 화면에 아무 말도 없으면 「안 돌았나」가 된다)
  const clean = actionPlan({ verdict: '', fixes: [], passed: [], skipped: [] })
  ok(clean.now.length === 0 && clean.next.length === 0, '고칠 게 없으면 둘 다 비어 있다')
  ok(clean.nowNote.includes('고칠 것은 없습니다'), '고칠 게 없으면 없다고 말한다', clean.nowNote)
  ok(clean.nextNote.includes('그대로'), '다음 글도 그대로 가면 된다고 말한다')
}

/*
 * **상위노출 분석 화면이 우리 글을 찾을 수 있어야 한다.**
 *
 * 회원: "이거는 상위노출 분석이랑 똑같잖아." 그 화면은 남의 글 통계만 보여주고 있었다.
 * 진단기는 이미 있었는데 우리 글을 찾는 조각이 없어서 순위 화면에서만 돌았다.
 */
{
  const post = (patch) => ({ id: 'x', status: 'published', mainKeyword: '', body: '본문', ...patch })
  const a = post({ id: 'a', mainKeyword: '쌍용동 헬스장', publishedAt: '2026-07-01' })
  const b = post({ id: 'b', mainKeyword: '쌍용동헬스장', publishedAt: '2026-08-01' })
  /*
   * **띄어쓰기가 다르면 다른 키워드다.** 회원은 「쌍용동헬스장」과 「쌍용동 헬스장」을 따로
   * 추적하고 있다 (검색 결과가 다르다). 정확히 같은 것이 있으면 그것을 쓴다 — 안 그러면
   * 「쌍용동 헬스장」 분석에 「쌍용동헬스장」 글의 진단이 붙는다.
   */
  ok(pickMyPost([b, a], '쌍용동 헬스장')?.id === 'a', '정확히 같은 키워드의 글을 먼저 고른다')
  ok(pickMyPost([a, b], '쌍용동헬스장')?.id === 'b', '반대쪽도 마찬가지')
  // 정확히 같은 것이 없을 때만 띄어쓰기를 무시한다 (아예 못 찾는 것보다는 낫다)
  ok(pickMyPost([a], '쌍용동헬스장')?.id === 'a', '없으면 띄어쓰기를 무시하고 찾는다')
  // 같은 키워드로 여러 편이면 가장 최근 것 — 그게 지금 그 자리를 노리는 글이다
  const older = post({ id: 'old', mainKeyword: '쌍용동 헬스장', publishedAt: '2026-06-01' })
  ok(pickMyPost([older, a], '쌍용동 헬스장')?.id === 'a', '여러 편이면 가장 최근 것')
  // 초안·빈 글은 진단할 대상이 아니다
  ok(!pickMyPost([post({ status: 'draft', mainKeyword: '쌍용동 헬스장' })], '쌍용동 헬스장'), '초안은 고르지 않는다')
  ok(!pickMyPost([post({ mainKeyword: '쌍용동 헬스장', body: '  ' })], '쌍용동 헬스장'), '본문이 비면 고르지 않는다')
  ok(!pickMyPost([a], '두정동 헬스장'), '다른 키워드 글을 끌어오지 않는다')
  ok(!pickMyPost(undefined, '쌍용동 헬스장') && !pickMyPost([a], '  '), '입력이 비어도 터지지 않는다')
}

/*
 * **화면이 두 갈래를 실제로 그려야 한다.** 갈래를 만들어 놓고 화면이 fixes 를 통째로
 * 늘어놓으면 아무것도 달라지지 않는다 — 이 저장소에서 「한쪽만 고친 것」이 반복된 자리다.
 */
{
  const { readFileSync: rf } = require('node:fs')
  const gap = rf(new URL('../app/serp/MyPostGap.tsx', import.meta.url), 'utf8')
  ok(gap.includes('plan.now') && gap.includes('plan.next'), '상위노출 분석 화면이 두 갈래로 그린다')
  ok(gap.includes('f.mine') && gap.includes('f.theirs'), '우리 값과 상위 기준을 나란히 놓는다')
  const serpUi = rf(new URL('../app/serp/SerpAnalyzer.tsx', import.meta.url), 'utf8')
  ok(serpUi.includes('MyPostGap') && serpUi.includes('json.mine'), '분석 결과에서 우리 글 진단을 받아 넘긴다')
  const serpApi = rf(new URL('../app/api/serp/route.ts', import.meta.url), 'utf8')
  ok(serpApi.includes('pickMyPost') && serpApi.includes('actionPlan'), '상위노출 분석이 우리 글까지 진단한다')
  const rank = rf(new URL('../app/rank/RankTracker.tsx', import.meta.url), 'utf8')
  ok(rank.includes('plan?.now') && rank.includes('plan?.next'), '순위 화면도 같은 두 갈래로 그린다')
  const rankApi = rf(new URL('../app/api/rank/diagnose/route.ts', import.meta.url), 'utf8')
  ok(rankApi.includes('actionPlan'), '순위 진단도 갈래를 함께 내려준다')
}

// 네이버에서 읽어온 글은 소제목을 못 재므로 "건너뜀" 에 이유가 남아야 한다
const PUB_FOR_SKIP = fromPublished(
  { title: '쌍용동 헬스장 후기', charCount: 1785, imageCount: 12, videoCount: 0, text: '후기 가격 PT', url: 'u' },
  '쌍용동 헬스장'
)
const DX_PUB = diagnose({ post: PUB_FOR_SKIP, serp: SERP_FOR_DX, rank: 14, daysSincePublish: 15 })
ok(DX_PUB.skipped.some((t) => t.includes('소제목')), '못 잰 항목을 이유와 함께 밝힌다', DX_PUB.skipped.join(' | '))
ok(!DX_PUB.fixes.some((f) => f.id === 'headings'), '못 잰 항목은 고칠 곳에 넣지 않는다')

// 기준을 맞춘 항목은 통과로 잡힌다
const BIG_POST = {
  ...MY_POST,
  title: '쌍용동 헬스장 3개월 다녀본 솔직 후기, 가격과 PT까지 정리했어요',
  body:
    '[이미지: 1]\n'.repeat(20) +
    '## 소제목1\n' + '가'.repeat(800) + '\n## 소제목2\n' + '나'.repeat(800) +
    '\n## 소제목3\n' + '다'.repeat(800) + '\n## 소제목4\n' + '라'.repeat(600),
}
const DX_OK = diagnose({ post: fromAppPost(BIG_POST), serp: SERP_FOR_DX, rank: 9, daysSincePublish: 30 })
ok(DX_OK.passed.some((t) => t.includes('본문 분량')), '맞춘 분량을 통과로 알려준다', DX_OK.passed.join(' | '))
// 이미지는 상위 글 장수가 아니라 실측 최적 구간(6~10장)으로 판단한다
{
  const many = diagnose({ post: { ...fromAppPost(BIG_POST), imageCount: 18 }, serp: SERP_FOR_DX, rank: 9, daysSincePublish: 30 })
  const f = many.fixes.find((x) => x.id === 'body-images-many')
  ok(!!f, '이미지가 너무 많으면 줄이라고 한다', f?.mine)
  ok(f?.action.includes('6~10장으로 줄이세요'), '몇 장으로 줄일지 알려준다')
  const ok6 = diagnose({ post: { ...fromAppPost(BIG_POST), imageCount: 8 }, serp: SERP_FOR_DX, rank: 9, daysSincePublish: 30 })
  ok(ok6.passed.some((t) => t.includes('이미지')), '6~10장이면 통과로 알려준다', ok6.passed.find((t) => t.includes('이미지')))
  ok(!ok6.fixes.some((x) => x.id.startsWith('body-images')), '최적 구간이면 이미지 지적을 하지 않는다')
}

const RXP = diagnosisToPrescription(DX)
ok(RXP.length === DX.fixes.length, '처방 문장으로 바뀐다')
ok(RXP[0].includes('지금') && RXP[0].includes('→'), '현재값과 할 일이 함께 들어간다', RXP[0].slice(0, 50))

// 커트라인이 없으면 본문 수치는 말하지 않는다 (상위가 얼마인지 모르는데 부족하다고 할 수 없다)
const DX2 = diagnose({
  post: MINE, serp: { ...SERP_FOR_DX, cutline: undefined }, rank: 33, daysSincePublish: 20,
})
ok(!DX2.fixes.some((f) => f.id === 'body-short'), '실측 없으면 글자수 지적을 안 한다')
ok(DX2.verdict.includes('33위'), '순위를 그대로 말한다')

// 같은 "고쳐야 함" 이라도 33위와 13위는 뜻이 다르다 — 13위는 실패가 아니라 문 앞이다
const DX_NEAR = diagnose({ post: MINE, serp: SERP_FOR_DX, rank: 13, daysSincePublish: 15 })
ok(DX_NEAR.verdict.includes('1페이지') && DX_NEAR.verdict.includes('3칸'), '남은 칸수를 말한다', DX_NEAR.verdict)
const DX_IN = diagnose({ post: MINE, serp: SERP_FOR_DX, rank: 7, daysSincePublish: 30 })
ok(DX_IN.verdict.includes('이미 1페이지'), '1페이지면 그렇게 말한다', DX_IN.verdict)

// 이미 기준을 맞춘 글이면 글 문제가 아니라고 말해준다
const GOOD_POST = {
  ...MY_POST,
  title: '쌍용동 헬스장 3개월 다녀본 솔직 후기, 가격과 PT까지 정리했어요',
  body:
    '[이미지: 1]\n'.repeat(16) +
    '## 소제목1\n' + '가'.repeat(700) + '\n## 소제목2\n' + '나'.repeat(700) +
    '\n## 소제목3\n' + '다'.repeat(700) + '\n## 소제목4\n' + '라'.repeat(500) + '\n[영상: 시설]\n',
}
const DX3 = diagnose({ post: fromAppPost(GOOD_POST), serp: SERP_FOR_DX, rank: null, daysSincePublish: 40 })
ok(!DX3.fixes.some((f) => ['title-short', 'body-short', 'body-images', 'headings'].includes(f.id)),
  '기준을 맞춘 글은 그 항목들을 지적하지 않는다', DX3.fixes.map((f) => f.id).join(','))

// 네이버에 이미 발행한 글도 진단한다 (앱에 본문이 없어도 읽어온다)
const PUB = fromPublished(
  { title: '헬스장 등록했어요', charCount: 1400, imageCount: 5, videoCount: 0, text: '짧은 본문입니다', url: 'u' },
  '쌍용동 헬스장'
)
ok(PUB.source === 'naver', '출처를 구분한다')
ok(PUB.headingCount === null, '소제목은 못 잰다고 표시한다 (0 이 아니다)')
const DX4 = diagnose({ post: PUB, serp: SERP_FOR_DX, rank: null, daysSincePublish: 30 })
const ids4 = DX4.fixes.map((f) => f.id)
ok(!ids4.includes('headings'), '못 잰 항목은 지적하지 않는다', ids4.join(','))
ok(ids4.includes('body-short') && ids4.includes('body-images'), '읽어온 수치로도 본문·이미지를 지적한다')
ok(ids4.includes('title-no-keyword'), '읽어온 제목으로 키워드 유무를 본다')
ok(ids4.includes('tokens'), '읽어온 본문으로 상위권 단어를 대조한다')

// 상위노출 처방이 글쓰기 화면까지 와야 분석이 글에 반영된다
ok(prescriptionKey('쌍용동 헬스장') === '쌍용동헬스장', '띄어쓰기를 없앤 키로 찾는다')
const RX1 = { key: prescriptionKey('쌍용동 헬스장'), keyword: '쌍용동 헬스장', items: ['제목 31~39자'], date: '2026-08-01', sampled: 15 }
const RX2 = { key: prescriptionKey('두정동 헬스장'), keyword: '두정동 헬스장', items: ['이미지 8장'], date: '2026-08-02', sampled: 15 }
let RXL = upsertPrescription([], RX1)
RXL = upsertPrescription(RXL, RX2)
ok(RXL.length === 2, '키워드마다 하나씩 쌓인다')
ok(RXL[0].keyword === '두정동 헬스장', '새 것이 앞에 온다')
const RX1b = { ...RX1, items: ['제목 31~39자', '이미지 8장 이상'], date: '2026-08-04' }
RXL = upsertPrescription(RXL, RX1b)
ok(RXL.length === 2, '같은 키워드는 갱신 (쌓이지 않는다)', String(RXL.length))
ok(findPrescription(RXL, '쌍용동 헬스장').items.length === 2, '갱신된 내용이 나온다')
ok(findPrescription(RXL, '쌍용동헬스장')?.keyword === '쌍용동 헬스장', '띄어쓰기가 달라도 찾는다')
ok(findPrescription(RXL, '없는 키워드') === undefined, '없으면 undefined')
ok(findPrescription(RXL, undefined) === undefined, '키워드가 비면 undefined')
// 저장소가 JSON 한 덩어리라 무한정 쌓이면 안 된다
let many = []
for (let i = 0; i < 80; i++) many = upsertPrescription(many, { ...RX1, key: `k${i}`, keyword: `k${i}` })
ok(many.length === 60, '상한을 넘지 않는다', String(many.length))
ok(many[0].keyword === 'k79', '최근 것이 남는다')
// 오래된 처방은 상위권이 이미 바뀌었을 수 있다
const TODAY = new Date('2026-08-20T00:00:00Z')
ok(prescriptionAgeDays('2026-08-20', TODAY) === 0, '오늘 분석은 0일')
ok(prescriptionAgeDays('2026-08-01', TODAY) === 19, '19일 전', String(prescriptionAgeDays('2026-08-01', TODAY)))
ok(isPrescriptionStale('2026-08-01', TODAY), '14일 넘으면 다시 보라고 한다')
ok(!isPrescriptionStale('2026-08-10', TODAY), '10일 전은 아직 유효')

// 진행 중인 이번 달은 모멘텀에서 빼야 한다 (실측: 8월 3일 조회에 8월이 5.7 로 찍혀 -23%)
const NOW = new Date('2026-08-03T00:00:00Z')
ok(isPartialMonth('2026-08-01', NOW), '이번 달은 진행 중')
ok(!isPartialMonth('2026-07-01', NOW), '지난 달은 끝났다')
const SERIES = [
  { period: '2026-02-01', ratio: 70 },
  { period: '2026-03-01', ratio: 50 },
  { period: '2026-04-01', ratio: 60 },
  { period: '2026-05-01', ratio: 55 },
  { period: '2026-06-01', ratio: 60 },
  { period: '2026-07-01', ratio: 61 },
  { period: '2026-08-01', ratio: 5.7 },
]
ok(completedMonths(SERIES, NOW).length === 6, '진행 중인 달을 뺀다', String(completedMonths(SERIES, NOW).length))
ok(completedMonths(SERIES.slice(0, 6), NOW).length === 6, '끝난 달만 있으면 그대로 둔다')
const mWith = momentumOf(SERIES, NOW)
ok(mWith > -10, '진행 중인 달이 모멘텀을 끌어내리지 않는다', `${mWith}%`)
ok(mWith === momentumOf(SERIES.slice(0, 6), NOW), '진행 중인 달을 지운 것과 같은 값', `${mWith}%`)
ok(momentumOf([], NOW) === 0, '데이터가 없으면 0')

// 순위를 세려면 같은 글의 세 가지 주소 표기를 하나로 봐야 한다
ok(normalizeBlogUrl('https://blog.naver.com/hyoni2_/224361842417') === 'blog.naver.com/hyoni2_/224361842417', '기본 주소')
ok(normalizeBlogUrl('https://m.blog.naver.com/hyoni2_/224361842417') === 'blog.naver.com/hyoni2_/224361842417', '모바일 주소도 같은 글')
ok(
  normalizeBlogUrl('https://blog.naver.com/PostView.naver?blogId=hyoni2_&logNo=224361842417&from=search') ===
    'blog.naver.com/hyoni2_/224361842417',
  'PostView 주소도 같은 글'
)
ok(normalizeBlogUrl('blog.naver.com/hyoni2_/') === 'blog.naver.com/hyoni2_', '끝 슬래시 무시')
ok(normalizeBlogUrl('') === '', '빈 주소')
ok(SECTION_PAGE_SIZE === 30, '섹션 검색은 한 페이지 30개 (실측)')

// 힌트를 5개씩 나눠 부르면 같은 키워드가 두 번 온다 (실측: 22개 요청에 24행)
const dup = dedupeAdRows([
  { keyword: '봉명동헬스장', monthlySearch: 830, monthlyPc: 250, monthlyMobile: 580, mock: false },
  { keyword: '쌍용동헬스장', monthlySearch: 1470, monthlyPc: 470, monthlyMobile: 1000, mock: false },
  { keyword: '봉명동헬스장', monthlySearch: 830, monthlyPc: 250, monthlyMobile: 580, mock: false },
  { keyword: '봉명동 헬스장', monthlySearch: 830, monthlyPc: 250, monthlyMobile: 580, mock: false },
])
ok(dup.length === 2, '같은 키워드는 한 줄로 합친다', String(dup.length))
ok(dup.map((r) => r.keyword).join(',') === '봉명동헬스장,쌍용동헬스장', '먼저 온 순서를 지킨다', dup.map((r) => r.keyword).join(','))
const dup2 = dedupeAdRows([
  { keyword: '쌍용동PT', monthlySearch: 0, monthlyPc: 0, monthlyMobile: 0, mock: true },
  { keyword: '쌍용동PT', monthlySearch: 90, monthlyPc: 40, monthlyMobile: 50, mock: false },
])
ok(dup2.length === 1 && dup2[0].monthlySearch === 90, '검색량을 읽은 행을 남긴다')

// 궁합만 보고 고르면 안 된다 — 검색량 × 궁합으로 값을 매긴다 (실측에서 뒤집혔던 저울)
const big = mk('쌍용동 24시 헬스장', 285, 95)   // 궁합 보통 + 검색량 큼
const tiny = mk('쌍용동 헬스장 가격', 15, 175)   // 궁합 강함 + 검색량 없음
const pick = buildKeywordSets([mk('쌍용동 헬스장', 1470, 437), big, tiny], {
  areas: ['쌍용동'],
  store: { open24: true, womenOnly: false },
})
ok(pick.sets[0].subs[0].metric.keyword === '쌍용동 24시 헬스장',
  '궁합이 조금 낮아도 검색량이 큰 쪽을 먼저 얹는다', pick.sets[0].subs[0].metric.keyword)
ok(
  subValue(big, pairSynergy('쌍용동 헬스장', big.keyword, ['쌍용동'])) >
    subValue(tiny, pairSynergy('쌍용동 헬스장', tiny.keyword, ['쌍용동'])),
  '검색량 × 궁합 저울'
)

// 지점 성격과 어긋나는 키워드는 빼낸다 (사실과 달라지면 안 된다)
const plan2 = buildKeywordSets(METRICS, { areas: ['쌍용동', '봉명동'], store: { open24: false, womenOnly: false } })
ok(plan2.excluded.some((x) => x.keyword === '쌍용동 24시 헬스장'), '24시간 운영이 아니면 24시 키워드를 뺀다')
ok(plan2.sets.every((s) => !s.subs.some((x) => x.metric.keyword.includes('24시'))), '빠진 키워드는 세트에도 없다')
ok(plan2.excluded[0].why.includes('사실과'), '왜 빼는지 말해준다')

// 전부 과열이면 그래도 방향을 준다
const hardPlan = buildKeywordSets([mk('쌍용동 헬스장', 500, 900), mk('쌍용동 PT', 300, 700)], {
  areas: ['쌍용동'],
})
ok(hardPlan.sets.length === 1, '과열이어도 세트를 하나는 낸다')
ok(Boolean(hardPlan.sets[0].warn), '어렵다는 사실을 함께 알려준다')

// 검색량을 못 읽은 키워드는 세트에 넣지 않는다 (경쟁률이 거짓이 된다)
ok(buildKeywordSets([mk('쌍용동 헬스장', 0, 0), mk('쌍용동 PT', 0, 0)], { areas: ['쌍용동'] }).sets.length === 0,
  '검색량 0 은 세트에서 제외')

// 글쓰기 화면으로 그대로 넘어간다
const href = writeHrefForSet(s0, 'store_1')
ok(href.startsWith('/write?'), '글쓰기 주소')
ok(href.includes('type=promo') && href.includes('store=store_1'), '유형·지점이 실린다')
ok(decodeURIComponent(href).includes('main=쌍용동 헬스장'), '메인 키워드가 실린다')
ok(decodeURIComponent(href).includes('subs=쌍용동 헬스장 가격,쌍용동 24시 헬스장'), '서브 2개가 실린다')
ok(decodeURIComponent(href).includes('local=쌍용동'), '지역 키워드가 실린다')

// ─────────────────────────────────────────────────────────────
console.log('\n[40] 광고가 블로그 자리를 밀어내는 정도')

// 없는 값을 0 으로 읽으면 "광고 없음" 이라는 거짓이 된다 (Number('') === 0 함정)
ok(toRate(undefined) === undefined, '필드가 없으면 모른다고 한다')
ok(toRate(null) === undefined, 'null 도 모른다')
ok(toRate('') === undefined, '빈 문자열을 0 으로 읽지 않는다', String(toRate('')))
ok(toRate('-') === undefined, '숫자가 없는 문자열도 모른다', String(toRate('-')))
ok(toRate(0) === 0, '실제로 0 이라고 온 값은 0 이다')
ok(toRate('5.6') === 5.6, '문자열 소수', String(toRate('5.6')))
ok(toRate(1.23456) === 1.23, '소수점 둘째 자리까지', String(toRate(1.23456)))
ok(toRate('0.85%') === 0.85, '단위가 붙어 와도 읽는다', String(toRate('0.85%')))

// 광고가 많으면 통합검색 위쪽이 덮여 블로그가 밀린다 — 검색량만으로는 안 보이는 사실
ok(adNoteFor(undefined) === undefined, '광고 지표가 없으면 아무 말도 하지 않는다')
// 실측으로 뒤집힌 문구 — 「광고가 많으면 블로그가 밀린다」는 근거가 없었다
ok(adNoteFor(AD_HEAVY).includes('파워링크'), '파워링크 광고라고 이름을 밝힌다', adNoteFor(AD_HEAVY))
ok(adNoteFor(AD_HEAVY).includes('상업성'), '상업성 세기로 읽으라고 말한다')
ok(!adNoteFor(10).includes('밀'), '광고 때문에 블로그가 밀린다고 말하지 않는다', adNoteFor(10))
ok(!adNoteFor(10).includes('플레이스'), '플레이스를 광고와 한 덩어리로 묶지 않는다')
// 값이 곧 화면에 보이는 광고 개수는 아니다 (모바일은 몇 개만 펼친다)
ok(!adNoteFor(10).includes('화면을 덮'), '화면을 덮는다고 단정하지 않는다')
ok(adNoteFor(6.2).includes('6.2개'), '실제 광고 수를 밝힌다', adNoteFor(6.2))
ok(adNoteFor(AD_SOME).includes('조금'), '중간은 중간이라고 한다')
ok(adNoteFor(0).includes('거의 없는'), '광고가 없으면 없다고 말한다')
ok(!adNoteFor(0).includes('상업성 높음'), '광고 0 개에 경고를 붙이지 않는다')
// 실측 분포: 지역+업종은 8~10, 정보 키워드는 3 안쪽 — 이 둘이 갈려야 뜻이 있다
ok(adNoteFor(10).includes('많습니다'), '지역+업종 실측값(10)은 광고 많음')
ok(adNoteFor(3).includes('조금 있습니다'), '정보 키워드 실측값(3)은 중간', adNoteFor(3))

// 설명문은 사실만 말한다 — 할 일은 판정 한 곳에서만 (두 곳에서 조언하면 같은 말이 두 번 나온다)
ok(!adNoteFor(10).includes('쓰세요'), '광고 설명문은 할 일을 말하지 않는다', adNoteFor(10))
ok(adPressureOf(undefined) === null, '광고 수를 모르면 압박도 판정하지 않는다')
ok(adPressureOf(10) === 'heavy' && adPressureOf(3) === 'some' && adPressureOf(0) === 'light', '압박 3단계')

// 클릭률은 광고 개수와 다른 것을 말한다 — 자리가 아니라 「살 마음의 세기」다
ok(ctrNote(undefined) === undefined, '클릭률을 못 읽으면 말하지 않는다')
ok(ctrNote(1.14).includes('상담으로 이어지기 쉬운'), '클릭률이 높으면 상업적 의도가 강하다고 말한다')
ok(ctrNote(0.33).includes('알아보려는 검색'), '클릭률이 낮으면 정보 검색에 가깝다고 말한다')
ok(!ctrNote(1.14).includes('유입이 오지 않'), '클릭률을 유입 손실로 말하지 않는다 (100명 중 99명은 안 누른다)')

// ─────────────────────────────────────────────────────────────
// 「그래서 써도 되나」 — 숫자를 읽을 줄 모르는 사람도 한 줄로 알 수 있어야 한다
const vd = (grade, monthlySearch, adDepth) => keywordVerdict({ grade, monthlySearch, adDepth })
ok(vd('gold', 1500, 2).level === 'go', '광고가 적은 황금 키워드는 바로 쓴다')
// 지역 키워드에서 위를 차지하는 것은 광고가 아니라 플레이스다 (실측)
ok(PLACE_ABOVE_BLOG.includes('플레이스가 차지'), '무엇이 위에 있는지 밝힌다')
ok(PLACE_ABOVE_BLOG.includes('광고를 끊어도'), '광고비 문제가 아니라고 말한다')
ok(PLACE_ABOVE_BLOG.includes('블로그탭 순위는 광고와 무관'), '블로그탭은 광고와 무관하다고 말한다')
ok(vd('gold', 1500, 2).label === '바로 쓰세요', '배지 말이 짧고 분명하다', vd('gold', 1500, 2).label)
/*
 * 광고가 많다고 등급을 내리지 않는다 — 실측에서 근거가 무너졌다.
 * 모바일 통합검색에 파워링크가 아예 없었고(0건), 지역+업종은 거의 다 광고 8~10개라
 * 그것으로 가르면 모든 지역 키워드가 조건부가 된다 (아무것도 못 가르는 판정).
 */
ok(vd('gold', 1500, 10).level === 'go', '광고가 많아도 황금 키워드는 바로 쓴다', vd('gold', 1500, 10).level)
ok(vd('gold', 1500, 10).line.includes('플레이스 순위도'), '대신 플레이스를 함께 챙기라고 말한다', vd('gold', 1500, 10).line)
ok(!vd('gold', 1500, 10).line.includes('광고 아래 자리'), '광고 아래로 밀린다는 말을 하지 않는다')
ok(vd('good', 840, 10).level === 'go', '노려볼 만함 + 광고 많음도 그대로 쓴다')
ok(vd('gold', 1500, 2).line.includes('가장 먼저 잡을 판'), '광고가 적으면 군더더기를 붙이지 않는다')
ok(!vd('gold', 1500, 2).line.includes('플레이스'), '광고가 적을 때는 플레이스 얘기를 안 한다')
ok(vd('good', 840, 2).level === 'go', '노려볼 만함 + 광고 적음은 바로 쓴다')
ok(vd('toosmall', 140, 10).level === 'attach', '검색량 부족은 따로 쓰지 않는다')
ok(vd('toosmall', 140, 10).label === '얹기만', '얹으라고 한 마디로 말한다')
ok(vd('toosmall', 140, 10).line.includes('140회'), '왜 그런지 숫자를 함께 준다')
ok(vd('hard', 500, 2).level === 'avoid', '포화는 피한다 (광고가 적어도)')
ok(vd('toobig', 40000, 10).level === 'conditional', '대형 키워드는 좁혀서 쓴다')
ok(vd('unknown', 0, undefined).level === 'unknown', '판정 못 한 것은 판정하지 않는다')
ok(vd('unknown', 0, undefined).line.includes('30일 건수'), '어떻게 하면 판정되는지 알려준다')
// 광고 수를 모르면 광고를 이유로 조건을 붙이지 않는다
ok(vd('gold', 1500, undefined).level === 'go', '광고 수를 모르면 등급대로 판정한다')

// 지표가 metric 까지 그대로 실린다 (등급 판정은 광고와 무관하게 유지)
const adM = buildMetric({
  keyword: '쌍용동 헬스장',
  monthlySearch: 1470,
  monthlyPc: 470,
  monthlyMobile: 1000,
  blogRecent: 437,
  adDepth: 6,
  ctrPc: 0.4,
  ctrMobile: 1.2,
  mock: false,
})
ok(adM.adDepth === 6 && adM.ctrMobile === 1.2, '광고 지표가 지표에 실린다')
ok(adM.adNote.includes('광고 6개'), '광고 안내문이 함께 만들어진다', adM.adNote)
ok(adM.grade === 'gold', '광고가 많아도 등급 기준(검색량·경쟁률)은 바뀌지 않는다', adM.grade)
ok(!adM.gradeReason.includes('광고'), '등급 설명에는 광고를 섞지 않는다 — 따로 말한다')
const noAd = buildMetric({
  keyword: '쌍용동 PT',
  monthlySearch: 1470,
  monthlyPc: 470,
  monthlyMobile: 1000,
  blogRecent: 437,
  mock: false,
})
ok(noAd.adDepth === undefined && noAd.adNote === undefined, '광고 지표를 못 받으면 비워둔다')

// ─────────────────────────────────────────────────────────────
console.log('\n[41] 누락 판별 — 블로그탭과 통합검색을 따로 본다')
const { indexVerdict, buildIndexCheck, summarizeIndex, verdictNote, VERDICT_LABEL, VERDICT_TONE, pickIndexSamples, INDEX_MIN_AGE_DAYS } =
  require(`${OUT}/analysis/indexcheck.js`)

/*
 * ── 색인 검사에 쓸 글을 고른다 (2026-08-27) ────────────────────
 *
 * 회원이 보내준 영상의 핵심 지적: "지금은 글을 발행하고 2주 뒤, 늦으면 4주 뒤에 반영되는
 * 글들이 상당히 많습니다. 그래서 어제 글 기준으로 체크하시면 안 되는 겁니다."
 *
 * 우리 색인 검사는 **RSS 맨 앞 세 편**(=가장 최근 글)으로 쟀다. 아직 반영이 안 된 글을
 * 「검색에서 빠진 글」로 세는 것이라, 멀쩡한 블로그가 저품질로 나온다. 회원이 그 판정을
 * 보고 블로그를 갈아엎으면 그건 우리가 만든 손해다.
 */
{
  const T = '2026-08-27'
  const items = [
    { title: '어제 글', date: '2026-08-26' },
    { title: '엿새 전 글', date: '2026-08-21' },
    { title: '보름 전 글', date: '2026-08-12' },
    { title: '한 달 전 글', date: '2026-07-25' },
    { title: '두 달 전 글', date: '2026-06-20' },
  ]
  const got = pickIndexSamples(items, T, 3)
  ok(got.picks.length === 3, '표본 수만큼 고른다', String(got.picks.length))
  ok(!got.picks.some((p) => p.title === '어제 글' || p.title === '엿새 전 글'),
    `${INDEX_MIN_AGE_DAYS}일이 안 지난 글은 넣지 않는다`, got.picks.map((p) => p.title).join())
  ok(got.picks[0].title === '보름 전 글', '조건을 만족하는 것 중 최신부터 (오래된 것만 보면 옛 상태를 재게 된다)', got.picks[0].title)
  ok(got.note.includes(`${INDEX_MIN_AGE_DAYS}일`), '왜 이 글들로 쟀는지 화면에 적을 말을 준다', got.note)

  // 갓 시작한 블로그 — 억지로 최신 글을 넣어 「누락」이라고 하지 않는다
  const fresh = pickIndexSamples([{ title: '어제 글', date: '2026-08-26' }], T, 3)
  ok(fresh.picks.length === 0 && fresh.eligible === 0, '2주 지난 글이 없으면 재지 않는다')
  ok(fresh.note.includes('색인 검사를 하지 않았습니다'), '안 쟀다고 밝힌다 (빈 화면을 남기지 않는다)')

  // 날짜를 못 읽은 글은 뺀다 — 언제 쓴 것인지 모르면 이 판정에 쓸 수 없다
  ok(pickIndexSamples([{ title: '날짜없음' }, { title: '보름 전 글', date: '2026-08-12' }], T, 3)
    .picks.map((p) => p.title).join() === '보름 전 글', '날짜를 모르는 글은 넣지 않는다')
  ok(pickIndexSamples(items, '엉뚱한날짜', 3).picks.length === 0, '오늘 날짜가 이상하면 재지 않는다')

  // 라우트가 실제로 이걸 쓰는지 — 규칙만 만들고 안 쓰면 아무것도 안 달라진다
  const { readFileSync: rf } = require('node:fs')
  const blogApi = rf(new URL('../app/api/blog/route.ts', import.meta.url), 'utf8')
  const blogCode = blogApi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok(blogCode.includes('pickIndexSamples'), '색인 검사가 이 규칙으로 표본을 고른다')
  ok(!/feed\.items[\s\S]{0,200}\.slice\(0, INDEX_SAMPLE\)/.test(blogCode), '최신 글부터 그냥 자르지 않는다')
  ok(blogCode.includes('indexNote'), '어느 글로 쟀는지 화면으로 넘긴다')
  const blogUi = rf(new URL('../app/blog/BlogInspector.tsx', import.meta.url), 'utf8')
  ok(blogUi.includes('data.indexNote'), '화면이 그 말을 보여준다')
}

ok(indexVerdict(true, true) === 'normal', '두 곳 다 나오면 정상')
ok(indexVerdict(true, false) === 'unifiedMissing', '블로그탭에만 있으면 통합검색 누락')
ok(indexVerdict(false, true) === 'blogTabMissing', '통합검색에만 있으면 블로그탭 누락')
ok(indexVerdict(false, false) === 'missing', '두 곳 다 없으면 누락 의심')
// 못 읽은 것을 없는 것으로 바꿔 읽으면 멀쩡한 글을 누락으로 몬다
ok(indexVerdict(null, false) === 'unknown', '블로그탭을 못 읽었으면 판정하지 않는다')
ok(indexVerdict(true, null) === 'unknown', '통합검색을 못 읽었으면 판정하지 않는다')

// 「통합검색에만 없음」은 글 문제가 아니다 — 색을 다르게 준다
ok(VERDICT_TONE.unifiedMissing === 'warn', '통합검색 누락은 빨강이 아니다')
ok(VERDICT_TONE.missing === 'bad', '완전 누락은 빨강')
ok(verdictNote('unifiedMissing').includes('색인은 됐습니다'), '색인은 됐다고 분명히 말한다')
ok(verdictNote('unifiedMissing').includes('키워드를 바꿀 문제'), '고칠 곳이 본문이 아니라고 말한다')
ok(verdictNote('missing').includes('검색에서 빠진 것'), '완전 누락은 색인 문제라고 말한다')
ok(verdictNote('unknown').includes('없다는 뜻이 아닙니다'), '못 잰 것을 없다고 하지 않는다')
ok(VERDICT_LABEL.missing === '누락 의심', '단정하지 않는다', VERDICT_LABEL.missing)

const IC = [
  buildIndexCheck({ title: 'ㄱ', blogTab: true, unified: true }),
  buildIndexCheck({ title: 'ㄴ', blogTab: true, unified: false }),
  buildIndexCheck({ title: 'ㄷ', blogTab: true, unified: null }),
]
const SUM = summarizeIndex(IC)
ok(SUM.blogTabRate === 100, '블로그탭 색인율', String(SUM.blogTabRate))
ok(SUM.unifiedRate === 50, '못 읽은 표본은 분모에서 뺀다', String(SUM.unifiedRate))
ok(SUM.counts.unifiedMissing === 1 && SUM.counts.unknown === 1, '판정별 개수')
ok(SUM.headline.includes('색인은 정상입니다'), '누락이 없으면 정상이라고 먼저 말한다', SUM.headline)

const SUM2 = summarizeIndex([
  buildIndexCheck({ title: 'ㄱ', blogTab: false, unified: false }),
  buildIndexCheck({ title: 'ㄴ', blogTab: true, unified: false }),
])
ok(SUM2.headline.includes('색인 문제를 먼저'), '완전 누락이 있으면 그것부터 말한다', SUM2.headline)
ok(summarizeIndex([]).blogTabRate === null, '표본이 없으면 비율도 없다')
ok(summarizeIndex([]).headline.includes('못 했습니다'), '표본이 없으면 못 했다고 한다')

// ─────────────────────────────────────────────────────────────
console.log('\n[42] 유사문서 판독 — 내 글이 상위 글과 그대로 겹치는지')
const { compareOne, compareWithTop, normalizeForCompare, shingleSet, SHINGLE, MIN_LENGTH, OVERLAP_HIGH, SIMILARITY_CAVEAT } =
  require(`${OUT}/analysis/similarity.js`)

// 띄어쓰기 차이로 같은 문장을 다르게 보면 안 된다 (한국어에서 실제로 자주 어긋난다)
const n1 = normalizeForCompare('쌍용동 헬스장, 새벽 6시에 문을 엽니다!')
const n2 = normalizeForCompare('쌍용동헬스장 새벽6시에 문을엽니다')
ok(n1.clean === '쌍용동헬스장새벽6시에문을엽니다', '공백·기호를 뺀다', n1.clean)
ok(n1.clean === n2.clean, '띄어쓰기가 달라도 같은 글자열')
ok(n1.map.length === n1.clean.length, '원문 자리를 함께 들고 있다')
ok('쌍용동 헬스장'[n1.map[3]] === '헬', '원문 몇 번째 글자였는지 되짚을 수 있다')
ok(shingleSet('가나다라마바사아자차카타파하하', SHINGLE).size === 2, '글자 사슬을 만든다')
ok(shingleSet('짧다', SHINGLE).size === 0, '사슬보다 짧은 글은 조각이 없다')

// 통째로 베낀 글 — 겹침이 크고, 겹친 구절을 원문 표기로 보여준다
const SIM_COPIED =
  '쌍용동 헬스장을 찾다가 여기를 알게 됐습니다. 새벽 여섯 시부터 문을 열어서 출근 전에 운동을 할 수 있었고, 기구도 넉넉해서 기다리는 일이 거의 없었습니다. 삼 개월 동안 다니면서 체지방이 오 킬로그램 줄었습니다.'
const same = compareOne(SIM_COPIED, `앞말이 다릅니다. ${SIM_COPIED} 뒷말도 다릅니다.`, 'https://blog.naver.com/a/1')
ok(same.overlap > 90, '통째로 같으면 겹침이 크다', String(same.overlap))
ok(same.samples.length > 0 && same.samples[0].includes('새벽 여섯 시부터'), '겹친 구절을 원문 띄어쓰기 그대로 보여준다', same.samples[0]?.slice(0, 20))

// 소재가 같아도 문장이 다르면 겹치지 않는다 — 이걸 못 가르면 경고가 무의미해진다
const SIM_MINE =
  '아침 일찍 운동하는 습관을 만들고 싶어서 집 근처를 알아봤습니다. 기구가 몇 대인지, 사람이 붐비는 시간대가 언제인지 직접 가서 물어봤습니다. 두 달째 다니는데 어깨 통증이 줄었습니다.'
const diff = compareOne(SIM_MINE, SIM_COPIED, 'https://blog.naver.com/a/1')
ok(diff.overlap < 10, '같은 주제라도 문장이 다르면 안 겹친다', String(diff.overlap))
ok(compareOne('짧아', SIM_COPIED, 'x') === null, '사슬보다 짧은 글은 판정하지 않는다')
ok(compareOne(SIM_COPIED, '짧아', 'x') === null, '상대 글이 너무 짧으면 판정하지 않는다')

// 분모는 내 글이다 — 반대로 재면 남의 긴 글에 내 글이 묻혀 늘 낮게 나온다
const longTheirs = `${SIM_COPIED} ${'다른 이야기가 아주 길게 이어집니다. '.repeat(20)}`
ok(
  compareOne(SIM_COPIED, longTheirs, 'x').overlap > compareOne(longTheirs, SIM_COPIED, 'x').overlap,
  '내 글을 분모로 잡는다'
)

// 짧은 초안은 아예 재지 않는다 (비율이 튀어 없는 문제를 만든다)
ok(compareWithTop('짧은 초안입니다', [{ url: 'x', text: SIM_COPIED }]) === null, `${MIN_LENGTH}자 미만은 판독하지 않는다`)

const SIM_LONG = `${SIM_COPIED} ${SIM_MINE} ${'운동 기록을 매일 적어 두면 변화가 눈에 보입니다. '.repeat(10)}`
const SIM_REPORT = compareWithTop(SIM_LONG, [
  { url: 'https://blog.naver.com/a/1', text: SIM_COPIED },
  { url: 'https://blog.naver.com/b/2', text: '전혀 다른 내용입니다. ' + 'PT 가격을 정리해 봤습니다. '.repeat(20) },
])
ok(SIM_REPORT.hits.length === 2, '견준 글을 다 돌려준다')
ok(SIM_REPORT.hits[0].overlap >= SIM_REPORT.hits[1].overlap, '겹침이 큰 순서로 정렬')
ok(SIM_REPORT.worst.url === 'https://blog.naver.com/a/1', '가장 많이 겹친 글을 짚어준다')
ok(SIM_REPORT.compared === 2, '몇 편과 견줬는지 밝힌다')
// 몇 % 를 넘으면 걸린다는 말은 하지 않는다 — 네이버 기준값은 공개돼 있지 않다
ok(!SIMILARITY_CAVEAT.includes('걸립니다'), '기준값을 단정하지 않는다')
ok(SIMILARITY_CAVEAT.includes('공개돼 있지 않습니다'), '모르는 것은 모른다고 밝힌다')
ok(SIMILARITY_CAVEAT.includes('주소'), '어차피 같아야 하는 문구는 괜찮다고 알려준다')

const SIM_CLEAN = compareWithTop(`${SIM_MINE} ${'서로 다른 이야기를 길게 적었습니다. '.repeat(20)}`, [
  { url: 'x', text: 'PT 가격 이야기입니다. ' + '완전히 다른 문장들입니다. '.repeat(20) },
])
ok(!SIM_CLEAN.needsWork, '안 겹치면 손볼 게 없다고 한다')
ok(SIM_CLEAN.headline.includes('따라 쓴 흔적은 없습니다'), '괜찮으면 괜찮다고 말한다', SIM_CLEAN.headline)
ok(OVERLAP_HIGH === 25, '문장을 통째로 따라 쓴 것으로 보는 값')

// ─────────────────────────────────────────────────────────────
console.log('\n[43] 줄마다 「함께 쓰기 좋은 키워드」')
const { bestPartner, writeHrefForPair } = require(`${OUT}/analysis/synergy.js`)

// 회원이 실제로 본 4줄 (운영 실측값 — 광고 수까지 실제로 받은 값)
const pairMk = (k, v, r, ad) =>
  buildMetric({ keyword: k, monthlySearch: v, monthlyPc: 0, monthlyMobile: 0, blogRecent: r, adDepth: ad, mock: false })
const PAIR_ROWS = [
  pairMk('쌍용동헬스장', 1470, 438, 10),
  pairMk('봉명동헬스장', 830, 422, 10),
  pairMk('쌍용동24시헬스장', 285, 96, 2),
  pairMk('봉명동PT', 140, 360, 10),
]
const pairOpts = { areas: ['쌍용동', '봉명동'], store: { open24: true, womenOnly: false } }
const pairFor = (k) => bestPartner(PAIR_ROWS.find((m) => m.keyword === k), PAIR_ROWS, pairOpts)

const pr1 = pairFor('쌍용동헬스장')
ok(pr1.metric.keyword === '쌍용동24시헬스장', '광고가 많은 줄에는 광고가 적은 짝을 붙인다', pr1.metric.keyword)
ok(pr1.adRelief === true, '그 짝이 광고를 피해 가는 짝이라고 표시한다')
ok(pr1.role === 'main', '이 줄이 더 크면 이 줄이 메인')

// 작은 키워드는 따로 한 편 쓰지 말고 큰 글에 얹으라고 말해야 한다
const pr3 = pairFor('쌍용동24시헬스장')
ok(pr3.metric.keyword === '쌍용동헬스장' && pr3.role === 'sub', '짝이 더 크면 이 줄은 서브', pr3.role)

// 지역이 다르면 절대 짝이 되지 않는다 (한 글에 두 동네를 넣으면 둘 다 밀린다)
ok(pairFor('봉명동헬스장').metric.keyword === '봉명동PT', '짝은 같은 지역에서만 찾는다', pairFor('봉명동헬스장').metric.keyword)
ok(
  bestPartner(PAIR_ROWS[0], [PAIR_ROWS[0], PAIR_ROWS[1]], pairOpts) === null,
  '같은 지역에 짝이 없으면 없다고 한다 (다른 동네를 억지로 붙이지 않는다)'
)

// 지점 성격과 어긋나는 짝은 붙이지 않는다 — 24시간이 아닌 지점에 24시 키워드를 얹으면 거짓이 된다
ok(
  bestPartner(PAIR_ROWS[0], PAIR_ROWS, { areas: ['쌍용동'], store: { open24: false, womenOnly: false } }) === null,
  '24시간 운영이 아니면 24시 짝을 주지 않는다'
)
// 광고 수를 못 읽었으면 광고를 근거로 삼지 않는다
const pairNoAd = [pairMk('쌍용동헬스장', 1470, 438, undefined), pairMk('쌍용동24시헬스장', 285, 96, undefined)]
ok(bestPartner(pairNoAd[0], pairNoAd, pairOpts).adRelief === false, '광고 수가 없으면 광고를 이유로 대지 않는다')

// 그 자리에서 글쓰기로 넘어간다
const pairHref = decodeURIComponent(writeHrefForPair('쌍용동헬스장', '쌍용동24시헬스장', { storeId: 'store_1' }))
ok(pairHref.includes('main=쌍용동헬스장') && pairHref.includes('subs=쌍용동24시헬스장'), '두 키워드가 실린다', pairHref)
ok(pairHref.includes('local=쌍용동'), '지역 키워드를 알아서 넣는다')
ok(pairHref.includes('type=promo'), '글 유형도 정해서 넘긴다')
ok(pairHref.includes('store=store_1'), '지점도 실린다')

// ─────────────────────────────────────────────────────────────
console.log('\n[44] 조사한 지역만 — 다른 지점이 섞이지 않게')

/*
 * 회원이 쌍용점만 조사했는데 두정동 세트가 나왔다. 검색광고 API 가 연관 키워드로
 * 두정동헬스장을 얹어 준 것이 표에 들어와 세트까지 만들어졌다.
 */
const MIX = [
  pairMk('쌍용동헬스장', 1500, 446, 10),
  pairMk('쌍용동24시헬스장', 305, 98, 2),
  pairMk('두정동헬스장', 1760, 598, 10),
  pairMk('두정동PT', 230, 80, 10),
]
const scoped = buildKeywordSets(MIX, {
  areas: ['쌍용동'],
  store: { open24: true, womenOnly: false },
})
ok(
  scoped.sets.every((s) => s.area === '쌍용동'),
  '조사한 지역의 세트만 만든다',
  scoped.sets.map((s) => s.area).join(',')
)
const other = scoped.excluded.filter((x) => x.kind === 'otherArea')
ok(other.length === 2, '다른 지점 지역은 빼고 몇 개인지 밝힌다', String(other.length))
ok(other[0].why.includes('두정동 지점 글로 따로 쓰세요'), '어디로 가야 하는지 말해준다', other[0].why)
// 쓸 수 없는 키워드와 다른 지점 키워드는 뜻이 다르다 — 화면에서 색을 갈라야 한다
const factOnly = buildKeywordSets([pairMk('쌍용동24시헬스장', 305, 98, 2), pairMk('쌍용동헬스장', 1500, 446, 10)], {
  areas: ['쌍용동'],
  store: { open24: false, womenOnly: false },
})
ok(factOnly.excluded.every((x) => x.kind === 'fact'), '사실과 달라지는 것은 kind=fact')
// 지역을 지정하지 않으면 예전처럼 다 만든다 (직접 키워드를 넣는 경로)
ok(buildKeywordSets(MIX).sets.length >= 2, '지역을 안 주면 전부 만든다')
// 광역·정보 키워드는 지역이 없으니 어느 지점 글에도 쓸 수 있다 — 빼지 않는다
const wide = buildKeywordSets([...MIX, pairMk('천안헬스장', 3060, 900, 10)], { areas: ['쌍용동'] })
ok(
  !wide.excluded.some((x) => x.keyword === '천안헬스장'),
  '지역이 없는 키워드는 빼지 않는다'
)

// ─────────────────────────────────────────────────────────────
console.log('\n[45] 짝은 같은 지역에서만 — 광역 키워드가 모든 줄을 먹지 않게')

/*
 * 실제로 벌어진 일: 4줄 전부 짝이 「천안헬스장」(월 3,060)이었다. 황금 키워드인
 * 「쌍용동헬스장」에게 "천안헬스장 글에 얹으세요" 라고 했다 — 훨씬 어려운 키워드
 * 밑에 황금 키워드를 넣으라는 뒤집힌 조언이다.
 */
const WIDE_POOL = [
  pairMk('쌍용동헬스장', 1500, 446, 10),
  pairMk('쌍용동24시헬스장', 305, 98, 2),
  pairMk('천안쌍용동헬스장', 260, 90, 10),
  pairMk('천안헬스장', 3060, 3400, 10),
]
const wOpts = { areas: ['쌍용동'], store: { open24: true, womenOnly: false } }
const wp = bestPartner(WIDE_POOL[0], WIDE_POOL, wOpts)
ok(wp.metric.keyword !== '천안헬스장', '광역 키워드를 짝으로 주지 않는다', wp.metric.keyword)
ok(splitKeyword(wp.metric.keyword, ['쌍용동']).area === '쌍용동', '같은 동네에서 고른다')
ok(wp.role === 'main', '황금 키워드를 다른 키워드의 서브로 내리지 않는다', wp.role)
// 광역 키워드 줄에는 같은 처지(지역 없음)의 짝만 — 없으면 없다고 한다
ok(bestPartner(WIDE_POOL[3], WIDE_POOL, wOpts) === null, '짝이 없으면 억지로 만들지 않는다')
// 짝이 더 커도 그 짝이 과열이면 자리를 뒤집지 않는다 (못 이기는 키워드로 글을 쓰라는 말이 된다)
const hardBig = [pairMk('쌍용동PT', 300, 100, 3), pairMk('쌍용동헬스장', 1500, 3000, 10)]
const hb = bestPartner(hardBig[0], hardBig, wOpts)
ok(hb.role === 'main', '짝이 크지만 과열이면 이 줄을 메인으로 남긴다', hb.role)

// ─────────────────────────────────────────────────────────────
console.log('\n[46] 사람들이 실제로 치는 검색어 (자동완성)')
const { parseSuggest, hasRepeatedToken, suggestSeeds } = require(`${OUT}/naver/autocomplete.js`)
const { cityTokens, suggestionDrop, hasForeignArea, isCleanWideKeyword, NEGATIVE_WORDS } =
  require(`${OUT}/analysis/keyword.js`)

// 실제 응답 모양 (2026-08 실측)
const AC_REAL = JSON.stringify({
  query: ['쌍용동 헬스장'],
  answer: [],
  items: [
    [
      ['쌍용동 헬스장', '0'],
      ['천안 쌍용동 헬스장', '0'],
      ['쌍용동 헬스장 24시', '0'],
      ['쌍용동 헬스장 일일권', '0'],
      ['서북 천안쌍용동헬스장', '0'],
    ],
  ],
})
const AC = parseSuggest(AC_REAL)
ok(AC.length === 5, '자동완성 목록을 읽는다', String(AC.length))
ok(AC[3] === '쌍용동 헬스장 일일권', '우리 접미사에 없던 말도 그대로 가져온다', AC[3])
ok(parseSuggest('깨진 응답').length === 0, '깨진 응답은 빈 목록')
ok(parseSuggest('{"items":null}').length === 0, 'items 가 없으면 빈 목록')
ok(parseSuggest('{"items":[["문자열만"]]}')[0] === '문자열만', '문자열만 와도 읽는다')

// 자동완성이 원본 질의를 덧붙여 만든 쓰레기값 (실측: 쌍용동 PT 로 물었을 때)
ok(hasRepeatedToken('쌍용동 PT 쌍용동pt'), '같은 말이 두 번 든 것은 걸러낸다')
ok(hasRepeatedToken('쌍용동 쌍용동pt'), '한쪽이 다른 쪽에 든 것도 걸러낸다')
ok(!hasRepeatedToken('쌍용동 헬스장 일일권'), '정상 검색어는 통과')
ok(!hasRepeatedToken('서북 천안쌍용동헬스장'), '동네가 겹쳐 보여도 토큰이 다르면 통과')

// 씨앗은 의도를 짜 넣지 않는다 — 뿌리만 주고 뒤는 사람들이 치는 말로 채운다
const SEEDS = suggestSeeds(['쌍용동', '봉명동'], '천안')
ok(SEEDS.includes('쌍용동 헬스장') && SEEDS.includes('쌍용동 PT'), '동네 × 뿌리 2개')
ok(SEEDS.includes('천안 쌍용동 헬스장'), '시 이름을 붙인 꼴도 물어본다')
ok(SEEDS.includes('천안 헬스장'), '시 단독도 물어본다')
ok(new Set(SEEDS).size === SEEDS.length, '씨앗이 겹치지 않는다')
ok(!suggestSeeds(['쌍용동']).some((s) => s.includes('undefined')), '시 이름이 없어도 만든다')

// 시 이름은 지점을 좁혀도 남아야 한다 — 좁히는 순간 「천안쌍용동헬스장」이 사라졌었다
const STORES = [
  { location: '쌍용동 먹자골목 인근 도보 5분', localKeywords: ['쌍용동 헬스장', '봉명동 헬스장'] },
  { location: '성정동 뚜쥬르에서 도보 10분', localKeywords: ['천안 성정동 헬스장'] },
]
const CITIES = cityTokens(STORES)
ok(CITIES.has('천안'), '전 지점에서 시 이름을 모은다', Array.from(CITIES).join(','))
ok(!CITIES.has('대전'), '없는 도시는 넣지 않는다')
const scopedTokens = new Set([...myRegionTokens([STORES[0]]), ...CITIES])
ok(
  suggestionDrop('천안쌍용동헬스장', scopedTokens) === null,
  '쌍용점만 조사해도 천안 키워드는 살아남는다',
  String(suggestionDrop('천안쌍용동헬스장', scopedTokens))
)
ok(
  isRelevantKeyword('천안쌍용동헬스장', scopedTokens),
  '연관 키워드 판정에서도 살아남는다'
)

// 무엇을 왜 뺐는지 말한다 (그냥 걸러내면 걸러내기가 지나친지 알 수 없다)
ok(suggestionDrop('쌍용동 헬스장 일일권', scopedTokens) === null, '쓸 수 있는 말은 통과')
ok(suggestionDrop('천안 헬스장 먹튀', scopedTokens).includes('먹튀'), '부정어는 이유를 밝히고 뺀다')
ok(suggestionDrop('천안 헬스장 먹튀', scopedTokens).includes('사고'), '왜 위험한지 말한다')
ok(suggestionDrop('청주 봉명동 헬스장', scopedTokens).includes('청주'), '다른 도시 같은 동 이름을 뺀다')
ok(suggestionDrop('쌍용동 필라테스', scopedTokens).includes('필라테스'), '다른 업종을 뺀다')
ok(suggestionDrop('강남 헬스장', scopedTokens) !== null, '우리 지역이 아니면 뺀다')
ok(suggestionDrop('쌍용동 맛집', scopedTokens) !== null, '업종 말이 없으면 뺀다')
ok(NEGATIVE_WORDS.includes('먹튀') && NEGATIVE_WORDS.includes('환불'), '노리면 안 되는 말 목록')

// ─────────────────────────────────────────────────────────────
// 시는 우리 것이지만 동네는 아니다.
// 시 이름을 살려두자 「천안두정동헬스장」이 전부 통과해 24칸을 먹었다 (실측: 24줄 중 8줄).
const MY_AREAS = ['쌍용동', '봉명동']
const MY_CITIES = ['천안']
const foreign = (k) => hasForeignArea(k, MY_AREAS, MY_CITIES)
ok(!foreign('천안쌍용동헬스장'), '내 시 + 내 동네는 통과')
ok(!foreign('쌍용동 헬스장 일일권'), '내 동네만 있어도 통과')
ok(!foreign('천안헬스장'), '동네가 없는 광역 키워드는 통과')
ok(!foreign('천안PT'), '광역 + 업종도 통과')
ok(foreign('천안두정동헬스장'), '내 시 + 남의 동네는 뺀다')
ok(foreign('천안불당동헬스장'), '우리 지점이 아닌 동네도 뺀다')
ok(foreign('천안성정동헬스장'), '다른 지점 동네도 이 조사에서는 뺀다')
// 「운동」에 걸리면 안 된다 — 운+동은 한 글자라 동네로 보지 않는다
ok(!foreign('천안운동'), '운동을 동네로 보지 않는다')
ok(!foreign('쌍용동 운동'), '운동이 섞여도 통과')
ok(!foreign('천안 다이어트'), '다이어트도 통과')
// 겹치는 이름은 긴 것부터 지워야 한다
ok(!foreign('천안쌍용동24시헬스장'), '긴 이름을 먼저 지운다')

// 판정 함수에도 그대로 걸린다
const SCOPE = { areas: MY_AREAS, cities: MY_CITIES }
ok(isRelevantKeyword('천안쌍용동헬스장', scopedTokens, SCOPE), '내 동네 키워드는 남는다')
ok(!isRelevantKeyword('천안두정동헬스장', scopedTokens, SCOPE), '남의 동네 키워드는 빠진다')
ok(isRelevantKeyword('천안두정동헬스장', scopedTokens), '범위를 안 주면 예전처럼 통과')
ok(
  suggestionDrop('천안두정동헬스장', scopedTokens, SCOPE).includes('그 동네 지점 글'),
  '어디로 가야 하는지 말해준다'
)

/*
 * 동/읍/면 규칙으로 못 잡는 것 — 목천(읍)·불당(동)을 접미사 없이 쓴다.
 * 실측에서 이 셋이 끝까지 남았다: 천안목천헬스장 · 천안불당헬스장 · 천안목천헬스.
 * 광역 키워드는 「시 + 업종·의도」로만 이뤄져야 한다고 뒤집어 본다.
 */
const wideOk = (k) => isCleanWideKeyword(k, MY_CITIES)
ok(wideOk('천안헬스장'), '시 + 업종은 깨끗하다')
ok(wideOk('천안 헬스장 일일권'), '자동완성으로 배운 의도도 깨끗하다 (일일권)')
ok(wideOk('천안 헬스장 사우나'), '사우나도 의도로 안다')
ok(wideOk('천안24시헬스장'), '숫자가 섞여도 깨끗하다')
ok(wideOk('천안다이어트') && wideOk('천안PT') && wideOk('천안피트니스'), '광역 업종 키워드들')
ok(!wideOk('천안목천헬스장'), '동네 이름이 남으면 깨끗하지 않다 (목천)')
ok(!wideOk('천안불당헬스장'), '동을 뗀 동네 이름도 잡는다 (불당)')
ok(!wideOk('천안터미널헬스장'), '지형지물 이름도 잡는다')
ok(!wideOk('천안헬스보이짐'), '남의 상호도 잡는다', String(wideOk('천안헬스보이짐')))
// 내 동네가 든 키워드에는 이 규칙을 걸지 않는다 — 새 의도를 발견하는 통로를 막으면 안 된다
ok(
  isRelevantKeyword('쌍용동헬스장샤워시설', scopedTokens, SCOPE),
  '내 동네 키워드는 모르는 말이 붙어도 통과'
)
ok(!isRelevantKeyword('천안목천헬스장', scopedTokens, SCOPE), '광역 + 남의 동네는 빠진다')
ok(isRelevantKeyword('천안헬스장일일권', scopedTokens, SCOPE), '광역 + 아는 의도는 남는다')
ok(
  suggestionDrop('천안불당헬스장', scopedTokens, SCOPE).includes('업체 이름'),
  '동네인지 업체인지 단정하지 않고 둘 다 말한다'
)

// ─────────────────────────────────────────────────────────────
console.log('\n[47] 후보 추리기 — 「키워드가 너무 많다」')
const { buildShortlist, shortlistHeadline, isEssential, SHORTLIST_MIN_SEARCH } =
  require(`${OUT}/analysis/shortlist.js`)

/*
 * 회원 화면 실측: 조합 46개 + 자동완성 26개 = 72줄. 사람이 고를 수 없다.
 * 검색량은 운영에서 받은 실제 값을 쓴다.
 */
const CANDS = [
  { keyword: '쌍용동헬스장', monthlySearch: 1500, adDepth: 10 },
  { keyword: '쌍용동24시헬스장', monthlySearch: 305, adDepth: 2 },
  { keyword: '쌍용동PT', monthlySearch: 90, adDepth: 9 },
  { keyword: '쌍용동헬스', monthlySearch: 120, adDepth: 3 },
  { keyword: '쌍용동헬스장가격', monthlySearch: 150, adDepth: 8 },
  { keyword: '봉명동헬스장', monthlySearch: 840, adDepth: 10 },
  { keyword: '봉명동헬스장일일권', monthlySearch: 210, adDepth: 4 },
  { keyword: '봉명동PT', monthlySearch: 140, adDepth: 10 },
  { keyword: '천안헬스장', monthlySearch: 3060, adDepth: 10 },
  { keyword: '천안헬스장일일권', monthlySearch: 120, adDepth: 5 },
  { keyword: '쌍용동필라테스', monthlySearch: 500, adDepth: 3 },
  { keyword: '쌍용동헬스장새벽', monthlySearch: 30, adDepth: 1 },
]
const SL = buildShortlist(CANDS, {
  areas: ['쌍용동', '봉명동'],
  store: { open24: true, womenOnly: false },
  limit: 8,
})
const slKeys = SL.picked.map((p) => p.keyword)
const essentials = SL.picked.filter((p) => p.essential)
ok(SL.picked.length <= 8 + essentials.length, '개수를 지킨다 (필수 키워드는 별도)', String(SL.picked.length))
// 필수 키워드는 검색량이 작아도, 자리에 밀려도 반드시 담는다
ok(
  slKeys.includes('쌍용동PT'),
  '동네 + 업종 기본형은 월 90회여도 담는다',
  JSON.stringify(essentials.map((p) => p.keyword))
)
ok(
  essentials.some((p) => p.keyword === '쌍용동PT' && p.why.includes('가장 먼저 치는 말')),
  '왜 필수인지 말한다'
)
ok(isEssential('쌍용동 헬스장', ['쌍용동']) && isEssential('쌍용동PT', ['쌍용동']), '기본형 두 개')
ok(!isEssential('쌍용동 헬스장 가격', ['쌍용동']), '의도가 붙으면 기본형이 아니다')
ok(!isEssential('쌍용동 헬스', ['쌍용동']), '같은 뜻의 변형은 필수로 올리지 않는다')
ok(!isEssential('천안헬스장', ['쌍용동']), '내 동네가 아니면 필수가 아니다')
ok(slKeys.includes('쌍용동헬스장'), '동네에서 가장 많이 찾는 말을 축으로 세운다', slKeys.join(','))
ok(slKeys.includes('봉명동헬스장'), '다른 동네도 축을 하나 세운다')
ok(SL.picked[0].role === 'main', '첫 줄은 축')
ok(
  SL.picked.some((p) => p.role === 'sub' && p.under === '쌍용동헬스장'),
  '축에 얹을 말을 붙인다',
  JSON.stringify(SL.picked.filter((p) => p.role === 'sub').map((p) => [p.keyword, p.under]))
)
// 지역이 다른 것은 같은 축에 얹지 않는다 (지역이 빈 값인 광역 묶음도 그 안에서만 묶인다)
const areaOf = (k) => (SL.picked.find((p) => p.keyword === k) ?? {}).area
ok(
  SL.picked.filter((p) => p.role === 'sub').every((p) => areaOf(p.under) === p.area),
  '서브는 축과 같은 지역에서만 붙는다',
  JSON.stringify(SL.picked.filter((p) => p.role === 'sub').map((p) => [p.keyword, p.area, p.under]))
)
ok(SL.picked.filter((p) => p.role === 'sub').every((p) => p.under), '서브는 어느 축에 얹는지 밝힌다')

/*
 * 운영 실측으로 잡은 결함 셋.
 *  ① 「천안운동」이 동네 「천안운동」으로 읽혀 "천안운동에서 가장 많이 찾는 말" 이 나왔다
 *  ② 월 120회짜리(쌍용동헬스)가 두 번째 축이 됐다 — 그걸로 글을 한 편 더 쓰라는 말이다
 *  ③ 시를 안 넘기면 「천안헬스장」의 의도를 못 읽어 정보글 키워드가 홍보글에 붙었다
 */
ok(splitKeyword('천안운동').area === '', '운동을 동네로 읽지 않는다', splitKeyword('천안운동').area)
ok(splitKeyword('천안활동비').area === '', '활동도 동네가 아니다')
ok(splitKeyword('쌍용동헬스장').area === '쌍용동', '진짜 동네는 그대로 읽는다')
ok(splitKeyword('두정동 PT').area === '두정동', '띄어쓴 동네도 읽는다')

// 시를 넘기면 광역 키워드도 의도가 갈린다 — 정보글 키워드가 홍보글 서브로 붙지 않는다
const SL4 = buildShortlist(
  [
    { keyword: '천안헬스장', monthlySearch: 3060, adDepth: 10 },
    { keyword: '천안다이어트', monthlySearch: 880, adDepth: 10 },
    { keyword: '천안PT', monthlySearch: 740, adDepth: 10 },
  ],
  { areas: ['쌍용동'], cities: ['천안'], limit: 6 }
)
const head4 = SL4.picked.find((p) => p.role === 'main')
ok(head4.area === '천안', '시가 지역으로 잡힌다', head4.area)
ok(head4.why.includes('천안에서'), '「천안에서 가장 많이 찾는 말」로 읽힌다', head4.why)
ok(
  !SL4.picked.some((p) => p.role === 'sub' && p.keyword === '천안다이어트'),
  '정보글 키워드를 홍보글 서브로 붙이지 않는다',
  JSON.stringify(SL4.picked.map((p) => [p.keyword, p.role]))
)
ok(
  SL4.picked.some((p) => p.role === 'sub' && p.keyword === '천안PT'),
  '같은 홍보글 키워드는 붙는다'
)

/*
 * 순서 — 내 동네가 시 광역보다 위에 온다.
 * 검색량만 보면 천안 묶음(합계 5,050)이 쌍용동(1,805)을 밀어낸다. 그런데 천안 급은
 * 발행량이 포화라 이기기 어렵고, 우리가 실제로 먹을 판은 동네다.
 */
const SL5 = buildShortlist(
  [
    { keyword: '천안헬스장', monthlySearch: 3060 },
    { keyword: '천안PT', monthlySearch: 740 },
    { keyword: '천안다이어트', monthlySearch: 880 },
    { keyword: '쌍용동헬스장', monthlySearch: 1500 },
    { keyword: '쌍용동24시헬스장', monthlySearch: 305 },
  ],
  { areas: ['쌍용동'], cities: ['천안'], store: { open24: true, womenOnly: false }, limit: 12 }
)
ok(SL5.picked[0].keyword === '쌍용동헬스장', '내 동네가 맨 위에 온다', SL5.picked[0].keyword)
ok(
  SL5.picked.findIndex((p) => p.area === '쌍용동') <
    SL5.picked.findIndex((p) => p.area === '천안'),
  '동네 묶음이 시 묶음보다 앞이다',
  SL5.picked.map((p) => p.area).join(',')
)
ok(
  SL5.picked.some((p) => p.keyword === '천안헬스장'),
  '시 광역도 빼지는 않는다 (뒤에 둘 뿐이다)'
)

// 왜 뺐는지 말한다
const why = (k) => (SL.skipped.find((x) => x.keyword === k) ?? {}).why ?? ''
ok(SHORTLIST_MIN_SEARCH === 100, '추천 하한')
ok(
  why('쌍용동헬스장새벽').includes('유입이 거의 없습니다'),
  '검색량이 작으면 이유를 밝히고 뺀다',
  why('쌍용동헬스장새벽')
)
ok(
  why('쌍용동헬스').includes('밀렸습니다'),
  '두 번째 축이 되지 못한 것은 자리에 밀렸다고 말한다',
  why('쌍용동헬스')
)
ok(!slKeys.includes('쌍용동헬스'), '월 120회짜리 변형은 축으로 세우지 않는다', slKeys.join(','))
ok(
  SL.skipped.some((x) => x.why.includes('밀렸습니다')),
  '자리에 밀린 것은 나쁜 키워드가 아니라고 밝힌다'
)
// 실제로 걸린 결함: 「쌍용동필라테스」가 검색량 500 으로 24시 키워드를 밀어내고 뽑혔다
ok(!slKeys.includes('쌍용동필라테스'), '다른 업종은 검색량이 커도 추천하지 않는다', slKeys.join(','))
ok(why('쌍용동필라테스').includes('업종'), '업종이 달라 뺐다고 말한다', why('쌍용동필라테스'))
ok(slKeys.includes('쌍용동24시헬스장'), '그 자리에 우리 업종 키워드가 들어온다')

// 지점 성격과 어긋나는 것은 추천하지 않는다 (사실과 달라진다)
const SL2 = buildShortlist(CANDS, {
  areas: ['쌍용동'],
  store: { open24: false, womenOnly: false },
  limit: 8,
})
ok(
  !SL2.picked.some((p) => p.keyword === '쌍용동24시헬스장'),
  '24시간 운영이 아니면 24시 키워드를 추천하지 않는다'
)
ok(
  SL2.skipped.some((x) => x.keyword === '쌍용동24시헬스장' && x.why.includes('24시간')),
  '왜 뺐는지 말한다'
)

// 검색량을 못 읽은 것은 추천하지 않는다 (0 을 작은 값으로 취급하면 안 된다)
const SL3 = buildShortlist([{ keyword: '쌍용동헬스장', monthlySearch: 0 }], { areas: ['쌍용동'] })
ok(SL3.picked.length === 0, '검색량 0 은 추천하지 않는다')
ok(SL3.skipped[0].why.includes('읽지 못'), '못 읽었다고 말한다 (작다고 하지 않는다)', SL3.skipped[0].why)

// 한 줄 요약 — 몇 편으로 몇 회를 노리는지, 경쟁률은 아직 모른다는 것까지
const HEAD = shortlistHeadline(SL)
ok(HEAD.includes('골랐습니다'), '몇 개를 골랐는지 말한다')
ok(HEAD.includes('경쟁률은 채점하면'), '경쟁률은 아직 모른다고 밝힌다', HEAD)
ok(shortlistHeadline({ picked: [], skipped: [], considered: 0 }).includes('찾지 못했습니다'), '없으면 없다고 한다')

// 광고가 적은 것은 그 사실을 이유에 곁들인다 (자리 다툼이 덜하다)
const lowAd = SL.picked.find((p) => p.keyword === '쌍용동24시헬스장')
ok(!lowAd || lowAd.why.includes('광고') || lowAd.role === 'sub', '광고 사정을 곁들인다')

// ─────────────────────────────────────────────────────────────
console.log('\n[48] 랭킹 요인 관찰소 — 무엇이 순위를 만드나')
const {
  spearman,
  measureFactors,
  buildObservation,
  poolFactors,
  poolHeadline,
  daysBetween: fDaysBetween,
  GRADE_NOTE,
  MIN_SAMPLE: F_MIN,
  WEAK: F_WEAK,
} = require(`${OUT}/analysis/factors.js`)

// 스피어만 — 순서만 본다
ok(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]) === 1, '완전히 같이 가면 +1')
ok(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]) === -1, '완전히 거꾸로면 -1')
ok(spearman([1, 2], [1, 2]) === null, '표본이 3개 미만이면 판정 안 함')
ok(spearman([1, 2, 3], [5, 5, 5]) === null, '한쪽이 전부 같은 값이면 판정 안 함 (0 이라고 하지 않는다)')
// 값 하나가 튀어도 뒤집히지 않는다 (순서만 보기 때문)
ok(spearman([1, 2, 3, 4], [10, 20, 30, 999999]) === 1, '튀는 값에 흔들리지 않는다')
// 동점은 평균 순위로 (앞뒤로 몰면 상관이 거짓으로 커진다)
const tie = spearman([1, 2, 3, 4], [10, 20, 20, 30])
ok(tie !== null && tie > 0.9 && tie < 1, '동점은 평균 순위로 처리', String(tie))

ok(fDaysBetween('2026-07-29', '2026-08-05') === 7, '경과일')
ok(fDaysBetween('bad', '2026-08-05') === 0, '못 읽는 날짜는 0')

/*
 * 실제로 잰 표본 (2026-08-05 「쌍용동 헬스장」 상위 5편).
 * 최신 글이 위에 있었고, 본문 분량은 순위와 반대로 갔다.
 */
const REAL_SAMPLES = [
  { rank: 1, ageDays: 7, charCount: 2197, imageCount: 17, videoCount: 8, titleLength: 45, keywordPos: 3 },
  { rank: 2, ageDays: 10, charCount: 1422, imageCount: 9, videoCount: 0, titleLength: 33, keywordPos: -1 },
  { rank: 3, ageDays: 10, charCount: 1203, imageCount: 12, videoCount: 1, titleLength: 44, keywordPos: 4 },
  { rank: 4, ageDays: 42, charCount: 2568, imageCount: 20, videoCount: 0, titleLength: 40, keywordPos: 6 },
  { rank: 5, ageDays: 13, charCount: 2346, imageCount: 14, videoCount: 0, titleLength: 24, keywordPos: 0 },
]
const FACT = measureFactors(REAL_SAMPLES)
const byKey = (k) => FACT.find((x) => x.key === k)
ok(FACT.length === 13, '신호 13개를 잰다 (+ 공감 · 제목 질문형 · 키워드 횟수 · 밀도)', String(FACT.length))
// 회원 질문에서 나온 항목이 관찰 대상에 들어갔는지 — 기준을 만들었으면 계속 검증해야 한다
ok(FACT.some((x) => x.key === 'info'), '정보 요소도 매일 다시 잰다')
ok(FACT.some((x) => x.key === 'promo'), '홍보 요소도 매일 다시 잰다')
ok(
  byKey('promo').n === 0 || byKey('promo').note.includes('홍보'),
  '홍보 요소는 값이 없으면 못 잰다고 한다'
)

/*
 * 공감 수도 관찰 대상이다.
 *
 * 우리 지역 키워드는 통합검색에서 「인기글」 블록으로 나오니 반응이 자리를 만든다고
 * 짐작하기 쉽다. 실측(2026-08-05 봉명동 헬스장)에서는 공감이 가장 많은 글(81개)이
 * 4위, 두 번째로 많은 글(49개)이 6위였다 — 순위가 공감으로 설명되지 않았다.
 * 그래서 재기만 하고 「공감을 늘려라」라고 말하지 않는다.
 */
ok(FACT.some((x) => x.key === 'likes'), '공감 수도 매일 다시 잰다')
ok(
  byKey('likes').n === 0 && byKey('likes').strength === 'unknown',
  '못 읽은 공감은 0 으로 세지 않는다 (표본에서 뺀다)',
  `n=${byKey('likes').n}`
)
// 실측 순서(81개 4위 · 49개 6위)를 그대로 넣으면 공감이 거꾸로 나와야 한다
const F_LIKE = measureFactors([
  { rank: 1, ageDays: 5, charCount: 1500, imageCount: 9, videoCount: 0, titleLength: 30, keywordPos: 0, likes: 0 },
  { rank: 2, ageDays: 6, charCount: 1500, imageCount: 9, videoCount: 0, titleLength: 30, keywordPos: 0, likes: 0 },
  { rank: 3, ageDays: 7, charCount: 1500, imageCount: 9, videoCount: 0, titleLength: 30, keywordPos: 0, likes: 0 },
  { rank: 4, ageDays: 8, charCount: 1500, imageCount: 9, videoCount: 0, titleLength: 30, keywordPos: 0, likes: 81 },
  { rank: 5, ageDays: 9, charCount: 1500, imageCount: 9, videoCount: 0, titleLength: 30, keywordPos: 0, likes: 0 },
  { rank: 6, ageDays: 10, charCount: 1500, imageCount: 9, videoCount: 0, titleLength: 30, keywordPos: 0, likes: 49 },
])
const fLikes = F_LIKE.find((x) => x.key === 'likes')
ok(fLikes.n === 6 && fLikes.advantage < 0, '실측 순서에서 공감은 유리하게 나오지 않는다', String(fLikes.advantage))
ok(
  fLikes.note.includes('공감 늘리기로는 순위가 안 올라갑니다'),
  '공감을 늘리라고 권하지 않는다',
  fLikes.note
)

// ─────────────────────────────────────────────────────────────
console.log('\n[48-1] 공감 수 읽기 — 0 과 「못 읽음」을 구별한다')
const { likeKey, parseLikeCount } = require(`${OUT}/naver/reaction.js`)

ok(likeKey('https://blog.naver.com/pnpgym/224012345678') === 'pnpgym_224012345678', '주소에서 열쇠를 뽑는다')
ok(
  likeKey('https://blog.naver.com/PostView.naver?blogId=euwoss&logNo=224000000001') ===
    'euwoss_224000000001',
  'PostView 주소도 읽는다'
)
ok(likeKey('https://blog.naver.com/PostView.naver?blogId=euwoss') === null, 'logNo 가 없으면 포기한다')
ok(likeKey('https://cafe.naver.com/abc/123') === null, '블로그 글이 아니면 null')

// 반응은 종류별로 쪼개져 오므로 다 더한다
ok(
  parseLikeCount(JSON.stringify({ contents: [{ reactions: [{ count: 20 }, { count: 3 }] }] })) === 23,
  '반응 종류를 합쳐 센다'
)
// 실제로 공감이 없는 글은 0 이다 — 이건 「못 읽음」이 아니다
ok(parseLikeCount(JSON.stringify({ contents: [{ reactions: [] }] })) === 0, '반응이 비면 0 이다')
ok(parseLikeCount('<html>차단</html>') === null, '못 읽으면 null (0 으로 대신하지 않는다)')
ok(parseLikeCount(JSON.stringify({ contents: [] })) === null, '내용이 비면 null')
ok(parseLikeCount(JSON.stringify({ contents: [{}] })) === null, 'reactions 가 없으면 null')

// ─────────────────────────────────────────────────────────────
console.log('\n[48-2] 고쳐서 다시 올린 글 — 실험이라고 밝히고 재기만 한다')
const { reviseEffect, reviseSummary, SETTLE_DAYS: RV_SETTLE } = require(`${OUT}/analysis/revise.js`)

const rvSnaps = [
  { date: '2026-07-20', rank: 12 },
  { date: '2026-07-25', rank: 11 },
  { date: '2026-08-01', rank: 4 },
  { date: '2026-08-04', rank: 3 },
]
const rvUp = reviseEffect(rvSnaps, '2026-07-28', '2026-08-05')
ok(rvUp.before === 11 && rvUp.after === 3, '수정 앞뒤로 마지막 측정을 고른다', `${rvUp.before}→${rvUp.after}`)
ok(rvUp.delta === 8, '오른 칸 수는 + 로 담는다', String(rvUp.delta))
ok(!rvUp.tooEarly, '3일 넘게 지났으면 판정한다')
ok(rvUp.note.includes('8칸 올랐습니다'), '몇 칸인지 말한다', rvUp.note)
ok(rvUp.note.includes('단정할 수는 없습니다'), '수정이 원인이라고 단정하지 않는다')

// 수정 당일 측정은 어느 쪽인지 알 수 없어 쓰지 않는다
const rvSameDay = reviseEffect([{ date: '2026-08-01', rank: 9 }], '2026-08-01', '2026-08-05')
ok(rvSameDay.before === null && rvSameDay.after === null, '수정 당일 측정은 어느 쪽으로도 세지 않는다')
ok(rvSameDay.note.includes('수정 전 순위 기록이 없어'), '비교할 수 없다고 말한다', rvSameDay.note)

// 색인이 다시 돌 시간을 준다
const rvEarly = reviseEffect(
  [{ date: '2026-08-01', rank: 9 }, { date: '2026-08-05', rank: 5 }],
  '2026-08-04',
  '2026-08-05'
)
ok(rvEarly.tooEarly && rvEarly.daysSince === 1, `수정 ${RV_SETTLE}일 안이면 판정하지 않는다`)
ok(rvEarly.note.includes('아직 판정하지 않습니다'), '이르다고 말한다', rvEarly.note)

// 순위 밖으로 사라진 경우 — 「도움이 됐다」로 읽지 않는다
const rvGone = reviseEffect(
  [{ date: '2026-07-20', rank: 8 }, { date: '2026-08-04', rank: null }],
  '2026-07-28',
  '2026-08-05'
)
ok(rvGone.delta === null && rvGone.note.includes('도움이 됐다고 볼 수 없습니다'), '사라졌으면 그렇게 말한다')

ok(reviseEffect(rvSnaps, '') === null, '수정일이 없으면 아무 말도 만들지 않는다')

const rvDown = reviseEffect(
  [{ date: '2026-07-20', rank: 3 }, { date: '2026-08-04', rank: 7 }],
  '2026-07-28',
  '2026-08-05'
)
ok(rvDown.delta === -4 && rvDown.note.includes('4칸 내려갔습니다'), '내려간 것도 그대로 말한다')

const rvSum = reviseSummary([rvUp, rvDown, rvEarly])
ok(rvSum.includes('수정 기록 2건'), '판정할 수 있는 것만 센다 (이른 것은 빼고)', rvSum)
ok(rvSum.includes('오름 1 · 내림 1'), '오름과 내림을 함께 보여준다')
ok(rvSum.includes('공개돼 있지 않아'), '네이버가 반영하는지 모른다고 밝힌다')
ok(reviseSummary([]).includes('아직 판정할 수 있는 수정 기록이 없습니다'), '없으면 없다고 한다')

// ─────────────────────────────────────────────────────────────
console.log('\n[48-3] 지점별 최신성 — 어느 지점이 식었나')
/*
 * ── 비율보다 순서가 먼저다 (2026-08-27) ────────────────────────
 *
 * 회원 정리: "매출에 도움이 되지 않는 순수 정보성 키워드로 글을 여러 개 올린 후에 상업성
 * 키워드를 작성할 때 상위노출 시켜준다는 거 같아."
 *
 * `balanceReport` 는 **최근 12편의 비율만** 봤다. 그래서 정보글 3편·홍보글 1편인 갓 시작한
 * 블로그에도 「비율 안입니다. 홍보글을 내도 좋습니다」라고 말했다 — 쌓인 것이 없는데
 * 수확하라고 한 셈이다.
 */
{
  const { balanceReport, INFO_BASE_BEFORE_PROMO } = require(`${OUT}/writing/rotation.js`)
  const post = (type, i) => ({
    id: `p${i}`, type, status: 'published', storeId: 's', title: '', body: '',
    mainKeyword: '', subKeywords: [], tags: [],
    publishedAt: `2026-08-${String(10 + i).padStart(2, '0')}`,
    createdAt: `2026-08-${String(10 + i).padStart(2, '0')}`, updatedAt: '',
  })
  // 정보글 3편 · 홍보글 1편 — 비율(3:1)은 좋지만 쌓인 것이 없다
  const early = balanceReport([...Array(3)].map((_, i) => post('info', i)).concat([post('promo', 3)]))
  ok(early.next === 'info', '쌓는 단계에서는 정보글을 권한다', early.next)
  ok(early.message.includes('정보글이 3편'), '몇 편인지 그대로 말해준다', early.message)
  ok(early.message.includes('신뢰도를 쌓은 뒤에'), '왜 아직인지 밝힌다')
  // 한 편도 없으면 더 세게 말한다
  ok(balanceReport([post('promo', 0)]).level === 'bad', '정보글이 하나도 없으면 경고')
  /*
   * **쌓이면 비율 판정으로 넘어간다.** 이 울타리가 없으면 정보글만 쓰는 블로그가 된다 —
   * 정보글은 매출로 이어지지 않으므로 그것대로 회원에게 손해다.
   */
  const grown = [...Array(INFO_BASE_BEFORE_PROMO)].map((_, i) => post('info', i))
  const ready = balanceReport(grown)
  ok(ready.next === 'promo', `정보글 ${INFO_BASE_BEFORE_PROMO}편이 쌓이면 홍보글을 권한다`, ready.next)
  ok(!ready.message.includes('신뢰도를 쌓은 뒤에'), '쌓인 뒤에는 쌓으라는 말을 하지 않는다')
  // 연속 홍보는 쌓인 뒤에도 그대로 잡는다
  const spam = balanceReport(grown.concat([post('promo', 6), post('promo', 7)]))
  ok(spam.next === 'info' && spam.level === 'bad', '홍보글 연속은 쌓인 뒤에도 막는다', spam.message)
}

const { freshnessReport, STALE_DAYS } = require(`${OUT}/writing/rotation.js`)

const frNow = Date.parse('2026-08-05T00:00:00Z')
const frStores = [
  { id: 'a', name: '쌍용점' },
  { id: 'b', name: '성정점' },
  { id: 'c', name: '용곡점' },
]
const frPosts = [
  { id: '1', storeId: 'a', status: 'published', publishedAt: '2026-08-03', type: 'promo', body: '', mainKeyword: '' },
  { id: '2', storeId: 'a', status: 'published', publishedAt: '2026-07-10', type: 'info', body: '', mainKeyword: '' },
  { id: '3', storeId: 'b', status: 'published', publishedAt: '2026-07-01', type: 'promo', body: '', mainKeyword: '' },
  // 초안은 발행이 아니다 — 써두기만 한 글로 「최신」이 되면 안 된다
  { id: '4', storeId: 'c', status: 'draft', publishedAt: '2026-08-04', type: 'promo', body: '', mainKeyword: '' },
]
const FR = freshnessReport(frPosts, frStores, frNow)
ok(FR.length === 3, '지점을 모두 담는다')
ok(FR[0].storeId === 'c', '가장 오래 빈 지점을 먼저 보여준다', FR[0].storeId)
ok(FR[0].days === null && FR[0].lastPublished === null, '초안은 발행으로 세지 않는다')
ok(FR[0].message.includes('아직 발행한 글이 없습니다'), '발행이 없으면 그렇게 말한다', FR[0].message)
const frA = FR.find((f) => f.storeId === 'a')
ok(frA.lastPublished === '2026-08-03' && frA.days === 2, '가장 최근 발행일을 고른다', String(frA.days))
ok(!frA.stale && frA.message.includes('최신성은 지금 괜찮습니다'), `${STALE_DAYS}일 안이면 괜찮다고 한다`)
const frB = FR.find((f) => f.storeId === 'b')
ok(frB.days === 35 && frB.stale, '오래 비면 식었다고 표시한다', String(frB.days))
ok(frB.message.includes('거꾸로 나온 적이 한 번도 없는'), '왜 급한지 근거를 붙인다', frB.message)
ok(byKey('age').advantage > 0.5, '실측 표본에서 최신성이 유리하게 나온다', String(byKey('age').advantage))
ok(byKey('age').note.includes('최신 글이 위에 있습니다'), '사람 말로 적는다', byKey('age').note)
ok(byKey('chars').advantage < 0, '같은 표본에서 본문 분량은 거꾸로 간다', String(byKey('chars').advantage))
ok(byKey('chars').note.includes('오히려'), '거꾸로 갈 때는 그렇게 말한다', byKey('chars').note)
ok(byKey('age').n === 5, '표본 수를 함께 담는다')
// 제목에 키워드가 없는 글은 「맨 뒤」로 취급하지 않고 표본에서 뺀다
ok(byKey('keywordFront').n === 4, '키워드가 없는 글은 그 항목 표본에서 뺀다', String(byKey('keywordFront').n))
// 부호는 항상 「유리한 방향」으로 담는다 (순위 숫자와의 상관을 그대로 두면 헷갈린다)
ok(
  byKey('chars').rho === -byKey('chars').advantage,
  '값이 클수록 좋은 신호는 부호를 뒤집어 담는다 (순위 숫자와의 상관을 그대로 두면 헷갈린다)',
  `rho=${byKey('chars').rho} advantage=${byKey('chars').advantage}`
)
ok(byKey('age').rho === byKey('age').advantage, '경과일은 작을수록 좋아서 그대로 담는다')

// 표본이 적으면 판정하지 않는다
const F_FEW = measureFactors(REAL_SAMPLES.slice(0, 3))
ok(F_FEW.find((x) => x.key === 'age').strength === 'unknown', `표본 ${F_MIN}편 미만은 판정 안 함`)
ok(F_FEW.find((x) => x.key === 'age').note.includes('표본이 3편뿐'), '몇 편인지 말한다')

// 관찰을 모으면 방향이 유지되는지 본다
const F_OBS1 = buildObservation('쌍용동 헬스장', '2026-08-05', REAL_SAMPLES)
ok(F_OBS1.sampled === 5 && F_OBS1.keyword === '쌍용동 헬스장', '관찰 하나')
const F_OBS2 = buildObservation('봉명동 헬스장', '2026-08-05', [
  { rank: 1, ageDays: 3, charCount: 1800, imageCount: 10, videoCount: 1, titleLength: 30, keywordPos: 0 },
  { rank: 2, ageDays: 8, charCount: 1700, imageCount: 9, videoCount: 0, titleLength: 31, keywordPos: 0 },
  { rank: 3, ageDays: 15, charCount: 1600, imageCount: 8, videoCount: 0, titleLength: 32, keywordPos: 1 },
  { rank: 4, ageDays: 20, charCount: 1500, imageCount: 7, videoCount: 0, titleLength: 33, keywordPos: 2 },
  { rank: 5, ageDays: 30, charCount: 1400, imageCount: 6, videoCount: 0, titleLength: 34, keywordPos: 3 },
])
const F_POOL = poolFactors([F_OBS1, F_OBS2])
const pAge = F_POOL.find((p) => p.key === 'age')
ok(pAge.runs === 2 && pAge.samples === 10, '관찰 수와 표본 합계를 담는다', `${pAge.runs}/${pAge.samples}`)
ok(pAge.advantage > 0.5, '두 관찰 모두 최신성이 유리 → 모아도 유리', String(pAge.advantage))
ok(pAge.agree === 2 && pAge.disagree === 0, '몇 번 중 몇 번이 같은 방향인지 센다')
ok(pAge.note.includes('관찰 2회 중 2회'), '몇 번 중 몇 번인지 말한다', pAge.note)

// 방향이 갈리면 「요인으로 보기 어렵다」고 말한다 (평균만 보여주면 없는 확신이 생긴다)
const pChars = F_POOL.find((p) => p.key === 'chars')
ok(
  pChars.note.includes('방향이 갈립니다') || Math.abs(pChars.advantage) < F_WEAK,
  '방향이 갈리면 그렇게 말한다',
  pChars.note
)

const F_HEAD = poolHeadline(F_POOL, [F_OBS1, F_OBS2])
ok(F_HEAD.includes('관찰 2회'), '몇 번 관찰했는지 먼저 말한다', F_HEAD)
ok(F_HEAD.includes('같이 움직이는 것과 원인은 다르므로'), '상관을 인과로 말하지 않는다')
ok(poolHeadline(poolFactors([]), []).includes('아직 관찰한 기록이 없습니다'), '없으면 없다고 한다')
// 신호별 표본을 더하면 같은 글을 여섯 번 세게 된다 (5편이 55편으로 나왔던 자리)
ok(F_HEAD.includes('상위 글 10편'), '표본 합계는 글 수로 센다', F_HEAD.slice(0, 40))

// 지수로는 순위가 설명되지 않았다는 실측 기록 — 업계 상식과 반대라 근거를 붙인다
ok(GRADE_NOTE.includes('최적1'), '실측 근거를 적는다')
ok(GRADE_NOTE.includes('입장권'), '등급의 역할을 밝힌다')
ok(!GRADE_NOTE.includes('지수는 의미가 없'), '등급이 무의미하다고 단정하지 않는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[49] 돈 주고 맡긴 글인가 — 단정하지 않고 근거만')
const { scanSponsorship, judgeAgency, AGENCY_CAVEAT, SPONSOR_LABEL, AGENCY_LABEL } =
  require(`${OUT}/analysis/agency.js`)

// 본인이 밝힌 표기가 가장 확실한 근거다
const ag1 = scanSponsorship('본 포스팅은 업체로부터 소정의 원고료를 받아 작성되었습니다.')
ok(ag1.level === 'paidDisclosed', '대가성 표기를 찾는다', ag1.level)
ok(ag1.found.includes('원고료'), '찾은 문구를 그대로 담는다', ag1.found.join(','))
ok(ag1.note.includes('직접 밝힌'), '본인 진술이라고 밝힌다')

const ag2 = scanSponsorship('체험단으로 방문했습니다. 정말 좋았어요.')
ok(ag2.level === 'campaignDisclosed', '체험단 표기를 가른다', ag2.level)

const ag3 = scanSponsorship('내돈내산 후기입니다. 3개월 등록했습니다.')
ok(ag3.level === 'ownMoney', '내돈내산도 본인 표기로 읽는다')

const agNo = scanSponsorship('운동 시작한 지 3주 됐습니다. 기구가 넉넉해서 좋아요.')
ok(agNo.level === 'noMark', '표기가 없으면 없다고 한다')
/*
 * 가장 중요한 검사. 표기가 없는 것을 「몰래 받았다」로도, 「안 받았다」로도 읽으면 안 된다.
 * 남이 대가를 받았다고 단정하는 것은 사실 주장이고, 틀리면 명예훼손이다.
 */
ok(agNo.note.includes('알 수 없습니다'), '표기 없음을 추측으로 채우지 않는다', agNo.note)
ok(!agNo.note.includes('받지 않'), '안 받았다고도 하지 않는다')
ok(!agNo.note.includes('숨기'), '숨겼다고도 하지 않는다')

// 제목에 있는 표기도 잡는다
ok(scanSponsorship('', '[협찬] 쌍용동 헬스장 후기').level === 'paidDisclosed', '제목의 표기도 잡는다')

// ── 블로그 단위 판단 ──
const AG_MARKED = judgeAgency({
  scans: [ag1, ag2, agNo],
  tradeGroups: 5,
  topTradeShare: 30,
  gymShare: 20,
  last30: 30,
})
ok(AG_MARKED.level === 'confirmedByMark', '표기를 봤으면 확인으로 올린다', AG_MARKED.level)
ok(AG_MARKED.signals.some((s) => s.toward === 'campaign'), '체험단 쪽 신호를 담는다')
ok(AG_MARKED.meaning.includes('비용을 들여 만든 자리'), '우리에게 뜻하는 것을 말한다')
ok(AG_MARKED.meaning.includes('후기'), '그럼 무엇을 하라고까지 말한다')

// 업체 본인 블로그 — 우리도 직접 써서 이길 수 있는 판이다
const AG_OWNER = judgeAgency({
  scans: [agNo, agNo],
  tradeGroups: 1,
  topTradeShare: 95,
  gymShare: 90,
  last30: 3,
})
ok(AG_OWNER.level === 'ownerLike', '업종 집중 + 적은 발행량은 업체 본인 쪽', AG_OWNER.level)
ok(AG_OWNER.meaning.includes('직접 써서 이길 수 있는'), '이길 수 있는 판이라고 말한다')

// 표기는 못 봤지만 캠페인 패턴이 여럿
const AG_LIKE = judgeAgency({
  scans: [agNo, agNo, agNo],
  tradeGroups: 6,
  topTradeShare: 25,
  gymShare: 10,
  last30: 40,
})
ok(AG_LIKE.level === 'campaignLike', '패턴만 있으면 「…로 보임」까지', AG_LIKE.level)
ok(AG_LIKE.meaning.includes('단정할 수는 없습니다'), '단정하지 않는다고 본문에 적는다', AG_LIKE.meaning)
ok(AGENCY_LABEL.campaignLike.includes('보임'), '배지 말도 단정하지 않는다', AGENCY_LABEL.campaignLike)

// 근거가 모자라면 모자라다고 한다
const AG_NONE = judgeAgency({ scans: [], tradeGroups: 2, topTradeShare: 50, gymShare: 40, last30: 8 })
ok(AG_NONE.level === 'unclear', '근거가 없으면 판단하지 않는다', AG_NONE.level)
ok(AG_NONE.meaning.includes('근거가 모자랍니다'), '모자라다고 말한다')

// 이 문장은 어떤 판정에도 함께 나간다
for (const j of [AG_MARKED, AG_OWNER, AG_LIKE, AG_NONE]) {
  ok(j.caveat === AGENCY_CAVEAT, '단서가 항상 함께 나간다')
}
ok(AGENCY_CAVEAT.includes('단정할 수 없습니다'), '단정하지 말라고 적는다')
ok(AGENCY_CAVEAT.includes('남에게 「돈 받은 글」이라고 말하지 마세요'), '밖으로 옮기지 말라고 적는다')
ok(SPONSOR_LABEL.noMark === '표기 없음', '표기 없음을 그대로 부른다')

// ─────────────────────────────────────────────────────────────
console.log('\n[50] 내용 균형 — 시설·이벤트만으로는 위로 못 간다')
const {
  countSignals,
  contentBalance,
  INFO_MIN,
  INFO_MIN_BY_TYPE,
  INFO_RELEASE,
  PROMO_MAX,
  PROMO_MAX_BY_TYPE,
  INFO_WORDS,
  PROMO_WORDS,
} = require(`${OUT}/analysis/content.js`)

// 종류를 센다 — 횟수를 세면 같은 말을 반복해 점수를 올릴 수 있다
const cbRep = countSignals('자세 자세 자세 자세 자세 자세 자세 자세')
ok(cbRep.info === 1, '같은 말을 열 번 써도 1종류', String(cbRep.info))
const cbMany = countSignals('자세와 루틴, 식단과 유산소, 스트레칭까지')
ok(cbMany.info === 5, '다른 말은 각각 센다', String(cbMany.info))
ok(cbMany.infoFound.includes('루틴'), '무엇이 들어 있었는지 담는다')

/*
 * 상한(6종류)을 넘긴 글 — 파는 말이 본문 전체에 깔린 상태.
 * 예전엔 이 예시가 6종류로 걸렸는데, 141편 재측정으로 상한이 3→6 이 되면서
 * 7종류를 넘겨야 걸린다. 실측에서 실제로 떨어진 지점이 거기다 (7종류 이상 1~3위 14%).
 */
const cbPushy = contentBalance(
  '상담 예약 이벤트 할인 영업시간 문의 선착순 마감 지금 바로 오세요. 시설이 넓습니다.'
)
ok(cbPushy.signals.promo > PROMO_MAX, '홍보 표현이 많은 것을 잡는다', String(cbPushy.signals.promo))
ok(cbPushy.level === 'both' || cbPushy.level === 'pushy', '판정', cbPushy.level)
ok(cbPushy.promoNote.includes('한 곳에 합치세요'), '지우라고 하지 않고 합치라고 한다', cbPushy.promoNote)
ok(!cbPushy.promoNote.includes('1~3위 평균 2.0'), '반증된 근거(1~3위 평균 2.0종류)를 더 대지 않는다')
ok(cbPushy.promoNote.includes('순위 기준이 아닙니다'), '상한이 순위 근거가 아니라고 밝힌다')
ok(cbPushy.promoNote.includes('혜택 내용은 그대로'), '혜택을 지우라고 하지 않는다')

/*
 * 홍보 6종류 — 예전 기준으로는 「과하다」였고 실측으로는 1~3위 43% 였다.
 * 이제 통과해야 한다. 회원이 「이벤트 문구는 줄이지 않는다」고 한 지점이 이것이다.
 */
const cbSix = contentBalance('상담 예약 이벤트 할인 영업시간 문의 주세요. 자세와 호흡, 세트와 무게, 초보 회복까지 잡아드립니다.')
ok(cbSix.signals.promo === 6, '홍보 6종류', String(cbSix.signals.promo))
ok(cbSix.level === 'good', '정보가 충분하면 홍보 6종류도 통과한다 (실측 1~3위 43%)', cbSix.level)

// 실측한 2위 글 모양 — 순수 소개글인데도 정보가 들어 있었다 (자세·식단·유산소·스트레칭)
const cbOk = contentBalance(
  '쌍용역 5분 거리입니다. 유산소는 이 시간대에, 자세는 이렇게 잡으세요. 식단은 단백질부터. 스트레칭도 함께. 궁금하면 문의 주세요.'
)
// 정보 하한이 4→5 로 올라갔으므로 이 예시도 5종류다 (유산소·자세·식단·단백질·스트레칭)
ok(cbOk.level === 'good', '정보가 있고 홍보가 절제되면 통과', cbOk.level)
ok(cbOk.signals.info >= INFO_MIN, `정보 ${INFO_MIN}종류 이상`, String(cbOk.signals.info))
ok(cbOk.infoNote.includes('상위권 수준'), '통과했다고 말해준다')

// 시설·이벤트만 쓴 글 — 회원이 말한 그 글
const cbThin = contentBalance(
  '런닝머신 10대, 스미스머신 2대가 있습니다. 이번 달 신규 등록 이벤트 진행합니다. 문의 주세요.'
)
ok(cbThin.level === 'thin' || cbThin.level === 'both', '시설·이벤트만 쓰면 걸린다', cbThin.level)
ok(cbThin.infoNote.includes('무엇을 어떻게 한다'), '고치는 방법을 말한다', cbThin.infoNote)
ok(cbThin.infoNote.includes('40~43%'), '계단이 있던 실측값을 근거로 준다', cbThin.infoNote)

// 홍보가 하나도 없으면 그것도 알려준다 (우리 글은 상담으로 이어져야 한다)
const cbNoPromo = contentBalance('자세와 루틴, 식단과 유산소, 스트레칭을 다룹니다.')
ok(cbNoPromo.level === 'good', '정보만 있어도 균형 자체는 통과')
ok(cbNoPromo.promoNote.includes('마지막에 한 번은 넣으세요'), '홍보가 0이면 넣으라고 한다')

ok(INFO_MIN === 5 && PROMO_MAX === 6, '141편 재측정으로 옮긴 기준선')
ok(INFO_WORDS.includes('식단') && INFO_WORDS.includes('자세'), '정보 어휘')
ok(PROMO_WORDS.includes('선착순'), '홍보 어휘에 마감 압박도 넣는다')

// 검수기에 두 항목이 실제로 붙었는지
const balanceCheck = checkPost({
  type: 'promo',
  title: '쌍용동 헬스장 시설 안내',
  body: '런닝머신 10대가 있습니다. 신규 등록 이벤트 진행 중입니다. 상담 문의 주세요. 예약도 받습니다. 영업시간은 24시간입니다.',
  mainKeyword: '쌍용동 헬스장',
  subKeywords: [],
  tags: [],
})
const infoItem = balanceCheck.items.find((i) => i.id === 'info-substance')
const promoItem = balanceCheck.items.find((i) => i.id === 'promo-restraint')
ok(Boolean(infoItem), '검수에 정보 항목이 있다')
ok(Boolean(promoItem), '검수에 홍보 절제 항목이 있다')
ok(infoItem.group === '내용 균형' && promoItem.group === '내용 균형', '같은 묶음에 둔다')
ok(infoItem.level !== 'pass', '시설·이벤트만 쓴 글은 정보 항목에서 걸린다', infoItem.level)
/*
 * 이 예시는 홍보 5종류(이벤트·상담·문의·예약·영업시간)다 — 실측 1~3위 47% 라서
 * 이제 통과해야 한다. 예전엔 걸렸고, 그게 회원이 반박한 지점이었다.
 */
ok(promoItem.level === 'pass', '홍보 5종류는 통과한다 (실측 1~3위 47%)', `${promoItem.value} ${promoItem.level}`)
ok(
  promoItem.hint === undefined || !/줄이|덜어/.test(promoItem.hint),
  '정보가 모자란 글에도 홍보를 줄이라고 하지 않는다',
  String(promoItem.hint)
)
ok(infoItem.target.includes('40~43%'), '목표에 계단이 있던 실측값을 적는다', infoItem.target)
ok(infoItem.weight === 5, '정보 종류는 이 앱에서 가장 센 신호급 (가중치 5)', String(infoItem.weight))
ok(promoItem.weight === 2, '홍보 종류 수는 순위를 가르지 않아 가중치를 내렸다', String(promoItem.weight))

/*
 * 정보가 모자라고 홍보가 3종류 이상이면, 「줄이지 말고 정보를 더하라」고 말해야 한다.
 * 실측: 정보 4종류 이하 글에서 홍보 2종류 이하 1~3위 17% / 3종류 초과 16% — 줄여도 안 오른다.
 */
const thinButPushy = contentBalance('런닝머신이 있습니다. 신규 등록 이벤트 상담 문의 주세요.', 'promo')
ok(thinButPushy.level === 'thin', '정보만 모자란 판정', thinButPushy.level)
ok(thinButPushy.promoNote.includes('이건 줄이지 마세요'), '홍보를 줄이지 말라고 명시한다', thinButPushy.promoNote)
ok(thinButPushy.promoNote.includes('17%'), '줄여도 안 오른다는 실측을 붙인다')

// ─────────────────────────────────────────────────────────────
console.log('\n[51] 유리한 글 유형 제안 — 앱이 보여주고 회원이 결정')
const { suggestPostType, blockHint } = require(`${OUT}/analysis/intent.js`)

// 블록 이름이 알려주는 것 (실측: 쌍용동 헬스장 → 「스포츠 인기글」)
ok(blockHint(['스포츠 인기글']).includes('인기글'), '인기글 블록을 알아본다')
ok(blockHint(['AI 브리핑', '네이버 클립']).includes('블로그 자리가 좁고'), '블로그 자리가 좁은 판을 알려준다')
ok(blockHint([]) === null, '블록을 못 읽으면 null')

const runFor = (keyword, expAdv, infoAdv, n = 8) => ({
  keyword,
  date: '2026-08-05',
  sampled: 10,
  results: [
    { key: 'experience', label: '경험', rho: 0, advantage: expAdv, n, strength: 'weak', note: '' },
    { key: 'info', label: '정보', rho: 0, advantage: infoAdv, n, strength: 'weak', note: '' },
  ],
})

/*
 * 실측에서 같은 업종인데 검색어에 따라 정반대였다.
 *   쌍용동 PT  경험 +0.78 · 천안 헬스장 경험 -0.81
 */
const sPT = suggestPostType({ keyword: '쌍용동 PT', runs: [runFor('쌍용동 PT', 0.78, 0.4)] })
ok(sPT.suggest === 'review', '경험이 유리한 키워드는 후기글을 제안', sPT.suggest)
ok(sPT.confidence === 'measured', '관찰로 판정했다고 밝힌다')
ok(sPT.reasons.some((r) => r.includes('겪은 이야기를 쓴 글이 위에')), '근거를 사람 말로 준다')

const sCity = suggestPostType({ keyword: '천안 헬스장', runs: [runFor('천안 헬스장', -0.81, 0.01)] })
ok(sCity.suggest === 'promo', '경험이 불리한 키워드는 홍보글을 유지', sCity.suggest)
ok(sCity.reasons.some((r) => r.includes('경험을 덜 쓴 글이 오히려 위에')), '반대 방향도 말해준다')

// 지역이 아닌 정보 키워드에서 정보 신호가 강하면 정보글
const sInfo = suggestPostType({ keyword: '다이어트 정체기', runs: [runFor('다이어트 정체기', 0.05, 0.7)] })
ok(sInfo.suggest === 'info', '지역이 없고 정보가 유리하면 정보글', sInfo.suggest)
// 지역 키워드는 정보 신호가 강해도 정보글로 바꾸지 않는다 (지역 글이 우리 무기다)
const sLocalInfo = suggestPostType({ keyword: '쌍용동 헬스장', runs: [runFor('쌍용동 헬스장', 0.05, 0.7)] })
ok(sLocalInfo.suggest === 'promo', '지역 키워드는 정보 신호가 커도 홍보글', sLocalInfo.suggest)

// 근거가 없으면 바꾸라고 하지 않는다
const sNone = suggestPostType({ keyword: '쌍용동 헬스장' })
ok(sNone.suggest === 'promo' && sNone.confidence === 'none', '근거가 없으면 기본값을 둔다')
ok(sNone.note.includes('근거가 없어 제안하지 않습니다'), '제안하지 않는다고 말한다')

const sBlock = suggestPostType({ keyword: '쌍용동 헬스장', blocks: ['스포츠 인기글'] })
ok(sBlock.confidence === 'blockOnly', '블록만 있으면 그렇다고 밝힌다')
ok(sBlock.note.includes('관찰한 기록이 없어'), '관찰이 없다고 말한다')
ok(sBlock.note.includes('지금 관찰하기'), '어떻게 근거를 쌓는지 알려준다')

// 결정권은 회원에게 있다고 말한다
ok(sPT.note.includes('회원님 판단이 우선'), '결정은 회원이 한다고 밝힌다', sPT.note)

// ─────────────────────────────────────────────────────────────
console.log('\n[52] 홍보글 골격 개편 — 시설 스펙 대신 동작, 홍보는 한 곳')
const promoSkeleton = buildTemplate('promo', {
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장', '쌍용동 PT'],
  store: {
    id: 's',
    name: '쌍용점',
    legalName: 'MTO 피트니스 쌍용점',
    womenOnly: false,
    open24: true,
    localKeywords: [],
    location: '',
    features: [],
    strengths: [],
    phone: '010-0000-0000',
  },
})
/*
 * 「시설 스펙을 나열하지 않는다」를 지웠다 (2026-08-07). 시설 소개 구간을 통째로 막고
 * 있었고, 다시 재보니 시설을 말하는 것 자체는 순위와 무관했다 (밀도 0~3 33% · 6~10 35%,
 * 1,000자당 10개 이상만 1~3위 0%). 회원 지적도 같았다 — "이건 시설 소개 내용이 전혀 아니야."
 */
ok(!promoSkeleton.includes('시설 스펙을 나열하지 않는다'), '시설 소개를 통째로 막지 않는다')
ok(promoSkeleton.includes('우리 센터에 무엇이 있나'), '시설 구간이 답할 질문을 준다')
/*
 * **2026-08-21 에 「운동 정보」 구간을 뺐다** (회원: "홍보글에 운동 정보 넣는것도 빼주고").
 * 위 세 줄은 그 구간이 있을 때를 지키던 검사였다. 지우지 않고 **반대를 지키게** 바꾼다 —
 * 자리가 비면 다음에 또 한쪽만 고치게 된다.
 *
 * 정보 종류 하한(5)은 실측이라 그대로 두고, **채우는 자리만 옮겼다.** 운동 정보 없이
 * 시설·신뢰·이벤트만으로 써서 세니 정보 7종류였다 (content.ts 의 INFO_MIN_BY_TYPE 주석).
 */
ok(promoSkeleton.includes('운동하는 방법을 설명하지 않는다'), '시설 구간에서 운동을 가르치지 말라고 한다')
ok(!promoSkeleton.includes('운동 정보 소제목'), '골격에 운동 정보 구간이 없다')
ok(!promoSkeleton.includes('주제를 하나만 잡는다'), '운동 주제를 고르라는 안내를 지웠다')
ok(promoSkeleton.includes('여기서도 운동을 가르치지 않는다'), '신뢰 구간에서도 가르치지 말라고 한다')
ok(promoSkeleton.includes('재본 값 7종류'), '그래도 정보 종류가 채워진다는 근거를 준다')
ok(promoSkeleton.includes('천국의 계단 4대" (X)'), '시설 소개의 나쁜 예와 좋은 예를 같이 준다')
/*
 * 「중간 CTA 를 넣지 않는다」를 지웠다 (2026-08-07). 정반대가 실측으로 나왔다 —
 * 「상담·예약·문의」 6회 이상 1~3위 60%(평균 3.3위) / 0~1회 14%(6.5위), 세 표본 재현.
 */
ok(!promoSkeleton.includes('중간 CTA 를 넣지 않는다'), '중간 CTA 금지를 지웠다')
ok(promoSkeleton.includes('상담·예약·문의를 본문 전체에서 6회 이상'), '오히려 6회 이상 쓰라고 한다')
ok(promoSkeleton.includes('한 곳에 몰아넣지 말고'), '한 곳에 몰지 말라고 한다')
/*
 * 「한 줄로만」을 뺐다 (2026-08-07). 회원 지적: "처음 홍보 후킹 문장이 너무 약해.
 * 광복절 이벤트 내용을 조금 더 구체적으로 넣되 다 밝히진 않은 선에서."
 *
 * 그 뒤에도 나온 글에 훅이 없어서(2026-08-10) 조건을 **두 조각으로 쪼개** 적었다 —
 * 검수의 `event-hook` 이 재는 것과 같은 둘이다. 「6단계에서 공개」라고 적혀 있던 것도
 * 함께 고쳤다: 이 골격에서 이벤트는 **7단계**다 (단정문이 옛 번호를 박고 있었다).
 */
ok(promoSkeleton.includes('㉮무엇이 있다'), '훅의 첫 조각을 요구한다')
ok(promoSkeleton.includes('㉯제한이 있다'), '훅의 두 번째 조각을 요구한다')
ok(promoSkeleton.includes('10만 원 아래로 맞췄어요'), '흘리는 예를 그대로 준다')
ok(promoSkeleton.includes('정확한 인원 수·마감일은 5단계'), '다 밝히지는 않게 한다 (단계 번호도 맞다)')
ok(promoSkeleton.includes('「이벤트 진행 중입니다」는 훅이 아니다'), '내용 없는 예고를 막는다')

/*
 * 「아픈 지점을 인사보다 먼저」를 뺐다 (2026-08-07 실측, 비방문자 글 84편).
 *   인사로 시작 37편 1~3위 27% (15~43%) / 아닌 글 47편 32% (20~46%) — 구간이 겹친다.
 * 1~3위 글 다수가 「안녕하세요」로 시작한다. 순서를 강제한 것은 내 통설이었다.
 */
ok(promoSkeleton.includes('①**첫 문장이 인사다**'), '인사를 첫 문장으로 못박는다')
ok(promoSkeleton.includes('처럼 줄이지 않는다'), '상호명을 줄여 쓰지 말라고 한다')
ok(!promoSkeleton.includes('①아픈 지점으로 첫 문장'), '아픈 지점을 인사보다 앞세우지 않는다')
ok(promoSkeleton.includes('순위 차이가 없었다'), '순서에 근거가 없다고 밝힌다')
ok(promoSkeleton.includes('인사 다음 문장이 승부처다'), '대신 첫 문장의 세기를 요구한다')
ok(promoSkeleton.includes('많은 분들이 고민하십니다'), '약한 첫 문장의 나쁜 예를 준다')
ok(promoSkeleton.includes('새벽 근무 끝나고'), '강한 첫 문장의 좋은 예를 준다')
const sysHook = buildSystemPrompt('promo')
ok(sysHook.includes('**첫 문장이 인사다.**'), 'AI 지시문도 인사를 첫 문장으로 못박는다')
ok(sysHook.includes('정식 상호명)입니다」를 글의 맨 처음에'), '정식 상호명을 그대로 쓰라고 한다')
/*
 * 「금액을 제목에 박지는 않는다」를 지웠다 (2026-08-07). 회원이 직접 예를 들었다 —
 * "나 같으면 「쌍용동 헬스장 가격 궁금할 때, 3개월 9.9만원」 이런 식으로 지었을 것."
 * 내가 넣은 금지였고 근거가 없었다 (제목에 금액 4편, 1~3위 25% vs 없음 30% — 표본이 못 된다).
 */
ok(!sysHook.includes('금액을 제목에 박지는 않는다'), '금액을 제목에 못 쓰게 하지 않는다')
ok(sysHook.includes('금액을 그대로 써도 된다'), '금액을 제목에 써도 된다고 알려준다')
ok(sysHook.includes('3개월 9.9만원'), '회원이 든 예를 그대로 준다')
ok(sysHook.includes('최저가·파격가·반값'), '광고심의 위험 표현은 계속 막는다')
ok(sysHook.includes('「무엇이 있다」와 「제한이 있다」를 붙여 쓴다'), 'AI 지시문도 두 조각을 요구한다')
ok(sysHook.includes('정확한 인원 수·마감일·포함 항목은 6단계에서 공개한다'), 'AI 지시문은 이벤트가 6단계다 (골격과 번호가 다르다)')
/*
 * 영상은 안내(`> `)가 아니라 **표기**로 넣는다 — 안내는 복사할 때 지워지므로,
 * 안내로만 두면 네이버에 붙이는 순간 영상 자리가 사라진다.
 */
ok(promoSkeleton.includes('[영상:'), '영상 자리를 표기로 넣는다')
ok(promoSkeleton.includes('10~20초'), '영상 길이까지 알려준다')
ok(stripGuides(promoSkeleton).includes('[영상:'), '복사 본문에도 영상 자리가 남는다')
// 홍보를 없애지는 않는다 — 이 글의 목적은 상담이다
/*
 * 구간이 하나 줄고(2026-08-21 운동 정보 제거) 골격 번호를 **지시문과 같게** 맞췄다 —
 * 전에는 골격이 2단계부터 시작하고 마지막을 「CTA」라 불러서, 회원이 두 판을 나란히 보면
 * 번호도 이름도 달랐다. 유형별 전면 점검에서 잡혔다.
 */
ok(promoSkeleton.includes('6단계 마무리'), '마지막은 6단계 마무리다 (지시문과 같은 이름)')
ok(promoSkeleton.includes('5단계 이벤트 본공개'), '이벤트는 5단계다')
ok(promoSkeleton.includes('3단계 시설 소개 (430~520자'), '시설 소개를 늘렸다 (300~380 → 430~520)')
ok(promoSkeleton.includes('4단계 신뢰 (400~480자'), '신뢰를 늘렸다 (200~250 → 400~480)')
ok(promoSkeleton.includes('1단계 후킹'), '후킹은 1단계다 (전에는 2단계였다)')
ok(!promoSkeleton.includes('단계 운동 정보'), '운동 정보 단계가 남아 있지 않다')
// 상담을 얹을 자리도 같이 옮겼다 — 번호가 어긋나면 회원이 엉뚱한 구간에 넣는다
ok(promoSkeleton.includes('2·3·5·6단계 끝에'), '상담 얹을 단계 번호도 옮겼다')


// ─────────────────────────────────────────────────────────────
console.log('\n[53] 검수 기준이 관찰을 읽는다 — 근거 없는 항목은 점수에서 물러난다')
const { ITEM_FACTOR, itemEvidence, evidenceHeadline, MIN_WEIGHT, MIN_RUNS } =
  require(`${OUT}/writing/evidence.js`)

/** 관찰 묶음 하나 만들기 (poolFactors 결과 모양) */
const evPool = (key, { advantage, runs, agree, disagree, samples = runs * 10 }) => [
  { key, label: key, advantage, runs, samples, agree, disagree, note: '' },
]
const evOne = (key, opts, base = { charCount: 3, images: 3 }) =>
  itemEvidence(evPool(key, opts), base)

// 관찰이 없으면 손대지 않는다 — 「근거 없음」과 「근거 나쁨」은 다르다
ok(itemEvidence(undefined, { charCount: 3 }).size === 0, '관찰이 없으면 아무것도 바꾸지 않는다')
ok(itemEvidence([], { charCount: 3 }).size === 0, '빈 관찰도 마찬가지')

// 관찰이 적으면 아직 반영하지 않는다 (한두 번은 우연이다)
const evFew = evOne('chars', { advantage: -0.9, runs: MIN_RUNS - 1, agree: 0, disagree: 2 })
ok(evFew.get('charCount').verdict === 'none', `관찰 ${MIN_RUNS}회 미만은 반영하지 않는다`)
ok(evFew.get('charCount').weight === 3, '가중치를 건드리지 않는다')
ok(evFew.get('charCount').line.includes('업계 통설'), '지금 기준이 통설이라고 밝힌다', evFew.get('charCount').line)

// 거꾸로 나온 항목 — 비중을 최소로 내린다
const evAgainst = evOne('chars', { advantage: -0.62, runs: 5, agree: 0, disagree: 4 })
const evAg = evAgainst.get('charCount')
ok(evAg.verdict === 'against', '거꾸로 나오면 그렇게 판정한다', evAg.verdict)
ok(evAg.weight === MIN_WEIGHT && evAg.baseWeight === 3, `비중을 ${MIN_WEIGHT}로 내린다`, `${evAg.baseWeight}→${evAg.weight}`)
ok(evAg.line.includes('오히려 아래에 있었습니다'), '무슨 일이 있었는지 사람 말로', evAg.line)
// 0 으로 만들지는 않는다 — 항목이 사라진 것처럼 보이면 안 된다
ok(evAg.weight > 0, '항목을 없애지는 않는다')

// 방향이 갈리는 항목 — 요인으로 보기 어렵다
const evMixed = evOne('images', { advantage: 0.0, runs: 6, agree: 2, disagree: 2 })
ok(evMixed.get('images').verdict === 'mixed', '방향이 갈리면 mixed')
ok(evMixed.get('images').weight === MIN_WEIGHT, '갈리는 항목도 비중을 내린다')
ok(evMixed.get('images').line.includes('방향이 갈립니다'), '갈린다고 말한다')
// 평균이 커도 거꾸로가 유리만큼 있으면 갈린 것이다 (평균 하나로 속지 않는다)
const evSplit = evOne('images', { advantage: 0.55, runs: 6, agree: 2, disagree: 2 })
ok(evSplit.get('images').verdict === 'mixed', '평균이 커도 거꾸로가 같은 수면 갈린 것')

// 여러 관찰에서 뚜렷하게 유리했던 항목 — 조금 올린다
const evUp = evOne('chars', { advantage: 0.78, runs: 4, agree: 4, disagree: 0 })
ok(evUp.get('charCount').verdict === 'supported', '뚜렷하게 유리하면 supported')
ok(evUp.get('charCount').weight === 4, '올리는 폭은 +1 로 제한한다', String(evUp.get('charCount').weight))
// 올리는 폭이 내리는 폭보다 작다 — 상관이 인과라는 보장이 없다
ok(
  evUp.get('charCount').weight - 3 < 3 - evAg.weight,
  '올리는 폭이 내리는 폭보다 작다'
)
const evCap = itemEvidence(evPool('chars', { advantage: 0.95, runs: 5, agree: 5, disagree: 0 }), {
  charCount: 5,
})
ok(evCap.get('charCount').weight === 5, '한 항목이 점수를 지배하지 못하게 상한을 둔다')

// 약하게 유리한 항목은 그대로 둔다
const evWeak = evOne('chars', { advantage: 0.45, runs: 4, agree: 3, disagree: 0 })
ok(evWeak.get('charCount').verdict === 'weak' && evWeak.get('charCount').weight === 3, '약하면 그대로')
ok(evWeak.get('charCount').line.includes('방향은 맞지만 약합니다'), '약하다고 말한다')

// 어느 검수 항목이 어느 관찰 신호에 걸려 있는지
ok(ITEM_FACTOR.charCount === 'chars' && ITEM_FACTOR.images === 'images', '분량·이미지가 연결돼 있다')
ok(ITEM_FACTOR.titleKeyword === 'keywordFront', '제목 키워드 위치도 연결')
ok(ITEM_FACTOR['info-substance'] === 'info' && ITEM_FACTOR['promo-restraint'] === 'promo', '내용 균형도 연결')

// 점수의 근거가 얼마나 되는지 한 줄로
ok(
  evidenceHeadline(new Map(), 26).includes('모두 업계 통설 기준'),
  '관찰이 없으면 전부 통설이라고 밝힌다'
)
const evHead = evidenceHeadline(evAgainst, 26)
ok(evHead.includes('26개 항목 중 1개'), '몇 개를 관찰과 맞춰봤는지 말한다', evHead)
ok(evHead.includes('비중을 낮춘 항목 1개'), '비중을 낮춘 개수를 밝힌다')
ok(evHead.includes('나머지 25개'), '나머지가 통설이라고 밝힌다')

// ─── 실제 검수에 걸었을 때 ───────────────────────────────────
const EV_BODY = [
  '[이미지: 대표]',
  '안녕하세요, 쌍용동 헬스장 MTO 피트니스 쌍용점입니다. 처음 오시는 분들이 가장 많이 묶는 것부터 정리했습니다.',
  '',
  '[이미지: 내부]',
  '## 처음 오면 무엇부터 하나',
  '유산소 15분으로 몸을 데우고 자극이 어디에 오는지 확인하는 순서로 시작합니다. 호흡은 내릴 때 마시고 올릴 때 내쉽니다.',
  '',
  '[이미지: 기구]',
  '## 시간이 없을 때',
  '30분만 있어도 방법은 있습니다. 하체 위주로 묶어 두 동작만 반복하면 충분합니다.',
  '',
  '[이미지: 상담]',
  '## 쌍용동 헬스장 이용 안내',
  '24시간 운영이라 교대근무자도 옵니다. 궁금한 점은 상담 때 물어보세요.',
  '',
  '[이미지: 외부]',
  '## 정리',
  '쌍용동 헬스장을 찾고 있다면 한 번 들러보세요. 자세와 호흡부터 잡아드립니다.',
].join('\n')
const EV_INPUT = {
  type: 'promo',
  title: '쌍용동 헬스장, 처음 오는 분들이 가장 많이 묶는 것 정리',
  body: EV_BODY,
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장'],
  tags: ['쌍용동헬스장', '천안헬스장'],
  legalName: 'MTO 피트니스 쌍용점',
}
const evPlain = checkPost(EV_INPUT)
ok(evPlain.evidenceNote.includes('모두 업계 통설 기준'), '근거를 안 넘기면 통설이라고 밝힌다')
ok(!evPlain.items.some((i) => i.evidence), '근거가 없으면 항목에 붙이지 않는다')

// 통설로 박혀 있던 두 항목의 비중을 실측에 맞춰 내려뒀다
const evChars = evPlain.items.find((i) => i.id === 'charCount')
const evImages = evPlain.items.find((i) => i.id === 'images')
ok(evChars.weight === 1, '분량 비중을 3 → 1 로 내렸다 (실측에서 순위와 반대로 갔다)', String(evChars.weight))
ok(evChars.target.includes('근거 약함'), '근거가 약하다고 화면에 적는다', evChars.target)
ok(evImages.weight === 1, '이미지 개수 비중도 1 로 내렸다 (실측 상관 0.00)', String(evImages.weight))
ok(evImages.target.includes('근거 약함'), '이미지도 근거가 약하다고 적는다')
ok(evImages.hint.includes('0.00'), '실측값을 그대로 보여준다')

// 근거를 넘기면 항목에 붙고 점수가 달라진다
const EV_POOLED = [
  { key: 'age', label: '최신성', advantage: 0.63, runs: 6, samples: 60, agree: 5, disagree: 0, note: '' },
  { key: 'chars', label: '본문 분량', advantage: -0.55, runs: 6, samples: 60, agree: 1, disagree: 4, note: '' },
  { key: 'images', label: '이미지 수', advantage: 0.0, runs: 6, samples: 60, agree: 1, disagree: 1, note: '' },
  { key: 'info', label: '정보 요소', advantage: 0.72, runs: 5, samples: 50, agree: 5, disagree: 0, note: '' },
  { key: 'keywordFront', label: '제목 키워드 위치', advantage: 0.3, runs: 4, samples: 38, agree: 1, disagree: 0, note: '' },
]
const evWired = checkPost({ ...EV_INPUT, evidence: EV_POOLED })
const wChars = evWired.items.find((i) => i.id === 'charCount')
ok(wChars.evidence.includes('관찰 6회 · 상위 글 60편'), '항목에 관찰 횟수를 적는다', wChars.evidence)
ok(wChars.evidenceVerdict === 'against', '거꾸로 나온 항목을 표시한다')
const wInfo = evWired.items.find((i) => i.id === 'info-substance')
ok(wInfo.evidenceVerdict === 'supported' && wInfo.weight === 5, '근거가 센 항목은 비중을 올린다', String(wInfo.weight))
ok(wInfo.evidence.includes('상위권이 실제로 이렇게 쓰고 있습니다'), '왜 올렸는지 말한다')
/*
 * 「제목 앞쪽에 메인 키워드」는 관찰 근거만 붙이고 비중은 건드리지 않는다.
 * 관찰이 재는 것은 제목 안 *위치*지만, 이 항목이 실제로 걸러내는 것은 제목에 키워드가
 * 아예 없는 글이다 — 그건 상관이 아니라 조건이다. 실측 219편에서 제목에 있는 글은
 * 77.3%가 상위 10에 들었고 없는 글은 22.6%였다. 그래서 관찰이 「무관」으로 나와도
 * 가중치 5를 유지한다.
 */
const wTitle = evWired.items.find((i) => i.id === 'titleKeyword')
ok(wTitle.evidenceVerdict === 'flat', '약한 신호를 「갈린다」고 하지 않는다', wTitle.evidenceVerdict)
ok(wTitle.evidence.includes('뚜렷하게 같이 움직이지 않았습니다'), '없는 갈등을 만들지 않는다', wTitle.evidence)
ok(wTitle.weight === 5, '제목 키워드 항목은 근거가 약해도 비중을 내리지 않는다', String(wTitle.weight))

/*
 * 「방향이 갈립니다」는 양쪽이 실제로 부딪힐 때만 쓴다.
 * 프로덕션에서 「유리 0회 · 거꾸로 1회」에 갈린다고 붙어 있던 것을 고쳤다 —
 * 나머지 5회가 판정 불가였을 뿐 갈린 게 아니다.
 */
const evOneSided = evOne('images', { advantage: -0.18, runs: 6, agree: 0, disagree: 1 })
ok(evOneSided.get('images').verdict === 'flat', '한쪽만 약하게 나온 것은 갈린 게 아니다', evOneSided.get('images').verdict)
ok(!evOneSided.get('images').line.includes('방향이 갈립니다'), '없는 갈등을 만들지 않는다', evOneSided.get('images').line)
ok(evOneSided.get('images').line.includes('거꾸로 1회'), '거꾸로 나온 횟수는 그대로 적는다')
const evReal = evOne('images', { advantage: 0.5, runs: 6, agree: 2, disagree: 3 })
ok(evReal.get('images').verdict === 'mixed', '양쪽이 다 있으면 갈린 것')

// mixed 와 flat 은 다른 상황이다 — 같은 말로 덮지 않는다
const evFlat = evOne('images', { advantage: 0.12, runs: 5, agree: 1, disagree: 0 })
ok(evFlat.get('images').verdict === 'flat', '거꾸로가 없으면 flat')
ok(!evFlat.get('images').line.includes('방향이 갈립니다'), 'flat 에는 갈린다고 쓰지 않는다')
ok(evFlat.get('images').weight === MIN_WEIGHT, 'flat 도 비중은 내린다')
ok(evWired.evidenceNote.includes('관찰과 맞춰봤습니다'), '요약 줄에 근거를 밝힌다', evWired.evidenceNote)

// 목표 수치는 자동으로 바뀌지 않는다 (상관을 규격으로 바꾸지 않는다)
ok(
  wChars.target === evChars.target,
  '관찰이 목표 수치를 갈아치우지는 않는다',
  `${evChars.target} vs ${wChars.target}`
)

// 근거가 붙은 항목이 점수를 흔드는 정도가 달라진다
ok(evWired.score !== evPlain.score || wInfo.weight !== 4, '관찰이 점수 계산에 실제로 들어간다')

// ─────────────────────────────────────────────────────────────
console.log('\n[54] 글의 목적에 따라 기준이 다르다 — 후기에 정보를 욱여넣지 않는다')

/*
 * 회원 질문: "후기 블로그에 정보를 욱여넣으면 이상하지 않을까?"
 * 실측도 같은 쪽이었다 — 경험 요소는 순위와 무관했고(-0.13) 4위 이하가 오히려 더
 * 많았다(4.8 vs 3.7). 2위였던 글은 경험 요소 0개인 순수 소개글이었다.
 * 그래서 후기의 정보 하한을 낮추고, 순위는 정보글·홍보글이 맡는다.
 */
ok(INFO_MIN_BY_TYPE.info === 5, '정보글은 정보가 주인공 (상위권 평균 5.2)')
/*
 * 홍보글 하한 4 → 5 (2026-08-06, 홍보 섞인 글 141편).
 * 3~4종류 1~3위 17% 는 1~2종류 18% 와 구분되지 않았고, 5종류를 넘겨야 40~43% 가 됐다.
 * 계단이 있는 자리에 기준선을 둔다.
 */
ok(INFO_MIN_BY_TYPE.promo === 5, '홍보글도 5종류 — 3~4종류로는 이득이 없었다 (17% vs 40~43%)')
ok(INFO_MIN_BY_TYPE.review === 2, '후기글은 들은 말을 옮기는 정도로 족하다')
ok(INFO_MIN_BY_TYPE.review > 0, '그래도 0 은 아니다 — 가져갈 게 하나도 없으면 안 된다')

// 같은 글이라도 유형에 따라 판정이 다르다
const TB_TEXT = '상담 때 제 자세를 봐주시면서 어디에 자극이 오는지 짚어주셨어요. 다녀왔습니다.'
const tbReview = contentBalance(TB_TEXT, 'review')
const tbInfo = contentBalance(TB_TEXT, 'info')
ok(tbReview.signals.info === 2, '자세·자극 두 종류', String(tbReview.signals.info))
ok(tbReview.level === 'good', '후기로는 통과')
ok(tbInfo.level === 'thin', '정보글로는 모자람 — 같은 글, 다른 목적')
ok(tbInfo.infoNote.includes('5종류 이상'), '정보글에는 5종류를 요구한다', tbInfo.infoNote)

// 후기에 「단락을 하나 더하세요」라고 하지 않는다 — 그러면 업체가 쓴 글이 된다
const tbThinRev = contentBalance('등록했어요. 좋았습니다.', 'review')
ok(tbThinRev.level === 'thin', '정보가 0~1종류면 후기도 모자람')
ok(!tbThinRev.infoNote.includes('단락을 하나 더하세요'), '후기에 정보 단락을 만들라고 하지 않는다')
ok(tbThinRev.infoNote.includes('정보 단락을 만들지 마세요'), '오히려 만들지 말라고 한다', tbThinRev.infoNote)
ok(tbThinRev.infoNote.includes('들은 말을 한 줄로'), '어떻게 채우는지 알려준다')

// 검수도 유형별로 다르게 본다
const TB_BODY = [
  '[이미지: 대표]',
  '쌍용동 헬스장을 알아보다 상담만 받아보러 다녀왔습니다. 후기 남깁니다.',
  '',
  '[이미지: 입구]',
  '## 등록만 하고 못 갈까 걱정했던 이야기',
  '작년에 다른 곳에 등록했다가 두 달 만에 끊었어요. 그게 계속 마음에 걸렸습니다.',
  '',
  '[이미지: 시설]',
  '[영상: 시설을 훑는 시선]',
  '## 가서 본 것과 상담 때 들은 말',
  '상담하시는 분이 제 자세를 보면서 어디에 자극이 와야 하는지 짚어주셨어요. 쌍용동 헬스장 중에 이렇게 봐주는 곳은 처음이었습니다.',
  '',
  '[이미지: 첫 운동]',
  '## 등록하기로 한 이유',
  '부담 없이 나올 수 있었던 게 컷어요. 아쉬운 점은 샤워실이 좀 좁다는 것 정도였습니다.',
  '',
  '[이미지: 안내물]',
  '## 제가 받은 혜택',
  '제가 등록할 때 마침 혜택이 있었어요. 쌍용동 24시 헬스장을 찾던 참이라 더 반가웠습니다.',
  '',
  '[이미지: 예약 화면]',
  '## 저는 이렇게 예약했어요',
  '전화로 시간만 말하고 갔습니다. 쌍용동 헬스장 고민 중이면 상담만 받아보셔도 됩니다.',
].join('\n')
const tbCheck = checkPost({
  type: 'review',
  title: '쌍용동 헬스장 상담만 받아본 솔직 후기, 등록까지 한 이유',
  body: TB_BODY,
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장'],
  tags: ['쌍용동헬스장', '천안헬스장'],
  sponsorship: 'own',
})
const tbItem = tbCheck.items.find((i) => i.id === 'info-substance')
ok(tbItem.label === '가서 알게 된 것', '후기에서는 항목 이름도 바뀐다', tbItem.label)
ok(tbItem.target.includes('신뢰를 만드는 글'), '이 글의 역할을 밝힌다', tbItem.target)
ok(tbItem.level === 'pass', '들은 말 한 줄로 통과한다', `${tbItem.value} / ${tbItem.target}`)
// 같은 본문을 정보글로 검수하면 걸린다
const tbAsInfo = checkPost({
  type: 'info',
  title: '쌍용동 헬스장 상담만 받아본 솔직 후기, 등록까지 한 이유',
  body: TB_BODY,
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장'],
  tags: ['쌍용동헬스장'],
})
ok(
  tbAsInfo.items.find((i) => i.id === 'info-substance').level !== 'pass',
  '같은 글을 정보글로 내면 정보가 모자란다'
)

// ─── 영상 자리 ───────────────────────────────────────────────
const tbParsed = parseBody(TB_BODY)
ok(tbParsed.videos.length === 1, '영상 표기를 센다', String(tbParsed.videos.length))
ok(tbParsed.videos[0] === '시설을 훑는 시선', '무엇을 찍을지도 담는다')
// 표기를 본문 글자로 세면 글은 그대로인데 분량이 늘어난 것처럼 보인다
ok(!tbParsed.prose.includes('[영상'), '영상 표기는 본문 글자수에서 뺀다')
ok(!tbParsed.prose.includes('[이미지'), '이미지 표기도 마찬가지')
// 영상이 소제목 위 이미지 배치 판정을 깨뜨리지 않아야 한다 (이미지→영상→소제목 순서)
ok(tbParsed.headingsWithImageAbove === 5, '이미지와 소제목 사이에 영상이 와도 배치는 유효', String(tbParsed.headingsWithImageAbove))

const tbVideo = tbCheck.items.find((i) => i.id === 'video')
ok(tbVideo && tbVideo.level === 'pass', '영상이 있으면 통과')
const tbNoVideo = checkPost({
  type: 'review',
  title: '쌍용동 헬스장 상담만 받아본 솔직 후기, 등록까지 한 이유',
  body: TB_BODY.replace('[영상: 시설을 훑는 시선]\n', ''),
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장'],
  tags: ['쌍용동헬스장'],
  sponsorship: 'own',
})
const tbNV = tbNoVideo.items.find((i) => i.id === 'video')
// 근거가 유리 2·거꾸로 0 뿐이라 발행을 막지는 않는다 — 촬영은 실제 부담이다
ok(tbNV.level === 'warn', '영상이 없으면 주의까지만 (수정필요 아님)', tbNV.level)
ok(tbNV.hint.includes('[영상:'), '어떻게 넣는지 알려준다')

// ─── 골격이 목적에 맞게 바뀌었나 ─────────────────────────────
const tbRevSkel = buildTemplate('review', {
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장', '쌍용동 PT'],
})
ok(tbRevSkel.includes('운동 정보를 설명하기 시작하면'), '후기에 정보를 욱여넣지 말라고 한다')
ok(tbRevSkel.includes('정보 단락을 만들지 않는다'), '정보 단락 금지')
ok(tbRevSkel.includes('상담 때 들은 말'), '대신 무엇을 쓰라고 알려준다')
// 후기 골격도 지시문과 같은 번호로 맞췄다 (2026-08-21) — 이벤트는 5단계다
ok(tbRevSkel.includes('5단계 이벤트 (180~220자)'), '이벤트 단락을 줄였다 (280~320 → 180~220)')
/*
 * **이벤트만 안 늘렸다.** 나머지 구간은 실측 최고 구간(1,700~2,200자)에 맞추느라 늘렸는데
 * 여기만 그대로다 — 방문자가 선착순·마감을 길게 나열하면 대가성 광고로 읽힌다.
 */
ok(tbRevSkel.includes('3단계 방문·상담 후기 (550~680자'), '몸통을 늘렸다 (450~550 → 550~680)')
ok(tbRevSkel.includes('1단계 후킹 (220~280자'), '후킹은 1단계다 (전에는 2단계 도입이었다)')
ok(tbRevSkel.includes('6단계 마무리 (200~250자'), '마지막은 6단계 마무리다 (전에는 7단계 CTA)')
ok(tbRevSkel.includes('한 대목만'), '혜택을 한 대목으로 모은다')
ok(tbRevSkel.includes('[영상:'), '후기에도 영상 자리')

const tbInfoSkel = buildTemplate('info', { mainKeyword: '다이어트 정체기 극복', subKeywords: ['정체기 식단'] })
ok(tbInfoSkel.includes('정보 요소 5종류 이상'), '정보글은 5종류를 목표로 준다')
ok(tbInfoSkel.includes('근력·부위·단백질'), '아래쪽에 더 많았던 말을 알려준다')
ok(tbInfoSkel.includes('자극이 어디에 오는지'), '갈린 말을 알려준다')
ok(tbInfoSkel.includes('[영상:'), '정보글에도 영상 자리')

// ─────────────────────────────────────────────────────────────
console.log('\n[55] 지점 간 유사문서 — 지점만 바꿔 같은 글을 올리는 것을 잡는다')
const { compareWithMine, MINE_CAVEAT } = require(`${OUT}/analysis/similarity.js`)

/*
 * 실측 재현 (2026-08-05). 홍보글 1편을 지점명·지역명·전화만 바꿔 4벌 만들고
 * compareOne 으로 재보니 90.4% 겹쳤고 876자가 연속으로 같았다. 그런데 경고는 0건이었다 —
 * adviseRotation 은 같은 지점만, compareWithTop 은 경쟁 글만 봤기 때문이다.
 */
const MO_BASE = [
  '퇴근이 밤 열한 시인데 헬스장은 열 시에 닫습니다. 쌍용동 헬스장을 찾다가 여기까지 오신 분이라면 시간 때문일 겁니다.',
  '등록은 했는데 왜 못 가게 되는지부터 이야기하겠습니다. 게으름 때문이 아니고 시간이 안 맞으면 의지는 셋째 주에 소진됩니다.',
  '출근 전 삼십 분이면 경사 오 도에 속도는 대화가 되는 정도로 십오 분. 숨이 차면 속도가 아니라 경사를 먼저 낮춥니다.',
  '스쿼트는 무게보다 앉는 깊이가 먼저입니다. 자극은 허벅지 앞이 아니라 엉덩이와 뒤쪽에 와야 정상입니다.',
  '호흡은 앉을 때 마시고 일어설 때 내쉽니다. 열 번씩 세 세트, 마지막 두 번이 버거운 무게가 지금 맞는 무게입니다.',
  '밤에 오시는 분들은 순서를 뒤집습니다. 근력을 먼저 하고 유산소는 십 분만 붙이는 편이 잠에 낫습니다.',
  '새벽에도 상주 인원을 두고 있습니다. 여성 회원이 많은 시간대는 데스크에서 따로 봅니다.',
].join(' ')
// 지점명·지역명만 바꾼 글
const MO_SWAPPED = MO_BASE.replace(/쌍용동/g, '용곡동')

const moPosts = [
  { id: 'other1', title: '용곡동 헬스장 24시간 안내', body: MO_SWAPPED, storeId: 'yonggok', storeName: '용곡점' },
]
const moCross = compareWithMine(MO_BASE, moPosts, 'ssangyong')
ok(moCross !== null, '내 글끼리 비교가 돌아간다')
ok(moCross.worst.overlap > 80, '지점명만 바꾼 글은 크게 겹친다', String(moCross.worst.overlap))
ok(moCross.worst.otherStore === true, '다른 지점 글임을 표시한다')
ok(moCross.needsWork, '고쳐야 한다고 판정한다')
ok(moCross.headline.includes('지점만 바꿔 같은 글'), '무슨 일인지 정확히 말한다', moCross.headline)
ok(moCross.headline.includes('검색 의도에 답하지 못'), '왜 문제인지도 말한다')

// 같은 지점 안에서 겹치면 다른 말을 한다 (자기잠식) — 처방이 다르다
const moSame = compareWithMine(MO_BASE, [{ ...moPosts[0], storeId: 'ssangyong', storeName: '쌍용점' }], 'ssangyong')
ok(moSame.worst.otherStore === false, '같은 지점이면 다른 지점으로 세지 않는다')
ok(moSame.headline.includes('자기잠식'), '같은 지점이면 자기잠식이라고 말한다', moSame.headline)
ok(!moSame.headline.includes('지점만 바꿔'), '같은 지점에 엉뚱한 말을 하지 않는다')

// 서로 다른 글은 통과해야 한다 (없는 문제를 만들면 경고를 아무도 안 본다)
const MO_DIFF = [
  '다이어트 정체기는 대개 넉 주쯤에 옵니다. 몸이 적응했다는 뜻이라 나쁜 신호가 아닙니다.',
  '식단을 더 줄이는 대신 단백질을 유지하고 유산소 시간을 바꿔보는 편을 권합니다.',
  '주 삼회 이상 같은 루틴을 반복했다면 종목을 두 개만 바꿔도 다시 반응이 옵니다.',
  '인바디는 같은 시간대에 재야 비교가 됩니다. 아침 공복에 재는 것을 기준으로 잡으세요.',
  '체지방이 그대로인데 허리가 줄었다면 그것도 변화입니다. 숫자 하나만 보지 않는 것이 중요합니다.',
  '잠을 여섯 시간 아래로 줄이면 식욕 조절이 먼저 무너집니다. 수면을 먼저 챙기는 편을 권합니다.',
  '물은 하루에 얼마를 마셨는지 세보는 것으로 시작합니다. 갈증을 느낀 뒤에 마시면 이미 늦습니다.',
].join(' ')
const moFar = compareWithMine(MO_DIFF, moPosts, 'ssangyong')
ok(moFar === null || moFar.worst.overlap < 10, '다른 내용은 겹침이 낮다', String(moFar?.worst.overlap))

// 자기 자신과 비교하지 않는다 / 짧은 글은 재지 않는다
ok(compareWithMine('짧은 글', moPosts, 'ssangyong') === null, '짧은 글은 판정하지 않는다')
ok(compareWithMine(MO_BASE, [], 'ssangyong') === null, '견줄 글이 없으면 null')

// 부분 수정으로는 안 내려간다는 사실을 회원에게 알려준다
ok(MINE_CAVEAT.includes('90.4%') && MINE_CAVEAT.includes('54.6%'), '실측 두 값을 그대로 적는다')
ok(MINE_CAVEAT.includes('부분 수정으로는'), '조금 고치면 된다는 오해를 먼저 깬다')

// ─────────────────────────────────────────────────────────────
console.log('\n[56] 「낫습니다」 오탐 — 의료 문맥일 때만 잡는다')
/*
 * 실전 검수에서 잡혔다. 「교정받고 가시는 편이 낫습니다」(= 더 좋다)가 의료 표현으로
 * 걸려 수정필요가 되고, fail 이라 점수 상한(79점)까지 맞았다.
 */
const fpOk = scanRisks('처음 오신 분들은 이 한 번으로 자세를 교정받고 가시는 편이 낫습니다.')
ok(!fpOk.some((r) => r.category.startsWith('C.')), '「편이 낫습니다」는 의료로 잡지 않는다', JSON.stringify(fpOk.map(r=>r.term)))
ok(!scanRisks('그냥 쉬는 게 낫습니다.').some((r) => r.category.startsWith('C.')), '「게 낫습니다」도 통과')
ok(!scanRisks('오전에 오시는 쪽이 낫습니다.').some((r) => r.category.startsWith('C.')), '「쪽이 낫습니다」도 통과')

// 진짜 의료 주장은 그대로 잡는다
const fpBad = scanRisks('무릎 통증이 낫습니다.')
ok(fpBad.some((r) => r.category.startsWith('C.') && r.level === 'fail'), '「통증이 낫습니다」는 잡는다')
ok(scanRisks('허리 디스크가 낫는다고 하십니다.').some((r) => r.category.startsWith('C.')), '「디스크가 낫는다」도 잡는다')
ok(scanRisks('치료해 드립니다').some((r) => r.category.startsWith('C.')), '「치료」는 그대로 잡는다')
ok(scanRisks('완치 사례가 있습니다').some((r) => r.category.startsWith('C.')), '「완치」도 그대로')

// ─────────────────────────────────────────────────────────────
console.log('\n[57] 홍보 상한도 목적에 따라 다르다')
/*
 * 홍보글 상한 4 → 6 (2026-08-06, 홍보 섞인 글 141편).
 *   1~2종류 1~3위 36% · 3종류 32% · 4종류 19% · 5종류 47% · 6종류 43% · 7종류 이상 14%
 * 6종류까지는 오르내리기만 하고 95% 구간이 전부 겹친다 — 상한이 필요한 지점은 7 하나다.
 * 정보글·후기글의 더 낮은 상한은 **순위 근거가 아니라 목적 근거다** (content.ts 주석).
 */
ok(PROMO_MAX_BY_TYPE.promo === 6, '홍보글은 6종류까지 — 순위 근거가 아니라 판단이다')
/*
 * info 2 → 4 (2026-08-10). 회원 요청으로 정보글 마지막 구간을 「문의 한 줄」에서
 * 「정보 8 : 홍보 2」로 늘렸다. 그 구간을 제대로 쓰면 상담·예약·전화·문의만으로 4종류다.
 * 상한을 2로 두면 지시문은 「넣어라」, 검수는 「줄여라」가 되어 서로 싸운다.
 * 대신 조이는 곳을 **개수에서 자리로** 옮겼다 (`info-promo-tail`).
 */
ok(PROMO_MAX_BY_TYPE.info === 4, '정보글은 4종류까지 — 마지막 구간에 홍보를 모으면 이만큼 된다')
/*
 * review 3 → 4 (2026-08-11). 회원이 후기글 **제목에도 홍보성**을 넣어달라고 했다.
 * 홍보 낱말은 제목+본문을 합쳐 세므로 제목 한 조각이 본문 예산을 깎는다 — 지시문과
 * 검수기가 싸우지 않게 **제목 몫으로 한 칸만** 올렸다 (본문 예산은 전과 같이 3).
 */
ok(PROMO_MAX_BY_TYPE.review === 4, '후기글은 4종류 — 그중 한 칸은 제목 몫이다')
ok(PROMO_MAX_BY_TYPE.review < PROMO_MAX_BY_TYPE.promo, '그래도 홍보글보다는 조인다 (대가성 티가 저품질 위험)')
ok(INFO_RELEASE === 5, '정보 5종류 이상이면 홍보를 더 세도 순위가 안 내려갔다')
/*
 * 회원이 반박한 지점을 그대로 고정한다 — "이벤트 문구는 줄이지 않아."
 * 정보 5종류 + 홍보 4종류 이상 = 1~3위 39%, 홍보 1~3종류 = 43%. 구간이 겹친다.
 */
const KEEP_EVENT = '상담 예약 이벤트 할인 혜택 문의 주세요. 자세와 호흡, 세트와 무게, 초보 회복까지.'
const keepEvent = contentBalance(KEEP_EVENT, 'promo')
ok(keepEvent.signals.promo >= 4, '홍보 4종류 이상', String(keepEvent.signals.promo))
ok(keepEvent.signals.info >= 5, '정보 5종류 이상', String(keepEvent.signals.info))
ok(keepEvent.level === 'good', '이벤트 문구를 다 넣어도 통과한다 (실측 39% vs 43%)', keepEvent.level)
const PM_TEXT = '상담은 전화로 받습니다. 신규 등록 혜택이 있습니다.'
ok(countSignals(PM_TEXT).promo === 4, '상담·전화·신규·혜택 = 4종류', String(countSignals(PM_TEXT).promo))
ok(contentBalance(PM_TEXT, 'promo').level !== 'pushy', '홍보글에서는 통과한다')
// 4종류는 정보글 상한과 같아서 홍보로는 안 걸린다 — 이 예문은 정보가 0종류라 그쪽만 걸린다
const pmInfo = contentBalance(PM_TEXT, 'info')
ok(pmInfo.level === 'thin', '정보글에서 홍보 4종류는 상한 안 (정보 부족만 걸린다)', pmInfo.level)
const pmInfo5 = contentBalance(PM_TEXT + ' 선착순 마감입니다.', 'info')
ok(pmInfo5.level === 'both', '5종류가 되면 홍보도 함께 걸린다', pmInfo5.level)
ok(pmInfo5.promoNote.includes('상한은 4종류'), '유형 상한을 밝힌다')

// ─────────────────────────────────────────────────────────────
console.log('\n[58] 맞춤법 검사 — 0건과 「못 읽음」을 섞지 않는다')
const { parsePassportKey, parseSpellResult, chunkForSpell, spellHeadline, dropOurWords, GYM_WORDS, CHUNK_MAX } =
  require(`${OUT}/naver/speller.js`)

ok(
  parsePassportKey('<a href="/SpellerProxy?passportKey=e440aa75760f04db35d65dafcda62bc4">') ===
    'e440aa75760f04db35d65dafcda62bc4',
  '검색 페이지에서 키를 뽑는다'
)
ok(parsePassportKey('<html>키 없음</html>') === null, '키가 없으면 null')

// 실제 응답 모양 그대로 (2026-08-05 측정)
const SP_REAL = JSON.stringify({
  message: {
    result: {
      errata_count: 2,
      origin_html:
        "오늘 날씨가 <span class='result_underline'>조으네요</span> <span class='result_underline'>밥먹었어요</span>",
      html: "오늘 날씨가 <em class='red_text'>좋네요</em> <em class='green_text'>밥 먹었어요</em>",
    },
  },
})
const spRes = parseSpellResult(SP_REAL)
ok(spRes.count === 2 && spRes.fixes.length === 2, '교정 2건을 읽는다')
ok(spRes.fixes[0].before === '조으네요' && spRes.fixes[0].after === '좋네요', '원문과 제안을 짝짓는다')
ok(spRes.fixes[0].kind === '맞춤법', '빨간색은 맞춤법')
ok(spRes.fixes[1].kind === '띄어쓰기', '초록색은 띄어쓰기')

// 막혔을 때 — 500 HTML 이 온다. 0건으로 읽으면 거짓이 된다
ok(parseSpellResult('<html><title>500</title></html>') === null, '500 응답은 null (0건이 아니다)')
ok(parseSpellResult(JSON.stringify({ message: { error: '유효한 키가 아닙니다.' } })) === null, '키 오류도 null')

// 문장 경계에서 자른다 — 중간에서 끊으면 없는 오류가 생긴다
const spChunks = chunkForSpell('가. '.repeat(10) + '나'.repeat(500), 60)
ok(spChunks.every((c) => c.length <= 60 || !c.includes(' ')), '상한을 넘기지 않거나 한 문장이다')
ok(chunkForSpell('짧은 문장입니다.')[0] === '짧은 문장입니다.', '짧으면 그대로 한 덩어리')
ok(chunkForSpell('').length === 0, '빈 글은 덩어리가 없다')
ok(CHUNK_MAX > 100, '덩어리 상한이 있다')

// 못 읽은 것을 숨기지 않는다
ok(
  spellHeadline([], 0, 3).includes('맞춤법이 깨끗하다는 뜻이 아닙니다'),
  '전부 실패면 깨끗한 게 아니라고 못 박는다',
  spellHeadline([], 0, 3)
)
ok(spellHeadline([], 5, 0).includes('교정할 곳이 없습니다'), '다 읽고 0건이면 그렇게 말한다')
const spPartial = spellHeadline([{ before: 'a', after: 'b', kind: '맞춤법' }], 3, 2)
ok(spPartial.includes('2덩어리는'), '일부만 읽었으면 몇 개를 못 읽었는지 말한다', spPartial)
ok(spPartial.includes('눈으로 한 번 보세요'), '그럼 어떻게 하라고 알려준다')
ok(spellHeadline([{ before:'a', after:'b', kind:'맞춤법' },{ before:'c', after:'d', kind:'띄어쓰기' }], 2, 0).includes('맞춤법 1건 · 띄어쓰기 1건'), '종류별로 센다')

/*
 * ─── 쓸 수 없는 제안 걸러내기 (2026-08-10) ─────────────────────
 *
 * 회원 지적: "맞춤법 검사를 했는데 오히려 제대로 안 되는 것도 있어. 3초쯤 / 5시~7시쯤 /
 * 그릭요구르트 등 맞춤법, 띄어쓰기가 잘 될 수 있게 해줘."
 * 실제 화면에 원문과 제안이 똑같은 줄, 엔티티가 안 풀린 줄, 따르면 키워드가 깨지는 줄이 있었다.
 */
// ① 원문과 제안이 같으면 버린다 — 화면에 띄우면 「뭘 고치라는 거지」가 된다
const SP_NOOP = JSON.stringify({
  message: {
    result: {
      errata_count: 2,
      origin_html: "운동은 <span class='result_underline'>5시~7시쯤에</span> 하고 <span class='result_underline'>조으네요</span>",
      html: "운동은 <em class='violet_text'>5시~7시쯤에</em> 하고 <em class='red_text'>좋네요</em>",
    },
  },
})
const spNoop = parseSpellResult(SP_NOOP)
ok(spNoop.fixes.length === 1, `원문과 같은 제안을 버린다 — ${spNoop.fixes.length}건 남음`)
ok(spNoop.fixes[0].before === '조으네요', '멀쩡한 제안은 남는다')
ok(spNoop.skipped === 1, '버린 개수를 돌려준다 (조용히 지우지 않는다)')

// 띄어쓰기 교정은 공백만 다르다 — 공백을 지워서 비교하면 이게 전부 버려진다
const spSpace = parseSpellResult(JSON.stringify({
  message: { result: { errata_count: 1, origin_html: "<span class='result_underline'>밥먹었어요</span>", html: "<em class='green_text'>밥 먹었어요</em>" } },
}))
ok(spSpace.fixes.length === 1 && spSpace.skipped === 0, '공백만 다른 띄어쓰기 제안은 버리지 않는다')

// ② HTML 엔티티를 푼다 — 따옴표가 든 문장은 우리 글에 흔하다 (상담 대화·리뷰 인용)
const spEnt = parseSpellResult(JSON.stringify({
  message: { result: { errata_count: 1, origin_html: "<span class='result_underline'>무너진다&quot;</span>", html: "<em class='red_text'>무너진다&quot;라는</em>" } },
}))
ok(spEnt.fixes[0].before === '무너진다"', `엔티티를 푼다 — ${spEnt.fixes[0].before}`)
ok(spEnt.fixes[0].after === '무너진다"라는', '제안 쪽도 푼다')
ok(!spEnt.fixes[0].after.includes('&quot;'), '화면에 &quot; 가 안 보인다')

// ③ 짝이 안 맞으면 버린다 — 어느 낱말 얘긴지 알 수 없다
const spUnpaired = parseSpellResult(JSON.stringify({
  message: { result: { errata_count: 2, origin_html: "<span class='result_underline'>조으네요</span>", html: "<em class='red_text'>좋네요</em> <em class='green_text'>밥 먹었어요</em>" } },
}))
ok(spUnpaired.fixes.length === 1 && spUnpaired.skipped === 1, '원문이 없는 제안은 버린다')

// ④ 우리 낱말은 뺀다 — 특히 키워드는 붙여 써야 검색에 걸린다
const SP_FIXES = [
  { before: '쌍용동PT까지', after: '쌍용동 PT까지', kind: '띄어쓰기' },
  { before: '랫풀다운을', after: '랫 풀다운을', kind: '띄어쓰기' },
  { before: '조으네요', after: '좋네요', kind: '맞춤법' },
]
const dropped = dropOurWords(SP_FIXES, ['쌍용동PT', 'MTO 피트니스 쌍용점'])
ok(dropped.kept.length === 1 && dropped.kept[0].before === '조으네요', `우리 낱말 제안을 뺀다 — ${dropped.kept.length}건 남음`)
ok(dropped.ours === 2, '뺀 개수를 돌려준다')
ok(GYM_WORDS.includes('랫풀다운'), '기구 이름 목록에 랫풀다운이 있다')
// 두 글자 미만은 목록에 넣지 않는다 — 너무 흔해서 멀쩡한 제안까지 지운다
ok(dropOurWords([{ before: '조으네요', after: '좋네요', kind: '맞춤법' }], ['조']).kept.length === 1, '한 글자는 무시 목록에 안 넣는다')
ok(dropOurWords(SP_FIXES, []).kept.length === 2, '키워드를 안 넘기면 기구 이름만 빠진다')

// 버린 것을 머리말에서 말한다 — 조용히 지우면 「검사기가 놓쳤다」로 읽힌다
const spDropHead = spellHeadline([{ before: 'a', after: 'b', kind: '맞춤법' }], 3, 0, 2, 1)
ok(spDropHead.includes('원문과 같거나 짝이 안 맞은 제안 2건'), '버린 이유를 밝힌다', spDropHead)
ok(spDropHead.includes('우리 낱말'), '우리 낱말로 뺀 것도 밝힌다')
ok(!spellHeadline([{ before: 'a', after: 'b', kind: '맞춤법' }], 3, 0).includes('빼고 보여줍니다'), '버린 게 없으면 그 말을 안 한다')
ok(spellHeadline([], 5, 0, 3, 0).includes('교정할 곳이 없습니다'), '0건일 때도 버린 것을 말한다')

// ─────────────────────────────────────────────────────────────
console.log('\n[59] 제목 유형 — 전국 판에서 통하는 방식을 우리 판에서 재본다')
const { titleShape, isQuestionTitle, shapeDistribution, titleAdvice, shapeCompareLine, TITLE_SHAPE_LABEL } =
  require(`${OUT}/analysis/title.js`)

/*
 * 실측 제목 (2026-08-05 프로덕션).
 * 전국 「다이어트 정체기」 상위 8편 중 7편이 질문형, 우리 판 「쌍용동 헬스장」은 0편이었다.
 */
const TS_REF = [
  '다이어트 정체기 극복! 치팅데이 주기와 실패 없는 탄수화물 리피딩 방법',
  '다이어트 정체기 극복 | 원인과 해결 방법!',
  '열심히 하는데 왜 안 빠질까? 다이어트 정체기 원인과 과학적으로 탈출하는 확실한',
  '다이어트 정체기 왜 올까? 원인 분석과 극복 방법과 팁',
  '치팅데이 후 2kg 증가? 다이어트 정체기가 아닌 과학적 이유',
  '여름인데 살이 안 빠진다면? 다이어트 정체기 때 바꾼 3가지 습관',
  '먹는 양은 그대로인데살이 안 빠진다?다이어트 정체기 극복법',
  '다이어트 정체기 극복 방법, 한 달째 몸무게 그대로?',
]
const TS_LOCAL = [
  '천안 쌍용동 헬스장 미녀와야수짐 봉명점 1:1 PT 1주일 수업 후기 정상문 트',
  "[천안 쌍용동헬스장] 운동과 재미 두마리 토끼를 잡을수 있는 안현섭TR 1:1피",
  '신방동헬스장 고민 끝! 쌍용역 5분 거리 피앤피짐 소개',
  '천안 쌍용동 헬스장 [미녀와 야수짐] 추천 !',
  '천안 | 쌍용동 헬스장 추천!  PT 필라테스 3년째 다니고 있는 고위드짐 찐후기',
  "쌍용동헬스장 필라테스  솔직후기 '고위드짐'",
  '천안 쌍용동 PT 추천｜운동 초보도 부담 없는 쌍용동 헬스장 Gym Grow 후기',
  '천안 쌍용동 헬스장 미녀와야수짐 ! 샤워실 개인 부스에 커피 무료에 PT까지 진',
]

const tsRefQ = TS_REF.filter(isQuestionTitle).length
const tsLocQ = TS_LOCAL.filter(isQuestionTitle).length
// 물음표가 있는 것은 6편이다 (앞서 7편이라고 센 것은 과다 집계였다 — 1·2위는 물음표가 없다)
ok(tsRefQ === 6, '전국 판 실측 8편 중 6편을 질문형으로 읽는다', String(tsRefQ))
ok(tsLocQ === 0, '우리 판 실측 8편은 질문형 0편', String(tsLocQ))

ok(isQuestionTitle('왜 안 빠질까?'), '물음표를 알아본다')
ok(isQuestionTitle('초보도 괜찮을까'), '물음표 없는 의문 어미도 알아본다')
ok(!isQuestionTitle('쌍용동 헬스장 추천!'), '느낌표는 질문이 아니다')

ok(titleShape('다이어트 정체기 왜 올까? 원인 분석') === 'question', '질문형')
ok(titleShape('처음 3주에 바꾼 2가지 습관') === 'listicle', '숫자형')
// 단위는 개수가 아니다 — 「1주일 수업 후기」가 숫자형으로 잡혀 분포가 틀렸던 자리
ok(titleShape('1:1 PT 1주일 수업 후기') === 'review', '「1주일」은 숫자형이 아니다', titleShape('1:1 PT 1주일 수업 후기'))
ok(titleShape('쌍용역 5분 거리 피앤피짐 소개') === 'plain', '「5분 거리」도 숫자형이 아니다')
ok(titleShape('샤워실 개인 부스에 커피 무료') === 'plain', '「개인」의 개도 아니다')
ok(titleShape('쌍용동 헬스장 솔직후기') === 'review', '후기형')
ok(titleShape('쌍용동 헬스장 MTO 피트니스 쌍용점') === 'plain', '평서형')
// 겹치면 앞선 것으로 센다 (질문형이 가장 강한 신호다)
ok(titleShape('쌍용동 헬스장 추천! 3가지 이유는 뭘까?') === 'question', '겹치면 질문형이 먼저')
ok(TITLE_SHAPE_LABEL.question === '질문형', '사람이 읽는 이름을 준다')

const tsDist = shapeDistribution(TS_LOCAL)
ok(tsDist.find((d) => d.shape === 'question').count === 0, '분포에서도 질문형 0')
ok(tsDist.find((d) => d.shape === 'review').count >= 5, '우리 판은 후기형이 대부분')
ok(tsDist.reduce((n, d) => n + d.count, 0) === TS_LOCAL.length, '분포 합계가 전체와 같다')
ok(shapeDistribution([]).every((d) => d.share === 0), '빈 목록은 0%')

// 조언은 「바꿔라」로 단정하지 않는다 — 판이 다르면 답도 다를 수 있다
ok(titleAdvice('쌍용동 헬스장 추천!').includes('눈에 띄지 않습니다'), '후기형에 왜 약한지 말한다')
ok(titleAdvice('쌍용동 헬스장 추천!').includes('궁금증'), '무엇을 얹으라고 알려준다')
ok(titleAdvice('왜 안 빠질까?').includes('6편'), '질문형에는 실측 근거를 붙인다')
ok(titleAdvice('쌍용동 헬스장 MTO 피트니스').includes('클릭할 이유가 제목에 없습니다'), '평서형에 문제를 짚는다')

const tsCmp = shapeCompareLine(TS_LOCAL, TS_REF)
ok(tsCmp.includes('우리 판 0/8편') && tsCmp.includes('참고 판 6/8편'), '두 판을 나란히 보여준다', tsCmp)
ok(tsCmp.includes('판마다 규칙이 달랐으므로'), '전국을 그대로 따르라고 하지 않는다')
ok(shapeCompareLine([], TS_REF) === null, '한쪽이 비면 비교하지 않는다')

// 검수 항목으로 들어갔는지
const tsCheck = (title) =>
  checkPost({ type:'promo', title, body:'[이미지: 대표]\n본문입니다.', mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
    .items.find((i) => i.id === 'titleShape')
ok(tsCheck('쌍용동 헬스장, 퇴근 늦어도 갈 수 있을까?').level === 'pass', '질문형 제목은 통과')
ok(tsCheck('쌍용동 헬스장 솔직후기').level === 'pass', '후기형도 통과 (우리 판 기본형이다)')
ok(tsCheck('쌍용동 헬스장 MTO 피트니스 쌍용점').level === 'warn', '평서형만 주의를 낸다')
ok(tsCheck('쌍용동 헬스장 MTO 피트니스 쌍용점').hint.includes('클릭할 이유'), '왜 주의인지 알려준다')

// 골격·AI 지시문에도 들어갔는지
const tsSkel = buildTemplate('promo', { mainKeyword: '쌍용동 헬스장', subKeywords: [] })
ok(tsSkel.includes('앞 7자 안에 두고'), '골격이 제목 규칙을 알려준다')
ok(tsSkel.includes('8편 중 6편이 질문형'), '실측 근거를 붙인다')
ok(tsSkel.includes('추천!」 (X)'), '나쁜 예와 좋은 예를 같이 준다')
ok(stripGuides(tsSkel).includes('[이미지'), '제목 안내는 복사 본문에서 지워진다')
ok(!stripGuides(tsSkel).includes('앞 7자 안에 두고'), '안내가 본문에 남지 않는다')
/*
 * **AI 지시문에서는 질문형을 홍보글에 시키지 않는다** (2026-08-18).
 *
 * 회원이 나온 제목을 보여줬다 — 「쌍용동 PT 지금 받아야 하는 이유, 시간 없는 분도 될까요?
 * 45,000원 안내」(45자). 요구를 따로따로 주면 모델은 각 요구를 한 절로 만들어 이어 붙인다.
 * 게다가 질문형 근거는 **전국 정보 키워드**에서 나왔고 우리 지역 키워드 상위 8편은 0편이었다 —
 * 홍보글·후기글은 늘 지역 키워드를 쓰므로, 측정이 「없다」고 한 자리에 규칙을 강요하고 있었다.
 *
 * 골격(buildTemplate)은 사람이 읽는 안내라 근거를 그대로 남긴다. 사람은 절을 이어 붙이지 않는다.
 */
{
  const spPromo = buildSystemPrompt('promo')
  ok(spPromo.includes('한 문장으로 읽혀야 한다'), '홍보글 제목은 한 문장으로 쓰라고 한다')
  ok(spPromo.includes('40자를 넘기지 않는다'), '상한을 이유와 함께 말한다')
  ok(!spPromo.includes('제목 뒤쪽에 **독자가 실제로 하는 질문**을 하나 얹는다'), '홍보글에 질문형을 시키지 않는다')
  ok(buildSystemPrompt('info').includes('독자가 실제로 하는 질문'), '정보글에는 질문형을 계속 권한다')
  // 근거는 실측 수치로 남긴다 (물음표가 1~3위에서 더 적었다는 것)
  ok(spPromo.includes('물음표로 끝나는 제목은 1~3위 9%'), '왜 안 시키는지 실측으로 남긴다')
  ok(spPromo.includes('숫자를 하나 넣어라'), '상위권에 더 많던 것을 시킨다 (숫자 58% 대 48%)')
  ok(spPromo.includes('0편'), '「가격·비용·얼마」가 1~3위에 없었다는 사실을 남긴다')
  ok(spPromo.includes('선택 기준'), '궁금증을 만드는 방법을 실측 형태로 준다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[60] 판을 섞지 않는다 — 우리 판과 참고 판을 따로 모은다')
const { splitByArena, ARENA_LABEL } = require(`${OUT}/analysis/factors.js`)

/*
 * 섞으면 숫자가 망가진다. 실측(2026-08-05 프로덕션):
 *              최신성    홍보 요소
 *   우리 판     +0.63     -0.18
 *   전국 판     +0.04     **+0.63**
 * 한 통에 모으면 둘 다 흐려진다.
 */
const AR_LOCAL = buildObservation('쌍용동 헬스장', '2026-08-05', REAL_SAMPLES)
const AR_REF = { ...buildObservation('다이어트 정체기', '2026-08-05', REAL_SAMPLES), arena: 'reference' }
const arSplit = splitByArena([AR_LOCAL, AR_REF])
ok(arSplit.local.length === 1 && arSplit.reference.length === 1, '판별로 나눈다')
ok(arSplit.local[0].keyword === '쌍용동 헬스장', '지역 키워드는 우리 판')
// 예전 기록에는 arena 가 없다 — 전부 지역 키워드였으므로 local 로 읽는다
ok(splitByArena([AR_LOCAL]).local.length === 1, 'arena 가 없으면 우리 판으로 읽는다')
ok(splitByArena([AR_LOCAL]).reference.length === 0, '없는 것을 참고 판으로 세지 않는다')
ok(ARENA_LABEL.reference.includes('참고'), '이름에 참고라고 박아둔다')
// 섞였을 때와 나눴을 때가 다르다는 것을 확인 (섞으면 흐려진다)
const arMixedPool = poolFactors([AR_LOCAL, AR_REF])
const arLocalPool = poolFactors(arSplit.local)
ok(
  arMixedPool.find((p) => p.key === 'age').runs === 2 &&
    arLocalPool.find((p) => p.key === 'age').runs === 1,
  '나눠 모으면 우리 판 관찰만 센다'
)

// ─────────────────────────────────────────────────────────────
console.log('\n[61] 홍보글 기준 재조정 — 서로 부딪히던 숫자를 맞췄다')

/*
 * ① 「메인 5~7회」와 「밀도 2%」가 부딪혔다.
 *   밀도 = 키워드 글자수 × 본문 등장 횟수 ÷ 본문 글자수 이므로 키워드가 길면 못 쓴다.
 *   전에는 이 상황에서 「메인 미달」과 「밀도 초과」가 동시에 떴다 — 둘을 같이 만족시킬 수
 *   없는 조합인데 회원은 자기가 잘못 쓴 줄 알았다.
 */
const rk = (keyword, charCount, inTitle = 1) =>
  reachableKeywordRange({ keyword, charCount, densityMax: 2, mainMin: 5, mainMax: 7, inTitle })

const rk7at1750 = rk('쌍용동 헬스장', 1750)
ok(rk7at1750.proseCap === 5, '6자 키워드 1,750자면 본문 5회까지', String(rk7at1750.proseCap))
ok(rk7at1750.max === 6, '제목 1회를 더해 6회가 상한', String(rk7at1750.max))
ok(rk7at1750.tight, '상한 7회에 못 미치므로 좁아졌다고 표시')
ok(rk7at1750.min === 5, '하한 5회는 도달 가능하므로 그대로')

const rk7at2100 = rk('쌍용동 헬스장', 2100)
ok(rk7at2100.max === 7 && !rk7at2100.tight, '2,100자면 상한 7회까지 도달 가능')

// 긴 키워드는 하한조차 못 채운다 — 그럴 때 하한도 내린다 (못 하는 것을 요구하지 않는다)
const rkLong = rk('쌍용동 24시 헬스장', 1750)
ok(rkLong.proseCap === 3, '9자 키워드 1,750자면 본문 3회까지', String(rkLong.proseCap))
ok(rkLong.max === 4 && rkLong.min === 4, '하한 5회가 불가능하므로 하한도 4로 내린다', `${rkLong.min}~${rkLong.max}`)

// 키워드가 없거나 본문이 비면 계산하지 않는다
ok(rk('', 2000).max === 7 && !rk('', 2000).tight, '키워드가 없으면 원래 범위를 그대로')
ok(rk('쌍용동 헬스장', 0).max === 7, '본문이 비면 원래 범위를 그대로')

// 검수에 실제로 반영됐는지 — 좁아진 이유를 말해준다
const RK_BODY = ['[이미지: 대표]', '가'.repeat(900), '', '[이미지: 2]', '## 소제목', '나'.repeat(880)].join('\n')
const rkCheck = checkPost({
  type: 'promo',
  title: '쌍용동 헬스장, 퇴근 늦어도 갈 수 있을까?',
  body: RK_BODY,
  mainKeyword: '쌍용동 헬스장',
  subKeywords: [],
  tags: [],
  legalName: 'MTO 피트니스 쌍용점',
})
const rkItem = rkCheck.items.find((i) => i.id === 'mainCount')
ok(rkItem.target.includes('5~'), '도달 가능한 범위를 목표로 준다', rkItem.target)
// 긴 키워드는 밀도 때문에 상한이 좁아진다 — 그 사정을 목표에 적는다
const rkTight = checkPost({
  type: 'promo',
  title: '쌍용동 24시 헬스장, 퇴근 늦어도 갈 수 있을까?',
  body: RK_BODY,
  mainKeyword: '쌍용동 24시 헬스장',
  subKeywords: [],
  tags: [],
  legalName: 'MTO 피트니스 쌍용점',
})
const rkTightItem = rkTight.items.find((i) => i.id === 'mainCount')
ok(rkTightItem.target.includes('불가'), '좁아진 사정을 목표에 적는다', rkTightItem.target)
const rkDensity = rkCheck.items.find((i) => i.id === 'density')
ok(rkDensity.level === 'pass', '밀도는 통과 상태 (본문에 키워드가 없다)')

/*
 * ② 골격 단락 예산과 통과 분량이 안 맞았다.
 *   예전: 단락 합계 1,710~2,040자 vs 통과 1,900~2,100자
 *        → 다 중간값으로 쓰면 1,875자로 미달, 상위 42% 구간으로만 써야 통과
 */
const PROMO_SECTIONS = [
  ['후킹', 200, 250],
  ['공감', 280, 330],
  ['해결', 620, 720],
  ['신뢰', 250, 300],
  ['이벤트', 220, 260],
  ['CTA', 180, 220],
]
const secLo = PROMO_SECTIONS.reduce((n, s) => n + s[1], 0)
const secHi = PROMO_SECTIONS.reduce((n, s) => n + s[2], 0)
const secMid = Math.round((secLo + secHi) / 2)
ok(secLo === 1750 && secHi === 2080, '새 단락 예산 합계 1,750~2,080', `${secLo}~${secHi}`)
ok(SPECS.promo.charMin === 1750, '통과 하한을 단락 예산 하한과 맞췄다', String(SPECS.promo.charMin))
ok(
  secMid >= SPECS.promo.charMin && secMid <= SPECS.promo.charMax,
  '단락을 다 중간값으로 써도 통과한다 (예전에는 미달이었다)',
  `중간 ${secMid} / 통과 ${SPECS.promo.charMin}~${SPECS.promo.charMax}`
)
ok(
  secLo >= SPECS.promo.charMin,
  '단락 예산 하한으로 써도 통과 구간 안이다',
  `${secLo} >= ${SPECS.promo.charMin}`
)
// 위쪽은 넉넉히 — 실측에서 분량은 순위와 무관했다
ok(SPECS.promo.charMax >= 2400, '상한은 넉넉하게 둔다', String(SPECS.promo.charMax))

/*
 * ③ 실측 방향대로 배분을 바꿨다 — 해결↑ 이벤트↓
 */
const rkSkel = buildTemplate('promo', {
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시 헬스장', '쌍용동 PT'],
})
ok(!rkSkel.includes('운동 정보 ('), '골격에 운동 정보 구간이 없다 (2026-08-21)')
ok(rkSkel.includes('시설 소개 (430~520자'), '그 자수가 시설 소개로 갔다')
ok(rkSkel.includes('신뢰 (400~480자'), '신뢰로도 갔다')
ok(rkSkel.includes('이벤트 본공개 (300~360자'), '골격의 이벤트도 늘렸다')
ok(rkSkel.includes('공감 (280~330자'), '공감도 늘렸다')
/*
 * 「줄인 자리다」를 뺐다 (2026-08-06). 홍보 종류 수는 순위와 무관했고, 회원이 그대로
 * 반박한 지점이다 — "이벤트 문구는 줄이지 않아." 자수 예산은 유지하되(전체 분량을 지켜야
 * 하므로) 「줄여라」는 말과 반증된 근거를 골격에서 지웠다.
 */
ok(!rkSkel.includes('줄인 자리다'), '이벤트를 줄이라고 하지 않는다')
ok(!rkSkel.includes('1~3위 평균 2.0종류'), '반증된 근거를 골격에 남기지 않는다')
ok(rkSkel.includes('늘린 자리다'), '이벤트가 늘어난 자리라고 적는다')
ok(rkSkel.includes('「상담」68%'), '상위권이 실제로 쓴 홍보 낱말을 근거로 준다')
ok(
  rkSkel.includes('정보 3~4종류는 1~3위 17%') && rkSkel.includes('5종류 이상'),
  '대신 정보 5종류를 요구한다 — 계단이 있던 쪽'
)
ok(!buildSystemPrompt('promo').includes('1~3위 평균 2.0종류'), 'AI 지시문에서도 반증된 근거를 지웠다')
ok(buildSystemPrompt('promo').includes('늘린 자리다'), 'AI 지시문에서 이벤트가 늘어난 자리라고 밝힌다')
ok(buildSystemPrompt('promo').includes('정보 5종류 이상'), 'AI 지시문이 정보 5종류를 요구한다')
/*
 * 「해결 620~720」 한 구간을 「운동 정보 300~380 + 시설 소개 300~380」으로 쪼갰다
 * (2026-08-07). 회원 지적: "정보성으로 포커스가 너무 치우쳐 있다. 정보성은 아주 살짝
 * 간단하게 소개하고 다음은 시설 소개랑 이벤트 소개로 가면 좋겠다."
 * 순위를 가른 것은 정보의 **종류 수**이고 분량이 아니어서, 종류를 유지하고 자수만 옮겼다.
 */
ok(!buildSystemPrompt('promo').includes('해결 620~720자'), '「해결」 한 덩어리를 없앴다')
/*
 * 2026-08-21 — 운동 정보 구간을 뺐다. 아래 두 줄은 그 구간을 지키던 검사이고, 지금은
 * **없다는 것**과 자수가 어디로 갔는지를 지킨다.
 */
ok(!buildSystemPrompt('promo').includes('운동 정보 300~380자'), '지시문에 운동 정보 구간이 없다')
ok(buildSystemPrompt('promo').includes('시설 소개 430~520자'), '시설 소개로 자수를 옮겼다')
ok(buildSystemPrompt('promo').includes('신뢰 400~480자'), '신뢰로도 자수를 옮겼다')
ok(buildSystemPrompt('promo').includes('종류 수가 신호이고 분량은 아니었다'), '분량이 아니라 종류라고 밝힌다')
ok(buildSystemPrompt('promo').includes('운동을 가르쳐서 채우는 것이 아니다'), '어디서 정보 종류를 채우는지 다시 적었다')
ok(!buildSystemPrompt('promo').includes('**시설 스펙을 나열하지 않는다.**'), '시설 소개 자체를 막지 않는다')
ok(buildSystemPrompt('promo').includes('10개 이상 몰아넣지 않는다'), '대신 상한만 남긴다 (밀도 10 이상 1~3위 0%)')
ok(buildSystemPrompt('promo').includes('이벤트 300~360자'), '이벤트도 늘렸다 (280~330 → 300~360)')

// ─────────────────────────────────────────────────────────────
console.log('\n[62] 키워드 횟수 — 실측으로 기준을 다시 잡았다')
const { countDistribution } = require(`${OUT}/analysis/factors.js`)

/*
 * 실측 (2026-08-06 프로덕션, 우리 지역 키워드 4개 상위 32편).
 *
 *   횟수 상관   쌍용동 +0.04 · 봉명동 -0.17 · 두정동 -0.39 · 성정동 +0.75
 *   1~3위 중간값 4.5회 / 4위 이하 3.5회  (차이 1회뿐)
 *   반례: 쌍용동 1위 17회(4.4%) · 봉명동 7위 12회(5.5%) · 두정동 1위 0회 · 쌍용동 2위 1회
 *
 * 방향이 키워드마다 정반대이므로 「많이 넣어야 오른다」는 근거가 없다.
 */
const KC_REAL = [
  { rank: 1, value: 17 }, { rank: 2, value: 1 }, { rank: 3, value: 4 },
  { rank: 4, value: 1 }, { rank: 5, value: 6 }, { rank: 6, value: 2 },
  { rank: 7, value: 2 }, { rank: 8, value: 5 },
]
const kcDist = countDistribution(KC_REAL)
ok(kcDist.topMedian === 4, '1~3위 중간값을 낸다 (17·1·4 → 4)', String(kcDist.topMedian))
// 이 픽스처(쌍용동 8편)의 4위 이하는 1·6·2·2·5 → 중간값 2. (32편 전체 합계로는 3.5였다)
ok(kcDist.restMedian === 2, '4위 이하 중간값도 따로', String(kcDist.restMedian))
ok(kcDist.topMax === 17, '상위권 최댓값도 담는다 — 반례를 숨기지 않는다')
ok(kcDist.n === 8, '값을 읽은 편수를 센다')
// 중간값을 쓰는 이유 — 평균은 17회 한 편에 끌려간다
const kcMean = KC_REAL.filter((x) => x.rank <= 3).reduce((n, x) => n + x.value, 0) / 3
ok(kcMean > 7 && kcDist.topMedian === 4, '평균(7.3)은 튀는 값에 끌려간다 — 그래서 중간값을 쓴다', String(Math.round(kcMean * 10) / 10))
// 못 읽은 글은 0 으로 세지 않는다
ok(countDistribution([{ rank: 1, value: null }, { rank: 2, value: 4 }]).n === 1, '못 읽은 글은 표본에서 뺀다')
ok(countDistribution([]).topMedian === null, '표본이 없으면 null (0 이라고 하지 않는다)')

/*
 * 하한은 5회로 둔다 — 「많이 넣어서 오르지는 않지만 5회가 위험하지도 않다」를 따로 재봤다.
 *   5회 이상 15편 → 1~3위 6편 · 평균 순위 4.3
 *   4회 이하 17편 → 1~3위 6편 · 평균 순위 4.6
 * 5회 이상이 오히려 평균 순위가 약간 좋았고, 5~6회 쓴 글에 1위(성정동 5회/1.3%)와
 * 2위(두정동 5회/1.9%)가 있었다.
 */
/*
 * 제목 항목이 횟수 항목보다 무겁다 — 실측 219편에서 걸리느냐를 가른 건 제목이었다
 * (제목 있음 77.3% / 없음 22.6%). 제목에 있으면 본문 0회도 61.5% 걸렸다.
 */
{
  const c = checkPost({ type:'promo', title:'쌍용동 헬스장 후기', body:'가'.repeat(1900), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  const t = c.items.find((i) => i.id === 'titleKeyword')
  const m = c.items.find((i) => i.id === 'mainCount')
  ok(t.weight === 5, '제목에 키워드 = 가중치 5 (가장 무겁다)', String(t.weight))
  ok(m.weight === 4, '메인 키워드 횟수 = 가중치 4 (제목보다 가볍다)', String(m.weight))
  ok(t.weight > m.weight, '제목이 횟수보다 무겁다', `${t.weight} > ${m.weight}`)
}

/*
 * 상호명은 순위 근거가 없다 — 실측 161편에서 상호명 있는 글(5.33위)과 없는 글(5.38위)의
 * 순위가 같았다. 하한 3회는 남기되 가중치는 밀도보다 가볍게 둔다.
 */
{
  const c = checkPost({ type:'promo', title:'쌍용동 헬스장 후기', body:'가'.repeat(1900), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[], legalName:'천안점' })
  const ln = c.items.find((i) => i.id === 'legalName')
  const ti = c.items.find((i) => i.id === 'titleKeyword')
  ok(ln.weight === 2, '상호명 = 가중치 2 (순위 근거가 없다)', String(ln.weight))
  ok(ln.weight < ti.weight, '상호명이 제목보다 가볍다', `${ln.weight} < ${ti.weight}`)
  ok(!ln.target.includes('플레이스'), '측정한 적 없는 「플레이스 재검색」을 근거로 대지 않는다', ln.target)
  ok(ln.target.includes('순위 항목이 아니라'), '순위 항목이 아니라고 밝힌다', ln.target)
}

ok(SPECS.promo.mainMin === 5, '홍보글 하한 5회 (안전성을 따로 확인했다)', String(SPECS.promo.mainMin))
ok(SPECS.promo.mainMax === 7, '상한은 7 — 실질 상한은 밀도가 정한다', String(SPECS.promo.mainMax))
// 겨냥할 값은 하한 5회다 (더 넣어서 오르지는 않으므로)
ok(SPECS.promo.mainTarget === 5, '메인 권장 횟수 5회', String(SPECS.promo.mainTarget))
ok(SPECS.promo.subTarget === 2, '함께 찾는 키워드 목표 2회', String(SPECS.promo.subTarget))
// 메인 5 + 서브 2개×2회 합산 밀도가 스터핑 구간(3%)에 안 닿는지
const combined = (chars) => Math.round(((4 * 6 + 2 * 2 * 5) / chars) * 10000) / 100
ok(combined(1915) < 3, '메인5+서브2×2 합산 밀도 안전 (1,915자)', `${combined(1915)}%`)
ok(combined(1750) < 3, '짧은 분량에서도 안전 (1,750자)', `${combined(1750)}%`)
// 5회를 쓸 때 밀도가 안전선 안인지 (제목 1 + 본문 4)
const kcSafe = (klen, chars) => Math.round(((4 * klen) / chars) * 10000) / 100
ok(kcSafe(6, 1750) < 2, '6자 키워드 1,750자에서 5회 → 밀도 2% 안', String(kcSafe(6, 1750)))
ok(kcSafe(8, 1750) < 2, '8자 키워드도 안전', String(kcSafe(8, 1750)))
ok(kcSafe(9, 1750) > 2, '9자 키워드 짧은 분량은 초과한다 — 그래서 하한을 자동으로 낮춘다', String(kcSafe(9, 1750)))
const kcLong = reachableKeywordRange({ keyword: '쌍용동 24시 헬스장', charCount: 1750, densityMax: 2, mainMin: 5, mainMax: 7, inTitle: 1 })
ok(kcLong.min === 4 && kcLong.tight, '긴 키워드는 하한 5회를 요구하지 않는다', `${kcLong.min}~${kcLong.max}`)
const kcCheck = checkPost({
  type: 'promo',
  title: '쌍용동 헬스장, 퇴근 늦어도 갈 수 있을까?',
  body: ['[이미지: 대표]', '쌍용동 헬스장을 찾고 있다면 시간 때문일 겁니다.', '', '[이미지: 2]', '## 소제목', '가'.repeat(1800), '쌍용동 헬스장 상담만 받아보셔도 됩니다.'].join('\n'),
  mainKeyword: '쌍용동 헬스장',
  subKeywords: [],
  tags: [],
  legalName: 'MTO 피트니스 쌍용점',
})
// 4회 = 주의(1회 미달) · 3회 이하 = 수정필요. 회원이 정한 하한 5회를 그대로 지킨다
ok(kcCheck.items.find((i) => i.id === 'mainCount').level === 'fail', '3회는 하한 5회에 2회 미달이라 수정필요', kcCheck.items.find((i) => i.id === 'mainCount').value)

// ─── 함께 쓰는 키워드 — 0회를 수정필요로 걸지 않는다 ───
/*
 * 실측에서 상위 3위권 12편 중 6편이 「○○동 PT」를 0회 썼다. 「천안 헬스장」도 대부분
 * 0회였다. 그런데 검수는 이걸 fail 로 걸어 점수 상한까지 내리고 있었다.
 */
const subCheck = (count) => {
  const body = ['[이미지: 대표]', '쌍용동 헬스장 이야기입니다.', '', '[이미지: 2]', '## 소제목',
    '가'.repeat(1800), Array(count).fill('쌍용동 PT 도 함께 봅니다.').join(' ')].join('\n')
  return checkPost({ type:'promo', title:'쌍용동 헬스장, 갈 수 있을까?', body,
    mainKeyword:'쌍용동 헬스장', subKeywords:['쌍용동 PT'], tags:[], legalName:'MTO 피트니스 쌍용점' })
    .items.find((i) => i.id === 'sub0')
}
const sub0 = subCheck(0)
ok(sub0.level === 'warn', '0회는 주의까지만 (수정필요 아님)', sub0.level)
ok(sub0.target.includes('2회'), '목표 2회를 적는다', sub0.target)
ok(sub0.target.includes('수정필요는 아닙니다'), '못 채워도 수정필요가 아니라고 알린다')
ok(sub0.hint.includes('억지 문장을 만들지는 마세요'), '억지로 넣지 말라고 한다')
// 1회는 목표에 1회 미달 → 주의 (수정필요는 아니다)
ok(subCheck(1).level === 'warn', '1회는 주의 (목표 2회에 1회 미달)')
ok(subCheck(1).hint.includes('1회 더'), '몇 회 더 넣으면 되는지 알려준다', subCheck(1).hint)
ok(subCheck(2).level === 'pass', '2회도 통과')
ok(subCheck(4).level === 'warn', '많으면 주의')
ok(subCheck(4).hint.includes('메인 키워드 자리를 잡아먹습니다'), '왜 줄이라는지 말한다')

// 밀도는 순위 규칙이 아니라 안전선이라고 밝힌다
const dnItem = kcCheck.items.find((i) => i.id === 'density')
ok(dnItem.target.includes('스터핑 안전선'), '밀도의 성격을 밝힌다', dnItem.target)

// ─────────────────────────────────────────────────────────────
console.log('\n[70] 상위노출 조사 판정 규칙 — 표본 오차를 발견으로 착각하지 않는다')
/*
 * 이 묶음이 지키는 것은 「기준을 언제 바꾸는가」다 (lib/analysis/study.ts).
 * 이 규칙이 느슨하면 앱의 모든 기준이 우연을 따라 움직인다 — 실제로 11편 표본으로 잡은
 * 기준 하나가 141편에서 뒤집혔고, 그게 이 도구를 만든 이유다.
 */
const { wilson, mergeRuns, boundaryScan, verdictFor, MIN_SIDE, MIN_SAMPLE } =
  require(`${OUT}/analysis/study.js`)

// ─── Wilson 구간 ───
const [w5lo, w5hi] = wilson(5, 10)
ok(w5lo < 0.3 && w5hi > 0.7, '10편 중 5편은 「50%」가 아니라 24~76% 다', `${(w5lo*100).toFixed(0)}~${(w5hi*100).toFixed(0)}%`)
const [w50lo, w50hi] = wilson(50, 100)
ok(w50hi - w50lo < w5hi - w5lo, '편수가 늘면 구간이 좁아진다')
ok(wilson(0, 8)[0] === 0, '0건이면 하한은 0')
ok(wilson(8, 8)[1] === 1, '전부 맞으면 상한은 1')
ok(wilson(0, 8)[1] > 0.2, '0/8 이어도 「0%」라고 단정하지 않는다', String(wilson(0, 8)[1]))
const [wz1, wz2] = wilson(0, 0)
ok(wz1 === 0 && wz2 === 1, '편수 0은 「모른다」(0~1)로 돌려준다')

// ─── 런 합치기 ───
const mkPost = (url, rank, extra = {}) => ({
  url, blogId: url.slice(-3), title: url, ranks: { '쌍용동 헬스장': rank },
  chars: 2000, images: 8, videos: 0, paras: 12, longestPara: 200, avgPara: 150,
  info: 6, promo: 3, experience: 2, infoFound: [], promoFound: [], topEnding: '~요',
  topEndingShare: 40, ...extra,
})
const mergeIn = [
  { date: '2026-08-01', keywords: ['쌍용동 헬스장'], top: 10, posts: [mkPost('a', 2), mkPost('b', 1), mkPost('c', 8)] },
  { date: '2026-08-08', keywords: ['쌍용동 헬스장'], top: 10, posts: [mkPost('a', 3), mkPost('b', 9), mkPost('d', 2)] },
]
const merged = mergeRuns(mergeIn)
const byUrl = Object.fromEntries(merged.map((m) => [m.url, m]))
ok(merged.length === 4, '네 글로 합쳐진다 (a·b·c·d)', String(merged.length))
ok(byUrl.a.runs === 2 && byUrl.c.runs === 1, '런에 몇 번 나왔는지 센다')
ok(byUrl.a.held === true, '두 런 다 3위 안이면 「유지」다')
ok(byUrl.b.held === false, '한 번 밀려나면 유지가 아니다 (1위 → 9위)')
ok(byUrl.d.held === false, '한 번만 나온 글은 유지라고 하지 않는다 — 아직 모른다')
ok(byUrl.c.held === false, '한 번 나온 하위권도 당연히 아니다')
ok(byUrl.a.best === 2.5, '순위는 런별 최고순위의 중간값', String(byUrl.a.best))
ok(byUrl.b.firstBest === 1 && byUrl.b.lastBest === 9, '처음과 마지막을 따로 남긴다 (내려간 글 찾기)')
// 측정값은 최근 런의 것 — 글이 그 사이 수정되었을 수 있다
const reEdited = mergeRuns([
  { date: '2026-08-01', keywords: ['k'], top: 10, posts: [mkPost('e', 2, { chars: 1000 })] },
  { date: '2026-08-08', keywords: ['k'], top: 10, posts: [mkPost('e', 2, { chars: 3000 })] },
])
ok(reEdited[0].chars === 3000, '측정값은 가장 최근 런의 것을 쓴다', String(reEdited[0].chars))
ok(reEdited[0].runs === 2, '그래도 이력은 둘 다 센다')

// ─── 경계 찾기 ───
const rowsFor = (spec) => spec.flatMap(([value, n, hits]) =>
  Array.from({ length: n }, (_, i) => ({ v: value, best: i < hits ? 2 : 8 })))
// 확실히 갈리는 자료: 5 이상은 40편 중 32편이 1~3위, 미만은 40편 중 4편
const clear = boundaryScan(rowsFor([[6, 40, 32], [3, 40, 4]]), (r) => r.v, { kind: 'min', candidates: [3, 5, 6] })
ok(clear.pick !== null, '구간이 갈리면 경계를 집는다')
ok(clear.pick.separated === true, '갈렸다고 표시한다')
ok(clear.pick.c === 5 || clear.pick.c === 6, '갈린 경계를 집는다', String(clear.pick.c))

// 우연 수준의 차이: 구간이 겹치면 아무 말도 하지 않는다 (이 도구의 핵심)
const noisy = boundaryScan(rowsFor([[6, 20, 8], [3, 20, 6]]), (r) => r.v, { kind: 'min', candidates: [5] })
ok(noisy.pick === null, '차이가 표본 오차 안이면 경계를 집지 않는다')
ok(noisy.rows[0].gap > 0, '차이 자체는 있었다 (그래도 집지 않는다)', noisy.rows[0].gap.toFixed(2))
ok(noisy.rows[0].separated === false, '겹쳤다고 표시한다')

// 한쪽이 MIN_SIDE 미만인 경계는 건너뛴다 — 4편으로 「40% 였다」를 말할 수 없다
const lopsided = boundaryScan(rowsFor([[6, 60, 30], [3, 4, 0]]), (r) => r.v, { kind: 'min', candidates: [5] })
ok(lopsided.rows[0].skip === true, `한쪽이 ${MIN_SIDE}편 미만이면 건너뛴다`)
ok(lopsided.pick === null, '건너뛴 경계는 집히지 않는다')

// 상한(max)은 방향이 반대다
const maxScan = boundaryScan(rowsFor([[3, 40, 32], [9, 40, 4]]), (r) => r.v, { kind: 'max', candidates: [5] })
ok(maxScan.pick !== null && maxScan.pick.goodRate > maxScan.pick.badRate, '상한에서는 값이 작은 쪽이 good')

// ─── 판정 ───
ok(verdictFor(5, clear, 10, 'min') === 'insufficient', `대상이 ${MIN_SAMPLE}편 미만이면 판정하지 않는다`)
ok(verdictFor(5, noisy, 80, 'min') === 'keep', '겹치면 유지')
ok(verdictFor(clear.pick.c, clear, 80, 'min') === 'confirmed', '데이터가 지금 값을 가리키면 확인')
/*
 * 여기가 이 규칙에서 가장 중요한 갈래다.
 *
 * 하한 항목에서 이 도구가 찾는 것은 「이 아래로 내려가면 확실히 불리한 지점」(절벽)이다.
 * 글자수 절벽이 1,200자에 있다고 해서 목표를 1,200자로 **내리라는** 뜻이 아니다 —
 * 우리 기준 1,750자는 절벽 위쪽, 안전한 자리다. 이 갈래가 없으면 도구가 앱을 나쁜 쪽으로
 * 끌고 간다 (실제로 첫 판에서 「제안: 1750 → 1200」이라고 출력했다).
 */
ok(verdictFor(1750, clear, 80, 'min') === 'stricter', '하한이 절벽보다 높으면 「유지」쪽이다 (내리라는 뜻이 아니다)')
ok(verdictFor(2, clear, 80, 'min') === 'change', '하한이 절벽보다 낮으면 고쳐야 한다')
ok(verdictFor(2, maxScan, 80, 'max') === 'stricter', '상한이 절벽보다 낮으면 안전한 쪽')
ok(verdictFor(9, maxScan, 80, 'max') === 'change', '상한이 절벽보다 높으면 고쳐야 한다')

// ─────────────────────────────────────────────────────────────
console.log('\n[71] 톤 — 순위 기준이 아니라 우리 톤 기준이라고 밝힌다')
/*
 * 회원 질문: "요즘 상위 블로그는 감정도 들어가고 친근한데 우리 글은 정제된 느낌이다.
 * 업체 화자니까 너무 가벼워도 안 되고 너무 무거워도 안 된다."
 *
 * 재봤더니 **톤은 순위와 관계가 없었다** (방문자 화자를 걸러낸 81편, 전부 |ρ| ≤ 0.22):
 *   느낌표 +0.13 · 이모지 -0.05 · 1인칭 -0.04 · 감정 낱말 -0.09 · 질문 -0.12
 * 그래서 이 항목은 가중치 2 이고, 목표 문구에 순위 기준이 아니라고 적는다.
 * 잡는 것은 양쪽 극단뿐이다 — 회사 공지문(센터 1인칭 0회)과 전단지(느낌표·이모지 남발).
 */
const toneBody = (extra) => ['[이미지: 대표]', '쌍용동 헬스장 이야기입니다.', '', '[이미지: 2]',
  '## 소제목', '자세와 호흡, 세트와 무게를 봅니다. ' + '가'.repeat(1700), extra].join('\n')
const toneCheck = (extra) => checkPost({ type:'promo', title:'쌍용동 헬스장, 갈 수 있을까?',
  body: toneBody(extra), mainKeyword:'쌍용동 헬스장', subKeywords:['쌍용동 PT'], tags:[],
  legalName:'MTO 피트니스 쌍용점' }).items.find((i) => i.id === 'tone')

const toneStiff = toneCheck('저희 센터는 최선을 다합니다.')
ok(toneStiff.level === 'warn', '센터 1인칭이 없으면 주의 (회사 공지문)', toneStiff.level)
ok(toneStiff.value === '센터 1인칭 0회', '무엇이 없는지 말한다', toneStiff.value)
ok(toneStiff.hint.includes('제가'), '「제가」를 넣으라고 한다')
ok(toneStiff.hint.includes('회사 공지문'), '왜 그런지 말한다')

const toneOk = toneCheck('제가 상담할 때 가장 많이 듣는 말이 이겁니다.')
ok(toneOk.level === 'pass', '「제가」가 있으면 통과', toneOk.level)
/*
 * 실제 초안에서 「저한테 제일 먼저 물으시는 게 이 시간 문제입니다」를 놓쳐, 통과해야 할
 * 글에 주의를 줬다. 「저한테」·「저에게」도 사람이 말하는 1인칭이다.
 */
ok(toneCheck('저한테 제일 먼저 물으시는 게 이 시간 문제입니다.').level === 'pass',
  '「저한테」도 센터 1인칭으로 센다')
ok(toneCheck('저에게 물어보시는 분이 많습니다.').level === 'pass', '「저에게」도 센다')
ok(toneCheck('저희 센터는 24시간 운영합니다.').level === 'warn',
  '「저희」만 반복하는 것은 여전히 회사 공지문이다')

// 가벼운 쪽 — 느낌표·이모지 남발 (상위권 중간값 느낌표 3.3 · 이모지 3.9 의 두 배 초과)
const toneLoud = toneCheck('제가 말씀드릴게요! 대박!! 정말 좋아요!!! ' + '!'.repeat(20))
ok(toneLoud.level === 'warn', '느낌표를 남발하면 주의', `${toneLoud.value} ${toneLoud.level}`)
ok(toneLoud.hint.includes('전단지'), '왜 줄이라는지 말한다', toneLoud.hint)
ok(toneLoud.hint.includes('3.3'), '상위권 중간값을 근거로 준다')

// 순위 기준이 아니라고 못박는다 — 나중에 순위 데이터가 바뀌어도 이 항목은 흔들리지 않는다
ok(toneOk.target.includes('순위 기준이 아니라'), '순위 기준이 아니라고 밝힌다', toneOk.target)
ok(toneOk.target.includes('톤은 순위와 무관'), '실측 결과를 함께 적는다')
ok(toneOk.weight === 2, '가중치는 낮게 (순위 근거가 없으므로)', String(toneOk.weight))

/*
 * 후기글은 화자가 방문객이라 「저희 센터」가 없는 게 정상이다 — 센터 1인칭을 요구하면 안 된다.
 */
const toneReview = checkPost({ type:'review', title:'쌍용동 헬스장 등록 후기, 3주 다녀보고',
  body: toneBody('시설을 둘러봤어요.'), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  .items.find((i) => i.id === 'tone')
ok(toneReview.level === 'pass', '후기글에는 센터 1인칭을 요구하지 않는다', toneReview.level)

// ─── 「더라고요」 금지를 풀었다 ───
/*
 * 1위 운영자 글이 「집이나 회사에서 멀면 결국 발길이 뜸해지더라고요」를 쓴다. 후기 톤 유출을
 * 막으려고 낱말 단위로 금지한 것이 과했다 — 막아야 하는 것은 어미가 아니라 **센터가
 * 체험자인 척하는 것**이다.
 */
const tonePromo = buildSystemPrompt('promo')
ok(!/"더라고요", "가봤더니"/.test(tonePromo), '「더라고요」를 통째로 금지하지 않는다')
ok(tonePromo.includes('하시더라고요'), '센터가 관찰한 「~하시더라고요」는 쓰라고 한다')
ok(tonePromo.includes('체험자인 척'), '무엇이 진짜 금지인지 밝힌다')
ok(tonePromo.includes('가봤더니'), '체험자인 척하는 말은 그대로 금지')
// 검수기 쪽은 원래부터 정확했다 — 평가하는 「좋더라고요」만 잡는다
const toneVoiceItem = (body) => checkPost({ type:'promo', title:'쌍용동 헬스장 안내', body,
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] }).items.find((i) => i.id === 'voice')
ok(toneVoiceItem(toneBody('회원분들이 이걸 어려워하시더라고요.')).level === 'pass',
  '센터가 관찰한 「어려워하시더라고요」는 통과')
ok(toneVoiceItem(toneBody('직접 가봤더니 좋더라고요.')).level !== 'pass',
  '체험자인 척하는 「가봤더니 좋더라고요」는 걸린다')

// ─── 톤 지시문이 순위 규칙과 섞이지 않는다 ───
ok(tonePromo.includes('## 우리 톤'), 'AI 지시문에 톤 묶음이 따로 있다')
ok(/## 우리 톤 \(순위 규칙이 아니다/.test(tonePromo), '묶음 제목에 순위 규칙이 아니라고 적는다')
ok(tonePromo.includes('동네 헬스장 사장이 상담 온 사람에게 말하듯'), '원하는 톤을 한 문장으로 준다')
ok(tonePromo.includes('등록만 하고 또 안 가게 될까 봐'), '감정을 상황으로 쓰는 예를 준다')
ok(tonePromo.includes('대박'), '가벼워지는 쪽도 막는다')
ok(buildSystemPrompt('promo').indexOf('## 우리 톤') < buildSystemPrompt('promo').indexOf('## 구조'),
  '톤은 화자 바로 다음에 둔다 (숫자 규칙에 묻히지 않게)')
const skelTone = buildTemplate('promo', { mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동 PT'] })
ok(skelTone.includes('동네 헬스장 사장이 상담 온 사람에게 말하듯'), '글 골격에도 같은 톤을 적는다')
ok(skelTone.includes('발길이 뜸해지더라고요'), '1위 글의 실제 예를 근거로 준다')

// ─────────────────────────────────────────────────────────────
console.log('\n[72] 상담 유도 횟수 — 이 앱에서 찾은 가장 센 신호')
/*
 * 회원이 말한 목적: "홍보성 글의 목적은 사람들이 이 글을 보고 상담 예약을 하거나 상담하러
 * 오게 만드는 것." 그래서 재봤더니 **순위도 같은 방향이었다.**
 *
 * 비방문자 글 84편 · 「상담·예약·문의」 등장 **횟수**(종류가 아니다):
 *   0~1회  29편  평균 6.45위  1~3위 14% ( 5~31%)
 *   1~3회  32편       4.75위        34% (20~52%)
 *   3~6회  13편       4.92위        31% (13~58%)
 *   6회 이상 10편      3.30위        60% (31~83%)
 *   밀도 3+/1,000자 8편 → 3.13위 · 75% (41~93%)  vs  0.5 미만 31편 → 6.32위 · 16% (7~33%)
 *
 * 세 표본에서 재현(ρ -0.23 ~ -0.35)되고 95% 구간이 갈렸다. 글자수 교란도 아니다
 * (글자수 자체 ρ -0.11~-0.18, 밀도 3+ 집단이 오히려 더 길다).
 *
 * 이 앱의 처음 규칙은 「홍보 표현을 줄여라」였고 두 번 뒤집혔다 — 종류 수는 무관(무해),
 * 상담 유도 횟수는 **많은 쪽이 위**. 둘은 다른 일이라서 항목도 따로 둔다.
 */
const { countCta, CTA_WORDS, CTA_MIN_BY_TYPE } = require(`${OUT}/analysis/content.js`)

ok(CTA_WORDS.join() === '상담,예약,문의', '세 낱말만 센다', CTA_WORDS.join('·'))
const cc = countCta('상담 예약 문의 주세요. 상담은 예약 후에. 문의 환영.')
ok(cc.count === 6, '종류가 아니라 횟수를 센다', String(cc.count))
ok(cc.found['상담'] === 2 && cc.found['예약'] === 2 && cc.found['문의'] === 2, '낱말별로도 센다')
ok(countCta('').count === 0, '빈 글은 0')
ok(countCta('상담상담').count === 2, '붙어 있어도 센다')

ok(CTA_MIN_BY_TYPE.promo === 6, '홍보글 하한 6회 (6회 이상 1~3위 60% / 0~1회 14%)')
/*
 * **정보글 2 → 0** (2026-08-21). 2 였던 이유는 「센터 소개 + 상담 유도」 구간이었고, 그
 * 구간이 2026-08-20 에 없어졌다. 남겨두니 홍보를 다 걷어낸 정보글에 서로 반대되는 두 줄이
 * 같이 떴다 — 「상담 안내를 지우세요」(info-purity)와 「2회는 넘기세요」(cta-invite).
 */
ok(CTA_MIN_BY_TYPE.info === 0, '정보글은 0회 — 상담 유도 구간이 없어졌다')
{
  const infoClean = checkPost({
    type: 'info',
    title: '폭식 멈추는 방법, 순서부터 바꿔보세요',
    mainKeyword: '폭식 멈추는 방법',
    subKeywords: ['다이어트 폭식'],
    localKeyword: '천안헬스장',
    tags: ['폭식멈추는방법'],
    body: '## 왜 저녁에 몰리나\n혈당이 낮게 유지되다 떨어지면서 생깁니다. 천안 헬스장을 검색해 보면 이 질문이 제일 많습니다.',
  })
  ok(infoClean.items.every((i) => i.id !== 'cta-invite'), '정보글에는 상담 유도 항목을 만들지 않는다')
  // 홍보글·후기글에는 그대로 있다
  ok(checkPost({ ...goodPromo }).items.some((i) => i.id === 'cta-invite'), '홍보글에는 그대로 있다')
  /*
   * **지역 키워드는 업체를 드러내는 것이 아니다.** 골격이 한때 「본문에는 지역·업체를 쓰지
   * 않는다」로 적혀 있어서 지시문·검수와 반대였다. 지역명이 있어도 순수성은 통과해야 한다.
   */
  ok(infoClean.items.find((i) => i.id === 'info-purity')?.level === 'pass', '지역명이 있어도 정보글 순수성은 통과')
  ok(infoClean.items.find((i) => i.id === 'localKeyword')?.level === 'pass', '지역 키워드 1회는 통과')

  /*
   * ─── 메인이 전국 정보 키워드면 본문 강제를 푼다 (2026-08-27) ────────
   *
   * 회원: "메인 키워드가 벌크업 식단인데 상위노출도 그에 맞게 될 수 있게 해주면 좋겠어."
   *
   * 이 규칙은 정보글 메인이 지역 키워드이던 때 만들었다. 메인이 정보성 검색어로 바뀌면서
   * 「벌크업 식단」을 찾는 사람에게 「쌍용동 헬스장」은 찾던 것이 아니게 됐다 — 억지로
   * 넣으면 그 글이 무엇에 대한 글인지 흐려진다.
   *
   * **순위 근거가 아니다.** 우리가 잰 1페이지 표본은 지역 키워드 판이었다. 그래서 **더
   * 요구하지 않는 쪽**으로만 움직인다 — 모르는 판에서 규칙을 지어내지 않는다.
   */
  {
    const loc = (patch) =>
      checkPost({
        type: 'info', title: '벌크업 식단, 뭐부터 챙길까요', mainKeyword: '벌크업 식단',
        subKeywords: [], tags: ['벌크업식단', '쌍용동헬스장'], localKeyword: '쌍용동 헬스장',
        body: '## 무엇부터\n' + '가'.repeat(600), ...patch,
      }).items.find((i) => i.id === 'localKeyword')
    ok(loc({}).level === 'pass', '전국 정보 키워드면 본문 0회도 통과', loc({}).value)
    ok(loc({}).target.includes('없어도 됩니다'), '무엇이 기준인지 화면에 적는다', loc({}).target)
    ok(loc({}).hint.includes('해시태그'), '지역 신호를 어디서 잡는지 알려준다')
    // 넣어도 통과다 — 버리는 것이 아니라 강제하지 않는 것이다
    ok(loc({ body: '## 무엇부터\n쌍용동 헬스장에서도 그렇습니다. ' + '가'.repeat(600) }).level === 'pass', '자연스럽게 넣은 1회도 통과')
    // 너무 많으면 여전히 잡는다 (정보 흐름을 끊는다)
    ok(loc({ body: '## 무엇부터\n' + '쌍용동 헬스장 '.repeat(4) + '가'.repeat(600) }).level !== 'pass', '많이 넣으면 여전히 잡는다')

    // 메인이 지역 키워드인 글은 예전 그대로 — 그 글은 지역 판에 들어가는 글이 맞다
    // 제목에는 안 넣는다 — 검수는 제목까지 세므로 본문 0회를 보려면 제목도 비워야 한다
    const localMain = loc({ mainKeyword: '쌍용동 헬스장', title: '헬스장 고를 때 볼 것' })
    ok(localMain.level === 'warn', '메인이 지역 키워드면 본문 0회를 여전히 잡는다', localMain.value)
    ok(localMain.target === '본문 1~2회 + 해시태그', '그 글의 기준은 예전 그대로')
  }
  const iskel2 = buildTemplate('info', { mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'], localKeyword: '천안헬스장' })
  ok(!iskel2.includes('본문에는 지역·업체를 쓰지 않는다'), '골격에서 반대되던 문장을 지웠다')
  ok(iskel2.includes('지역 키워드 "천안헬스장"를 본문에 1~2회'), '골격도 본문에 넣으라고 한다 (지시문·검수와 같은 말)')

  /*
   * **목표 문구가 정보글에 「넣어라」로 읽히면 안 된다.** 판정은 원래도 「없어도 통과」였지만
   * 회원이 보는 것은 그 한 줄이다 — 「0~1회」·「1~2개」를 보고 넣으면 `info-purity` 가 잡는다.
   */
  const tgt = (id, patch) => checkPost({ type: 'info', title: '폭식 멈추는 방법, 순서부터', mainKeyword: '폭식 멈추는 방법', subKeywords: [], tags: [], body: '## 소제목\n내용', ...patch }).items.find((i) => i.id === id)?.target
  ok(tgt('phone').startsWith('0회'), `정보글 전화번호 목표는 0회 — ${tgt('phone')}`)
  ok(tgt('links').startsWith('0개'), `정보글 외부 링크 목표는 0개 — ${tgt('links')}`)
  // 홍보글·후기글은 그대로다 (예약 링크·전화가 그 글의 일이다)
  ok(tgt('phone', { type: 'promo' }) === 'CTA에 1회', '홍보글 전화번호 목표는 그대로')
  ok(tgt('links', { type: 'review' }).startsWith('1~2개'), '후기글 링크 목표는 그대로')
}
ok(CTA_MIN_BY_TYPE.review === 2, '후기글은 방문자 화자 — 여섯 번 권하면 대가성 광고가 된다')

const ctaBody = (n) => ['[이미지: 대표]', '쌍용동 헬스장입니다. 제가 안내드릴게요.', '', '[이미지: 2]',
  '## 소제목', '자세와 호흡, 세트와 무게, 초보 회복까지 봅니다. ' + '가'.repeat(1700),
  Array(n).fill('상담 예약 문의 주세요.').join(' ')].join('\n')
const ctaItem = (n) => checkPost({ type:'promo', title:'쌍용동 헬스장 8월 혜택, 새벽에도 갈 수 있을까?',
  body: ctaBody(n), mainKeyword:'쌍용동 헬스장', subKeywords:['쌍용동 PT'], tags:[],
  legalName:'MTO 피트니스 쌍용점' }).items.find((i) => i.id === 'cta-invite')

ok(ctaItem(0).level === 'fail', '상담 유도가 없으면 수정필요', ctaItem(0).level)
ok(ctaItem(0).hint.includes('방향이 가장 일관됐던'), '왜 중요한지 말한다')
/*
 * 런 3회 중간값으로 다시 재니 구간이 겹쳤다 (content.ts 의 「정정」 항목).
 * 방향은 세 표본 다 같았지만 「6회」라는 선은 표본 오차 안이다 — 힌트가 과장하지 않게 고정한다.
 */
ok(!ctaItem(0).hint.includes('가장 뚜렷한 순위 신호'), '단정하지 않는다 (구간이 겹쳤다)')
ok(ctaItem(0).hint.includes('0회와 1회 사이'), '가장 큰 계단이 어디인지 알려준다')
ok(ctaItem(2).target.includes('표본 오차 안'), '목표 문구도 정확한 선이 아니라고 밝힌다', ctaItem(2).target)
ok(ctaItem(0).hint.includes('몰아넣으라는 뜻이 아닙니다'), '한 곳에 몰지 말라고 알려준다')
ok(ctaItem(0).hint.includes('각 단락의 끝에'), '어디에 넣으라고 알려준다')
ok(ctaItem(1).level === 'warn', '3회면 주의 (하한 6의 절반)', `${ctaItem(1).value} ${ctaItem(1).level}`)
ok(ctaItem(2).level === 'pass', '6회면 통과', `${ctaItem(2).value} ${ctaItem(2).level}`)
ok(ctaItem(3).level === 'pass', '더 써도 통과 — 상한은 두지 않는다 (근거가 없다)')
ok(ctaItem(2).value.includes('상담 2'), '낱말별 횟수를 보여준다', ctaItem(2).value)
ok(ctaItem(2).target.includes('45~60%'), '목표에 실측 범위를 적는다', ctaItem(2).target)
ok(ctaItem(2).weight === 4, '구간이 갈린 신호라 가중치를 높게', String(ctaItem(2).weight))

/*
 * 「홍보 표현 절제」(종류 6종류 이하)와 충돌하지 않는다 —
 * 상담·예약·문의 3종류만으로 6회를 채울 수 있다.
 */
const bothItems = checkPost({ type:'promo', title:'쌍용동 헬스장 8월 혜택, 새벽에도 갈 수 있을까?',
  body: ctaBody(3), mainKeyword:'쌍용동 헬스장', subKeywords:['쌍용동 PT'], tags:[],
  legalName:'MTO 피트니스 쌍용점' }).items
ok(bothItems.find((i) => i.id === 'cta-invite').level === 'pass', '상담 유도 통과')
ok(bothItems.find((i) => i.id === 'promo-restraint').level === 'pass', '동시에 홍보 종류도 통과 (충돌 없음)')

// 후기글에서는 2회로 족하다 — 방문자가 상담을 여섯 번 권하면 광고다
const revCta = checkPost({ type:'review', title:'쌍용동 헬스장 등록 후기, 3주 다녀보고',
  body: ctaBody(1), mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
  .items.find((i) => i.id === 'cta-invite')
ok(revCta.level === 'pass', '후기글은 3회로도 통과', `${revCta.value} ${revCta.level}`)
ok(revCta.target.includes('글의 목적'), '후기는 순위보다 목적이라고 밝힌다', revCta.target)

// 제목에 홍보성을 넣으라고 한다 (실측: 있음 36% / 없음 29% — 불리하지 않다)
const promoTitleRule = buildSystemPrompt('promo')
ok(promoTitleRule.includes('제목에 혜택을 한 조각 넣는다'), '제목에 혜택을 넣으라고 한다')
ok(promoTitleRule.includes('있음 1~3위 36% / 없음 29%'), '불리하지 않다는 실측을 붙인다')
ok(promoTitleRule.includes('금액을 그대로 써도 된다'), '금액을 제목에 써도 된다 (회원 요청 · 반대 근거 없음)')
/*
 * **후기글에도 제목 홍보성을 준다** (2026-08-11). 회원 요청: "제목도 홍보성이 별로 없어.
 * 홍보성 있게 해줘." 다만 말투는 방문자 쪽이어야 한다 — 후기 제목에서 센터 말투로 혜택을
 * 외치면 업체가 쓴 글로 읽혀 대가성 광고 자리로 간다.
 */
const revTitleRule = buildSystemPrompt('review')
ok(revTitleRule.includes('제목에 혜택을 한 조각 넣되 방문자 말투로 쓴다'), '후기글 제목에도 홍보성을 넣으라고 한다')
ok(revTitleRule.includes('3개월 9.9만원에 등록한 후기'), '방문자 말투 예시를 준다')
ok(revTitleRule.includes('지금 신청하세요'), '센터 말투 제목을 막는다')
ok(revTitleRule.includes('금액을 지어내지 말고'), '이벤트 정보가 없으면 금액을 만들지 않게 한다')
ok(!revTitleRule.includes('상담을 받으려고 쓰는 글이니'), '홍보글 문구를 그대로 주지는 않는다')

/*
 * ─── 제목에 홍보 한 조각이 있는가 (검수) ────────────────────────
 *
 * 회원이 같은 말을 **두 번** 했다 — 홍보글에 대해("명색이 홍보글인데 제목에 홍보성이
 * 하나도 없어"), 그리고 후기글에 대해("제목에 홍보 관련 내용이 없고").
 *
 * **지시문만으로는 안 붙었다.** 지시문에 넣고도 같은 말을 다시 들었으니 검수가 잡아야
 * 한다 — `event-hook` 과 똑같은 경로다(지시문에는 있었는데 나온 글에 없었다).
 */
const tpItem = (type, title, eventText) =>
  checkPost({
    ...(type === 'review' ? { ...goodPromo, type: 'review', sponsorship: 'own' } : goodPromo),
    type,
    title,
    eventText,
  }).items.find((i) => i.id === 'titlePromo')

ok(tpItem('promo', '쌍용동 헬스장 추천, 처음이라 걱정되시죠?')?.level === 'fail', '홍보성이 없으면 즉시수정')
ok(tpItem('promo', '쌍용동 헬스장 8월 혜택 정리해드려요 새벽운동')?.level === 'pass', '「혜택」이 있으면 통과')
ok(tpItem('promo', '쌍용동 헬스장 3개월 9.9만원, 새벽에도 갈까?')?.value.includes('3개월'), '금액·기간도 홍보로 센다')
// 후기글도 본다 (회원이 이번에 말한 자리다)
ok(tpItem('review', '천안 쌍용동 헬스장 상담 받아본 솔직 후기예요')?.level === 'fail', '후기 제목도 잡는다')
ok(tpItem('review', '쌍용동 헬스장 3개월 9.9만원에 등록한 후기입니다')?.level === 'pass', '방문자 말투 + 금액이면 통과')
ok(tpItem('review', '쌍용동 헬스장 상담 후기').hint.includes('방문자 말투로'), '후기에는 방문자 말투로 쓰라고 한다')
ok(tpItem('review', '쌍용동 헬스장 상담 후기').hint.includes('지금 신청하세요'), '센터 말투 제목을 막는다')
// 「상담·등록·문의」는 홍보로 세지 않는다 — 후기 제목에 거의 다 들어가서 검사가 무의미해진다
ok(tpItem('review', '쌍용동 헬스장 등록하고 상담 문의까지 후기')?.level === 'fail', '상담·등록·문의는 홍보로 세지 않는다')
// 이벤트 칸에 적은 것이 있으면 그걸 가져오라고 한다
const tpEv = tpItem('review', '쌍용동 헬스장 등록 후기, 처음인데 괜찮을까?', '8월 등록분 3개월 9.9만원, 락커 무료')
ok(tpEv.hint.includes('8월 등록분 3개월 9.9만원'), '이벤트 칸 내용을 그대로 보여준다')
/*
 * **이벤트 칸이 비었을 때 빠져나갈 구멍을 막았다** (2026-08-11, 두 번째).
 *
 * 회원 지적: "제목에 갑자기 홍보가 안 들어가." 내가 만든 모순이었다 — 지시문은 「이벤트
 * 정보가 없으면 「상담 받아본 후기」로 둔다」고 했는데 이 검사는 상담·등록을 홍보로 세지
 * 않는다. 지시대로 쓰면 반드시 걸렸다. 금액을 지어내는 것과 홍보성을 넣는 것은 다른
 * 얘기이므로, **금액 없이 쓸 수 있는 말**을 준다.
 */
const tpEmpty = tpItem('review', '쌍용동 헬스장 등록 후기')
ok(tpEmpty.hint.includes('금액 없이 쓸 수 있는 말'), '금액 없이 넣는 방법을 준다')
/*
 * 예시를 「가격 궁금해서…」에서 바꿨다 (2026-08-18 실측). 우리 판 1~3위 55편에 「가격·비용·
 * 얼마」를 쓴 제목이 0편이었다 — 검사는 통과시키되 권하지는 않는다.
 */
ok(tpEmpty.hint.includes('이용권'), '금액 없이 쓸 말을 예로 준다', tpEmpty.hint.slice(0, 80))
ok(tpEmpty.hint.includes('0편'), '「가격」류를 왜 피하라는지 수치로 밝힌다')
ok(tpEmpty.hint.includes('없는 금액을 만들 필요는 없습니다'), '지어내지 않아도 된다고 밝힌다')
ok(tpEmpty.hint.includes('구별이 되지 않습니다'), '왜 상담·등록은 안 되는지 말한다')
// 금액 없이 쓴 제목이 실제로 통과해야 한다 (이게 통과 안 되면 지시문과 검수가 또 싸운다)
ok(tpItem('review', '쌍용동 헬스장 가격 궁금해서 상담 받아본 후기')?.level === 'pass', '「가격」이면 통과')
ok(tpItem('review', '쌍용동 헬스장 이용권 알아보고 등록한 후기예요')?.level === 'pass', '「이용권」이면 통과')
ok(tpItem('promo', '쌍용동 헬스장 비용 얼마나 드는지 알려드려요')?.level === 'pass', '「비용·얼마」면 통과')
// 지시문도 같은 말을 해야 한다
for (const t of ['promo', 'review']) {
  const sp = buildSystemPrompt(t)
  ok(sp.includes('이벤트 정보가 없어도 제목에 홍보 한 조각은 반드시 넣는다'), `${t} 지시문이 예외를 두지 않는다`)
  /*
   * **예시와 기준을 유형별로 갈랐다** (2026-08-12). 앞 판은 홍보글에도 후기 제목 예시를
   * 줬고("가격 궁금해서 상담 받아본 후기"), 실제로 그대로 따라 썼다 — 배포된 앱에 홍보글을
   * 시켰더니 제목이 「쌍용동 헬스장 가격 궁금해서 상담받은 후기」로 나와 검수의
   * `화자 (센터여야 합니다)` 에 즉시수정으로 걸렸다(79점). 그래서 유형마다 다른 문장을 본다.
   */
  const same =
    t === 'review'
      ? '「상담 받아본 후기」·「등록한 후기」만으로는 홍보 조각이 없는 것으로 본다'
      : '「상담」·「등록」·「문의」만으로는 홍보 조각이 없는 것으로 본다'
  ok(sp.includes(same), `${t} 지시문이 검수와 같은 기준을 말한다`)
}
// 홍보글 지시문은 제목에 「후기」를 쓰지 말라고 분명히 말해야 한다 (검수가 막는 자리다)
ok(buildSystemPrompt('promo').includes('제목에 「후기」를 쓰지 않는다'), '홍보글 제목에 후기를 금지한다')
ok(
  !buildSystemPrompt('promo').includes('가격 궁금해서 상담 받아본 후기'),
  '홍보글에 후기 제목을 예시로 주지 않는다'
)
ok(!buildSystemPrompt('review').includes('금액을 지어내지 말고 「상담 받아본 후기」'), '옛 빠져나갈 구멍이 사라졌다')
ok(!buildSystemPrompt('info').includes('제목에 홍보 한 조각은 반드시'), '정보글에는 주지 않는다')

/*
 * ─── 고쳐 쓰기 목록에 제목 항목이 실제로 실리는가 ────────────────
 *
 * 회원 지적 "제목에 갑자기 홍보가 안 들어가" 의 나머지 절반이 여기였다. 걸린 항목을
 * 가중치 순으로 6개만 넘기니 제목 항목이 본문 항목들에 밀려 **아예 전달되지 않았다.**
 * 모델은 제목 문제를 들은 적이 없으니 고칠 수도 없었다.
 *
 * 이 함수는 라우트 안에 있어서 테스트가 없었다 — 그래서 lib 로 옮겼다.
 */
const { fixList } = require(`${OUT}/writing/next-action.js`)
const heavyBody = Array.from({ length: 7 }, (_, i) => ({
  id: `body${i}`, level: 'fail', label: `본문항목${i}`, value: 'x', target: 'y', weight: 5,
}))
const withTitle = fixList([
  ...heavyBody,
  { id: 'titlePromo', level: 'fail', label: '제목에 홍보 한 조각', value: '없음', target: '혜택 한 조각', hint: '넣으세요', weight: 4 },
])
ok(withTitle.some((l) => l.includes('제목에 홍보 한 조각')), '가중치가 낮아도 제목 항목은 반드시 실린다')
ok(withTitle[0].includes('제목'), '제목을 앞에 둔다')
ok(withTitle.filter((l) => l.includes('본문항목')).length === 6, '본문 항목은 6개까지', String(withTitle.filter((l) => l.includes('본문항목')).length))
// 제목 항목도 무한정 넣지 않는다 — 한 줄에 네 가지를 동시에 시키면 그것도 무리다
const manyTitles = fixList(
  Array.from({ length: 5 }, (_, i) => ({ id: `title${i}`, level: 'fail', label: `제목항목${i}`, value: 'x', target: 'y', weight: 3 }))
)
ok(manyTitles.length === 3, '제목 항목은 3개까지', String(manyTitles.length))
// 수정필요를 주의보다 먼저 (점수 상한을 푸는 것은 수정필요뿐이다)
const flMixed = fixList([
  { id: 'a', level: 'warn', label: '주의것', value: 'x', target: 'y', weight: 9 },
  { id: 'b', level: 'fail', label: '수정필요것', value: 'x', target: 'y', weight: 1 },
])
ok(flMixed[0].includes('수정필요것'), '수정필요를 먼저 넘긴다')
ok(flMixed[0].startsWith('[수정필요]'), '등급을 앞에 표시한다')
// 통과한 항목은 넘기지 않는다
ok(fixList([{ id: 'c', level: 'pass', label: '통과것', value: 'x', target: 'y', weight: 5 }]).length === 0, '통과 항목은 안 넘긴다')
// 힌트가 있으면 함께 (「지금 2회 / 기준 5회」만으로는 어디에 넣을지 모른다)
ok(fixList([{ id: 'd', level: 'fail', label: 'ㄱ', value: 'x', target: 'y', hint: '이렇게 하세요', weight: 5 }])[0].includes('이렇게 하세요'),
  '힌트를 함께 넘긴다')
// 위험 표현은 개수와 무관하게 전부
const withRisks = fixList(heavyBody, [
  { term: '무료', category: 'D. 상업 단어 도배', fix: '줄이세요' },
  { term: '최고의', category: 'A. 최상급·단정', fix: '바꾸세요' },
])
ok(withRisks.filter((l) => l.startsWith('[위험 표현]')).length === 2, '위험 표현은 전부 넘긴다')
// 정보글은 대상이 아니다 — 그 글의 홍보는 마지막 구간에만 모인다
ok(tpItem('info', '폭식 멈추는 방법, 순서부터 바꿔보세요 정리') === undefined, '정보글은 검사하지 않는다')
ok(tpItem('promo', '쌍용동 헬스장 추천').hint.includes('있음 1~3위 36% / 없음 29%'), '실측 근거를 붙인다')
ok(tpItem('promo', '쌍용동 헬스장 추천').hint.includes('최저가·파격가'), '광고심의 위험은 계속 막는다')

/*
 * 좋았던 점을 **홍보 관련으로** — 회원 요청: "좋았던점도 홍보관련해서 좋았던점을 적어주면
 * 좋겠어." 앞 판에서 시설 예시만 줬더니(샤워실·기구) 후기가 시설 구경기로 끝났다.
 */
ok(revTitleRule.includes('하나는 반드시 혜택·가격·상담과 이어서 쓴다'), '좋았던 점 하나는 혜택·가격에 닿게 한다')
ok(revTitleRule.includes('부담이 훨씬 덜했어요'), '가격 만족 예시를 준다')
ok(revTitleRule.includes('락커를 같이 준다고 해서'), '혜택 만족 예시를 준다')
ok(revTitleRule.includes('부담 없이 들어갔어요'), '상담 부담 예시를 준다')
ok(revTitleRule.includes('없는 금액·기간을 만들지 않는다'), '이벤트 칸 밖의 금액을 만들지 않게 한다')
ok(buildTemplate('review', { mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], localKeyword: '쌍용동 헬스장' }).includes('혜택·가격·상담과 이어서'), '골격에도 적었다')

/*
 * ─── 후기글에서 아쉬운 점을 뺀다 ────────────────────────────────
 *
 * 회원 요청 (2026-08-11): "후기글 뽑으면 아쉬운 점을 적는데 이 부분 삭제하고 좋은점,
 * 만족한점으로 교체해줘."
 *
 * 전에는 「가벼운 아쉬움을 1~2개 반드시 남긴다 — 단점이 없는 후기는 광고로 읽힌다」로
 * 시켰다. 그 걱정은 여전히 맞지만, 광고처럼 읽히지 않게 하는 것은 **단점이 아니라
 * 구체성**이다. 그래서 단점을 빼는 대신 좋은 점을 뭉뚱그리지 못하게 조인다.
 */
ok(!revTitleRule.includes('아쉬움을 1~2개'), '아쉬움을 남기라는 지시가 사라졌다')
ok(!revTitleRule.includes('솔직한 아쉬움'), '단계 설명에서도 아쉬움이 사라졌다')
ok(revTitleRule.includes('아쉬웠던 점·단점은 쓰지 않는다'), '아쉬운 점을 쓰지 말라고 못 박는다')
ok(revTitleRule.includes('좋았던 점·만족한 점'), '좋았던 점으로 바꿨다')
ok(revTitleRule.includes('뭉뚱그리지 않는다'), '「다 좋았어요」를 막는다 — 그게 광고로 읽히는 지점이다')
ok(revTitleRule.includes('샤워실이 두 칸이라'), '구체적인 장면 예시를 준다')
// 홍보글·정보글에는 이 규칙이 필요 없다 (화자가 센터다)
ok(!buildSystemPrompt('promo').includes('아쉬웠던 점·단점은 쓰지 않는다'), '홍보글에는 주지 않는다')
// 골격에도 반영됐는지 (회원이 보는 화면이다)
const revGoodTpl = buildTemplate('review', { mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], localKeyword: '쌍용동 헬스장' })
ok(!revGoodTpl.includes('아쉬웠던 점 1가지'), '골격에서도 아쉬움이 사라졌다')
ok(revGoodTpl.includes('좋았던 점·만족한 점'), '골격이 좋았던 점을 시킨다')
ok(revGoodTpl.includes('없는 후기·사례 창작 금지'), '지어내지 말라는 말은 그대로 남긴다')
ok(promoTitleRule.includes('소제목은 `## 소제목` 형식. 4~5개'), '홍보글 소제목은 4~5개 (운동 정보 구간이 빠졌다)')
// 정보글도 2026-08-20 에 「고를 때 기준」 구간이 늘어 5~6개가 됐다. 후기글만 4~5개다
ok(buildSystemPrompt('info').includes('소제목은 `## 소제목` 형식. 5~6개'), '정보글도 5~6개 (구간이 늘었다)')
ok(buildSystemPrompt('review').includes('소제목은 `## 소제목` 형식. 4~5개'), '후기글은 4~5개 그대로')

// ─────────────────────────────────────────────────────────────
console.log('\n[73] 회원이 직접 쓴 홍보글에서 나온 오탐 두 개')
/*
 * 회원이 홍보글을 직접 뽑아 보여줬는데 64점이 나왔다. 그중 「즉시수정」과 「수정필요」
 * 하나씩이 **정상 문장을 잡은 오탐**이었다. 고치고 나서 79점이 됐다.
 *
 * 낱말만 보고 판정하면 이런 일이 난다 — 이 두 검사에서 벌써 네 번째다.
 */
const { scanRisks: sr73 } = require(`${OUT}/writing/banned.js`)

// ① 「확실히」 — 결과에 붙을 때만 위험하다
ok(!sr73('등에 자극이 확실히 옮겨갑니다.').length, '「자극이 확실히 옮겨갑니다」는 잡지 않는다')
ok(!sr73('무릎이 안쪽으로 말리는지 확실히 보고 잡아드립니다.').length, '「확실히 보고」도 통과')
ok(sr73('확실히 빠집니다').some((r) => r.category.startsWith('B.')), '「확실히 빠집니다」는 그대로 잡는다')
ok(sr73('확실히 좋아집니다').some((r) => r.category.startsWith('B.')), '「확실히 좋아집니다」도 잡는다')
ok(sr73('확실히 달라집니다').some((r) => r.category.startsWith('B.')), '「확실히 달라집니다」도 잡는다')
ok(sr73('무조건 됩니다').some((r) => r.category.startsWith('A.')), '「무조건」은 그대로 잡는다')
ok(sr73('절대로 안 됩니다').some((r) => r.category.startsWith('A.')), '「절대로」도 그대로')

// ② 「추천드려요」 — 장소를 평가하며 권할 때만 방문자 말투다
const v73 = (body) => checkPost({ type:'promo', title:'쌍용동 헬스장 8월 혜택 안내', body,
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] }).items.find((i) => i.id === 'voice')
const v73body = (tail) => ['[이미지: 대표]', '쌍용동 헬스장입니다. 제가 안내드릴게요.', '',
  '[이미지: 2]', '## 소제목', '자세와 호흡, 무게를 봅니다. ' + '가'.repeat(1700), tail].join('\n')
ok(v73(v73body('리니어 로우로 넘어가는 순서를 추천드려요.')).level === 'pass',
  '센터가 운동 순서를 권하는 「추천드려요」는 통과')
ok(v73(v73body('식단은 단백질부터 챙기시길 추천드려요.')).level === 'pass', '방법을 권하는 것도 통과')
ok(v73(v73body('여기 정말 추천드려요.')).level !== 'pass', '「여기 추천드려요」는 방문자 말투로 잡는다')
ok(v73(v73body('이 헬스장 꼭 추천드려요.')).level !== 'pass', '「이 헬스장 추천드려요」도 잡는다')
ok(v73(v73body('가봤더니 좋더라고요.')).level !== 'pass', '「좋더라고요」는 그대로 잡는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[74] 첫 문장 인사 + 정식 상호명 — 회원이 직접 잡은 문제')
/*
 * 회원 지적: "첫 문장이 「안녕하세요 MTO 피트니스 쌍용점」이 아니라 뭐 이상한 문장이야.
 * 업체명을 제대로 쓴 것도 아니고 「쌍용점」이라고만 나오고."
 * 나온 문장이 「저희는 쌍용점입니다」였다.
 *
 * 정식 상호명 **횟수** 검사는 이걸 못 잡는다 — 뒤쪽에서 세 번 채우면 통과한다.
 * 그래서 첫 80자만 따로 본다. 순위 기준은 아니다 (인사로 시작 27% / 아닌 글 32%).
 */
const g74 = (opening) => checkPost({ type:'promo', title:'쌍용동 헬스장 3개월 9.9만원, 새벽에도 갈 수 있을까?',
  body: ['[이미지: 대표]', opening, '', '[이미지: 2]', '## 소제목',
    '자세와 호흡, 무게를 봅니다. ' + '가'.repeat(1700),
    'MTO 피트니스 쌍용점에서 상담 예약 문의 주세요. 상담 예약 문의 환영합니다.'].join('\n'),
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[], legalName:'MTO 피트니스 쌍용점' })
  .items.find((i) => i.id === 'intro-greeting')

ok(g74('안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동 헬스장 이야기예요.').level === 'pass',
  '인사 + 정식 상호명이면 통과')
/*
 * 회원 글에 실제로 나온 문장이다 — 인사도 없고 정식 상호명도 없어서 수정필요다.
 * ("새벽에 눈뜨자마자 … 계시죠. 저희는 쌍용점입니다.")
 */
ok(g74('저희는 쌍용점입니다. 쌍용동 헬스장 이야기예요.').level === 'fail',
  '「저희는 쌍용점입니다」는 잡는다 — 회원이 지적한 그 문장', g74('저희는 쌍용점입니다. 쌍용동 헬스장 이야기예요.').value)
ok(g74('안녕하세요, 저희는 쌍용점입니다. 쌍용동 헬스장 이야기예요.').level === 'warn',
  '인사는 했지만 상호를 줄이면 주의')
ok(g74('안녕하세요, 저희는 쌍용점입니다.').hint.includes('MTO 피트니스 쌍용점'),
  '어떻게 써야 하는지 상호명을 넣어 보여준다')
ok(g74('안녕하세요, 저희는 쌍용점입니다.').hint.includes('줄이면'), '줄여 쓰면 안 되는 이유를 말한다')
ok(g74('MTO 피트니스 쌍용점 쌍용동 헬스장 안내입니다.').level === 'warn', '인사가 없으면 주의')
ok(g74('새벽 근무 끝나고 나오면 애매하죠. 쌍용동 헬스장 이야기예요.').level === 'fail',
  '둘 다 없으면 수정필요')
// 띄어쓰기 차이로 거짓 경고를 내지 않는다
ok(g74('안녕하세요, MTO피트니스 쌍용점입니다. 쌍용동 헬스장 이야기예요.').level === 'pass',
  '띄어쓰기가 달라도 같은 상호로 본다')
ok(g74('안녕하세요, MTO 피트니스 쌍용점입니다.').target.includes('순위 기준이 아니라'),
  '순위 기준이 아니라고 밝힌다')

// 후기글은 화자가 방문객이라 이 검사를 하지 않는다
const g74rev = checkPost({ type:'review', title:'쌍용동 헬스장 등록 후기, 3주 다녀보고',
  body: ['[이미지: 대표]', '등록한 지 3주 됐어요. 쌍용동 헬스장 이야기예요.', '', '[이미지: 2]',
    '## 소제목', '자세를 봐주셨어요. ' + '가'.repeat(1700)].join('\n'),
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] })
ok(!g74rev.items.some((i) => i.id === 'intro-greeting'),
  '후기글에는 이 항목을 만들지 않는다 — 방문객이 센터 이름으로 인사하면 틀린다')

// ─────────────────────────────────────────────────────────────
console.log('\n[75] 조사 캐시는 하루만 듣는다')
/*
 * **캐시가 영구적이면 측정값이 굳는다.** 사흘 전에 받아둔 본문이 그대로 재사용되고 있었다 —
 * 순위(SERP)는 매번 새로 받으니 순위 변화는 보이는데 내용은 안 변하는, 조용히 어긋나는
 * 조사가 된다. 그동안 글이 수정됐으면 옛 수치가 영구히 남는다.
 *
 * 규칙 자체(날짜 비교)는 scripts/study.mjs 에 있지만, 그 규칙이 지켜야 하는 성질을
 * 여기서 고정한다 — 날짜 문자열 비교가 맞는 방향인지.
 */
const cacheStamp = (offsetDays) =>
  new Date(Date.UTC(2026, 7, 10) + offsetDays * 86_400_000).toISOString().slice(0, 10)
const wouldReuse = (fileOffset, cacheDays) => cacheStamp(fileOffset) >= cacheStamp(-cacheDays)

ok(wouldReuse(0, 0), '오늘 받은 것은 재사용한다 (같은 날 재실행을 싸게)')
ok(!wouldReuse(-1, 0), '어제 받은 것은 다시 받는다 — 기본값에서')
ok(!wouldReuse(-3, 0), '사흘 전 것도 다시 받는다 (실제로 이게 문제였다)')
ok(wouldReuse(-3, 3), '--cache-days=3 이면 사흘 전 것까지 재사용')
ok(!wouldReuse(-4, 3), '--cache-days=3 이면 나흘 전은 다시 받는다')
ok(wouldReuse(0, 7), '넉넉히 줘도 오늘 것은 당연히 재사용')

// ─────────────────────────────────────────────────────────────
console.log('\n[76] 하루씩 쌓기 — 순위는 매일, 본문은 묵은 것만')
/*
 * 회원이 물었다 — "일주일 뒤까지 모으지 않아도 하루씩 모이게 할 수 있지 않아?"
 *
 * 된다. 유지 판정에 필요한 것은 런 개수가 아니라 **기간**이고, 하루씩 쌓으면 이 주면
 * 14개 런이 14일을 덮는다. 문제는 비용이었다 — 키워드 22개 × 상위 10편이면 매일 본문
 * 160편을 읽어야 하고 함수 한 번에 안 들어간다.
 *
 * 그래서 나눴다: **순위는 매일 전부(22콜), 본문은 7일 넘게 묵은 것만.**
 * 순위는 매일 바뀌고 본문은 거의 안 바뀌므로 유지 판정이 흐려지지 않는다.
 */
const {
  BODY_MAX_AGE_DAYS,
  BODY_BUDGET_PER_RUN,
  STUDY_RUNS_KEEP,
  STUDY_POSTS_KEEP,
  measurementAgeDays,
  studyKeywords,
} = require(`${OUT}/analysis/study.js`)

ok(BODY_MAX_AGE_DAYS === 7, '본문은 7일까지 재사용', String(BODY_MAX_AGE_DAYS))
ok(BODY_BUDGET_PER_RUN >= 40 && BODY_BUDGET_PER_RUN <= 100, '한 번에 읽을 본문에 상한을 둔다', String(BODY_BUDGET_PER_RUN))
ok(STUDY_RUNS_KEEP >= 30, '하루 하나면 한 달 이상 남는다', String(STUDY_RUNS_KEEP))
ok(STUDY_POSTS_KEEP >= 300, '상위 글 수보다 넉넉하게 둔다', String(STUDY_POSTS_KEEP))

// ─── 측정값 나이 ───
ok(measurementAgeDays('2026-08-10', '2026-08-10') === 0, '같은 날이면 0일')
ok(measurementAgeDays('2026-08-03', '2026-08-10') === 7, '이레 전이면 7일')
ok(measurementAgeDays('2026-08-03', '2026-08-10') >= BODY_MAX_AGE_DAYS, '7일이면 다시 받는다')
ok(measurementAgeDays('2026-08-04', '2026-08-10') < BODY_MAX_AGE_DAYS, '6일이면 재사용한다')
ok(measurementAgeDays('2026-07-31', '2026-08-10') === 10, '달을 넘겨도 센다')
ok(!Number.isFinite(measurementAgeDays('', '2026-08-10')), '날짜가 없으면 무한 — 무조건 다시 받는다')
ok(!Number.isFinite(measurementAgeDays('망가진 값', '2026-08-10')), '깨진 값도 다시 받는다')
// 미래 날짜(시계가 어긋난 경우)를 음수로 돌려주면 영원히 재사용된다
ok(measurementAgeDays('2026-08-20', '2026-08-10') === 0, '미래 날짜는 0으로 (음수를 돌려주지 않는다)')

// ─── 조사 키워드 ───
const kwDb = {
  rankTargets: [{ keyword: '쌍용동 헬스장' }, { keyword: '천안 PT' }],
  stores: [{ localKeywords: ['쌍용동 헬스장', '봉명동 헬스장'] }],
}
ok(studyKeywords(kwDb, ['두정동 헬스장', '성정동 헬스장']).length === 2, '파일 목록이 있으면 그것만 쓴다')
ok(studyKeywords(kwDb, ['두정동 헬스장'])[0] === '두정동 헬스장', '파일 목록을 그대로 쓴다')
ok(studyKeywords(kwDb, ['  ', '']).length === 3, '빈 항목만 있으면 앱 키워드로 물러선다', String(studyKeywords(kwDb, ['  ']).length))
ok(studyKeywords(kwDb, []).includes('쌍용동 헬스장'), '물러설 때 순위 추적 키워드를 쓴다')
ok(studyKeywords(kwDb, []).includes('봉명동 헬스장'), '지점 지역 키워드도 쓴다')
ok(new Set(studyKeywords(kwDb, [])).size === studyKeywords(kwDb, []).length, '중복을 없앤다')
ok(studyKeywords({}, []).length === 0, '아무것도 없으면 빈 목록 (크론이 400 으로 알려준다)')

/*
 * 크론 런에는 문단 구조가 없다 (se-component 쪼개기는 로컬 스크립트에만 있다).
 * 그래도 합치기·판정이 깨지지 않아야 한다 — 문단 항목만 대상에서 빠지면 된다.
 */
const cronPost = {
  url: 'x', blogId: 'b', title: 't', ranks: { k: 2 },
  chars: 2000, images: 8, videos: 0,
  info: 6, promo: 3, experience: 2, infoFound: [], promoFound: [], cta: 7,
  topEnding: '~요', topEndingShare: 40,
}
const cronMerged = mergeRuns([
  { date: '2026-08-09', keywords: ['k'], top: 10, posts: [cronPost] },
  { date: '2026-08-10', keywords: ['k'], top: 10, posts: [{ ...cronPost, ranks: { k: 3 } }] },
])
ok(cronMerged.length === 1, '문단 필드가 없어도 합쳐진다')
ok(cronMerged[0].held === true, '유지 판정은 순위만으로 된다 (문단 없이도)')
ok(cronMerged[0].longestPara === undefined, '없는 값은 없는 채로 둔다 (0 으로 꾸미지 않는다)')

// ─────────────────────────────────────────────────────────────
console.log('\n[77] 화자 경고는 걸린 말을 그대로 보여준다')
/*
 * 회원이 유형을 홍보글로 바꿨는데 본문은 예전 후기글이 남아 있었다. 그 상태에서 빨간
 * 배너를 보고 「유형은 홍보글이고 화자도 센터가 맞는데 왜 어긋났다고 하나」로 읽었다.
 *
 * 배너가 **패턴 목록**을 읊고 있었기 때문이다 — 「제목의 「후기」나 「다녀왔다」·
 * 「괜찮더라고요」는…」. 무엇 때문에 걸렸는지 알려주지 않으면 맞는 경고도 버그로 읽힌다.
 * 이제 실제로 걸린 구절을 뽑아 보여준다.
 */
const v77 = (title, tail) => checkPost({ type:'promo', title,
  body: ['[이미지: 대표]', '안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동 헬스장입니다.', '',
    '[이미지: 2]', '## 소제목', '자세와 호흡, 무게를 봅니다. ' + '가'.repeat(1700), tail].join('\n'),
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[], legalName:'MTO 피트니스 쌍용점' })
  .items.find((i) => i.id === 'voice')

const v77body = v77('쌍용동 헬스장 8월 혜택 안내', '지난주에 직접 다녀왔습니다.')
ok(v77body.level === 'fail', '방문자 말투는 그대로 잡는다')
ok(v77body.value.includes('다녀왔'), '걸린 말을 value 에 넣는다', v77body.value)
// 주어까지 함께 잡히므로(「직접 다녀왔」) 낱말이 힌트에 들어 있는지로 본다
ok(
  v77body.hint.includes('본문의 「') && v77body.hint.includes('다녀왔'),
  '힌트도 걸린 말을 짚는다',
  v77body.hint
)
ok(!v77body.hint.includes('괜찮더라고요'), '걸리지도 않은 패턴을 나열하지 않는다')

const v77title = v77('쌍용동 헬스장 등록 후기, 3주 다녀보고', '오시면 안내드립니다.')
ok(v77title.hint.includes('제목의 「후기」'), '제목에서 걸렸으면 제목이라고 말한다', v77title.hint)

const v77both = v77('쌍용동 헬스장 체험 후기', '내돈내산으로 다녀왔습니다.')
ok(v77both.hint.includes('제목의') && v77both.hint.includes('본문의'), '둘 다면 둘 다 짚는다')

ok(v77('쌍용동 헬스장 8월 혜택 안내', '오시면 안내드립니다.').level === 'pass',
  '깨끗하면 통과 (센터 말투는 홍보글에서 정상)')

// 후기글 쪽도 같은 방식
const v77rev = checkPost({ type:'review', title:'쌍용동 헬스장 등록 후기, 3주 다녀보고',
  body: ['[이미지: 대표]', '등록한 지 3주 됐어요. 쌍용동 헬스장 후기예요.', '', '[이미지: 2]',
    '## 소제목', '자세를 봐주셨어요. ' + '가'.repeat(1700), '저희 센터는 24시간 운영합니다.'].join('\n'),
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[] }).items.find((i) => i.id === 'voice')
ok(v77rev.level === 'fail', '후기글에 센터 말투가 새면 잡는다')
ok(v77rev.value.includes('저희 센터'), '걸린 말을 보여준다', v77rev.value)
ok(v77rev.hint.includes('본문에 「저희 센터'), '힌트도 그 말을 짚는다', v77rev.hint)

// ─────────────────────────────────────────────────────────────
console.log('\n[78] 소제목도 본문이다 — 세는 데서 빠져 있었다')
/*
 * 회원 화면에서 「메인 키워드 2회」가 매번 수정필요로 떴다. 원인은 AI 만이 아니었다 —
 * **검수기가 소제목을 세지 않고 있었다.**
 *
 * parseBody 가 소제목을 headings 로 따로 빼내고 prose 에서 지워서, 글자수와 키워드 횟수가
 * 소제목을 빼고 계산됐다. 그런데 발행하면 소제목도 본문이고, 기준을 만든 조사 도구는
 * 소제목을 **포함해서** 잰다 (parsePostMetrics 는 se-main-container 를 통째로 읽는다).
 * 같은 것을 서로 다른 자로 재고 있었다.
 */
const { parseBody: pb78 } = require(`${OUT}/writing/checker.js`)
const p78 = pb78(['[이미지: 대표]', '앞 문장입니다.', '## 쌍용동 헬스장 소제목', '뒤 문장입니다.'].join('\n'))
ok(!p78.prose.includes('쌍용동 헬스장 소제목'), 'prose 는 소제목을 빼둔다 (문단 통계용)')
ok(p78.scan.includes('쌍용동 헬스장 소제목'), 'scan 은 소제목을 넣는다 (세기용)')
ok(!p78.scan.includes('[이미지'), 'scan 에서 이미지 지시문은 뺀다')
ok(p78.scan.indexOf('앞 문장') < p78.scan.indexOf('소제목'), '원래 순서를 지킨다 (첫 100자·등간격 판정용)')
ok(p78.scan.indexOf('소제목') < p78.scan.indexOf('뒤 문장'), '소제목 다음이 뒤 문장')

// 소제목에 넣은 키워드가 실제로 세어지는지
const kw78 = (heading) => checkPost({ type:'promo', title:'쌍용동 헬스장 8월 혜택, 새벽에도 갈까?',
  body: ['[이미지: 대표]', '안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동 헬스장 이야기예요.', '',
    '[이미지: 2]', `## ${heading}`,
    '자세와 호흡, 세트와 무게, 초보 회복까지 봅니다. ' + '가'.repeat(1700),
    '상담 예약 문의 주세요. 상담 예약 문의 환영합니다. MTO 피트니스 쌍용점 MTO 피트니스 쌍용점'].join('\n'),
  mainKeyword:'쌍용동 헬스장', subKeywords:[], tags:[], legalName:'MTO 피트니스 쌍용점' })
  .items.find((i) => i.id === 'mainCount')
const withKw = kw78('쌍용동 헬스장 중에 공간이 나뉘어 있는 곳')
const without = kw78('공간이 나뉘어 있는 곳')
ok(withKw.value !== without.value, '소제목에 넣으면 횟수가 달라진다 (예전에는 같았다)',
  `${withKw.value} vs ${without.value}`)
ok(withKw.value.includes('3회'), '제목 1 + 본문 1 + 소제목 1 = 3회', withKw.value)
ok(without.value.includes('2회'), '소제목에 없으면 2회', without.value)

console.log('\n[79] 정보 주제·요청칸이 지시문에 실린다')
/*
 * 회원 요청: "정보성란을 내가 원하는 주제로 넣을 수 있는지, 혹은 이런 식으로 해달라고 하는
 * 요청칸이 있으면 좋겠어."
 *
 * 주제를 지정할 수 있어야 했던 이유: 지시문은 「주제를 하나만 잡는다」까지만 말하고 **어느
 * 주제인지는 AI 가 골랐다.** 키워드가 「24시」쪽이니 매번 시간대 이야기로 수렴했다.
 */
const REQ79 = {
  type: 'promo', store: { name: '쌍용점', legalName: 'MTO 피트니스 쌍용점', localKeywords: [] },
  mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동 24시 헬스장'],
}
const noExtra = buildUserPrompt(REQ79)
ok(!noExtra.includes('이것만 다룬다'), '비워두면 주제 묶음이 안 들어간다')
ok(!noExtra.includes('이번 글 요청'), '비워두면 요청 묶음도 안 들어간다')

/*
 * **2026-08-21 — 이 묶음은 정보글 전용이 됐다.** 회원 요청으로 홍보글의 운동 정보 구간을
 * 뺐으니, 그 구간의 주제를 지정하는 이 묶음도 홍보글에는 갈 자리가 없다. 화면에서도 칸을
 * 감췄지만, 옛 글을 불러오면 값이 남아 있을 수 있어서 **지시문 쪽에서도 무시한다.**
 */
const promoTopic = buildUserPrompt({ ...REQ79, infoTopic: '다이어트 첫 달에 할 것' })
ok(!promoTopic.includes('이것만 다룬다'), '홍보글에는 주제 묶음이 안 들어간다')
ok(!promoTopic.includes('다이어트 첫 달에 할 것'), '옛 글에 남은 주제 값이 홍보 지시문으로 새지 않는다')

const withTopic = buildUserPrompt({ ...REQ79, type: 'info', infoTopic: '다이어트 첫 달에 할 것' })
ok(withTopic.includes('## 이 글에서 다룰 주제 (이것만 다룬다)'), '정보글에는 주제 묶음이 들어간다')
ok(withTopic.includes('다이어트 첫 달에 할 것'), '적은 주제를 그대로 넣는다')
ok(withTopic.includes('다른 주제로 새지 않는다'), '한 주제만 다루라고 못박는다')
ok(withTopic.includes('5종류 이상'), '그 주제 안에서 정보 5종류를 요구한다 (실측 기준 유지)')

const withReq = buildUserPrompt({ ...REQ79, request: '주차 얘기는 빼고 샤워실을 강조해주세요' })
ok(withReq.includes('## 이번 글 요청 (이 문서의 다른 모든 지시보다 우선한다)'), '요청 묶음이 들어간다')
/*
 * **요청은 정말 맨 마지막에 있어야 한다** (2026-08-11 정정).
 *
 * 주석에는 「맨 마지막에」라고 적혀 있었는데 실제로는 아니었다 — 뒤에 로테이션·최근 글
 * 묶음을 붙이면서 요청이 가운데로 밀렸다. 회원이 「24시 내용 빼고」라고 했는데 그 뒤에 온
 * 「주력 앵글: 시간」이 이겨서 글이 온통 시간대 얘기가 됐다. 모델은 뒤쪽을 더 강하게
 * 따르므로 **위치가 곧 우선순위다.**
 */
const reqOrder = buildUserPrompt({
  ...REQ79,
  request: '24시 내용은 빼주세요',
  introType: '③ 비교형 — 몇 군데 알아보다가',
  angle: '방법',
  recent: [{ type: 'review', title: '지난 글', mainKeyword: 'k', introType: '① 검색 시작형', angle: '시간' }],
})
ok(
  reqOrder.indexOf('## 이번 글 요청') > reqOrder.indexOf('## 이번 글의 도입·전개'),
  '요청이 로테이션보다 뒤에 온다'
)
ok(reqOrder.indexOf('## 이번 글 요청') > reqOrder.indexOf('## 우리 블로그 최근 글'), '요청이 최근 글 묶음보다도 뒤에 온다')
ok(reqOrder.includes('빼달라고 한 것은 제목·소제목·본문 어디에도 넣지 않는다'), '빼달란 것을 어디에도 넣지 말라고 한다')
ok(reqOrder.includes('앵글을 버리고 요청을 따른다'), '앵글과 부딪히면 요청이 이긴다고 못 박는다')
// 키워드에 그 말이 박혀 있으면 (「쌍용동 24시헬스장」) 낱말은 남기고 축으로만 쓰지 않게 가른다
ok(reqOrder.includes('키워드로만 쓰고, 그 얘기를 설명하거나 소제목으로 세우지 않는다'), '키워드와 주제를 가른다')

/*
 * ─── 요청과 부딪히는 앵글은 **애초에 고르지 않는다** ─────────────
 *
 * 회원 지적: "24시 내용 빼고 작성해달라 했는데 이렇게 작성했어" (나온 글이 온통 시간대
 * 얘기였다). 지시문에 「부딪히면 요청이 이긴다」를 적는 것보다, 로테이션이 그 앵글을
 * 고르지 않게 하는 쪽이 확실하다 — 모델에게 모순을 주고 잘 풀기를 바라지 않는다.
 */
const { anglesToAvoid } = require(`${OUT}/writing/rotation.js`)
ok(anglesToAvoid('24시 내용 빼고 작성해줘').includes('시간'), '「24시 빼고」면 시간 앵글을 뺀다')
ok(anglesToAvoid('새벽 얘기는 제외해주세요').includes('시간'), '「새벽 제외」도 시간 앵글')
ok(anglesToAvoid('시간대 얘기 말고 다른 걸로').includes('시간'), '「시간대 말고」도 시간 앵글')
ok(anglesToAvoid('여성전용은 빼주세요').includes('안심(여성전용)'), '여성전용도 뺀다')
ok(anglesToAvoid('초보 얘기 없이 써주세요').includes('초보 진입장벽'), '초보도 뺀다')
// **그냥 언급한 것까지 빼면 요청을 거꾸로 읽는 셈이다**
ok(anglesToAvoid('24시간 운영하는 걸 강조해주세요').length === 0, '강조해달란 것을 빼지 않는다')
ok(anglesToAvoid('새벽에 오시는 분들 얘기를 넣어주세요').length === 0, '넣어달란 것을 빼지 않는다')
ok(anglesToAvoid('').length === 0 && anglesToAvoid(undefined).length === 0, '요청이 없으면 빼는 것도 없다')
// 로테이션이 실제로 그 앵글을 피하는지
const avoidAdv = adviseRotation([], 's', 'review', undefined, '24시 내용 빼고 작성해줘')
ok(avoidAdv.angle !== '시간', '로테이션이 시간 앵글을 고르지 않는다', avoidAdv.angle)
ok(avoidAdv.avoidedAngles?.includes('시간'), '무엇을 뺐는지 알려준다')
// 전부 걸러지면 원래 목록으로 돌아간다 (앵글이 없는 것보다는 낫다)
const allAvoid = adviseRotation([], 's', 'review', undefined, '시간 빼고 지속 빼고 방법 빼고 초보 빼고')
ok(Boolean(allAvoid.angle), '전부 걸러져도 앵글은 하나 준다', allAvoid.angle)

/*
 * ─── 빼달란 낱말을 **프롬프트 전체에서** 걷어낸다 ──────────────────
 *
 * 회원 지적 (두 번째): "24시 내용 빼달라 그랬는데 더 홍보하고 있어."
 *
 * 앞 판에서 앵글만 걸렀더니 부족했다. 프롬프트 전체를 훑어보니 **다른 자리에서 24시를
 * 밀고 있었다** — 가장 센 것이 상위노출 분석 처방이었다:
 *     - 상위 제목에 반복되는 말: **24시**, PT, 후기, 추천
 * 「이 말들을 제목에 넣어라」는 뜻이라 요청과 정면으로 부딪히고, 처방은 구체적이라 모델이
 * 더 강하게 따른다. 지점 정보의 「24시간 운영: 예」도 같은 일을 한다.
 */
const { excludedWords } = require(`${OUT}/writing/rotation.js`)
const { dropExcluded } = require(`${OUT}/analysis/prescription.js`)

ok(excludedWords('24시 내용은 빼고 작성해주세요').includes('24시'), '빼달란 낱말을 뽑는다')
ok(!excludedWords('24시 내용은 빼고 작성해주세요').includes('내용'), '「내용」같은 말은 주제가 아니다')
ok(excludedWords('여성전용은 빼주세요').includes('여성전용'), '조사를 떼어낸다')
ok(excludedWords('주차 얘기는 넣지 말아주세요').includes('주차'), '「넣지 말아」도 부정으로 읽는다 (마 ≠ 말)')
ok(excludedWords('가격은 언급하지 마세요').includes('가격'), '「언급하지 마」도 읽는다')
ok(excludedWords('').length === 0, '요청이 없으면 없다')
// 넣어달란 것을 빼면 요청을 거꾸로 읽는 셈이다
ok(excludedWords('24시간 운영을 강조해주세요').length === 0, '강조해달란 것은 뽑지 않는다')

// 처방에서 그 낱말만 뺀다 (줄은 살린다 — 나머지 낱말은 쓸모가 있다)
const rxDropped = dropExcluded(['상위 제목에 반복되는 말: 24시, PT, 후기, 추천. 반영하세요.'], ['24시'])
ok(rxDropped[0].includes('PT') && !rxDropped[0].includes('24시'), '낱말 목록에서 그 말만 뺀다', rxDropped[0])
// 줄 전체가 그 낱말 얘기면 줄을 버린다
ok(dropExcluded(['24시 검색량이 큽니다. 제목에 넣으세요.', '제목은 31~39자'], ['24시']).length === 1, '그 낱말 얘기인 줄은 버린다')
ok(dropExcluded(['제목은 31~39자'], ['24시'])[0] === '제목은 31~39자', '관계없는 줄은 그대로')
ok(dropExcluded(['상위 제목에 반복되는 말: 24시. 반영하세요.'], ['24시']).length === 0, '남는 낱말이 없으면 줄을 버린다')
ok(dropExcluded(['제목은 31~39자'], []).length === 1, '빼는 게 없으면 그대로')

/*
 * 프롬프트 전체 검사 — 빼달란 낱말이 **어디에도 남지 않아야** 한다.
 * 예외는 두 곳뿐이다: 회원이 적은 요청 문장 그대로, 그리고 우리가 만든 「쓰지 않을 말」 목록.
 */
const excStore = {
  id: 's', name: '두정점', legalName: 'MTO 피트니스 두정점', location: '천안 두정동', phone: '041-000-0000',
  open24: true,
  features: ['24시간 출입 가능', '샤워실 2칸'],
  strengths: ['새벽에도 트레이너 상주'],
  localKeywords: ['두정동 헬스장'],
}
const excPrompt = buildUserPrompt({
  type: 'review', store: excStore, mainKeyword: '두정동 헬스장', subKeywords: ['두정동PT'],
  request: '24시 내용은 빼고 작성해주세요',
  angle: '지속', introType: '③ 비교형 — 몇 군데 알아보다가',
  prescription: ['상위 제목에 반복되는 말: 24시, PT, 추천. 반영하세요.'],
})
const leaks = excPrompt
  .split('\n')
  .filter((l) => /24\s*시/.test(l))
  .filter((l) => !l.includes('빼고 작성해주세요') && !l.includes('쓰지 않을 말'))
ok(leaks.length === 0, `프롬프트에 24시를 미는 줄이 없다 — ${JSON.stringify(leaks)}`)
ok(!excPrompt.includes('24시간 운영: 예'), '지점 정보의 24시간 운영 줄도 내지 않는다')
ok(!excPrompt.includes('24시간 출입 가능'), '시설 특징에서도 그 항목을 뺀다')
ok(excPrompt.includes('샤워실 2칸'), '관계없는 시설은 그대로 남긴다')
ok(excPrompt.includes('이 글에서 쓰지 않을 말: 24시'), '쓰지 않을 말을 목록으로 못 박는다')
ok(excPrompt.includes('같은 뜻으로 도는 말도 쓰지 않는다'), '돌려 쓰는 것도 막는다')
ok(excPrompt.includes('시간대'), '무엇으로 돌려 쓰면 안 되는지 예를 든다')
// 지시문의 부정 예시에도 그 낱말이 남아 있을 이유가 없다
ok(!buildSystemPrompt('review').includes('"24시간 운영"'), '지시문 예시에서도 뺐다')
// 요청이 없으면 지점 정보가 온전히 나온다 (거르기가 과하게 작동하면 안 된다)
const noExc = buildUserPrompt({
  type: 'review', store: excStore, mainKeyword: '두정동 헬스장', subKeywords: [],
})
ok(noExc.includes('24시간 운영: 예') && noExc.includes('24시간 출입 가능'), '요청이 없으면 지점 정보를 다 준다')
ok(withReq.includes('주차 얘기는 빼고'), '적은 요청을 그대로 넣는다')
/*
 * **형식 규칙은 요청보다 위다.** 「우선한다」만 적어두면 모델이 글자수·키워드 횟수까지
 * 무시할 수 있고, 그러면 검수에서 떨어진다.
 */
ok(withReq.includes('형식 규칙'), '형식 규칙은 지키라고 함께 적는다')
ok(withReq.includes('기계가 검사한다'), '왜 지켜야 하는지 말한다')
ok(
  withReq.indexOf('## 이번 글 요청') > withReq.indexOf('## 이번 글'),
  '요청은 뒤쪽에 둔다 (모델이 뒤를 더 강하게 따른다)'
)

// 키워드 자리를 세어서 지시한다 — 매번 미달나던 항목
const slots = buildSystemPrompt('promo')
ok(slots.includes('자리를 먼저 정하고'), '자리를 정해서 넣으라고 한다')
ok(slots.includes('①제목'), '자리를 번호로 짚어준다')
ok(slots.includes('소제목에 넣은 것도 세어진다'), '소제목이 세어진다고 알려준다')

// ─────────────────────────────────────────────────────────────
console.log('\n[80] 고쳐 쓰기가 반영되지 않던 이유 — 점수 상한')
/*
 * 회원: "검수항목 고쳐쓰기 하는데 반영이 안돼 왜그런거야?"
 * 화면 메시지: "79점으로 나왔습니다 (고쳐 써도 나아지지 않아 원래 글을 두었습니다)"
 *
 * 고쳐 쓰기는 돌아갔다. 버려진 것이다. 채택 조건이 `새 점수 > 옛 점수` 였는데,
 * **점수는 수정필요가 하나라도 있으면 79점(PUBLISH_THRESHOLD − 6)으로 상한이 걸린다.**
 * 그래서 수정필요를 2개 → 1개로 줄여도 79 → 79 이고, 개선된 글이 매번 버려졌다.
 *
 * 회원이 본 79점이 바로 그 상한값이다.
 */
ok(PUBLISH_THRESHOLD - 6 === 79, '상한값이 79 — 회원 화면의 그 숫자다', String(PUBLISH_THRESHOLD - 6))

/*
 * 수정필요가 여러 개일 때와 하나일 때 점수가 **같다**는 것을 고정한다.
 * 이 성질이 있는 한 점수 비교만으로는 개선을 알 수 없다.
 */
/*
 * 통과하는 글에서 항목을 하나씩 깨뜨려 본다. **깨진 개수가 달라도 점수는 상한에 붙는다** —
 * 이 성질이 있는 한 점수 비교만으로는 개선을 알 수 없다.
 */
const cap80Clean = checkPost(goodPromo)
ok(summarize(cap80Clean).fail === 0 && cap80Clean.score > PUBLISH_THRESHOLD - 6,
  '깨끗한 글은 상한 위에 있다', `${cap80Clean.score}점 · 수정필요 ${summarize(cap80Clean).fail}`)

// 제목에서 키워드를 빼면 여러 항목이 함께 걸린다 (횟수·제목 앞쪽·제목 유형)
const cap80Broken = checkPost({ ...goodPromo, title: '이번 달 등록 혜택 안내드립니다' })
// 전화번호까지 지우면 하나 더 걸린다 (같은 방향으로 더 나빠진 글)
const cap80Worse = checkPost({
  ...goodPromo,
  title: '이번 달 등록 혜택 안내드립니다',
  body: goodPromo.body.replace(/MTO 피트니스 쌍용점/g, '저희 지점'),
})
ok(summarize(cap80Broken).fail > 0, '하나 깨면 수정필요가 생긴다', String(summarize(cap80Broken).fail))
ok(summarize(cap80Worse).fail > summarize(cap80Broken).fail, '더 깨면 수정필요가 늘어난다',
  `${summarize(cap80Broken).fail} → ${summarize(cap80Worse).fail}`)
ok(cap80Broken.score === PUBLISH_THRESHOLD - 6, '수정필요가 있으면 점수가 상한에 붙는다',
  `${cap80Broken.score}점`)
ok(cap80Worse.score === cap80Broken.score,
  '수정필요 개수가 달라도 점수는 같다 — 점수 비교로는 개선이 안 보인다',
  `${cap80Worse.score} vs ${cap80Broken.score}`)

/*
 * 그래서 채택 규칙을 「수정필요 개수 먼저, 같으면 점수」로 바꿨다.
 * 규칙 자체는 라우트에 있지만 그 규칙이 성립해야 하는 조건을 여기서 고정한다.
 */
const betterBy = (aFail, aScore, bFail, bScore) => bFail < aFail || (bFail === aFail && bScore > aScore)
ok(betterBy(2, 79, 1, 79), '수정필요가 줄면 채택한다 (예전에는 버렸다)')
ok(betterBy(1, 79, 0, 92), '수정필요가 0이 되면 상한이 풀려 점수도 오른다')
ok(!betterBy(1, 79, 2, 79), '수정필요가 늘면 버린다')
ok(betterBy(1, 79, 1, 79) === false, '아무것도 안 바뀌면 버린다')
ok(betterBy(0, 88, 0, 91), '수정필요가 없을 때는 점수로 가른다')

// 고쳐 쓰기 지시문 — 수정필요 우선, 나머지는 건드리지 않기
const fix80Prompt = buildFixPrompt(['[수정필요] 메인 키워드: 지금 2회 / 기준 5회'], 1800, { charMin: 1750, charMax: 2400 })
ok(fix80Prompt.includes('글을 새로 쓰지 말고'), '전체를 다시 쓰지 말라고 한다')
ok(fix80Prompt.includes('[수정필요] 부터 반드시 해결한다'), '수정필요를 먼저 고치라고 한다')
ok(fix80Prompt.includes('이미 통과한 것은 건드리지 않는다'), '맞던 것을 깨지 말라고 한다')
ok(fix80Prompt.includes('문장을 새로 만들지 말고'), '키워드를 억지로 늘리지 않는 방법을 준다')
ok(fix80Prompt.includes('[주의] 는 남아도 발행할 수 있으니'), '주의는 남겨도 된다고 알려준다')

/*
 * ─── 분량이 모자랄 때는 **반대로** 말해야 한다 ──────────────────
 *
 * 회원 지적 (2026-08-11): "글이 882자만 나와. 최소 1,500자는 나와야 하고."
 *
 * 고쳐 쓰기를 돌려도 늘어나지 않는 이유가 이 지시문에 있었다 — 「글을 새로 쓰지 말고」·
 * 「문장을 새로 만들지 말고」가 박혀 있었다. 그건 키워드 횟수처럼 있는 문장을 손보는
 * 항목을 위한 말인데, 800자를 더 써야 하는 상황에서는 **정확히 반대 지시**가 된다.
 */
const fixShort = buildFixPrompt(['[수정필요] 본문 글자수: 지금 882자 / 기준 1,700~2,800자'], 882, { charMin: 1700, charMax: 2800 })
ok(fixShort.includes('본문을 늘려서'), '모자라면 늘리라고 말한다')
ok(!fixShort.includes('글을 새로 쓰지 말고'), '「새로 쓰지 말라」를 빼야 늘릴 수 있다')
ok(fixShort.includes('818자를 더 써야 한다'), '몇 자 모자란지 숫자로 준다', fixShort.match(/[\d,]+자를 더 써야 한다/)?.[0])
ok(fixShort.includes('가장 짧은 단계를 찾는다'), '어디를 늘릴지 방법을 준다')
ok(fixShort.includes('문장을 새로 만들어도 된다'), '문장을 만들어도 된다고 허락한다')
ok(fixShort.includes('일반론'), '물타기로 늘리지 말라고 한다')
// 분량이 맞으면 예전 지시문 그대로다 (있는 문장만 손보는 게 맞는 상황이다)
ok(fix80Prompt.includes('글을 새로 쓰지 말고') && !fix80Prompt.includes('본문을 늘려서'), '분량이 맞으면 늘리라고 하지 않는다')
ok(!fix80Prompt.includes('자를 더 써야 한다'), '모자라지 않으면 그 말이 없다')
// 너무 길 때도 숫자로 말한다
const fixLong = buildFixPrompt(['본문 글자수: 지금 3,200자'], 3200, { charMin: 1700, charMax: 2800 })
ok(fixLong.includes('400자를 줄여야 한다'), '넘치면 줄일 양을 말한다', fixLong.match(/[\d,]+자를 줄여야 한다/)?.[0])
// 「문단 구성을 그대로 두라」와 「818자를 더 써라」가 부딪히지 않게 한다
ok(fixShort.includes('문단과 문장은 늘려도 된다'), '늘릴 때는 문단을 건드려도 된다고 한다')
ok(!fixShort.includes('문단 구성·소제목 개수·이미지 자리·화자·상호명은 그대로 두고'), '모자랄 때는 문단 고정 지시를 빼낸다')
ok(fixShort.includes('소제목 개수·소제목 순서·이미지 자리·화자·상호명은 그대로 둔다'), '지켜야 할 것은 그대로 지킨다')

/*
 * 생성 지시문에도 분량을 한 번 더 못박는다 — 단계별 숫자만으로는 모델이 각 단계를
 * 짧게 끝내고 넘어갔다. 합계와 「미달은 실패」를 함께 적는다.
 */
for (const t of ['promo', 'info', 'review']) {
  const sp = buildSystemPrompt(t)
  ok(sp.includes('자 미만이면 실패다'), `${t} 지시문이 미달을 실패로 못 박는다`)
  ok(sp.includes('단계별 글자수를 하나씩 채워라'), `${t} 지시문이 단계별로 채우라고 한다`)
  ok(sp.includes('단계마다 분량을 대조해서'), `${t} 지시문이 다 쓴 뒤 대조하라고 한다`)
}

// ─────────────────────────────────────────────────────────────
console.log('\n[81] 이벤트 훅 — 후킹에서 흘렸는가')
/*
 * 회원 지적: "첫 구조에서 이벤트에 대한 훅이 없는 것 같아." 지시문에는 있었는데 나온 글에는
 * 없었다 — 아무도 안 잡고 있었기 때문이다. 순위 기준이 아니라 우리 규칙이다.
 */
const hookItem = (input) => checkPost(input).items.find((i) => i.id === 'event-hook')
ok(hookItem(goodPromo)?.level === 'pass', `기준 글은 통과 — ${hookItem(goodPromo)?.value}`)

// 이벤트가 없으면 항목을 만들지 않는다 (없는 것을 안 넣었다고 감점하면 안 된다)
ok(hookItem({ ...goodPromo, eventText: undefined }) === undefined, '이벤트가 없는 글에는 항목이 안 생긴다')

const stripHook = goodPromo.body.replace('이번 달에는 그 시간대에 오시는 분들을 위한 혜택을 걸었어요. 3개월 이용권을 10만 원 아래로 맞췄고 인원은 정해뒀습니다. 정확한 조건은 아래에서 정리해 드릴게요.', '오늘은 그 시간 문제를 어떻게 풀면 되는지 정리해서 말씀드릴게요.')
const noHook = hookItem({ ...goodPromo, body: stripHook })
ok(noHook?.level === 'fail', `훅을 빼면 수정필요 — ${noHook?.value}`)
ok(noHook?.hint?.includes('한 문장만 흘리세요'), '무엇을 쓰면 되는지 예문을 준다')

// 절반만 있으면 주의 — ㉮만 있으면 광고 문구, ㉯만 있으면 무엇이 걸렸는지 모른다
const offerOnly = hookItem({ ...goodPromo, body: goodPromo.body.replace('3개월 이용권을 10만 원 아래로 맞췄고 인원은 정해뒀습니다. 정확한 조건은 아래에서 정리해 드릴게요.', '3개월 이용권 가격을 낮췄습니다.').replace('이번 달에는 그 시간대에 오시는 분들을 위한 혜택을 걸었어요.', '그 시간대에 오시는 분들을 위해 준비한 게 있어요.') })
ok(offerOnly?.level === 'warn', `혜택만 있으면 주의 — ${offerOnly?.value}`)

// 내용 없는 예고는 훅이 아니다
const emptyTease = hookItem({ ...goodPromo, body: stripHook.replace('오늘은 그 시간 문제를', '이벤트도 진행 중입니다. 오늘은 그 시간 문제를') })
ok(emptyTease?.level === 'warn', `「이벤트 진행 중입니다」만으로는 통과 못 한다 — ${emptyTease?.value}`)

/*
 * **후기글도 본다** (2026-08-11). 회원 요청: "후기글도 도입부에 이벤트 홍보성을 넣어야
 * 하고." 전에는 「후기글의 예고는 방문자 시점 한 줄이면 된다」며 검사에서 뺐는데, 그 「한
 * 줄」이 실제로는 「혜택이 있었어요」로 끝나 아무 정보가 없었다.
 */
ok(hookItem({ ...goodPromo, type: 'info' }) === undefined, '정보글에는 항목이 안 생긴다 (이벤트 글이 아니다)')
const revHook = hookItem({ ...goodPromo, type: 'review', sponsorship: 'own' })
ok(revHook !== undefined, '후기글에도 항목이 생긴다')
const revHookMissing = hookItem({ ...goodPromo, type: 'review', sponsorship: 'own', body: stripHook })
ok(revHookMissing?.level === 'fail', `후기글도 훅이 없으면 잡는다 — ${revHookMissing?.value}`)
ok(revHookMissing?.hint.includes('방문객 말투로'), '후기글에는 방문객 말투로 쓰라고 한다')
ok(revHookMissing?.hint.includes('지금 신청하세요'), '센터 말투를 막는다')
ok(!hookItem({ ...goodPromo, body: stripHook })?.hint.includes('방문객 말투로'), '홍보글에는 그 말을 하지 않는다')
// 지시문에도 적혀 있어야 한다
const revHookSys = buildSystemPrompt('review')
ok(revHookSys.includes('마지막 한두 문장은 이벤트 훅이다'), '후기글 골격이 이벤트 훅을 시킨다')
ok(revHookSys.includes('센터 말투로 외치지 않는다'), '말투를 방문객 쪽으로 못 박는다')

/*
 * ─── 협찬 표기는 **맨 아래** ────────────────────────────────
 *
 * 회원 요청: "협찬 문구는 제일 하단에 표시될 수 있도록 해줘."
 * 공정위 「추천·보증 심사지침」은 표시문구를 게시물의 **처음 또는 끝**에 두게 하므로 끝도
 * 문제없다. 다만 정말 끝이어야 한다 — 더보기로 접히거나 댓글로 밀리면 표기가 아니다.
 */
const spItem = (body) =>
  checkPost({ ...goodPromo, type: 'review', sponsorship: 'sponsored', body, tags: ['쌍용동헬스장', '협찬후기'] })
    .items.find((i) => i.id === 'sponsorship')
const revBody = goodPromo.body
ok(spItem(`${revBody}\n이 글은 MTO 피트니스 쌍용점에서 시설 이용을 제공받아 작성했습니다.`)?.level === 'pass',
  '맨 아래에 있으면 통과')
ok(spItem(`이 글은 제공받아 작성했습니다.\n${revBody}`)?.level === 'warn', '위쪽에 있으면 주의로 내린다')
ok(spItem(`이 글은 제공받아 작성했습니다.\n${revBody}`)?.hint.includes('맨 마지막 구간으로 내리세요'), '어디로 옮기라고 말한다')
ok(spItem(`이 글은 제공받아 작성했습니다.\n${revBody}`)?.hint.includes('처음 또는 끝'), '왜 끝이어도 되는지 근거를 준다')
// 태그에만 있으면 주의다 — 「본문에도 밝히세요」라고 조언하면서 통과를 주면 고칠 이유가 없다
const spTagOnly = spItem(revBody)
ok(spTagOnly?.level === 'warn', '태그에만 있으면 주의', spTagOnly?.value)
ok(spTagOnly?.hint.includes('태그만으로는'), '태그만으로 부족한 이유를 말한다')
// 아무 데도 없으면 즉시수정 (표시광고법)
const spNone = checkPost({ ...goodPromo, type: 'review', sponsorship: 'sponsored', body: revBody, tags: ['쌍용동헬스장'] })
  .items.find((i) => i.id === 'sponsorship')
ok(spNone?.level === 'fail', '아무 데도 없으면 즉시수정', spNone?.value)
ok(spNone?.hint.includes('표시광고법'), '법 위반이라고 밝힌다')
// 지시문
ok(revHookSys.includes('본문 맨 마지막에') || buildUserPrompt({
  type: 'review',
  store: { legalName: 'MTO 피트니스 쌍용점', location: '천안', phone: '041' },
  mainKeyword: '쌍용동 헬스장',
  subKeywords: [],
  sponsorship: 'sponsored',
}).includes('본문 맨 마지막에'), '지시문이 맨 마지막에 쓰라고 한다')

/*
 * ─── 2단계도 망설임에서 풀어준다 ────────────────────────────
 *
 * 회원 지적: "완전 도입부가 아니라 도입부 바로 아래는 망설이는 이유로 시작하는 거 같아."
 * 1단계만 로테이션에 붙였더니 망설임이 한 칸 아래로 밀려났을 뿐이었다.
 */
ok(!revHookSys.includes('등록해도 안 가게 될까 하는 불안을 본인 이야기로'), '2단계에 망설임이 박혀 있지 않다')
ok(revHookSys.includes('1단계에서 연 이야기를 그대로 이어간다'), '2단계는 도입을 이어가라고 한다')
ok(revHookSys.includes('망설임·불안으로 되돌아가지 않는다'), '망설임으로 돌아가지 말라고 한다')

// 지시문과 검사가 같은 것을 요구해야 한다 (어긋나면 AI 는 옛 규칙으로 쓰고 검수는 새 규칙으로 잰다)
const hookPrompt = buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], eventText: '8월 3개월 9.9만원 선착순 50명' })
ok(hookPrompt.includes('### 이벤트 훅 (첫 구간에 반드시 넣는다)'), '이벤트가 있으면 훅 지시를 따로 낸다')
ok(hookPrompt.includes('「무엇이 있다」 + 「제한이 있다」'), '검사와 같은 두 조각을 요구한다')
ok(hookPrompt.includes('이벤트 진행 중입니다'), '내용 없는 예고를 예시로 금지한다')
const noEventPrompt = buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'] })
ok(!noEventPrompt.includes('이벤트 훅'), '이벤트가 없으면 훅 지시도 안 낸다')
const infoHookPrompt = buildUserPrompt({ type: 'info', mainKeyword: '스쿼트 자세', subKeywords: ['하체운동'], eventText: '8월 이벤트' })
ok(!infoHookPrompt.includes('이벤트 훅'), '정보글에는 훅 지시를 안 낸다')

// ─────────────────────────────────────────────────────────────
console.log('\n[82] 정보글 — 화자는 센터, 정보 8 : 홍보 2')
/*
 * 회원 요청: "화자는 센타 입장에서 정보성 주제를 알려주는 느낌으로 해주고 정보성 8 :
 * 홍보성 2 느낌으로 글 마지막에는 홍보가 들어갈 수 있게 해줘."
 * 순위 기준이 아니다 — 이 글의 목적(신뢰 축적) 쪽 규칙이다.
 */
const infoSys = buildSystemPrompt('info')

/*
 * ── 정보글을 개편했다 (2026-08-20) ─────────────────────────────
 *
 * 회원이 영상을 주며 "이 영상을 분석해서 정보성글 다시 개편하자"고 했다
 * (머니코치 최준호, 「열심히 쓴 글이 쓰레기 취급받는 이유」).
 *
 * 영상 근거는 네이버 공식 공지다 — 「연락을 유도하는 활동」이 홍보성 게시물이다. 금지 목록
 * 여섯 가지: 전화번호·플레이스/위치·상호명 반복·홍보 링크·혜택 낱말·방문 유도.
 * 우리 실측도 같은 방향이었다 — 1페이지 정보형 38편 중 25편(66%)이 홍보 요소 0개.
 *
 * **이 개편은 회원의 옛 요청 두 개를 덮는다.** 조용히 바꾸지 않으려고 여기 적어 둔다:
 *   ① "정보성 8 : 홍보성 2 느낌으로 글 마지막에는 홍보가 들어갈 수 있게" (2026-08-07)
 *   ② "화자는 센타로 해서 해주고 상호명도 함께 소개될 수 있게" (2026-08-10)
 */
ok(infoSys.includes('자기가 업체 사람이라는 것을 드러내지 않는다'), '정보글은 업체 사람인 것을 드러내지 않는다')
/*
 * **화자를 「센터」에서 「일반 블로거」로 되돌렸다** (2026-08-27 회원 요청: "그냥 정보성을
 * 쓸때는 센타 입장에서 쓰는게 아니라 일반 블로거가 쓰는 느낌으로 해줘").
 *
 * 2026-08-10 에는 반대로 갔었다 — 그때는 정보글 마지막에 홍보 구간이 있어서(정보 8 : 홍보 2)
 * 화자가 센터인 것이 자연스러웠다. 08-20 에 홍보 구간을 걷어내고 08-21·08-27 에 「상담」과
 * 「회원님」을 막으면서, 화자만 센터로 남은 것이 어긋난 자리가 됐다.
 */
ok(infoSys.includes('일반 블로거'), '화자가 일반 블로거다')
ok(!infoSys.includes('"제가 상담할 때"'), '옛 화자 예시(제가 상담할 때)가 남아 있지 않다')
/*
 * **겪지 않은 경험을 지어내라는 말이 아니다.** 이 글을 실제로 쓰는 사람은 센터 운영자다.
 * 「제가 3개월 해보니 5kg 빠졌어요」는 없는 체험이고 그건 기만적 광고가 된다.
 */
ok(infoSys.includes('겪지 않은 개인 경험을 지어내지도 않는다'), '없는 체험을 지어내지 말라고 함께 못 박는다')
ok(infoSys.includes('정보 10 : 홍보 0'), '비중을 숫자로 적는다 — 홍보 0')
ok(!infoSys.includes('정보 8 : 홍보 2'), '옛 비중(8:2)이 남아 있지 않다')
ok(!infoSys.includes('센터 소개 + 상담 유도'), '마지막 홍보 구간을 없앴다')
// 2026-08-20 에 「고를 때 기준」이 4) 로 들어가면서 마무리가 6) 이 됐다
ok(infoSys.includes('6) 마무리'), '그 자리를 정보 마무리로 바꿨다')
ok(infoSys.includes('홍보성 게시물로 분류'), '왜 빼는지(분류 위험) 밝힌다')
ok(infoSys.includes('어느 단계에도 홍보 낱말을 쓰지 않는다 — 하나도.'), '어느 단계에도 안 섞는다 (예외 없음)')
/*
 * 회원: "정보성에는 홍보문구가 아예 들어가면 안돼 상담도 홍보문구잖아 알고 있는거지?"
 * 우리 코드가 이미 CTA_WORDS 로 「상담·예약·문의」를 세고 있었는데 정보글에서만 예외였다.
 */
ok(infoSys.includes('「상담」·「예약」·「문의」'), '「상담」을 콕 집어 막는다')
// 08-27: 그 대체 표현으로 권했던 말들도 결국 운영자 신분을 드러낸다 — 함께 막는다
ok(infoSys.includes('운영자·트레이너 신분이 드러나는 말도 쓰지 않는다'), '신분이 드러나는 말도 막는다')
ok(infoSys.includes('대한비만학회 자료를 보면'), '근거를 댈 자리에 무엇을 쓸지 준다 (출처)')

/*
 * **「우리 회원」 관계도 홍보 문구다** (2026-08-27 회원 요청: "정보성글에는 제가 센타
 * 상담하다보면 등록하는 회원님들 이런 문구들도 모두빼줘").
 *
 * 08-21 에 「상담」을 막으면서 대체 표현으로 「회원분들 보면」을 권했는데, 그게 잘못이었다 —
 * 낱말만 바뀌었지 **「나는 이 사람들의 업체다」라는 관계는 그대로**다. 읽는 사람에게는
 * 「당신도 등록하면 저 회원분들처럼 된다」로 읽힌다.
 */
ok(infoSys.includes('「회원님」·「회원분들」·「등록하신 분들」'), '우리 회원을 가리키는 말도 막는다')
ok(!infoSys.includes('「회원분들 보면」으로 바꿔라'), '옛 대체 표현(회원분들 보면)이 남아 있지 않다')

/*
 * **인사는 하되 상호명은 안 붙인다** (2026-08-21). 회원: "정보성글 인사말이 없어서 어색해
 * 인사 문구는 넣어주면 좋을거 같아."
 *
 * 2026-08-20 에 뺐던 것은 상호명이지 인사가 아니었는데, 「안녕하세요, ○○입니다」가 한
 * 덩어리라 인사까지 같이 나갔다. 갈라 놓으면 둘 다 지킬 수 있다 — 인사는 네이버가 홍보성으로
 * 보는 여섯 가지에 없고, 실측에서도 순위 손해가 없었다 (인사 27% / 아닌 글 32%, 구간 겹침).
 */
ok(infoSys.includes('**첫 문장은 인사다.**'), '인사로 열라고 한다')
/*
 * **인사에서 상호명을 뺐다** (2026-08-27, 화자가 일반 블로거가 되면서). 인사 자체는 남는다 —
 * 08-21 회원 요청 "정보성글 인사말이 없어서 어색해". 인사와 상호명은 갈라 놓을 수 있다.
 */
ok(infoSys.includes('안녕하세요. 오늘은 (메인 키워드)에 대해 정리해 보려고 합니다.'), '인사 형식을 그대로 준다')
ok(infoSys.includes('상호명·지점명은 이 글 어디에도 넣지 않는다'), '인사에도 상호명을 넣지 않는다')
ok(!infoSys.includes('(정식 상호명)입니다. 오늘은'), '옛 인사 형식(상호명 포함)이 남아 있지 않다')
ok(infoSys.includes('업체 이야기는 이 글 어디에도 없다'), '업체 얘기를 통째로 막는다')
ok(!infoSys.includes('인사·상호명·업체 소개로 열지 않는다'), '「인사하지 마라」를 지웠다')
ok(!infoSys.includes('첫 문장에서 인사와 정식 상호명으로 누가 말하는지 밝힌다'), '「인사로 밝혀라」를 지웠다')
/*
 * **지시와 검수가 반대가 되지 않게** 한다. 2026-08-10 에 지시는 「인사로 열지 마라」인데
 * 검수는 인사를 요구해서 서로 반대였던 적이 있다. 이번에는 검수 쪽도 같이 껐다.
 */
const greetInfo = checkPost({ type: 'info', title: '폭식 멈추는 방법, 순서부터 바꿔보세요', body: '제가 상담할 때 이 질문을 제일 많이 받습니다.\n\n## 왜\n혈당이 낮게 유지되다 떨어지면서 생깁니다.', mainKeyword: '폭식 멈추는 방법', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' })
/*
 * **인사는 남기고 상호명은 뺐다** (2026-08-27). 회원: "그냥 정보성을 쓸때는 센타 입장에서
 * 쓰는게 아니라 일반 블로거가 쓰는 느낌으로 해줘."
 *
 * 08-21 에는 「인사 + 상호명 1회」였다 (회원 요청 "인사말에 업체명 한번을 소개되게").
 * 화자가 센터였으니 자기 이름을 밝히는 것이 자연스러웠다. 화자가 일반 블로거가 된 지금은
 * **그 한 줄로 화자가 도로 업체가 된다** — 뒤를 아무리 깨끗하게 써도 첫 문장이 「저희
 * 업체입니다」이면 나머지는 그 업체의 홍보로 읽힌다.
 *
 * 인사 자체는 남는다 (08-21 회원 요청 "정보성글 인사말이 없어서 어색해"). 둘은 갈라 놓을
 * 수 있다.
 */
{
  const item = greetInfo.items.find((i) => i.id === 'intro-greeting')
  ok(Boolean(item), '정보글에도 인사 검사가 생긴다')
  ok(item.target.includes('상호명은 넣지 않습니다'), `정보글 목표에 상호명 금지를 적는다 — ${item.target}`)
  ok(item.value === '없음', `인사가 없으면 잡는다 — ${item.value}`)
  // 상호명이 없다고 즉시수정을 주지 않는다 — 없는 게 정상이다
  ok(item.level === 'warn', '인사가 없으면 주의 (상호명은 안 센다)', item.level)

  const OPEN = '안녕하세요. 오늘은 폭식 멈추는 방법에 대해 정리해 보려고 합니다.'
  const greeted = checkPost({ type: 'info', title: '폭식 멈추는 방법, 순서부터 바꿔보세요', body: `${OPEN}\n\n## 왜\n혈당이 낮게 유지되다 떨어지면서 생깁니다.`, mainKeyword: '폭식 멈추는 방법', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' })
  ok(greeted.items.find((i) => i.id === 'intro-greeting')?.level === 'pass', '상호명 없는 인사면 통과')
  ok(greeted.items.find((i) => i.id === 'info-purity')?.level === 'pass', '상호명이 없으니 순수성도 통과')

  // **1회부터 잡는다** — 08-21 에는 1회를 허용했는데, 화자가 바뀌면서 그 예외가 없어졌다
  const once = checkPost({ type: 'info', title: '폭식 멈추는 방법, 순서부터 바꿔보세요', body: `안녕하세요, MTO 피트니스 쌍용점입니다.\n\n## 왜\n혈당이 낮게 유지되다 떨어지면서 생깁니다.`, mainKeyword: '폭식 멈추는 방법', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' })
  const p1 = once.items.find((i) => i.id === 'info-purity')
  ok(p1?.level === 'fail' && p1.value.includes('상호명 1회'), `상호명은 1회부터 즉시수정 — ${p1?.value}`)
  ok(once.items.find((i) => i.id === 'intro-greeting')?.value.includes('상호명이 섞임'), '인사에 상호명이 섞였다고 알린다')

  // 제목에는 여전히 안 된다 (자리가 다르다)
  const inTitle = checkPost({ type: 'info', title: 'MTO 피트니스 쌍용점 폭식 멈추는 방법', body: `${OPEN}\n\n## 왜\n내용입니다.`, mainKeyword: '폭식 멈추는 방법', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' })
  ok(inTitle.items.find((i) => i.id === 'info-title-purity')?.value.includes('상호명'), '제목의 상호명은 그대로 잡는다')

  // 홍보글은 3회 그대로
  ok(SPECS.promo.legalNameMin === 3 && SPECS.info.legalNameMin === 0, `홍보 3회 · 정보 0회 — ${SPECS.promo.legalNameMin}/${SPECS.info.legalNameMin}`)
}
const greetPromo = checkPost({ ...goodPromo, body: '쌍용동 헬스장 이야기입니다.\n\n## 소제목\n' + '가'.repeat(1800) })
ok(greetPromo.items.some((i) => i.id === 'intro-greeting'), '홍보글에는 인사 검사가 그대로 있다')

// 분량 — 회원: "정보성 글 분량이 부족한 거 같아 늘려서 업데이트 해줘"
ok(SPECS.info.charMin === 2200 && SPECS.info.charMax === 3000, `정보글 분량 2,200~3,000자 — ${SPECS.info.charMin}~${SPECS.info.charMax}`)
/*
 * **1 → 0** (2026-08-27). 회원: "일반 블로거가 쓰는 느낌으로 해줘." 화자가 업체가 아니므로
 * 자기 이름을 밝힐 자리가 없다 (SPECS.info 의 legalNameMin 주석에 근거를 적어 뒀다).
 */
ok(SPECS.info.legalNameMin === 0, `정보글에는 상호명이 없다 — ${SPECS.info.legalNameMin}회`)
/*
 * 「방법」은 여전히 최대 구간이다. 2026-08-20 에 구간이 하나 늘면서 800~1,000 → 700~900 으로
 * 줄었지만, **다른 어느 구간보다 크다**는 것이 이 검사가 지키려던 것이다. 숫자를 박아 두면
 * 구간을 조정할 때마다 이 줄만 고치게 되므로, 「가장 큰가」로 바꿔서 확인한다.
 */
{
  const spans = [...infoSys.matchAll(/^\d\) (.+?) (\d[\d,]*)~(\d[\d,]*)자/gm)].map((m) => [
    m[1],
    Number(m[3].replace(/,/g, '')),
  ])
  const biggest = spans.slice().sort((a, b) => b[1] - a[1])[0]
  ok(biggest?.[0] === '방법', `정보 본문 최대 구간은 「방법」이다 — ${biggest?.[0]} ${biggest?.[1]}자`)
}
ok(infoSys.includes('종류를 늘리지 말고 깊이를 늘린다'), '자수만 늘리지 말라고 한다')

const infoSkeleton = buildTemplate('info', { mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'], localKeyword: '천안헬스장', store: { id: 's', name: 'MTO 쌍용점', legalName: 'MTO 피트니스 쌍용점', localKeywords: ['천안헬스장'], phone: '010-2455-2896' } })
/*
 * **손으로 쓰는 판과 기계가 쓰는 판이 같은 말을 하는가** (2026-08-20).
 *
 * 지시문에서 정보글의 홍보를 걷어냈는데 골격만 옛 판이었다 — 인사 + 상호명으로 열고
 * 마지막에 「센터 소개 + 상담 유도」 400~500자가 있었다. 그 골격대로 손으로 쓰면 그 글이
 * 검수의 `info-purity` 에 걸린다. 아래 네 줄은 옛 판을 지키던 검사였고, **지금은 반대를
 * 지킨다** — 그 자리가 비면 다음에 또 한쪽만 고치게 된다.
 */
/*
 * **골격도 같은 인사를 준다** (2026-08-27, 화자가 일반 블로거). 손으로 쓰는 판(골격)과
 * 기계가 쓰는 판(지시문)이 갈리면 사람 쪽이 틀린다 — 이 저장소에서 여러 번 겪었다.
 */
ok(infoSkeleton.includes('안녕하세요. 오늘은 폭식 멈추는 방법에 대해 정리해 보려고 합니다.'), '골격이 인사 형식을 그대로 연다')
ok(infoSkeleton.includes('**⓪첫 문장은 인사다.**'), '골격도 인사로 열라고 적는다')
ok(infoSkeleton.includes('상호명·지점명은 넣지 않는다'), '골격도 상호명을 막는다')
ok(infoSkeleton.includes('검색한 사람이 실제로 궁금해하는 질문'), '골격도 화자를 일반 블로거로 적는다')
ok(infoSkeleton.includes('자기 신분이 드러나는 말을 쓰지 않는다'), '골격도 신분이 드러나는 말을 막는다')
/*
 * 회원: "정보성에는 홍보문구가 아예 들어가면 안돼 상담도 홍보문구잖아."
 * 골격도 같은 말을 해야 한다 — 손으로 쓰는 판과 기계가 쓰는 판이 갈리면 사람 쪽이 틀린다.
 */
ok(infoSkeleton.includes('「상담」·「예약」·「문의」'), '골격도 홍보 낱말을 막는다')
ok(infoSkeleton.includes('「수업하다 보면」'), '골격도 대신 쓸 말을 준다')
ok(infoSkeleton.includes('교대근무라 오후에 눈뜨고'), '골격도 첫 문장에 독자를 못 박게 한다 (셀프 체크 ①)')
ok(infoSkeleton.includes('4단계 고를 때 기준'), '골격에도 대안 비교 구간이 있다 (셀프 체크 ③)')
ok(infoSkeleton.includes('사진에만 있는 내용이 없는가'), '골격에도 사진 내용을 본문에 적으라고 한다 (셀프 체크 ⑤)')
ok(!infoSkeleton.includes('센터 소개 + 상담 유도 ('), '골격에서 센터 소개 구간을 없앴다')
ok(!infoSkeleton.includes('정보 8 : 홍보 2'), '골격에서 옛 비중(8:2)이 사라졌다')
ok(infoSkeleton.includes('6단계 마무리'), '그 자리가 정보 마무리로 바뀌었다')
// 골격 구간 합계도 지시문과 같아야 한다 — 한쪽만 옮기면 골격대로 써도 분량에 걸린다
for (const span of ['1단계 후킹 (250~300자', '2단계 왜 그런지 (350~450자', '3단계 방법 (700~900자', '4단계 고를 때 기준 (350~450자', '5단계 흔한 실수 (350~450자', '6단계 마무리 (250~350자']) {
  ok(infoSkeleton.includes(span), `골격 구간 분량이 지시문과 같다 — ${span})`)
}
/*
 * **골격에 업체 흔적이 남지 않았는가.** 지점 정보를 통째로 넘겨도 본문에 상호명·전화번호가
 * 새지 않아야 한다 (해시태그 안내의 지역 키워드는 본문이 아니다).
 */
/*
 * **골격에 상호명이 아예 없다** (2026-08-27). 값을 꺼내 두면 어딘가에 쓰게 된다 — 이 파일에서
 * 여러 번 확인된 일이라, 안 쓰기로 한 값은 골격에서도 꺼내지 않는다.
 */
ok(!infoSkeleton.includes('MTO 피트니스 쌍용점'), '골격에 상호명이 나오지 않는다')
ok(!stripGuides(infoSkeleton).includes('MTO 피트니스 쌍용점'), '복사 본문에는 상호명이 박히지 않는다 (회원이 직접 쓴다)')
// 전화번호·예약 링크는 안내 줄에도 나오면 안 된다 — 정보글에는 넣을 자리가 없다
for (const leak of ['010-2455-2896', 'booking.naver.com']) {
  ok(!infoSkeleton.includes(leak), `골격에 연락 수단이 새지 않는다 — ${leak}`)
}
ok(!infoSkeleton.includes('전화/문의 한 줄이면 충분'), '「한 줄이면 충분」을 지웠다')

/*
 * ─── 정보글에 홍보가 하나라도 있는가 (2026-08-20 뒤집힘)
 *
 * 예전 항목 `info-promo-tail` 은 「홍보를 마지막 구간에 모아라」였다 — 마지막 구간이 비면
 * 걸렸다. 정보글에서 홍보를 전부 걷어내면서 그 항목이 `info-purity` 와 정반대를 시키게 돼서
 * 없앴다 (lib/writing/checker.ts 의 「없앤 검사」 주석). 아래는 **없앴다는 사실 자체**와
 * 새 기준을 함께 고정한다 — 한쪽만 고치면 회원 화면에 서로 반대되는 두 줄이 뜬다.
 */
const infoBase = {
  type: 'info',
  title: '천안헬스장 다니는데 폭식 못 끊는 이유, 순서부터 바꿔보세요',
  mainKeyword: '폭식 멈추는 방법',
  subKeywords: ['다이어트 폭식'],
  localKeyword: '천안헬스장',
  tags: ['폭식멈추는방법', '다이어트폭식', '천안헬스장'],
  legalName: 'MTO 피트니스 쌍용점',
}
const tailItem = (body) => checkPost({ ...infoBase, body }).items.find((i) => i.id === 'info-purity')

const INFO_GOOD = `폭식 멈추는 방법을 찾으시는 분들이 많습니다. 검색해 보면 이 질문이 제일 먼저 나옵니다.

## 운동하면 왜 더 배고파질까
운동 강도를 갑자기 올리면 식욕 호르몬이 늘어납니다. 강도를 며칠 단위로 올리고 운동 직후 30분 안에 단백질을 챙기면 충동이 줄어듭니다.

## 순서를 이렇게 바꿔보세요
웨이트 40분 먼저 하고 유산소 15분을 뒤에 붙이면 혈당이 안정되면서 공복감이 덜합니다. 호흡은 힘쓰는 구간에서 뱉으세요.

## 저희 센터에서는 이렇게 하실 수 있어요
위 순서를 그대로 하시려면 웨이트실과 유산소존이 나뉘어 있는 게 편합니다. MTO 피트니스 쌍용점은 24시간 운영이라 새벽 근무 마치고도 오실 수 있어요. 궁금한 점은 상담 때 여쭤보시면 되고, 예약은 전화로 편하게 주세요.`
/*
 * 옛 판에서 「통과」였던 글 — 마지막 구간에 상호명·상담·전화를 모았다. 상호명 1회는
 * 2026-08-21 부터 허용이지만, 이 글에는 전화·방문 유도가 함께 있어서 여전히 통과가 아니다.
 */
ok(tailItem(INFO_GOOD)?.level !== 'pass', `마지막에 모아도 통과가 아니다 — ${tailItem(INFO_GOOD)?.value}`)

/*
 * **깨끗한 정보글이 아무 데도 안 걸려야 한다.** 옛 항목이 살아 있으면 이 글이 「마지막
 * 구간이 비었습니다」로 걸렸다 — 회원이 그 말을 따르면 이번엔 `info-purity` 에 걸린다.
 */
const INFO_CLEAN = INFO_GOOD.replace(
  /## 저희 센터에서는[\s\S]*$/,
  '## 오늘부터 이것 하나만\n오늘 저녁 한 끼만 순서를 바꿔보세요. 웨이트를 먼저 하고 유산소를 뒤에 붙이는 것, 그거 하나면 첫날은 충분합니다. 흔히 여기서 실패하는 지점은 첫 주에 강도를 한꺼번에 올리는 것입니다. 며칠 단위로 조금씩 올리세요.'
)
const clean = checkPost({ ...infoBase, body: INFO_CLEAN })
ok(clean.items.find((i) => i.id === 'info-purity')?.level === 'pass', `홍보를 다 뺀 정보글은 순수성 통과 — ${clean.items.find((i) => i.id === 'info-purity')?.value}`)
ok(clean.items.every((i) => i.id !== 'info-promo-tail'), '「홍보는 마지막 구간에」 항목은 없앴다 (info-purity 와 반대를 시켰다)')
ok(
  !clean.items.some((i) => i.level !== 'pass' && i.hint?.includes('마지막 구간이 비었습니다')),
  '깨끗한 정보글에 「홍보를 채우라」는 말이 뜨지 않는다'
)
// 어느 유형에도 이 항목이 남아 있지 않다
for (const t of ['promo', 'review']) {
  ok(checkPost({ ...goodPromo, type: t }).items.every((i) => i.id !== 'info-promo-tail'), `${t} 에도 항목이 없다`)
}

// ─────────────────────────────────────────────────────────────
console.log('\n[83] 플레이스 리뷰 — 실제 리뷰로 신뢰 주기')
/*
 * 회원 요청: "홍보성 글에 플레이스 관련 헬스 및 피티 리뷰를 분석해서 신뢰성을 줄 수 있게
 * 작성해주면 좋겠어. **실제 리뷰인 거지.** 링크도 첨부해서."
 *
 * 순위 기준이 아니다 (인용은 오히려 실측에서 반대로 나왔다 — 있음 25% / 없음 35%, 표본 작음).
 * 상담 전환과 **법** 쪽 규칙이다.
 */
const RAW_REVIEWS = [
  '방문자 리뷰',
  '헬스빌런',
  '2026.7.28.화',
  '새벽에 가도 사람이 적당히 있고 기구가 깨끗해서 좋았어요',
  '시설이 깨끗해요',
  '3',
  'PT 받는데 자세를 하나하나 잡아주셔서 확실히 다릅니다',
  '팔로우 12',
  '샤워실이 넓고 수건도 넉넉하게 있어서 퇴근하고 바로 가기 편해요',
  '친절해요',
  '새벽에 가도 사람이 적당히 있고 기구가 깨끗해서 좋았어요',
  '★★★★★',
].join('\n')

const { reviews: parsedRv, dropped: rvDropped } = parsePastedReviews(RAW_REVIEWS)
ok(parsedRv.length === 5, `리뷰 5줄을 뽑는다 (닉네임·날짜·숫자는 버림) — ${parsedRv.length}줄, 버린 것 ${rvDropped}개`)
ok(!parsedRv.some((r) => r.text === '헬스빌런'), '닉네임 줄은 안 들어온다 (짧은 줄은 서술어로 끝나야 남긴다)')
ok(!parsedRv.some((r) => /^20\d{2}/.test(r.text)), '날짜 줄은 안 들어온다')
ok(!parsedRv.some((r) => r.text === '3' || r.text === '★★★★★'), '숫자·별표 줄은 안 들어온다')
ok(parsedRv.filter((r) => r.text.includes('새벽에 가도')).length === 1, '같은 리뷰를 두 번 안 넣는다')
ok(parsedRv.find((r) => r.text === '시설이 깨끗해요')?.kind === 'tag', '짧은 한마디는 tag 로 구분한다')
ok(parsedRv.find((r) => r.text.includes('PT 받는데'))?.kind === 'text', '긴 문장은 인용 가능(text)')

const rvA = analyzeReviews(parsedRv, rvDropped)
ok(rvA.count === 3 && rvA.tagCount === 2, `인용 가능 3 · 한마디 2 — ${rvA.count}/${rvA.tagCount}`)
ok(rvA.themes.length > 0, '주제를 뽑는다')
ok(rvA.themes[0].count >= 2, `가장 많은 주제가 2편 이상 — ${rvA.themes[0].label} ${rvA.themes[0].count}편`)
ok(rvA.themes.every((t) => t.words.length > 0), '어떤 낱말이 걸렸는지 함께 준다 (근거를 보여주려고)')
ok(rvA.themes.some((t) => t.label === '청결·관리'), '「깨끗」을 청결 주제로 센다')
ok(rvA.themes.some((t) => t.label === 'PT·트레이너'), 'PT 리뷰도 주제로 잡는다')
ok(rvA.quotes.length >= 2 && rvA.quotes.length <= 4, `인용문 2~4개 — ${rvA.quotes.length}개`)
const rvNorm = (s) => s.replace(/\s+/g, '')
ok(
  rvA.quotes.every((q) => parsedRv.some((r) => rvNorm(r.text).includes(rvNorm(q)))),
  '인용문은 원문에 있는 말 그대로다 (요약하지 않는다)'
)
ok(rvA.quotes.every((q) => q.length >= 18), '너무 짧은 문장은 인용하지 않는다')

/*
 * ─── 긴 리뷰에서도 인용문이 나온다
 *
 * 실제 예약 리뷰는 대부분 90자를 넘는다. 원문만 후보로 쓰던 판에서는 쌍용점 리뷰 20편으로
 * 인용문이 **한 줄**밖에 나오지 않았다 — 리뷰를 모을수록 근거가 비어버렸다. 그래서 긴 리뷰는
 * 문장 단위로 잘라 후보에 넣는다. 잘라낸 조각은 원문의 부분 문자열이라 review-honesty 를
 * 그대로 통과한다.
 */
const LONG_RV = [
  {
    text:
      '운동을 해본적이 없어서 잘 할 수 있을까 걱정했었는데 쌤이 항상 칭찬도 많이 해주시고 맞춤으로 알려주셔서 앞으로 혼자 운동하는데 기반을 많이 다질 수 있었어요. ' +
      '기구도 많고 깔끔해서 아주 좋았습니다. 샤워실도 넉넉해서 퇴근하고 바로 가기 편했어요.',
    kind: 'text',
  },
]
const longA = analyzeReviews(LONG_RV)
ok(longA.quotes.length >= 2, `90자 넘는 리뷰 한 편에서도 인용문이 나온다 — ${longA.quotes.length}개`)
ok(longA.quotes.every((q) => rvNorm(LONG_RV[0].text).includes(rvNorm(q))), '잘라낸 인용문도 원문 안의 말이다')
ok(longA.quotes.every((q) => q.length <= 90), '인용문은 90자를 넘지 않는다 (본문이 리뷰로 채워진다)')
ok(
  longA.quotes.every((q) => verifyReviewQuotes(`플레이스 리뷰: "${q}"`, LONG_RV)[0].ok),
  '잘라낸 인용문은 review-honesty 대조를 통과한다'
)
// 짧은 스무 자짜리("친절해요 좋았어요")보다 무엇을 해줬는지 적힌 문장을 먼저 고른다
ok(longA.quotes[0].length > 40, `근거가 되는 긴 문장을 먼저 고른다 — ${longA.quotes[0].length}자`)

/*
 * ─── 리뷰에 붙인 원본 화면이 실제로 있는지 (2026-08-19)
 *
 * 회원 요청 "글이랑 사진이랑 함께 첨부해서 홈페이지에 보일 수 있게 해줘" 로 리뷰에 캡처를
 * 붙였다. 경로가 틀리면 화면에는 **깨진 이미지**가 조용히 뜬다 — 근거로 붙인 사진이 근거를
 * 못 하는 상태이고, 그건 오류로 보이지도 않는다. 그래서 파일이 있는지 여기서 본다.
 */
{
  const { existsSync } = require('node:fs')
  const { join } = require('node:path')
  const { SEED_STORES } = require(`${OUT}/seed/stores.js`)
  const shots = SEED_STORES.flatMap((s) => (s.placeReviews ?? []).filter((r) => r.image))
  const gone = shots.filter((r) => !r.image.startsWith('http') && !existsSync(join(process.cwd(), 'public', r.image)))
  ok(gone.length === 0, `리뷰에 붙인 원본 화면이 다 있다 — ${shots.length}장`, gone.map((r) => r.image).join(' · '))
  ok(
    shots.every((r) => r.kind === 'text' && r.author && r.at),
    '원본 화면이 있는 리뷰는 작성자·날짜도 함께 둔다 (누가 언제 쓴 것인지 없으면 대조가 안 된다)'
  )
  // 사진을 붙였어도 인용 대조 대상은 그대로 본문이다
  ok(
    shots.every((r) => verifyReviewQuotes(`플레이스 리뷰: "${r.text.slice(0, 30)}"`, shots)[0]?.ok),
    '사진이 붙은 리뷰도 문장으로 대조된다'
  )
}

ok(placeReviewUrl('1234567890') === 'https://m.place.naver.com/place/1234567890/review/visitor', '리뷰 링크를 만든다')
ok(placeReviewUrl(undefined) === null, '플레이스 id 가 없으면 링크도 없다')

// ─── 지어낸 인용을 잡는다 (표시광고법)
const REAL_RV = [{ text: '새벽에 가도 사람이 적당히 있고 기구가 깨끗해서 좋았어요', kind: 'text' }]
const okQuote = verifyReviewQuotes('플레이스 리뷰에 이런 말이 있어요. "새벽에 가도 사람이 적당히 있고 기구가 깨끗해서 좋았어요"', REAL_RV)
ok(okQuote.length === 1 && okQuote[0].ok, '실제 리뷰 인용은 통과')
const fakeQuote = verifyReviewQuotes('리뷰에 이런 말이 많아요. "3개월에 10kg 빠졌어요 최고의 헬스장"', REAL_RV)
ok(fakeQuote.length === 1 && !fakeQuote[0].ok, '없는 리뷰 인용은 잡는다')
// 상담 대화 인용은 리뷰가 아니다 — 전부 대조하면 멀쩡한 글이 걸린다
const consultQuote = verifyReviewQuotes('상담 때 가장 많이 듣는 말이 이겁니다. "제 시간에 문 여는 데가 없어요"', REAL_RV)
ok(consultQuote.length === 0, '리뷰라고 안 붙인 인용은 대조하지 않는다')
// 조사·말줄임만 다듬은 인용은 통과 (그걸 위반으로 잡으면 아무도 인용을 못 한다)
const trimmed = verifyReviewQuotes('방문자 리뷰: "새벽에 가도 사람이 적당히 있고 기구가 깨끗해서"', REAL_RV)
ok(trimmed[0].ok, '리뷰 안의 일부만 인용해도 통과')

// ─── 검수 항목 두 개
const RV_STORE = { placeReviews: parsedRv, placeId: '1234567890' }
const rvItem = (patch) => checkPost({ ...goodPromo, ...RV_STORE, ...patch }).items.find((i) => i.id === 'review-proof')
const honestyItem = (patch) => checkPost({ ...goodPromo, ...RV_STORE, ...patch }).items.find((i) => i.id === 'review-honesty')

ok(rvItem({}) && rvItem({}).level === 'fail', `리뷰를 모아뒀는데 안 쓰면 수정필요 — ${rvItem({}).value}`)
ok(rvItem({}).hint.includes('플레이스 리뷰 화면'.slice(0, 2)) || rvItem({}).hint.includes('모아뒀는데'), '무엇을 쓰면 되는지 알려준다')
ok(rvItem({}).target.includes('가장 많은 주제'), '가장 많이 나온 주제를 알려준다')
ok(checkPost({ ...goodPromo }).items.every((i) => i.id !== 'review-proof'), '리뷰를 안 모았으면 항목이 안 생긴다')
ok(rvItem({ type: 'info' }) === undefined, '정보글에는 항목이 안 생긴다')

const WITH_REVIEW =
  goodPromo.body.replace(
    '운동하다 자세가 무너지면',
    '플레이스 방문자 리뷰 5편 중 3편이 같은 말을 하셨어요. "새벽에 가도 사람이 적당히 있고 기구가 깨끗해서 좋았어요" 라고요. 확인은 여기서 하실 수 있습니다 — https://m.place.naver.com/place/1234567890/review/visitor\n운동하다 자세가 무너지면'
  )
ok(rvItem({ body: WITH_REVIEW }).level === 'pass', `인용 + 링크가 있으면 통과 — ${rvItem({ body: WITH_REVIEW }).value}`)
ok(honestyItem({ body: WITH_REVIEW }).level === 'pass', '실제 리뷰라 정직성도 통과')
const noLink = WITH_REVIEW.replace(' 확인은 여기서 하실 수 있습니다 — https://m.place.naver.com/place/1234567890/review/visitor', '')
ok(rvItem({ body: noLink }).level === 'warn', `인용만 있고 링크가 없으면 주의 — ${rvItem({ body: noLink }).value}`)

// 지어낸 리뷰 — 리뷰를 안 모아둔 지점에서도 잡아야 한다 (가장 위험한 경우)
const FAKE = goodPromo.body.replace(
  '운동하다 자세가 무너지면',
  '플레이스 리뷰를 보면 "3개월 만에 10kg 빠졌어요" 같은 말이 많습니다.\n운동하다 자세가 무너지면'
)
const fakeNoStore = checkPost({ ...goodPromo, body: FAKE }).items.find((i) => i.id === 'review-honesty')
ok(fakeNoStore && fakeNoStore.level === 'fail', '리뷰를 안 모았는데 리뷰를 인용하면 즉시수정')
ok(fakeNoStore.group === '저품질 위험', '저품질 위험으로 분류한다', fakeNoStore.group)
ok(fakeNoStore.hint.includes('표시광고법'), '왜 위험한지 밝힌다')
ok(honestyItem({ body: FAKE }).level === 'fail', '리뷰를 모아뒀어도 원본에 없으면 즉시수정')
ok(checkPost({ ...goodPromo }).items.every((i) => i.id !== 'review-honesty'), '리뷰 인용이 없는 글에는 항목이 안 생긴다')

// ─── 지시문
const rvStore = { id: 's', name: 'MTO 쌍용점', legalName: 'MTO 피트니스 쌍용점', localKeywords: ['쌍용동 헬스장'], phone: '010-2455-2896', placeId: '1234567890', placeReviews: parsedRv }
const rvPrompt = buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], store: rvStore })
ok(rvPrompt.includes('## 플레이스 리뷰 (실제 리뷰다 — 여기 없는 말을 만들지 않는다)'), '리뷰 묶음을 낸다')
ok(rvPrompt.includes('리뷰에서 반복된 것 (많은 순)'), '분석 결과를 넣는다')
ok(rvPrompt.includes('글자 그대로'), '그대로 옮기라고 한다')
ok(rvPrompt.includes('m.place.naver.com/place/1234567890/review/visitor'), '링크를 넣어준다')
/*
 * 별점은 「금지」가 아니라 「출처가 있으면 허용」이다. 지점 정보의 고유 강점에 확인된 평점이
 * 들어오게 되면서(예약 리뷰 13건·평점 5.0) 전면 금지가 지시끼리 어긋나게 만들었다 —
 * 한쪽은 주고 한쪽은 금지하면 모델은 어느 쪽이든 어긴다.
 */
ok(rvPrompt.includes('별점·평점 숫자는'), '별점을 어떻게 다룰지 말한다')
ok(rvPrompt.includes('고유 강점)에 적혀 있을 때만'), '적혀 있을 때만 쓰라고 한다 (출처 있는 숫자는 살린다)')
ok(rvPrompt.includes('없으면 만들지 않는다'), '없는 숫자는 여전히 막는다')
ok(rvPrompt.includes('출처 없는 인용은 거짓 광고다'), '왜 안 되는지 적는다')

// 리뷰가 없으면 **언급 금지**를 명시한다 (지시가 없으면 모델이 지어낸다)
const noRvPrompt = buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], store: { ...rvStore, placeReviews: [] } })
ok(noRvPrompt.includes('리뷰·후기·별점을 언급하지 않는다'), '리뷰가 없으면 언급하지 말라고 한다')
ok(!noRvPrompt.includes('인용할 수 있는 문장'), '없는 인용문 목록을 만들지 않는다')
const rvInfoPrompt = buildUserPrompt({ type: 'info', mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'], store: rvStore })
ok(!rvInfoPrompt.includes('플레이스 리뷰'), '정보글에는 리뷰 묶음을 안 낸다')

// 골격 지시문도 같은 것을 요구한다
ok(promoSkeleton.includes('플레이스 리뷰') || buildSystemPrompt('promo').includes('「플레이스 리뷰」 묶음'), '홍보글 구조에 리뷰 구간이 있다')
ok(buildSystemPrompt('promo').includes('묶음이 없으면 리뷰·후기·별점을 아예 언급하지 않는다'), '리뷰가 없을 때의 규칙도 구조에 적는다')

// 발행 체크리스트 — 죽은 링크가 붙은 「실제 리뷰」는 없는 리뷰와 같다
const rvPkg = buildCopyPackage({ ...goodPromo, id: 'x', status: 'draft', storeId: 's', createdAt: '', updatedAt: '', body: WITH_REVIEW }, { legalName: 'MTO 피트니스 쌍용점', location: '신협 뒷건물 4층', phone: '010-2455-2896', placeId: '1234567890' })
ok(rvPkg.checklist.some((c) => c.label.includes('리뷰 링크가 열리는지')), '체크리스트에 링크 확인이 들어간다')
ok(buildCopyPackage({ ...goodPromo, id: 'x', status: 'draft', storeId: 's', createdAt: '', updatedAt: '' }, { legalName: 'a', location: 'b', phone: 'c' }).checklist.every((c) => !c.label.includes('리뷰 링크')), '링크를 안 쓴 글에는 안 넣는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[84] 플레이스 id — 주소를 붙여넣어도 되게')
/*
 * 회원이 물었다 — "플레이스 아이디 어디서 확인해?" 확인하는 곳은 주소창인데 손으로 넣을
 * 칸이 없었다 (플레이스 조회가 성공할 때만 채워졌다). 주소 모양이 여러 가지라 통째로
 * 받는다 — 숫자만 골라 옮기라고 하면 한 번 더 틀릴 일을 만든다.
 */
ok(extractPlaceId('1234567890') === '1234567890', '숫자만 넣어도 된다')
ok(extractPlaceId('https://m.place.naver.com/place/1234567890/home') === '1234567890', '모바일 플레이스 주소')
ok(extractPlaceId('https://pcmap.place.naver.com/place/1234567890/review/visitor') === '1234567890', '리뷰 탭 주소')
ok(extractPlaceId('https://map.naver.com/p/entry/place/1234567890?c=15.00,0,0,0,dh') === '1234567890', '지도 새 주소')
ok(extractPlaceId('https://map.naver.com/v5/entry/place/1234567890') === '1234567890', '지도 옛 주소')
ok(extractPlaceId('https://m.place.naver.com/restaurant/1234567890/home') === '1234567890', '업종 경로가 달라도 된다')
ok(extractPlaceId('https://smartplace.naver.com/bizes/place/home?id=1234567890') === '1234567890', '스마트플레이스 주소')
ok(extractPlaceId('  https://m.place.naver.com/place/1234567890/home  ') === '1234567890', '앞뒤 공백 무시')
// 단축주소에는 숫자가 없다 — 서버가 따라가야 알 수 있고 그건 이 함수의 일이 아니다
ok(extractPlaceId('https://naver.me/xAbCdEfG') === null, '단축주소는 못 뽑는다 (화면에서 안내한다)')
ok(extractPlaceId('') === null && extractPlaceId('쌍용동 헬스장') === null, '빈 값·상호명은 null')
// 주소가 섞인 문장에서 엉뚱한 숫자를 집지 않는다
ok(extractPlaceId('전화 010-2455-2896') === null, '전화번호를 id 로 착각하지 않는다')
ok(extractPlaceId('123') === null, '너무 짧은 숫자는 id 가 아니다')
// 뽑은 id 로 리뷰 링크가 바로 만들어져야 한다 (화면에서 눌러 확인하게)
ok(placeReviewUrl(extractPlaceId('https://map.naver.com/p/entry/place/1234567890')) === 'https://m.place.naver.com/place/1234567890/review/visitor', '뽑은 id 로 리뷰 링크를 만든다')

// ─────────────────────────────────────────────────────────────
console.log('\n[85] 정보글 마지막 홍보 — 적어둔 것만 쓴다')
/*
 * 회원 지적: "정보글에 마지막 홍보를 넣어달란 게 알아서 작성해달란 게 아니라, 내가 원하는
 * 홍보글 칸을 넣어서 거기 정보를 주면 그에 맞게 작성해달란 거였어."
 *
 * 앞 판에서 「센터 소개 + 상담 유도 400~500자」만 시켰더니 모델이 그 자리를 스스로 채웠고,
 * 실제 결과물에 「1:1 PT 공동구매 500회, 회당 45,000원」이 들어왔다. 실제 조건이면 다행이고
 * 아니면 거짓 광고인데 — **글만 봐서는 어느 쪽인지 알 수 없다.** 그게 문제였다.
 */
const NOTE = '1:1 PT 공동구매 500회 진행 중, 회당 45,000원(VAT 별도), 10회 단위 등록 가능'
/*
 * **2026-08-20 에 뒤집혔다.** 정보글에서 홍보 구간을 없애면서 홍보 칸도 정보글 화면에서
 * 뺐다. 그래서 이제는 「적어둔 것만 쓴다」가 아니라 **「아예 쓰지 않는다」**다.
 *
 * 아래 두 줄은 옛 묶음이 되살아나지 않는지를 지킨다 — 칸에 값이 들어와도(예전 글을 불러오면
 * 남아 있을 수 있다) 정보글 지시문은 홍보 구간을 만들지 않아야 한다.
 */
const promoPrompt = buildUserPrompt({ type: 'info', mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'], promoNote: NOTE })
ok(!promoPrompt.includes('마지막 홍보 구간'), '정보글 지시문에 홍보 구간 묶음이 없다')
ok(!promoPrompt.includes(NOTE), '옛 글에 남은 홍보 칸 값이 지시문으로 새지 않는다')

const emptyNotePrompt = buildUserPrompt({ type: 'info', mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'] })
ok(!emptyNotePrompt.includes('마지막 홍보 구간'), '칸이 비어도 마찬가지다')
// 홍보글에는 이벤트 칸이 따로 있으니 이 묶음을 내지 않는다
const promoTypePrompt = buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], promoNote: NOTE })
ok(!promoTypePrompt.includes('마지막 홍보 구간'), '홍보글에는 안 낸다 (이벤트 칸이 그 역할)')
/*
 * 2026-08-20 개편 — 정보글에서 홍보 구간 자체를 없앴다. 구조 지시가 더는 홍보 칸을
 * 가리키지 않는다. 칸을 채우면 검수(info-purity)가 분류 위험을 알린다.
 */
ok(!buildSystemPrompt('info').includes('묶음이 있으면 **그 내용으로** 쓴다'), '구조 지시가 홍보 칸을 가리키지 않는다')
ok(buildSystemPrompt('info').includes('업체 이야기를 넣지 않는다'), '마무리에 업체 이야기를 넣지 말라고 한다')

// ─── 검수: 적어두지 않은 금액을 잡는다
const infoBody = (tailPromo) => `안녕하세요, MTO 피트니스 쌍용점입니다. 제가 상담할 때 폭식 멈추는 방법을 제일 많이 물으십니다.

## 왜 저녁에 몰리나
혈당이 하루 종일 낮게 유지되다 저녁에 떨어지면서 생깁니다. 낮에 단백질을 챙기면 줄어듭니다.

## 순서를 이렇게 바꿔보세요
웨이트 40분 먼저 하고 유산소 15분을 뒤에 붙이면 공복감이 덜합니다. 호흡은 힘쓰는 구간에서 뱉으세요.

## 저희 센터에서는 이렇게 하실 수 있어요
${tailPromo} 궁금한 점은 상담 때 여쭤보시면 되고, 예약은 전화로 편하게 주세요.`

const srcItem = (patch) => checkPost({ type: 'info', title: '폭식 멈추는 방법, 순서부터 바꿔보세요', mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'], localKeyword: '천안헬스장', tags: ['폭식멈추는방법'], legalName: 'MTO 피트니스 쌍용점', ...patch }).items.find((i) => i.id === 'info-promo-source')

const MADE_UP = infoBody('1:1 PT 공동구매 500회 진행 중인데 회당 45,000원입니다.')
ok(srcItem({ body: MADE_UP }).level === 'fail', `칸이 비었는데 금액·이벤트가 있으면 즉시수정 — ${srcItem({ body: MADE_UP }).value}`)
ok(srcItem({ body: MADE_UP }).group === '저품질 위험', '저품질 위험으로 분류한다')
ok(srcItem({ body: MADE_UP }).hint.includes('홍보글이 맡습니다'), '가격·이벤트는 홍보글 몫이라고 알려준다')
/*
 * **옛 판에서는 칸에 적으면 통과였다.** 지금은 적어뒀든 아니든 정보글에 금액이 있으면
 * 잘못이다 — 대조할 칸 자체가 없어졌다.
 */
ok(srcItem({ body: MADE_UP, promoNote: NOTE }).level === 'fail', '칸에 적어뒀어도 정보글에는 못 쓴다')
ok(srcItem({ body: MADE_UP }).value.includes('45,000원'), '어떤 금액이 문제인지 보여준다')

// 시설·상담만 쓴 마무리는 칸이 비어도 통과 (그게 기본 동작이다)
const FACILITY_ONLY = infoBody('웨이트실과 프리웨이트실이 나뉘어 있고 24시간 운영이라 새벽에도 오실 수 있어요.')
ok(srcItem({ body: FACILITY_ONLY }) === undefined || srcItem({ body: FACILITY_ONLY }).level === 'pass', '시설·상담만 쓰면 통과')
// 「24시간」·「4대」 같은 숫자는 금액이 아니라 대조 대상이 아니다
ok(!/24시간/.test(String(srcItem({ body: FACILITY_ONLY })?.value ?? '')), '운영시간 숫자를 금액으로 착각하지 않는다')
// 전화번호는 「원」이 없어서 안 걸린다
ok(srcItem({ body: infoBody('전화 010-2455-2896 으로 주세요.') }) === undefined || srcItem({ body: infoBody('전화 010-2455-2896 으로 주세요.') }).level === 'pass', '전화번호를 금액으로 착각하지 않는다')
// 홍보글·후기글에는 이 항목이 없다 (홍보글은 이벤트 칸이 따로 검사된다)
ok(checkPost({ ...goodPromo }).items.every((i) => i.id !== 'info-promo-source'), '홍보글에는 항목이 안 생긴다')

// ─────────────────────────────────────────────────────────────
console.log('\n[86] 한국어로만 쓰기')
/*
 * 회원 지적 — "글에 영문이 들어가. 모든 글은 한국어로 작성될 수 있게 해줘."
 * 나온 문장: "혈당이 천천히 올라가서 addictive한 느낌이 덜합니다."
 *
 * 순위 기준이 아니다. 읽는 분들은 동네 손님이고, 모르는 영어 낱말 하나가 「번역기 돌린 글」로
 * 읽히게 만든다. 다만 **정말 필요한 로마자**는 있으므로 허용 목록을 둔다.
 */
ok(findLatinWords('혈당이 천천히 올라가서 addictive한 느낌이 덜합니다.')[0] === 'addictive', '섞인 영어 낱말을 찾는다')
ok(findLatinWords('한글만 있는 문장입니다.').length === 0, '한글만 있으면 빈 배열')
// 필요한 로마자는 통과 — 이걸 걸면 아무 글도 못 쓴다
ok(findLatinWords('PT 10회와 OT 1회, 체중 3kg 감량, 칼로리는 300kcal 정도입니다.').length === 0, '약어·단위는 허용한다')
ok(findLatinWords('예약은 https://vo.la/Zbynx 로 주세요.').length === 0, '링크는 세지 않는다')
ok(findLatinWords('문의는 hello@mto.kr 로 주세요.').length === 0, '메일도 세지 않는다')
ok(findLatinWords('안녕하세요, MTO 피트니스 쌍용점입니다.', ['MTO']).length === 0, '상호명은 허용 목록으로 넘긴다')
ok(findLatinWords('안녕하세요, MTO 피트니스입니다.')[0] === 'MTO', '허용 목록에 없으면 상호명도 잡힌다 (지점 설정을 보게)')
ok(findLatinWords('L사이즈와 A타입').length === 0, '한 글자는 보지 않는다 (기호에 가깝다)')
ok(findLatinWords('routine 과 healthy 를 섞어 씀').length === 2, '여러 개면 여러 개를 돌려준다')
ok(findLatinWords('addictive 하고 addictive 합니다').length === 1, '같은 낱말은 한 번만')
ok(LATIN_ALLOWED.includes('PT') && LATIN_ALLOWED.includes('kg'), '허용 목록에 PT·kg 이 있다')

// ─── 검수 항목
const koItem = (patch) => checkPost({ ...goodPromo, ...patch }).items.find((i) => i.id === 'korean-only')
ok(koItem({}).level === 'pass', '기준 글은 통과')
const withEnglish = koItem({ body: goodPromo.body.replace('세트 사이에 호흡만', 'addictive한 느낌이 덜하고, 세트 사이에 호흡만') })
ok(withEnglish.level === 'fail', `영어가 섞이면 수정필요 — ${withEnglish.value}`)
ok(withEnglish.value.includes('addictive'), '어떤 낱말인지 보여준다')
ok(withEnglish.hint.includes('중독성'), '바꿀 예를 준다')
ok(withEnglish.group === 'AI 티 제거', 'AI 티 제거로 분류한다 (모델이 흘리는 말이다)')
// 제목도 본다
ok(koItem({ title: 'Best 쌍용동 헬스장 3개월 9.9만원' }).level === 'fail', '제목의 영어도 잡는다')
// 키워드에 로마자가 있으면 허용한다 — 쓰라고 시켜놓고 걸면 안 된다
const ptPost = koItem({ subKeywords: ['쌍용동PT'], body: goodPromo.body.replace('쌍용동 24시헬스장 알아보시는 분은', '쌍용동PT 알아보시는 분은') })
ok(ptPost.level === 'pass', 'PT 가 든 키워드는 통과 (애초에 PT 는 허용 목록에도 있다)')
const brandPost = checkPost({ ...goodPromo, legalName: 'MTO 피트니스 쌍용점' }).items.find((i) => i.id === 'korean-only')
ok(brandPost.level === 'pass', '정식 상호명의 로마자는 통과')
// 세 유형 모두 검사한다 (회원 요청은 "모든 글")
for (const t of ['promo', 'info', 'review']) {
  const item = checkPost({ type: t, title: 'Best 쌍용동 헬스장', body: 'addictive한 느낌', mainKeyword: '쌍용동 헬스장', subKeywords: [], tags: [] }).items.find((i) => i.id === 'korean-only')
  ok(item && item.level === 'fail', `${t} 도 검사한다`)
}

// ─── 지시문·골격
for (const t of ['promo', 'info', 'review']) {
  ok(buildSystemPrompt(t).includes('제목과 본문을 전부 한국어로 쓴다'), `${t} 지시문에 한국어 규칙이 있다`)
}
ok(buildSystemPrompt('promo').includes('addictive(X) → 중독성(O)'), '바꾸는 예를 준다')
ok(buildSystemPrompt('promo').includes('굳어진 약어(PT·OT·GX·VAT·CCTV)'), '예외를 정확히 알려준다')
for (const t of ['promo', 'info', 'review']) {
  const tpl = buildTemplate(t, { mainKeyword: '쌍용동 헬스장', subKeywords: ['A'], localKeyword: '쌍용동 헬스장' })
  ok(tpl.includes('**제목·본문 전부 한국어로.**'), `${t} 골격에도 적혀 있다`)
}

// ─────────────────────────────────────────────────────────────
console.log('\n[87] 굵게 표시와 평소 쓰는 말')
const { findHardWords, HARD_WORDS } = require(`${OUT}/writing/plainwords.js`)

/*
 * ① 굵게 표시 — 회원 지적: "**이 붙은 게 있어. 이게 아마 서식 굵은 글자 같은데 복사
 * 붙여넣기 할 때 반영이 안 돼." 반영이 안 되는 게 맞았다. 별표를 그대로 내보내고 있었다.
 */
const BOLD_BODY = '## 실제로 순서를 바꾸는 방법\n**첫 번째, 점심 식사 순서를 바꿔보세요.** 밥부터 먹지 말고 채소를 먼저 드세요.'
const boldPkg = toBlocks(BOLD_BODY)
const boldHtml2 = blocksToHtml(boldPkg)
ok(boldHtml2.includes('<strong>첫 번째, 점심 식사 순서를 바꿔보세요.</strong>'), '별표를 굵게 서식으로 바꾼다')
ok(!boldHtml2.includes('**'), 'HTML 에 별표가 안 남는다')
const boldText = blocksToText(boldPkg, false)
ok(!boldText.includes('**') && boldText.includes('첫 번째, 점심 식사 순서를 바꿔보세요.'), '글자만 복사할 때는 별표를 뗀다')
ok(stripBold('**굵게** 아님') === '굵게 아님', '별표만 떼고 글자는 남긴다')
ok(stripBold('별표 * 하나는 그대로') === '별표 * 하나는 그대로', '한 개짜리 별표는 건드리지 않는다')
// 이스케이프 순서 — 태그를 넣은 뒤 escape 하면 우리 태그가 깨진다
ok(blocksToHtml(toBlocks('**<b>꺾쇠</b>**')).includes('<strong>&lt;b&gt;꺾쇠&lt;/b&gt;</strong>'), '이스케이프 뒤에 굵게를 넣는다')
// 검수에서는 별표를 글자수·키워드에서 뺀다 (발행되는 글자가 아니다)
const boldParsed = parseBody('**쌍용동 헬스장**을 찾으시면')
ok(!boldParsed.prose.includes('**'), '검수도 별표를 뺀다')
ok(boldParsed.prose.includes('쌍용동 헬스장을 찾으시면'), '별표 안의 글자는 남는다')
const withBoldPkg = buildCopyPackage({ ...goodPromo, id:'x', status:'draft', storeId:'s', createdAt:'', updatedAt:'', body: goodPromo.body + '\n**굵게 쓴 문장입니다.**' }, { legalName:'a', location:'b', phone:'c' })
ok(!withBoldPkg.body.includes('**'), '「그대로」 본문에도 별표가 안 남는다')
ok(!withBoldPkg.bodyMobile.includes('**'), '모바일 본문에도 안 남는다')

/*
 * ①-2 **줄바꿈으로 갈린 굵게 표시** — 회원이 두 번째로 캡처해 보낸 그 화면이다.
 *
 *   **대한비만학회가 일반인 홈페이지 자료에서
 *   밝힌 내용을 보면**, 운동은 …
 *
 * 모바일 줄바꿈이 `**` 짝 사이를 갈랐고, 서식으로 바꾸는 자리에서 줄마다 따로 짝을 찾으니
 * 못 찾아 별표가 살아남았다. 두 군데를 고쳤다 — 줄을 끊을 때 굵게 안쪽을 피하고(clauseLines),
 * 짝은 줄을 붙인 뒤에 찾는다(blocksToHtml).
 */
const LONG_BOLD =
  '**대한비만학회가 일반인 홈페이지 자료에서 밝힌 내용을 보면**, 운동은 스트레스 호르몬인 코티졸의 분비를 줄여주고 신체적, 정신적 긴장을 풀어줍니다.'
/*
 * 강조가 한 줄에 들어가는 길이면 마디에서 끊지 않는다.
 *
 * 상한(30자)을 넘는 강조는 어쩔 수 없이 갈린다 — 그래서 짝 찾기를 줄 단위에서 덩어리
 * 단위로 옮긴 것이 진짜 고침이다. 여기서는 **피할 수 있는 갈림**만 막는지 본다.
 */
const shortBold = clauseLines('**대한비만학회 자료를 보면** 혈당이 빠르게 떨어지고 공복감이 옵니다.')
ok(
  !shortBold.find((l) => (l.match(/\*\*/g) ?? []).length % 2 === 1),
  `한 줄에 들어가는 강조는 갈라놓지 않는다 — ${shortBold.join(' / ')}`
)
// 별표는 서식으로 사라지므로 길이에서 뺀다 (강조가 든 줄만 짧아지던 문제)
ok(clauseLines(LONG_BOLD).every((l) => l.replace(/\*\*/g, '').length <= LINE_MAX), '눈에 보이는 글자로 상한을 잰다')
const lbHtml = blocksToHtml(toBlocks(LONG_BOLD))
ok(!lbHtml.includes('**'), `줄바꿈을 넘어가도 별표가 안 남는다 — ${lbHtml.slice(0, 90)}`)
ok(lbHtml.includes('<strong>'), '굵게 서식으로 들어간다')
ok(!blocksToText(toBlocks(LONG_BOLD), false).includes('**'), '글자 복사에도 안 남는다')
// 상한을 넘겨 어쩔 수 없이 갈리는 경우에도 짝을 찾아야 한다
const forced = blocksToHtml([
  { kind: 'para', groups: [['**앞줄에서 열고', '뒷줄에서 닫는 아주 긴 강조입니다**']] },
])
/*
 * **줄을 넘는 강조는 줄마다 닫고 다시 연다** (2026-08-31). 줄 하나가 문단 하나가 되었으니
 * `<strong>` 이 문단 두 개에 걸치면 태그가 깨진다 — 붙여넣기에서 한쪽만 열린 채 남는다.
 * 보이는 모양은 같다.
 */
ok(
  forced.includes('<strong>앞줄에서 열고</strong>') && forced.includes('<strong>뒷줄에서 닫는 아주 긴 강조입니다</strong>'),
  '줄을 넘는 짝도 찾아서 줄마다 닫는다',
  forced
)
ok(!forced.includes('**'), '별표가 안 남는다')
// 태그 짝이 맞아야 한다 — 안 맞으면 붙여넣기에서 뒤가 통째로 굵어진다
ok((forced.match(/<strong>/g) ?? []).length === (forced.match(/<\/strong>/g) ?? []).length, '열고 닫은 개수가 같다')
// 짝이 안 맞는 별표 하나 때문에 글이 통째로 묶이면 안 된다
ok(stripBold('**열고 안 닫음\n다음 문단입니다.') === '**열고 안 닫음\n다음 문단입니다.', '짝이 없으면 건드리지 않는다')

/*
 * ①-3 **구분선과 나머지 마크다운** — 회원 캡처에 `---` 가 글자로 박혀 있었다.
 * 모델이 마크다운 습관으로 쓴 것이고, 우리는 소제목·이미지만 처리했으니 문단이 되어 나갔다.
 */
const { inlineMarkdown, isRuleLine } = require(`${OUT}/writing/export.js`)
ok(isRuleLine('---') && isRuleLine('***') && isRuleLine('___') && isRuleLine('- - -'), '구분선 줄을 알아본다')
ok(!isRuleLine('--') && !isRuleLine('-- 두 개') && !isRuleLine('· 목록'), '구분선이 아닌 줄은 아니다')
const ruleBlocks = toBlocks('앞 문단입니다.\n\n---\n\n뒤 문단입니다.')
ok(ruleBlocks.map((b) => b.kind).join(',') === 'para,rule,para', '구분선을 따로 떼어낸다', ruleBlocks.map((b) => b.kind).join(','))
ok(blocksToHtml(ruleBlocks).includes('<hr'), '서식에서는 선으로 낸다')
ok(!blocksToHtml(ruleBlocks).includes('---'), 'HTML 에 별표·하이픈이 안 남는다')
ok(blocksToText(ruleBlocks).includes('───'), '글자 복사에서는 선 글자로 낸다')
ok(!blocksToText(ruleBlocks).includes('---'), '글자 복사에도 하이픈이 안 남는다')
// 글 맨 앞·맨 뒤 구분선은 버린다 (선만 남는 자리가 생긴다)
ok(toBlocks('---\n본문입니다.\n---').map((b) => b.kind).join(',') === 'para', '앞뒤 구분선은 버린다')
// 소제목 위아래 선과 겹치지 않게 연속 구분선은 하나로
ok(toBlocks('앞.\n\n---\n***\n\n뒤.').filter((b) => b.kind === 'rule').length === 1, '연속 구분선은 하나로')

// 나머지 마크다운은 글자로 풀어놓는다
ok(inlineMarkdown('자세한 내용은 [대한비만학회](https://kso.or.kr) 에서') === '자세한 내용은 대한비만학회 (https://kso.or.kr) 에서', '링크는 글자 + 주소로', inlineMarkdown('자세한 내용은 [대한비만학회](https://kso.or.kr) 에서'))
ok(inlineMarkdown('![대표사진](a.jpg) 사진 설명') === '사진 설명', '이미지 문법은 버린다')
ok(inlineMarkdown('`유산소` 부터') === '유산소 부터', '코드 표시를 뗀다')
ok(inlineMarkdown('- 채소를 먼저 드세요') === '· 채소를 먼저 드세요', '목록 기호를 가운뎃점으로')
/*
 * 목록은 **한 줄에 한 항목**이어야 한다. 처음 고쳤을 때는 줄들이 한 문단으로 뭉쳐서
 * 가운뎃점이 줄 한복판에 붙었다 — 실제 결과물로 확인하고 잡았다:
 *   · 유산소 15분부터 시작하세요 ·
 *   세 세트 사이에는 호흡만 고르세요
 */
const listText = blocksToText(toBlocks('앞 문단입니다.\n- 유산소 15분부터\n- 세 세트 사이에는 호흡만\n\n뒤 문단입니다.'), false)
ok(listText.includes('· 유산소 15분부터\n· 세 세트 사이에는 호흡만'), `목록은 한 줄에 한 항목 — ${JSON.stringify(listText)}`)
ok(!/·[^\n]*·/.test(listText), '가운뎃점이 한 줄에 두 번 오지 않는다')
ok(listText.startsWith('앞 문단입니다.'), '앞 문단과 섞이지 않는다')
ok(listText.trim().endsWith('뒤 문단입니다.'), '뒤 문단도 따로 남는다')
ok(inlineMarkdown('> 상담에서 들은 말') === '상담에서 들은 말', '인용 기호를 뗀다')
ok(inlineMarkdown('*조금* 다릅니다') === '조금 다릅니다', '기울임을 뗀다')
// **굵게는 건드리지 않는다** — 서식으로 살릴 것이다
ok(inlineMarkdown('**굵게** 그대로') === '**굵게** 그대로', '굵게 표시는 남긴다')
ok(inlineMarkdown('**굵게** 뒤에 *기울임*') === '**굵게** 뒤에 기울임', '굵게는 남기고 기울임만 뗀다')
// 아이디에 든 밑줄을 기울임으로 오해하면 안 된다 (회원 블로그가 hyoni2_ 다)
ok(inlineMarkdown('블로그 아이디는 _hyoni2_ 입니다') === '블로그 아이디는 _hyoni2_ 입니다', '밑줄은 건드리지 않는다')
ok(inlineMarkdown('3 * 4 는 곱하기') === '3 * 4 는 곱하기', '한쪽만 있는 별표는 그대로')
// 「그대로 복사」 본문에도 남지 않아야 한다
const mdPkg = buildCopyPackage(
  { ...goodPromo, id: 'x', status: 'draft', storeId: 's', createdAt: '', updatedAt: '', body: `${goodPromo.body}\n\n---\n\n- 목록 한 줄\n[글자](https://a.b)` },
  { legalName: 'a', location: 'b', phone: 'c' }
)
ok(!mdPkg.body.includes('---') && !mdPkg.body.includes('](http'), '「그대로」 본문에 마크다운이 안 남는다')
ok(!mdPkg.bodyMobile.includes('---'), '모바일 본문에도 안 남는다')
ok(!mdPkg.bodyHtml.includes('---'), '서식 본문에도 안 남는다')

// 검수도 알려준다 — 붙여넣고 나서 알면 늦다
const mdItem = (body) =>
  checkPost({ ...goodPromo, body }).items.find((i) => i.id === 'markdown-leak')
// 남아 있을 때만 항목을 만든다 — 초록 줄이 매 글에 붙으면 공짜 통과 점수가 된다
ok(mdItem(goodPromo.body) === undefined, '깨끗하면 항목이 안 생긴다')
ok(mdItem(`${goodPromo.body}\n[글자](https://a.b)`).level === 'warn', '링크 문법을 잡는다')
ok(mdItem(`${goodPromo.body}\n- 목록 한 줄`).level === 'warn', '목록 기호를 잡는다')
ok(mdItem(`${goodPromo.body}\n| 가 | 나 |`).level === 'warn', '표 문법을 잡는다')
ok(mdItem(`${goodPromo.body}\n**짝이 없습니다`).value.includes('짝이 안 맞는'), '짝 안 맞는 별표를 잡는다')
// 우리가 살릴 수 있는 표기는 잡지 않는다
ok(mdItem(`${goodPromo.body}\n## 소제목\n**굵게**\n\n---\n\n[이미지: 설명]`) === undefined, '소제목·굵게·구분선·이미지는 잡지 않는다')
ok(mdItem(`${goodPromo.body}\n[글자](https://a.b)`).hint.includes('글자로 박힙니다'), '왜 안 되는지 알려준다')

// 지시문
const mdPrompt = buildSystemPrompt('info')
ok(mdPrompt.includes('쓸 수 있는 표기는 네 개뿐이다'), '지시문이 쓸 수 있는 표기를 못 박는다')
ok(mdPrompt.includes('한 문장 안에서 열고 닫는다'), '굵게를 한 문장 안에서 닫으라고 한다')

/*
 * ② 평소 쓰는 말 — 회원 지적: "낙폭이란 단어를 별로 쓰지 않아서 네이버에 치니까 주식 용어인
 * 거 같더라고. 글은 평소 우리가 많이 쓰는 단어들로 사람들이 이해하기 쉽게."
 */
const hw = findHardWords('폭식은 배고픔이 아니라 혈당 낙폭에서 온다')
ok(hw.length === 1 && hw[0].word === '낙폭', `주식 용어를 잡는다 — ${hw[0]?.found}`)
ok(hw[0].found === '낙폭에서', '조사가 붙은 모양을 그대로 보여준다')
ok(hw[0].easy === '떨어지는 폭', '바꿀 말을 준다')
ok(hw[0].why === '다른 분야 용어', '왜 걸렸는지 알려준다')
ok(findHardWords('원리를 알면 방해가 안 됩니다').length === 0, '쉬운 말은 안 걸린다')
// 앞이 한글이면 안 잡는다 — 「반등」을 막으면서 「일반등급」까지 잡히면 안 된다
ok(findHardWords('일반등급으로 나눕니다').length === 0, '낱말 중간에 든 것은 안 잡는다')
ok(findHardWords('사용이 편합니다').length === 0, '「사용이」를 「용이」로 잡지 않는다')
// 목록에서 뺀 것 — 어려워 보인다고 다 막으면 정보가 얕아진다
ok(!HARD_WORDS.some((w) => w.word === '개선'), '「개선」은 우리도 쓰는 말이라 안 막는다')
ok(!HARD_WORDS.some((w) => ['코르티솔', '렙틴', '그렐린', '인슐린'].includes(w.word)), '다이어트에서 실제로 쓰는 말은 안 막는다')
/*
 * 상한은 **갈래별로** 센다. 단위 항목(그램→g)은 성격이 달라서 같이 세면 「목록이 길어졌다」와
 * 「단위를 추가했다」가 구분되지 않는다. 조이려는 것은 낱말을 막는 쪽이다.
 */
const jargon = HARD_WORDS.filter((w) => w.why !== '단위는 기호로')
ok(jargon.length <= 30, `막는 낱말 목록을 짧게 유지한다 — ${jargon.length}개`)

const pwItem = (patch) => checkPost({ ...goodPromo, ...patch }).items.find((i) => i.id === 'plain-words')
ok(pwItem({}).level === 'pass', '기준 글은 통과')
const hardPost = pwItem({ body: goodPromo.body.replace('세트 사이에 호흡만', '혈당 낙폭이 크면 힘들고, 세트 사이에 호흡만') })
ok(hardPost.level === 'fail', `어려운 낱말이 있으면 수정필요 — ${hardPost.value}`)
ok(hardPost.value.includes('낙폭'), '어떤 낱말인지 보여준다')
ok(hardPost.hint.includes('떨어지는 폭'), '바꿀 말을 알려준다')
ok(hardPost.hint.includes('다른 분야'), '왜 문제인지 알려준다')
ok(pwItem({ title: '쌍용동 헬스장 혈당 낙폭 관리법' }).level === 'fail', '제목도 본다')

/*
 * ─── 단위는 숫자에 붙어 있을 때만 잡는다 (2026-08-28) ────────────────
 *
 * 회원 지적: "해도 안고쳐지는데?" — 「벌크업 식단」 글이 이 항목에서 계속 즉시수정으로
 * 걸려 79점에 묶여 있었다. 걸린 낱말이 **「칼로리」**였다.
 *
 * 이 규칙은 원래 단위를 위한 것이다 (2026-08-10 회원 요청: "g, kg 같은 단위는 한글이
 * 아니라 영어로"). 「단백질 10그램」 → 「10g」이 그 얘기다.
 *
 * 그런데 「칼로리」·「그램」은 **보통명사로도 쓰인다** — 「하루 칼로리를 늘리세요」를
 * 「하루 kcal를 늘리세요」로 바꿀 수는 없다. **고칠 방법이 없는 즉시수정**을 만들어 놓고
 * 고쳐 쓰기를 돌린 셈이고, 식단 글에서는 이 낱말이 안 나올 수가 없었다.
 */
ok(findHardWords('하루 칼로리를 조금씩 늘리세요').length === 0, '보통명사로 쓴 「칼로리」는 안 잡는다')
ok(findHardWords('칼로리가 중요합니다').length === 0, '문장 맨 앞도 마찬가지')
ok(findHardWords('한 끼에 700칼로리쯤 됩니다').length === 1, '숫자에 붙으면 잡는다')
ok(findHardWords('한 끼에 700 칼로리쯤 됩니다').length === 1, '사이에 공백이 있어도 잡는다')
ok(findHardWords('단백질 10그램을 채우세요')[0]?.easy === 'g', '「10그램」은 g 로 바꾸라고 한다')
ok(findHardWords('그램 단위로 재세요').length === 0, '숫자가 없으면 안 잡는다')
ok(findHardWords('체중이 3킬로그램 늘었습니다').length === 1, '킬로그램도 같은 규칙')
ok(findHardWords('30퍼센트 늘려보세요').length === 1, '퍼센트도 같은 규칙')
// 다른 갈래는 그대로다 — 그건 어디에 나와도 바꿀 수 있는 말이다
ok(findHardWords('낙폭이 큽니다').length === 1, '딴 분야 말은 숫자가 없어도 잡는다')
ok(findHardWords('기전을 설명합니다').length === 1, '어렵게 쓴 말도 그대로 잡는다')

// 지시문·골격
for (const t of ['promo', 'info', 'review']) {
  ok(buildSystemPrompt(t).includes('평소 쓰는 말로 쓴다'), `${t} 지시문에 규칙이 있다`)
  ok(buildSystemPrompt(t).includes('강조는 `**말**` 로 한다'), `${t} 지시문이 굵게 표시 방법을 알려준다`)
}
ok(buildSystemPrompt('promo').includes('낙폭·반등·급락·변동성·지지선은 주식 용어'), '회원이 짚은 낱말을 그대로 예로 든다')
ok(buildSystemPrompt('promo').includes('상담 오신 분께 말로 설명할 때 쓸 낱말인가'), '판단 기준을 하나 준다')
ok(buildSystemPrompt('info').includes('중학생도 아는 말로 쓴다'), '정보글 톤에도 적었다')
ok(buildTemplate('info', { mainKeyword: 'a', subKeywords: ['b'] }).includes('**평소 쓰는 말로.**'), '골격에도 적혀 있다')

// ─────────────────────────────────────────────────────────────
console.log('\n[88] 단위는 기호로')
/*
 * 회원 요청 — "g, kg 같은 단위는 한글이 아니라 영어로 나오게 고쳐줘."
 *
 * 바로 앞 판에서 「제목과 본문을 전부 한국어로 쓴다」를 넣었더니 그 규칙이 단위까지 끌고 갈
 * 수 있다 — 「단백질 10g」이 「10그램」으로 나온다. 두 검사가 같은 곳을 서로 반대로 밀지
 * 않게, `korean-only` 의 허용 목록과 이 목록이 같은 단위를 가리키게 맞춰 뒀다.
 */
const unitHit = findHardWords('단백질을 10그램 정도 챙기세요')
ok(unitHit.length === 1 && unitHit[0].easy === 'g', `한글로 쓴 단위를 잡는다 — ${unitHit[0]?.found} → ${unitHit[0]?.easy}`)
ok(unitHit[0].why === '단위는 기호로', '이유를 따로 표시한다')
ok(findHardWords('3킬로그램 빠졌어요')[0].easy === 'kg', '킬로그램 → kg')
ok(findHardWords('300킬로칼로리 정도')[0].easy === 'kcal', '킬로칼로리 → kcal')
ok(findHardWords('무릎이 5센티미터')[0].easy === 'cm', '센티미터 → cm')
ok(findHardWords('물 500밀리리터')[0].easy === 'ml', '밀리리터 → ml')
// 기호로 쓴 것은 당연히 안 걸린다 (그게 우리가 원하는 모양이다)
ok(findHardWords('단백질 10g, 체중 3kg, 300kcal').length === 0, '기호로 쓰면 안 걸린다')
// 두 검사가 서로 반대로 밀지 않는다 — korean-only 는 이 기호들을 허용한다
ok(findLatinWords('단백질 10g 과 3kg, 300kcal, 5cm, 500ml').length === 0, '기호는 영문 검사에서 허용된다')
// 시간은 한글이 맞다 — 「15min」이 아니다
ok(findHardWords('유산소 15분, 3초 버티기, 40분이면 끝').length === 0, '시간 단위는 한글로 둔다')
ok(!HARD_WORDS.some((w) => ['분', '초', '시간'].includes(w.word)), '시간 단위는 목록에 없다')
// 「그램」이 든 흔한 낱말을 잡으면 안 된다
ok(findHardWords('프로그램을 짜드립니다').length === 0, '「프로그램」을 「그램」으로 잡지 않는다')
ok(findHardWords('인스타그램에 올렸어요').length === 0, '「인스타그램」도 안 잡는다')

const unitItem = checkPost({ ...goodPromo, body: goodPromo.body.replace('세트 사이에 호흡만', '단백질을 20그램 챙기고, 세트 사이에 호흡만') }).items.find((i) => i.id === 'plain-words')
ok(unitItem.level === 'fail', `한글 단위가 있으면 수정필요 — ${unitItem.value}`)
ok(unitItem.hint.includes('단위는 기호로 씁니다'), '단위 안내를 따로 준다')
ok(unitItem.hint.includes('시간(분·초)은 한글'), '시간은 예외라고 알려준다')

for (const t of ['promo', 'info', 'review']) {
  ok(buildSystemPrompt(t).includes('단위는 기호로 쓴다'), `${t} 지시문에 단위 규칙이 있다`)
}
ok(buildSystemPrompt('promo').includes('「10킬로그램」(X) → 「10kg」(O)'), '바꾸는 예를 준다')
ok(buildSystemPrompt('promo').includes('시간은 한글로'), '시간은 한글이라고 함께 적는다')
ok(buildTemplate('promo', { mainKeyword: 'a', subKeywords: ['b'] }).includes('**단위는 기호로.**'), '골격에도 적혀 있다')

// ─────────────────────────────────────────────────────────────
console.log('\n[89] 퍼센트 단위와 「팩트가 우선」')
// 회원 요청: "%도 해주고 정보글은 팩트가 우선이야 정확한 정보로 쓸 수 있게 해줘"
ok(findHardWords('폭식이 30퍼센트 줄어요')[0]?.easy === '%', `퍼센트 → % — ${findHardWords('폭식이 30퍼센트 줄어요')[0]?.found}`)
ok(findHardWords('폭식이 30% 줄어요').length === 0, '% 로 쓰면 안 걸린다')
// 「프로」는 목록에 없다 — 「프로그램」이 문장 맨 앞에 오면 가드가 안 듣는다
ok(!HARD_WORDS.some((w) => w.word === '프로'), '「프로」는 안 막는다 (프로그램 오탐)')
ok(findHardWords('프로그램을 짜드립니다').length === 0, '문장 맨 앞의 「프로그램」도 안 걸린다')
ok(buildSystemPrompt('info').includes('「퍼센트」(X) → 「%」'), '지시문에 % 규칙이 있다')

/*
 * 팩트 — 나온 글에 「식단 사진만 찍어놔도 줄어든다는 연구가 꽤 있습니다」가 있었다.
 * 사실일 수도 있지만 우리는 출처를 못 댄다. 정보글은 신뢰를 쌓으려고 쓰는 글이다.
 */
const factBody = (line) => `안녕하세요, MTO 피트니스 쌍용점입니다. 폭식 멈추는 방법을 물으시는 분이 많아요.

## 왜 저녁에 몰리나
${line}

## 순서를 바꿔보세요
웨이트 40분 먼저 하고 유산소 15분을 뒤에 붙이면 공복감이 덜합니다.

## 저희 센터에서는
24시간 운영이라 늦게도 오실 수 있어요. 상담은 예약 주시면 됩니다.`
const factItem = (line, patch = {}) =>
  checkPost({
    type: 'info',
    title: '폭식 멈추는 방법, 순서부터 바꿔보세요',
    body: factBody(line),
    mainKeyword: '폭식 멈추는 방법',
    subKeywords: ['다이어트 폭식'],
    localKeyword: '천안헬스장',
    tags: ['폭식멈추는방법'],
    legalName: 'MTO 피트니스 쌍용점',
    ...patch,
  }).items.find((i) => i.id === 'fact-source')

/*
 * **판정을 뒤집었다** (같은 날 두 번째 판). 회원 지적: "정보글인데 내용 자체는 팩트로 써야
 * 하잖아. 그냥 감으로 이렇게 했더니 이렇게 됬다더라 하면 안 되는 거잖아. 실제 연구 결과 등이
 * 있으면 **출처도 함께 인용해서** 쓰는 게 좋을 거 같아."
 *
 * 앞 판에서 나는 「연구를 인용하지 않는다」로 막았는데 그건 반대 방향이었다 — 인용을 막으면
 * 정보글이 「감으로 쓴 글」이 된다. 문제는 인용이 아니라 **출처 없는 인용**이다.
 */
const cited = factItem('사진만 찍어놔도 충동적으로 먹는 횟수가 줄어든다는 연구가 꽤 있습니다.')
ok(cited && cited.level === 'fail', `출처 없는 인용은 즉시수정 — ${cited?.value}`)
ok(cited.group === '저품질 위험', '저품질 위험으로 분류한다')
ok(cited.hint.includes('인용은 좋습니다'), '인용 자체를 막지 않는다고 알려준다')
ok(cited.hint.includes('「근거·출처」 칸'), '어디에 넣으면 되는지 알려준다')
ok(factItem('전문가들은 아침을 거르지 말라고 합니다.')?.level === 'fail', '전문가 인용도 출처가 필요하다')
ok(factItem('임상에서 확인된 방법입니다.')?.level === 'fail', '임상 언급도 마찬가지')

// 효과에 붙은 수치도 출처가 필요하다
const numbered = factItem('이 순서만 지키면 폭식이 30% 줄어듭니다.')
ok(numbered && numbered.level === 'fail', `출처 없는 수치는 즉시수정 — ${numbered?.value}`)
ok(numbered.hint.includes('수치에도 출처가 필요합니다'), '수치도 출처를 요구한다')
// 가격·비율이 효과와 무관하면 대상이 아니다
ok(factItem('3개월 9.9만원으로 시작할 수 있어요.') === undefined, '가격 숫자는 대상이 아니다')
ok(factItem('경사 3도에 15분 걸으세요.') === undefined, '우리가 안내하는 값은 대상이 아니다')
ok(factItem('눈에 띄게 줄어드시더라고요.') === undefined, '방향으로 쓴 문장은 통과')

/*
 * ─── 출처를 붙이면 **통과** — 이게 우리가 원하는 모양이다
 */
const sourcedLink = factItem('연구에 따르면 그렇습니다. 출처: https://example.com/paper')
ok(sourcedLink.level === 'pass', `링크를 붙이면 통과 — ${sourcedLink?.value}`)
const sourcedOrg = factItem('대한비만학회 연구에 따르면 하루 500kcal 줄이면 주당 0.5kg 정도라고 합니다.')
ok(sourcedOrg.level === 'pass', `기관 이름을 밝히면 통과 — ${sourcedOrg?.value}`)
ok(sourcedOrg.value.includes('출처 표기 있음'), '무엇을 출처로 봤는지 보여준다')
ok(factItem('질병관리청 국민건강영양조사 연구에서 아침 결식률이 34% 늘었다고 합니다.').level === 'pass', '정부 기관도 출처로 본다')
// 인용도 수치도 없으면 항목이 아예 안 생긴다 (기관 이름만 적은 문장은 주장이 아니다)
ok(factItem('대한비만학회 자료를 참고해 순서를 정리했어요.') === undefined, '주장이 없으면 항목이 안 생긴다')
ok(factItem('연구에 따르면 그렇습니다.').level === 'fail', '기관 이름이 없으면 여전히 잡는다')
// 「출처를 밝혀라」와 「영문을 쓰지 마라」가 부딪히지 않아야 한다
ok(findLatinWords('WHO 권고에 따르면 그렇습니다.').length === 0, '기관 약어는 영문 검사에서 허용된다')
/*
 * 「근거·출처」 칸은 **지웠다** (회원: "이제 알아서 써주는 거면 이거는 삭제해줘"). AI 가 검색해서
 * 찾으므로 사람이 넣을 자리가 필요 없다. 대신 검색으로 찾은 **출처 이름이 영문 검사에 걸리지
 * 않아야** 한다 — 지시문이 「출처 이름은 한국어로, 약어는 괄호에」로 그 길을 정해준다.
 */
const orgItem = checkPost({ type: 'info', title: '폭식 멈추는 방법, 순서부터', body: factBody('세계보건기구(WHO) 신체활동 지침 연구에서는 주 150분을 권고합니다.'), mainKeyword: '폭식 멈추는 방법', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' }).items.find((i) => i.id === 'korean-only')
ok(orgItem.level === 'pass', '「세계보건기구(WHO)」는 영문 검사를 통과한다')

// 세 유형 다 본다 — 없는 연구를 홍보글에 쓰면 광고 표시에 걸린다
ok(checkPost({ ...goodPromo, body: goodPromo.body.replace('운동하다 자세가', '연구에 따르면 그렇습니다. 운동하다 자세가') }).items.some((i) => i.id === 'fact-source'), '홍보글도 검사한다')
ok(checkPost({ ...goodPromo }).items.every((i) => i.id !== 'fact-source'), '주장이 없으면 항목이 안 생긴다')

/*
 * ─── 출처를 **문장 앞에** 세웠는가 ─────────────────────────────
 *
 * 회원 지적 (캡처와 함께): "내가 원하는 건 「대한비만학회 무슨무슨 결과에 따르면 단맛 나는
 * 음식은 혈당을 빠르게 올리고…」인데, 그냥 내용을 쓰고 괄호로 출처를 쓰고 있어. 나는 이런
 * 걸 원한 게 아니야."
 *
 * fact-source 는 이걸 못 잡았다 — 「출처가 있나」만 봤으니 괄호로 붙어도 통과였다.
 */
const leadItem = (line) =>
  checkPost({
    type: 'info',
    title: '폭식 멈추는 방법, 순서부터 바꿔보세요',
    body: factBody(line),
    mainKeyword: '폭식 멈추는 방법',
    subKeywords: ['다이어트 폭식'],
    localKeyword: '천안헬스장',
    tags: ['폭식멈추는방법'],
    legalName: 'MTO 피트니스 쌍용점',
  }).items.find((i) => i.id === 'source-lead')

// 회원이 캡처로 보여준 그 문장 그대로
const tailCite = leadItem(
  '단맛 나는 음식은 혈당을 빠르게 올리고 다시 빠르게 떨어뜨리는데, 혈당이 떨어지면 공복감을 느끼고 과식 또는 폭식으로 이어지기 쉽다고 합니다 (대한비만학회 일반인 홈페이지).'
)
ok(tailCite && tailCite.level === 'fail', `괄호로 뒤에 붙인 출처는 즉시수정 — ${tailCite?.value}`)
ok(tailCite.group === 'AI 티 제거', '기계가 쓴 티로 분류한다 (사실이 틀린 게 아니라 모양이 틀렸다)')
ok(tailCite.hint.includes('문장 맨 앞으로 옮기면'), '어디로 옮기라고 알려준다')
ok(tailCite.hint.includes('단정으로 끝냅니다'), '「~라고 합니다」를 겹치지 말라고 알려준다')

// 회원이 원한 모양
const leadCite = leadItem(
  '대한비만학회가 일반인용 자료에서 밝힌 내용을 보면, 단맛 나는 음식은 혈당을 빠르게 올렸다가 다시 빠르게 떨어뜨립니다.'
)
ok(leadCite && leadCite.level === 'pass', `출처를 앞에 세우면 통과 — ${leadCite?.value}`)
ok(leadItem('세계보건기구가 2020년 지침에서 권고한 내용을 보면 주 150분입니다.').level === 'pass', '기관 + 권고 형태도 통과')
ok(leadItem('질병관리청 국민건강영양조사에 따르면 아침 결식률이 34%였습니다.').level === 'pass', '「에 따르면」도 통과')

// 앞에도 세우고 괄호로도 적었으면 통과다 (괄호 자체를 금지하는 게 아니다)
ok(
  leadItem('대한비만학회 자료에 따르면 혈당이 빠르게 떨어집니다. 확인은 대한비만학회 홈페이지에서 하실 수 있어요 (대한비만학회).').level === 'pass',
  '앞에 세웠으면 괄호가 더 있어도 통과'
)
// 괄호 안 기관 이름이 뒷문장의 「보면」과 붙어 통과로 오판하면 안 된다
ok(
  leadItem('혈당이 빠르게 떨어진다고 합니다 (대한비만학회 홈페이지) 그러니 순서를 보면 좋습니다').level === 'fail',
  '괄호를 지운 뒤에 앞 출처를 찾는다'
)
// 출처가 아예 없으면 이 항목은 안 만든다 — fact-source 가 이미 말한다
ok(leadItem('연구에 따르면 그렇습니다.') === undefined, '출처가 없으면 여기서 또 말하지 않는다')
ok(leadItem('제가 상담하면서 보면 그런 분이 많으셨어요.') === undefined, '주장·출처가 없으면 항목이 없다')

// 지시문
const factPrompt = buildSystemPrompt('info')
ok(factPrompt.includes('출처는 문장 맨 앞에 세운다'), '지시문이 출처를 앞에 세우라고 시킨다')
ok(factPrompt.includes('괄호로 출처를 뒤에 붙이지 않는다'), '괄호 각주를 막는다')
ok(factPrompt.includes('단정으로 끝낸다'), '출처를 앞에 세웠으면 단정으로 끝내라고 한다')
ok(factPrompt.includes('이 글은 팩트가 우선이다'), '정보글 지시문에 팩트 우선을 적었다')
ok(factPrompt.includes('「감으로 이렇게 했더니 이렇게 되더라」로 쓰면 안 된다'), '회원 말을 그대로 규칙으로 옮겼다')
ok(factPrompt.includes('두 갈래 중 하나여야 한다'), '출처 있는 사실 / 조건 붙인 설명으로 갈래를 나눈다')
ok(factPrompt.includes('**출처를 밝힌 사실**'), '인용은 출처와 함께 하라고 한다')
/*
 * 2026-08-27: 화자가 일반 블로거가 되면서 「우리가 현장에서 본 것」 갈래가 없어졌다.
 * 그렇다고 「제가 해보니」로 열어 주면 **없는 체험을 지어내게 된다** — 이 글을 실제로 쓰는
 * 사람은 센터 운영자다. 그래서 근거를 출처 쪽으로 좁혔다.
 */
ok(factPrompt.includes('겪지 않은 개인 경험을 지어내지 않는다'), '없는 체험을 지어내지 말라고 못 박는다')
ok(!factPrompt.includes('①우리가 현장에서 본 것'), '옛 갈래(현장에서 본 것)가 남아 있지 않다')
ok(factPrompt.includes('어느 연구인지 못 밝히는 인용은 쓰지 않는다'), '막는 것이 무엇인지 분명히 한다')
ok(!factPrompt.includes('연구·논문·전문가를 인용하지 않는다'), '「인용하지 마라」를 지웠다 (앞 판이 반대였다)')
ok(factPrompt.includes('막는 것은 이름이 아니라 단정이다'), '호르몬 이름은 쓰되 단정을 막는다')
ok(factPrompt.includes('우리가 안내하는 값은 그대로 쓴다'), '쓸 수 있는 숫자를 알려준다')

// 「근거·출처」 묶음 — 있을 때와 없을 때
// 검색이 안 되는 키에서는 인용을 막는다 (사람이 넣을 칸이 없으므로 그게 유일하게 안전한 길이다)
const noSrcPrompt = buildUserPrompt({ type: 'info', mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'] })
ok(noSrcPrompt.includes('연구·논문·전문가 인용과 효과 수치를 쓰지 않는다'), '자료를 못 찾으면 인용을 막는다')
ok(noSrcPrompt.includes('단정을 빼고 쓴다'), '대신 어떻게 쓸지 알려준다')
ok(!buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], canSearch: true }).includes('근거·출처'), '홍보글에는 이 묶음을 안 낸다')
ok(!buildSystemPrompt('promo').includes('이 글은 팩트가 우선이다'), '홍보글 구조에는 안 넣는다 (검수로만 잡는다)')

// 발행 체크리스트 — 틀린 사실은 기계가 못 잡는다
const factPkg = buildCopyPackage({ ...goodPromo, type: 'info', id:'x', status:'draft', storeId:'s', createdAt:'', updatedAt:'' }, { legalName:'a', location:'b', phone:'c' })
ok(factPkg.checklist.some((c) => c.label.includes('숫자와 단정 문장')), '정보글 체크리스트에 팩트 확인이 있다')
ok(buildCopyPackage({ ...goodPromo, id:'x', status:'draft', storeId:'s', createdAt:'', updatedAt:'' }, { legalName:'a', location:'b', phone:'c' }).checklist.every((c) => !c.label.includes('숫자와 단정 문장')), '홍보글에는 안 넣는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[90] 자료를 AI 가 직접 찾는다')
/*
 * 회원 지적 — "내가 자료를 찾으면 안 되고 너가 알아서 자료를 찾아서 작성해줘야지."
 * 앞 판에서는 사람이 출처를 붙여넣게 만들었다. 그건 일을 회원에게 넘긴 것이다.
 */
const anthTools = searchTools('anthropic')
ok(Array.isArray(anthTools) && anthTools[0].type === 'web_search_20250305', 'Anthropic 은 서버 검색 도구를 쓴다')
ok(anthTools[0].max_uses > 0, '검색 횟수에 상한을 둔다 (비용)')
ok(searchTools('gemini')?.[0]?.google_search !== undefined, 'Gemini 는 google_search 를 쓴다')
// 못 하는 것을 되는 척하지 않는다 — chat/completions 에는 표준 검색 도구가 없다
ok(searchTools('openai') === null, 'OpenAI 호환은 검색 도구가 없다')
ok(searchTools('clova') === null, 'CLOVA 도 없다')

// 검색 결과 블록이 섞여 와도 본문만 뽑아야 한다
const withSearchBlocks = JSON.stringify({
  content: [
    { type: 'server_tool_use', id: 'x', name: 'web_search' },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '지침', url: 'https://e.kr' }] },
    { type: 'text', text: '{"title":"제목","body":"본문"}' },
  ],
})
ok(extractText(withSearchBlocks) === '{"title":"제목","body":"본문"}', '검색 블록을 걸러내고 본문만 읽는다')

// ─── 지시문: 찾을 수 있을 때 / 없을 때 / 회원이 지정했을 때
const srcBase = { type: 'info', mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'] }
const searchPrompt = buildUserPrompt({ ...srcBase, canSearch: true })
ok(searchPrompt.includes('검색 도구로 직접 찾아서 인용한다'), '찾아서 인용하라고 한다')
ok(searchPrompt.includes('먼저 검색해서'), '쓰기 전에 찾으라고 한다')
ok(searchPrompt.includes('대한비만학회'), '어디서 찾을지 알려준다')
ok(searchPrompt.includes('개인 블로그·카페·쇼핑몰·광고 글은 근거로 쓰지 않는다'), '쓰면 안 되는 출처도 알려준다')
ok(searchPrompt.includes('검색으로 확인한 것만 쓴다'), '기억으로 채우지 말라고 한다')
ok(searchPrompt.includes('빈손으로 오는 것이 지어내는 것보다 낫다'), '못 찾았을 때 무엇이 옳은지 못 박는다')
ok(searchPrompt.includes('인용이 아니라 장식이다'), '주제와 어긋난 인용을 막는다')
ok(!searchPrompt.includes('자료를 찾을 수 없는 상태다'), '찾을 수 있으면 못 한다고 하지 않는다')

const noSearchPrompt = buildUserPrompt({ ...srcBase, canSearch: false })
ok(noSearchPrompt.includes('자료를 찾을 수 없는 상태다'), '못 찾으면 그렇다고 밝힌다')
ok(noSearchPrompt.includes('연구·논문·전문가 인용과 효과 수치를 쓰지 않는다'), '그때는 인용을 막는다')
ok(!noSearchPrompt.includes('검색 도구로 직접 찾아서'), '못 하는 것을 시키지 않는다')

// 출처 이름을 한국어로 적게 한다 — 「한국어로만」 검사와 부딪히지 않게
ok(searchPrompt.includes('출처 이름은 한국어로 적는다'), '출처 이름을 한국어로 쓰라고 한다')
ok(searchPrompt.includes('세계보건기구(WHO)'), '약어는 괄호에 넣는 예를 준다')
ok(searchPrompt.includes('발행 기관 이름'), '우리말 이름이 없으면 기관으로 밝히라고 한다')
// 홍보글·후기글은 대상이 아니다
ok(!buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: ['쌍용동PT'], canSearch: true }).includes('검색 도구로'), '홍보글에는 검색 지시를 안 낸다')

// ─────────────────────────────────────────────────────────────
console.log('\n[91] 노출률에서 「경쟁 없는 검색어」를 뺀다')
/*
 * 회원이 우리 진단(「최적 3」)과 다른 사이트(「준최 · 44점」)를 나란히 놓고 물었다.
 * 우리 쪽을 다시 보니 계산에 구멍이 있었다 — 노출률을 낼 때 쓰는 검색어(제목 앞 3낱말)의
 * 난이도가 표본마다 완전히 달랐다. 회원 블로그의 실제 제목으로 재본 값(2026-08-11):
 *
 *   천안 신방동 맛집                    1,000편 이상   ← 진짜 경쟁 키워드
 *   천안 생선구이 뭔맛집                  410편
 *   천안 성심호수공원마당 백년한방활산채탕      0편        ← 사실상 그 글 하나
 *
 * 0편짜리 검색어에서 1위 하는 것은 블로그 힘의 증거가 아니다. 그런 표본이 섞이면 노출률이
 * 부풀고 등급이 후해진다 — 시중 도구와 벌어진 차이의 절반이 이것이었다.
 */
ok(isTrivialQuery(0) === true, '0편 검색어는 경쟁 없음')
ok(isTrivialQuery(29) === true, `${TRIVIAL_QUERY_MAX}편 미만은 경쟁 없음`)
ok(isTrivialQuery(TRIVIAL_QUERY_MAX) === false, '기준값은 경쟁 있음으로 본다')
ok(isTrivialQuery(410) === false, '410편은 경쟁 있음')
// 못 읽은 것을 유리하게도 불리하게도 쓰지 않는다
ok(isTrivialQuery(null) === false, '못 읽은 것(null)은 경쟁 없다고 보지 않는다')

// 경쟁 구간을 가르는 값이 blogsection 과 blogscore 에서 어긋나면 계산이 갈린다
ok(competitionOf(TRIVIAL_QUERY_MAX - 1) === 'none' && competitionOf(TRIVIAL_QUERY_MAX) === 'low',
  '두 파일의 「경쟁 없음」 경계가 같다')

// 뺀 표본을 판정 문장에 밝힌다 — 조용히 빼면 「이 숫자가 다 진짜」로 읽힌다
const trimEx = measureExposure([...mkS(3, 1, 0), ...mkS(7, 5, 2000), ...mkS(3, null, 2000)])
const gTrim = gradeBlog({ indexedRate: 100, exposure: trimEx, trivialMax: 30, samples: 13 })
ok(trimEx.real === 10 && trimEx.trivial === 3, '남은 표본 10편으로 센다', `${trimEx.real}/${trimEx.trivial}`)
ok(gTrim.reason.includes('표본 3편은 뺐습니다'), '몇 편을 뺐는지 말한다', gTrim.reason)
ok(gTrim.reason.includes('블로그 힘과 무관'), '왜 뺐는지도 말한다')
ok(gTrim.reason.includes('경쟁 강함'), '표본의 경쟁 강도도 밝힌다')
const gClean = gradeBlog({ indexedRate: 100, exposure: measureExposure(mkS(10, 5, 2000)), samples: 13 })
ok(!gClean.reason.includes('뺐습니다'), '뺀 게 없으면 그 말을 안 한다')

// 경쟁 있는 표본이 하나도 없으면 노출력을 판정하지 않는다 (모르는 것을 만들지 않는다)
const gNone = gradeBlog({ indexedRate: 100, exposure: measureExposure(mkS(5, 1, 0)), trivialMax: 30, samples: 5 })
ok(gNone.grade === 'normal', '판정을 미룬다')
ok(gNone.reason.includes('경쟁이 거의 없는 검색어'), '왜 못 쟀는지 밝힌다', gNone.reason)
ok(gNone.reason.includes('상호명·가게 이름이 제목 앞에 오면'), '어떤 경우인지 예를 든다')

// ─────────────────────────────────────────────────────────────
console.log('\n[92] 활동 지표 — 시중 도구가 보는 축을 우리도 읽는다')
/*
 * 회원이 우리 등급(준최 5)과 라블로그(준최 1)를 놓고 「우리도 저기서만 볼 수 있는 걸
 * 분석하면 되지 않냐」고 물었다. 라블로그 코드에서 무엇을 긁는지 확인하고 같은 것을
 * 로그인 없이 읽을 수 있는지 실측했다 (2026-08-11) — **전부 나왔다.**
 *
 *   hyoni2_  오늘 51 · 누적 90,159 · 이웃 640 · 글 416 (첫 글 2010-11-12)
 *   pnpgym   오늘  1 · 누적  6,699 · 이웃  74 · 글 146
 *
 * 그래서 그동안 화면에 적어둔 「방문자는 밖에서 볼 수 없다」가 틀린 말이었다.
 */
const { parseBlogStat, parsePostList, parseSympathy, postDate, statEmpty } = require(`${OUT}/naver/blogstat.js`)
const { measureActivity, band } = require(`${OUT}/analysis/activity.js`)

// 모바일 블로그 첫 화면에 박힌 상태값 (실제 응답에서 잘라온 모양)
const STAT_HTML =
  '{"alert":{"todayVisitor":0,"totalVisitor":0},"blogInfo":{"dayVisitorCount":51,' +
  '"subscriberCount":640,"totalVisitorCount":90159},"blogContentsCount":{"hyoni2_":' +
  '{"data":{"postCount":416,"marketPostCount":0,"momentCount":11}}}}'
const ST = parseBlogStat(STAT_HTML)
ok(ST.dayVisitors === 51 && ST.totalVisitors === 90159, '오늘·누적 방문자를 읽는다', `${ST.dayVisitors}/${ST.totalVisitors}`)
ok(ST.buddies === 640 && ST.postCount === 416, '이웃·글 수를 읽는다', `${ST.buddies}/${ST.postCount}`)
// 같은 이름이 알림용 0 으로 먼저 나온다 — 0 을 집으면 「방문자 없는 블로그」가 된다
ok(parseBlogStat('{"todayVisitor":0,"dayVisitorCount":0,"dayVisitorCount":51}').dayVisitors === 51,
  '0 이 먼저 나와도 실제 값을 집는다')
ok(parseBlogStat('<html>구조가 바뀌었다</html>') === null, '못 읽으면 null (0 으로 만들지 않는다)')
ok(statEmpty(null) === true && statEmpty(ST) === false, '빈 값 판정')

// 글 목록 — JSON.parse 로는 못 읽는다 (제목에 잘못된 \u 이스케이프가 섞여 온다)
const LIST_JSON =
  '{"resultCode":"S","countPerPage":"30","totalCount":"416","postList":[' +
  '{"sellerServiceStatus":"","logNo":"224372893152","title":"%EC%B2%9C%EC%95%88+%EB%A7%9B%EC%A7%91",' +
  '"categoryNo":"19","commentCount":"1","readCount":"","addDate":"2026. 8. 9.","openType":"2","searchYn":"true"},' +
  '{"logNo":"224372519097","title":"%EB%B9%84%EA%B3%B5%EA%B0%9C+%EA%B8%80","categoryNo":"7",' +
  '"commentCount":"10","addDate":"2026. 7. 30.","openType":"0","searchYn":"false"}]}'
const PL = parsePostList(LIST_JSON)
ok(PL.total === 416, '전체 글 수 — RSS 는 50편만 주니 이게 있어야 규모를 안다', String(PL.total))
ok(PL.posts.length === 2, '글 2편')
ok(PL.posts[0].title === '천안 맛집', '제목을 디코딩한다 (+ 는 공백)', PL.posts[0].title)
ok(PL.posts[0].date === '2026-08-09', '날짜를 YYYY-MM-DD 로', PL.posts[0].date)
ok(PL.posts[0].commentCount === 1 && PL.posts[1].commentCount === 10, '댓글 수를 읽는다')
// **검색 허용 안 함**을 구분해야 정상 블로그를 누락으로 오판하지 않는다
ok(PL.posts[0].searchable === true && PL.posts[1].searchable === false, '검색 허용 설정을 읽는다')
ok(PL.posts[0].open === true && PL.posts[1].open === false, '공개 범위를 읽는다')
ok(parsePostList('').posts.length === 0 && parsePostList('<html>').total === null, '못 읽으면 빈 값')
ok(postDate('2010. 11. 12.') === '2010-11-12', '한 자리 월·일도 채운다', postDate('2010. 11. 12.'))
ok(postDate('없는날짜') === '', '못 읽으면 빈 문자열')

// 공감 수
ok(parseSympathy('{"isSuccess":true,"result":{"totalCount":21,"postTitle":"x"}}') === 21, '공감 수를 읽는다')
ok(parseSympathy('{"isSuccess":false}') === null, '실패 응답은 null')

// 구간 나누기
ok(band(0, [50, 200]) === 0 && band(50, [50, 200]) === 0.5 && band(999, [50, 200]) === 1, '구간 → 0~1')

// hyoni2_ 실측값으로 활동 지수를 낸다
const ACT = measureActivity({
  stat: ST,
  posts: [
    { logNo: '1', title: 'a', date: '2026-08-09', categoryNo: '19', commentCount: 1, searchable: true, open: true },
    { logNo: '2', title: 'b', date: '2026-08-05', categoryNo: '19', commentCount: 3, searchable: true, open: true },
    { logNo: '3', title: 'c', date: '2024-01-01', categoryNo: '19', commentCount: 2, searchable: false, open: true },
  ],
  firstPost: '2010-11-12',
  sympathy: [21, 2, null],
  today: '2026-08-11',
})
ok(ACT.score > 0 && ACT.score <= 100, '0~100 점수를 낸다', String(ACT.score))
ok(ACT.axes.length === 5, '다섯 축', String(ACT.axes.length))
ok(ACT.axes.every((a) => a.observed && a.note), '축마다 관찰값과 근거를 함께 준다')
ok(ACT.facts.ageDays > 5000, '첫 글 날짜로 운영 기간을 센다', String(ACT.facts.ageDays))
ok(ACT.facts.avgVisitors === Math.round(90159 / ACT.facts.ageDays), '누적 ÷ 운영일수 = 하루 평균', String(ACT.facts.avgVisitors))
ok(ACT.facts.last30 === 2, '최근 30일 발행만 센다 (2024년 글은 빼고)', String(ACT.facts.last30))
ok(ACT.facts.unsearchable === 1, '검색 허용 안 함인 글을 센다')
// 못 읽은 것을 0점으로 넣으면 「이웃을 못 읽은 블로그」가 「이웃이 없는 블로그」가 된다
const PARTIAL = measureActivity({
  stat: { dayVisitors: 51, totalVisitors: null, buddies: null, postCount: null, moments: null },
  posts: [],
  today: '2026-08-11',
})
ok(PARTIAL.axes.length === 1 && PARTIAL.score === Math.round((PARTIAL.axes[0].value / PARTIAL.axes[0].max) * 100),
  '못 읽은 항목은 배점에서 뺀다', `${PARTIAL.axes.length}축 ${PARTIAL.score}점`)
ok(measureActivity({ stat: null, posts: [], today: '2026-08-11' }) === null, '아무것도 못 읽으면 null')
// 규모가 다른 블로그는 다른 점수가 나와야 한다 (pnpgym 실측값)
const SMALL = measureActivity({
  stat: { dayVisitors: 1, totalVisitors: 6699, buddies: 74, postCount: 146, moments: 0 },
  posts: [],
  firstPost: '2021-03-01',
  today: '2026-08-11',
})
ok(SMALL.score < ACT.score, '작은 블로그가 낮게 나온다', `${SMALL.score} < ${ACT.score}`)
ok(SMALL.size === '작은 편' || SMALL.size === '아주 작은 편', '구간 이름도 최적·준최과 겹치지 않는다', SMALL.size)
// 밖에서 못 보는 것은 못 본다고 밝힌다
ok(ACT.blind.some((b) => b.includes('유입경로')) && ACT.blind.some((b) => b.includes('체류시간')),
  '로그인해야 보이는 것을 명시한다')

// ─────────────────────────────────────────────────────────────
console.log('\n[94] 상호명을 줄여 쓰지 않았는가')
/*
 * 회원 요청 (2026-08-11): "센터를 단순 지역명 + 「점」이 아니라 제대로 상호명이 들어갈 수
 * 있게 해줘." 나온 글이 「두정점입니다」·「두정점에서는」으로 도배돼 있었다.
 *
 * **기존 `legalName` 검사로는 안 잡혔다.** 그건 정식 상호명이 몇 번 나오는지만 세니까,
 * 세 번만 제대로 쓰고 나머지를 줄임말로 써도 통과였다.
 */
const shortBase = {
  type: 'promo',
  mainKeyword: '두정동 헬스장',
  subKeywords: ['두정동PT'],
  tags: ['두정동헬스장'],
  legalName: 'MTO 피트니스 두정점',
  title: '두정동 헬스장 3개월 9.9만원, 새벽에도 갈까?',
}
const shortItem = (body, patch = {}) =>
  checkPost({ ...shortBase, ...patch, body }).items.find((i) => i.id === 'legalNameShort')
const filler = '운동 얘기입니다. '.repeat(28)
const properly = `안녕하세요, MTO 피트니스 두정점입니다. `.repeat(3) + filler
ok(shortItem(properly)?.level === 'pass', '정식 상호명만 쓰면 통과', shortItem(properly)?.value)
// 정식 상호명 안에도 「두정점」이 들어 있다 — 그걸 줄임말로 세면 통과가 불가능해진다
ok(shortItem(properly)?.value.includes('줄임말 없음'), '정식 상호명 속의 낱말을 줄임말로 세지 않는다')
const once = `안녕하세요, MTO 피트니스 두정점입니다. `.repeat(3) + '두정점에서는 이렇게 합니다. ' + filler
ok(shortItem(once)?.level === 'warn', '한두 곳 줄여 쓰면 주의', shortItem(once)?.value)
const mostly = `안녕하세요, MTO 피트니스 두정점입니다. ` + '두정점은 이렇습니다. '.repeat(5) + filler
ok(shortItem(mostly)?.level === 'fail', '줄임말이 정식 상호명보다 많으면 즉시수정', shortItem(mostly)?.value)
ok(shortItem(mostly)?.hint.includes('어느 브랜드인지 모릅니다'), '왜 안 되는지 알려준다')
ok(shortItem(mostly)?.hint.includes('MTO 피트니스 두정점'), '무엇으로 바꾸라고 알려준다')
ok(shortItem(mostly)?.hint.includes('「저희」·「여기」로 받으세요'), '길어지는 부담에 대한 답도 준다')
// 상호명이 한 낱말이면 줄임말이 있을 수 없다 — 항목을 만들지 않는다
ok(shortItem(properly, { legalName: '헬스장' }) === undefined, '한 낱말 상호명은 검사하지 않는다')

/*
 * **후기글에서도 돌아야 한다** (2026-08-11 두 번째 판).
 *
 * 처음엔 이 검사를 상호명 횟수 검사(`legalName`) 안에 넣었는데, 후기글은
 * `legalNameMin: 0` 이라(방문객이 상호를 반복하면 광고 티가 난다 — 그 이유는 그대로
 * 맞다) **검사가 아예 안 돌았다.** 회원이 「두정점」을 지적한 글이 바로 후기글이었다.
 * 「몇 번 쓰라」와 「줄여 쓰지 마라」는 다른 규칙이다.
 */
ok(SPECS.review.legalNameMin === 0, '후기글은 상호명 횟수를 요구하지 않는다 (그대로 둔다)')
const revShort = (body) =>
  checkPost({ ...shortBase, type: 'review', sponsorship: 'own', body }).items.find((i) => i.id === 'legalNameShort')
ok(revShort(properly) !== undefined, '후기글에서도 검사가 돈다')
ok(revShort('여성전용 착한헬스 두정점에 다녀왔어요. ' + '두정점은 좋았어요. '.repeat(3) + filler)?.level === 'fail',
  '후기글의 줄임말도 잡는다')

/*
 * **브랜드가 남은 축약은 세지 않는다.** 「여성전용 착한헬스 두정점」을 「착한헬스 두정점」
 * 으로 줄이는 것은 스킬(stores.md)이 일부러 허용한 형태다 — 방문객이 정식 명칭을 세 번
 * 다 읊으면 광고 티가 가장 크게 난다. 막아야 하는 것은 **브랜드가 사라진** 「두정점」이다.
 */
const wsBase = { ...shortBase, type: 'review', sponsorship: 'own', legalName: '여성전용 착한헬스 두정점' }
const wsItem = (body) => checkPost({ ...wsBase, body }).items.find((i) => i.id === 'legalNameShort')
ok(wsItem('여성전용 착한헬스 두정점에 다녀왔어요. ' + '착한헬스 두정점은 좋았어요. '.repeat(2) + filler)?.level === 'pass',
  '브랜드가 남은 축약은 통과한다')
ok(wsItem('여성전용 착한헬스 두정점에 다녀왔어요. ' + '두정점은 좋았어요. '.repeat(2) + filler)?.level === 'fail',
  '브랜드가 사라진 축약은 잡는다')
// **바로 앞에 붙어 있어야** 브랜드가 남은 것이다 — 앞 문장의 상호명에 묻히면 안 된다
const adjacency = shortItem('안녕하세요, MTO 피트니스 두정점입니다. 두정점에서는 이렇게 합니다. ' + filler)
ok(adjacency?.value.includes('1곳'), '앞 문장의 상호명에 묻히지 않는다', adjacency?.value)
ok(wsItem('여성전용 착한헬스 두정점입니다. ' + filler)?.hint === undefined, '통과면 힌트가 없다')
ok(wsItem('두정점입니다. ' + filler)?.hint.includes('착한헬스 두정점'), '브랜드가 남는 축약을 대안으로 알려준다')

/*
 * 지시문도 같은 말을 해야 한다. **예시가 「○○점입니다」였던 게 원인의 절반이다** —
 * 줄여 쓴 꼴을 예시로 주고 있었으니 모델은 그대로 따랐다.
 */
const nameSys = buildSystemPrompt('promo')
ok(!nameSys.includes('"안녕하세요, ○○점입니다"'), '줄여 쓴 예시를 빼냈다')
ok(nameSys.includes('정식 상호명 전체로'), '정식 상호명 전체로 인사하라고 한다')
ok(nameSys.includes('지역명+점 으로만 줄여 쓰지 않는다'), '줄여 쓰지 말라고 못 박는다')
// 지점 정보의 「표시 이름」이 본문용으로 읽히지 않게 한다
const namePrompt = buildUserPrompt({
  type: 'promo',
  store: { name: '두정점', legalName: 'MTO 피트니스 두정점', location: '천안 두정동', phone: '041-000-0000' },
  mainKeyword: '두정동 헬스장',
  subKeywords: [],
})
ok(namePrompt.includes('본문·제목에는 이것을 글자 그대로 쓴다'), '정식 상호명을 쓰라고 표시한다')
ok(namePrompt.includes('본문에 쓰지 않는다'), '표시 이름을 본문에 쓰지 말라고 한다')
ok(namePrompt.includes('「두정점입니다」처럼 줄여 쓰면'), '줄여 쓴 꼴을 그대로 보여주며 막는다')
// 표시 이름과 정식 상호명이 같으면 그 줄을 두 번 낼 이유가 없다
const sameName = buildUserPrompt({
  type: 'promo',
  store: { name: 'MTO 피트니스 두정점', legalName: 'MTO 피트니스 두정점', location: '천안', phone: '041' },
  mainKeyword: '두정동 헬스장',
  subKeywords: [],
})
ok(!sameName.includes('- 표시 이름:'), '이름이 같으면 표시 이름 줄을 내지 않는다')

// ─────────────────────────────────────────────────────────────
console.log('\n[93] 제목만 다시 쓰기 · 도배 낱말을 바꿔 쓸 말')
/*
 * ─── 제목만 다시 쓰기 ─────────────────────────────────────────
 *
 * 회원 지적 (네 번째): "제목에 홍보 내용이 안 들어갈 때가 있어. 확실히 수정해줘."
 * 지시문·검수·고쳐 쓰기 목록·자동 실행까지 이었는데도 가끔 빠졌다 — 본문까지 함께 고치는
 * 요청에서는 모델이 할 일이 많아 제목 한 줄을 흘린다. 그래서 **제목만 놓고** 한 번 더 묻는다.
 */
const { buildTitlePrompt } = require(`${OUT}/ai/prompt.js`)
const tp1 = buildTitlePrompt('쌍용동 헬스장 상담 받아본 후기', ['제목에 홍보 한 조각: 지금 없음 / 기준 혜택 한 조각'], {
  mainKeyword: '쌍용동 헬스장',
  eventText: '8월 등록분 3개월 9.9만원',
  type: 'review',
})
ok(tp1.includes('제목만'), '제목만 고치라고 한다')
ok(tp1.includes('본문은 손대지 않는다'), '본문을 건드리지 말라고 한다')
ok(tp1.includes('쌍용동 헬스장 상담 받아본 후기'), '지금 제목을 보여준다')
ok(tp1.includes('제목에 홍보 한 조각'), '무엇이 걸렸는지 알려준다')
ok(tp1.includes('8월 등록분 3개월 9.9만원'), '이벤트 정보에서 가져오라고 한다')
ok(tp1.includes('방문객 말투'), '후기글은 방문객 말투로')
ok(tp1.includes('{"title"'), '제목 한 줄만 JSON 으로 받는다')
ok(!tp1.includes('본문 글자수'), '본문 규칙을 다시 늘어놓지 않는다 (길면 또 흘린다)')
// 이벤트 정보가 없으면 금액을 지어내지 않게 한다
const tp2 = buildTitlePrompt('쌍용동 헬스장 추천', ['제목에 홍보 한 조각: 지금 없음'], {
  mainKeyword: '쌍용동 헬스장',
  type: 'promo',
})
ok(tp2.includes('금액을 지어내지 말고'), '이벤트 정보가 없으면 지어내지 말라고 한다')
ok(tp2.includes('가격'), '금액 없이 쓸 말을 준다')
ok(!tp2.includes('방문객 말투'), '홍보글에는 방문객 말투를 시키지 않는다')
ok(tp2.includes('한 문장으로 읽히게'), '제목 재시도도 한 문장을 요구한다')
ok(!tp2.includes('독자가 실제로 하는 질문'), '제목 재시도에서 홍보글에 질문형을 시키지 않는다')
ok(tp1.includes('최저가·파격가'), '광고심의 위험은 계속 막는다')

/*
 * 회원 요청 (2026-08-11): "이거를 지우는 게 아니라 단어를 수정하는 쪽으로 고치면 좋겠어."
 * 「무료」를 지우면 무료라는 사실이 사라지지만 「비용 없는」으로 바꾸면 **뜻은 남고 도배
 * 횟수만 줄어든다.** 그게 더 맞는 방향이다.
 */
const { ALT_WORDS, altWords, COMMERCIAL_LIMITS: LIMITS, scanRisks: scanR, RISK_TERMS: RTERMS } = require(`${OUT}/writing/banned.js`)

ok(altWords('무료').length >= 2, '무료에 바꿔 쓸 말이 있다', altWords('무료').join('/'))
ok(altWords('혜택').includes('조건'), '혜택 → 조건')
ok(altWords('없는말').length === 0, '없는 낱말은 빈 배열 (화면이 버튼을 안 만든다)')
// 상한이 걸린 낱말은 모두 바꿔 쓸 말이 있어야 한다 — 없으면 버튼이 안 나와 회원이 막힌다
for (const { term } of LIMITS) {
  ok(altWords(term).length > 0, `「${term}」에 바꿔 쓸 말이 있다`)
}

/*
 * **바꾼 결과가 다른 항목에 걸리면 안 된다.** 「혜택」을 「할인」으로 바꾸면 할인 상한(2회)
 * 으로 옮겨가는 것뿐이고, 광고심의에 걸리는 말로 바꾸면 한 항목 고치고 다른 항목을 만든다.
 */
const limitTerms = LIMITS.map((l) => l.term)
for (const [term, alts] of Object.entries(ALT_WORDS)) {
  for (const alt of alts) {
    ok(!limitTerms.some((t) => alt.includes(t)), `「${term}」→「${alt}」가 다른 상한 낱말이 아니다`)
    // 위험 표현 검사를 그대로 돌려본다 (문장에 넣어도 안 걸리는지)
    const hits = scanR(`${alt} 상담을 해드립니다.`)
    ok(hits.length === 0, `「${alt}」는 위험 표현에 안 걸린다`, hits.map((h) => h.term).join('/'))
  }
}

/*
 * 실제로 바꿨을 때 도배가 풀리는지 — 「무료」 3회 중 하나를 바꾸면 허용(2회) 안으로 들어온다.
 */
const { scanCommercialOveruse } = require(`${OUT}/writing/banned.js`)
const overused = '무료 상담도 되고 무료 주차도 되고 무료 체험도 됩니다.'
ok(scanCommercialOveruse(overused).length === 1, '무료 3회면 걸린다')
const swapped = overused.replace('무료 체험', '비용 없는 체험')
ok(scanCommercialOveruse(swapped).length === 0, '한 자리를 바꾸면 상한 안으로 들어온다', JSON.stringify(swapped))
// 지우는 쪽도 여전히 된다 (지워도 읽히는 자리가 있다)
ok(scanCommercialOveruse(overused.replace('무료 체험', '체험')).length === 0, '지워도 상한 안으로 들어온다')


/*
 * ─── mutate 오용 잡기 ────────────────────────────────────────────
 *
 * 회원 요청 "오류 수정해줘" 로 찾은 진짜 결함. `/api/cron/factors` 가
 * `return { ...cur, factorRuns: … }` 로 새 DB 객체를 돌려줬는데, `mutate` 가 저장하는 것은
 * **넘겨준 db** 다. 그래서 크론은 매일 네이버를 수십 번 호출하고 결과를 전부 버렸다.
 * 8월 5일 이후 관찰 기록이 하나도 안 쌓였고, 오류도 로그도 없어서 8일 동안 몰랐다.
 *
 * 같은 실수가 다시 들어오지 못하게 두 겹으로 막는다: 런타임 가드 + 소스 검사.
 */
const { isDbShaped } = require(`${OUT}/store.js`)
const dbLike = { posts: [], stores: [], rankTargets: [] }
ok(isDbShaped(dbLike) === true, 'DB 모양을 알아본다')
ok(isDbShaped({ ...dbLike, factorRuns: [] }) === true, '항목이 더 있어도 DB 모양이다')
ok(isDbShaped({ posts: [] }) === false, '일부만 있으면 DB 모양이 아니다 (반환값을 함부로 막지 않는다)')
ok(isDbShaped(null) === false, 'null 은 아니다')
ok(isDbShaped([dbLike]) === false, '배열은 아니다')
ok(isDbShaped({ post: { id: 'p1' }, tracked: 1 }) === false, '흔한 반환값은 통과시킨다')

// 소스 검사 — mutate 콜백이 새 DB 를 돌려주는 꼴이 남아 있지 않은지
{
  const { readFileSync, readdirSync, statSync } = require('node:fs')
  const { join } = require('node:path')
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : []
    })
  /*
   * 주석은 걷어내고 본다. 이 결함을 설명하는 주석 자체가 나쁜 예를 글자로 적고 있어서,
   * 안 걷어내면 「고쳐 놨는데 테스트가 실패」한다 (실제로 그렇게 됐다).
   */
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const bad = []
  for (const f of [...walk('app'), ...walk('lib')]) {
    const src = stripComments(readFileSync(f, 'utf8'))
    if (!src.includes('mutate(')) continue
    // `return { ...db` / `...d,` / `...cur` — DB 를 펼쳐 새 객체를 만드는 꼴
    const m = src.match(/return \{\s*\.\.\.(db|d|cur|database)[,\s}]/)
    if (m) bad.push(`${f}: ${m[0]}`)
  }
  ok(bad.length === 0, 'mutate 콜백이 새 DB 를 돌려주는 곳이 없다', bad.join(' / '))
}


/*
 * ─── 저장했는데 읽을 때 사라지는 항목이 없는지 (2026-08-19) ─────────
 *
 * `openingRuns` 를 저장하고도 화면에는 「첫 측정 전입니다」가 떴다. 원인은 `normalize()` —
 * **여기 적힌 항목만 옮기고 나머지는 조용히 버린다.** 저장은 성공했고 다음 읽기에서
 * 사라졌으니, mutate 오용(2026-08-13)과 같은 모양의 사고다: **성공으로 보이는 데이터 손실.**
 *
 * 그래서 목록을 한 곳(DB_LIST_KEYS)으로 모으고, 그 목록이 `lib/types.ts` 의 DB 인터페이스와
 * 어긋나면 여기서 실패하게 한다. 다음에 새 항목을 만드는 사람이 「한 군데 빠뜨리는」 실수를
 * 타입 검사가 못 잡기 때문에, 사람이 아니라 테스트가 잡아야 한다.
 */
{
  const { readFileSync } = require('node:fs')
  const { join } = require('node:path')
  const { DB_LIST_KEYS } = require(`${OUT}/store.js`)

  const types = readFileSync(join(process.cwd(), 'lib/types.ts'), 'utf8')
  const block = types.match(/export interface DB \{([\s\S]*?)\n\}/)
  ok(Boolean(block), 'lib/types.ts 에서 DB 인터페이스를 찾는다')

  // 주석을 걷어내고 「이름?: 타입[]」 꼴만 뽑는다
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const declared = [...body.matchAll(/^\s*(\w+)\??:\s*[^\n]*\[\]/gm)].map((m) => m[1])
  ok(declared.length > 5, `DB 목록 항목을 읽었다 — ${declared.length}개`)

  const missing = declared.filter((k) => k !== 'stores' && !DB_LIST_KEYS.includes(k))
  ok(
    missing.length === 0,
    'DB 의 모든 목록 항목이 store 의 DB_LIST_KEYS 에 있다 (없으면 저장해도 읽을 때 사라진다)',
    missing.join(' · ')
  )
  const extra = DB_LIST_KEYS.filter((k) => !declared.includes(k))
  ok(extra.length === 0, 'DB_LIST_KEYS 에 없는 항목을 만들지 않는다', extra.join(' · '))

  /*
   * 실제로 살아 돌아오는지도 본다 — 목록에 이름을 적는 것과 값이 보존되는 것은 다른 일이다.
   * (저장 경로를 건드리지 않는다. 테스트가 회원의 data/db.json 을 덮어쓰면 안 된다.)
   */
  const { normalizeDB } = require(`${OUT}/store.js`)
  const sample = { stores: [{ id: 's', name: '테스트점' }] }
  for (const k of DB_LIST_KEYS) sample[k] = [{ mark: k }]
  const back = normalizeDB(sample)
  const lost = DB_LIST_KEYS.filter((k) => back[k]?.[0]?.mark !== k)
  ok(lost.length === 0, '읽기 정규화를 거쳐도 항목이 사라지지 않는다', lost.join(' · '))
  ok(back.openingRuns?.[0]?.mark === 'openingRuns', '이 사고의 원본 항목(openingRuns)이 살아 돌아온다')
  // 모르는 항목은 여전히 버린다 (백업 파일이 아닌 것을 통째로 받아들이지 않는다)
  ok(normalizeDB({ ...sample, 엉뚱한것: [1] }).엉뚱한것 === undefined, '모르는 항목은 받아들이지 않는다')
  ok(normalizeDB(null).openingRuns.length === 0, '값이 없으면 빈 목록으로 시작한다')
}


/*
 * ─── 지금 뚫릴 만한 자리인가 (openings) ──────────────────────────
 *
 * 회원 제안으로 7일 이내 진입 글을 재보니 **글의 형태로는 안 갈렸다**. 그래서 글쓰기 규칙을
 * 만들지 않고, 고를 수 있는 것(어느 키워드를 잡느냐)을 재기로 했다. 등급이 잰 것만으로
 * 갈리는지 여기서 지킨다.
 */
{
  const { openingOf, ageDaysOf, sortOpenings, FRESH_DAYS, QUIET_MAX } = require(`${OUT}/analysis/openings.js`)

  const openQuiet = openingOf({ ages: [1, 14, 30, 40], recent30: 28 })
  ok(openQuiet.tier === 'open-quiet', '7일 이내 글 + 조용한 판 = 맨 위', openQuiet.tier)
  ok(openQuiet.fresh === 1 && openQuiet.youngest === 1, '7일 이내 수와 가장 어린 나이', `${openQuiet.fresh}/${openQuiet.youngest}`)
  ok(openQuiet.medianAge === 30, '나이 중간값', String(openQuiet.medianAge))
  ok(openQuiet.why.includes('28편'), '왜 그 등급인지 숫자로 말한다', openQuiet.why)

  ok(openingOf({ ages: [2, 40, 60], recent30: 404 }).tier === 'open', '7일 이내는 있지만 경쟁이 세면 open')
  ok(openingOf({ ages: [31, 40, 60], recent30: 45 }).tier === 'quiet', '조용하지만 굳은 자리')
  ok(openingOf({ ages: [31, 40, 60], recent30: 404 }).tier === 'shut', '둘 다 아니면 굳은 자리')

  // 경계값 — 7일과 100편은 포함이다
  ok(openingOf({ ages: [FRESH_DAYS], recent30: QUIET_MAX }).tier === 'open-quiet', '경계값은 포함으로 본다')
  ok(openingOf({ ages: [FRESH_DAYS + 1], recent30: QUIET_MAX + 1 }).tier === 'shut', '경계를 넘으면 굳은 자리')

  // 발행량을 모르면 「경쟁 적음」으로 치지 않는다 (모르는 것을 유리하게 쓰지 않는다)
  ok(openingOf({ ages: [3], recent30: null }).tier === 'open', '발행량을 모르면 조용하다고 하지 않는다')
  ok(openingOf({ ages: [50], recent30: null }).tier === 'shut', '발행량 모름 + 오래된 글 = 굳은 자리')

  // 날짜를 하나도 못 읽으면 7일 이내 0편이고 나이도 없다
  const noDate = openingOf({ ages: [], recent30: 50 })
  ok(noDate.youngest === null && noDate.medianAge === null, '날짜가 없으면 나이를 만들지 않는다')
  ok(noDate.tier === 'quiet', '날짜를 모르면 열렸다고 하지 않는다', noDate.tier)

  // 나이 계산
  const now = Date.parse('2026-08-18T00:00:00Z')
  ok(ageDaysOf('2026-08-11', now) === 7, '이레 전이면 7일', String(ageDaysOf('2026-08-11', now)))
  ok(ageDaysOf('', now) === null, '날짜가 없으면 null')
  ok(ageDaysOf('말도 안 되는 값', now) === null, '못 읽으면 null')

  // 표 순서 — 등급 먼저, 같으면 7일 이내 많은 순, 그다음 발행량 적은 순
  const mk = (keyword, ages, recent30) => ({ ...openingOf({ ages, recent30 }), keyword, stores: [], dated: ages.length, sampled: ages.length })
  const sorted = sortOpenings([
    mk('굳음', [50], 500),
    mk('열림-경쟁셈', [2], 300),
    mk('열림-조용', [2], 20),
    mk('열림-조용-많이', [1, 2, 3], 20),
  ]).map((r) => r.keyword)
  ok(sorted[0] === '열림-조용-많이' && sorted[1] === '열림-조용', '열리고 조용한 자리가 위로', sorted.join(' > '))
  ok(sorted[sorted.length - 1] === '굳음', '굳은 자리는 맨 아래', sorted.join(' > '))
}


/*
 * ─── 매일 자동으로 다시 잰다 (2026-08-19) ────────────────────────
 *
 * 회원 요청: "자동으로 매일 업데이트 되게 해줘." 앞 판은 버튼을 누를 때만 재고 결과를 화면
 * 상태에만 뒀다 — 새로 고치면 사라지고, 누르지 않으면 아무 값도 없었다.
 *
 * 여기서 지키는 것은 세 가지다:
 *   ① 재는 루프가 **버튼과 크론에서 같다** (라우트는 테스트가 못 읽으니 lib 로 뺐다)
 *   ② 못 잰 키워드를 숨기지 않는다 — 빈 줄은 「자리가 굳었다」로 읽힌다
 *   ③ 어제와 비교해 **열린 날**을 잡는다 (그게 매일 재는 이유다)
 */
{
  const { openingOf, openingChanges, OPENING_RUNS_KEEP, CHANGE_LABEL } = require(`${OUT}/analysis/openings.js`)
  const { scanOpenings, mergeOpeningRuns, keywordOwners, TOP } = require(`${OUT}/analysis/openings-scan.js`)

  // ── 재는 루프. 네이버 호출은 주입한다 (진짜로 부르지 않는다)
  const NOW = Date.parse('2026-08-19T00:00:00Z')
  const PAGES = {
    '용곡동 PT': { items: [{ date: '2026-08-18' }, { date: '2026-07-01' }, { date: null }] },
    '쌍용동 헬스장': { items: [{ date: '2026-05-01' }, { date: '2026-04-01' }] },
  }
  const owners = keywordOwners([
    { name: '쌍용점', localKeywords: ['쌍용동 헬스장', ' 용곡동 PT ', ''] },
    { name: '두정점', localKeywords: ['쌍용동 헬스장'] },
  ])
  ok(owners.size === 2, `키워드 앞뒤 공백·빈 값을 정리한다 — ${owners.size}개`)
  ok(owners.get('쌍용동 헬스장').join('·') === '쌍용점·두정점', '한 키워드를 두 지점이 쓰면 둘 다 적는다')

  const deps = {
    now: () => NOW,
    top: async (k, n) => {
      ok(n === TOP, '1페이지 범위를 그대로 넘긴다', String(n))
      if (!PAGES[k]) throw new Error('네이버가 막았다')
      return PAGES[k]
    },
    recent: async (k) => ({ count: k === '용곡동 PT' ? 22 : 800 }),
  }
  const scan = await scanOpenings(['용곡동 PT', '쌍용동 헬스장', '없는 키워드'], owners, deps)
  ok(scan.rows.length === 2, `잰 줄만 표에 넣는다 — ${scan.rows.length}줄`)
  ok(scan.failed.join() === '없는 키워드', '못 잰 키워드를 숨기지 않는다', scan.failed.join())
  ok(scan.rows[0].keyword === '용곡동 PT' && scan.rows[0].tier === 'open-quiet', '열린 자리가 맨 위', scan.rows[0].tier)
  ok(scan.rows[0].stores.join() === '쌍용점', '어느 지점 키워드인지 함께 준다')
  ok(scan.rows[0].dated === 2 && scan.rows[0].sampled === 3, `날짜를 읽은 수와 잰 수를 구분한다 — ${scan.rows[0].dated}/${scan.rows[0].sampled}`)

  // 발행량 조회만 실패하면 그 키워드를 버리지 않는다 (등급은 7일 이내만으로도 나온다)
  const halfBlind = await scanOpenings(['용곡동 PT'], owners, {
    ...deps,
    recent: async () => {
      throw new Error('발행량 조회 실패')
    },
  })
  ok(halfBlind.rows.length === 1 && halfBlind.failed.length === 0, '발행량을 못 읽어도 줄은 남긴다')
  ok(halfBlind.rows[0].tier === 'open', '발행량 모름 = 조용하다고 하지 않는다', halfBlind.rows[0].tier)

  /*
   * ─── 자리 회전 (2026-08-20) ─────────────────────────────────
   *
   * 회원: "쌍용동 헬스장, 두정동 헬스장에 상위노출하려면 어떻게 해야 하냐. 우회하고 싶지
   * 않다." 10일치 조사 기록으로 재보니 두 자리 1페이지가 **주당 11편씩 갈리고 있었다.**
   * 내 등급은 「1페이지에 7일 이내 글이 있나」만 보고 그걸 「굳은 자리」로 적었는데, 그 말은
   * 「못 들어간다」로 읽힌다. 등급과 회전은 **다른 질문**이라는 것을 여기서 못 박는다.
   */
  {
    const { turnoverOf, dailyTopFrom, turnoverNote } = require(`${OUT}/analysis/turnover.js`)

    // 하루에 1편씩 갈리는 자리
    const daily = [
      { date: '2026-08-10', urls: ['a', 'b', 'c'] },
      { date: '2026-08-11', urls: ['a', 'b', 'd'] },
      { date: '2026-08-12', urls: ['a', 'e', 'd'] },
    ]
    const t = turnoverOf(daily)
    ok(t.entries === 2, `새로 들어온 글만 센다 — ${t.entries}편`)
    ok(t.perWeek === 7, `주당으로 환산한다 — ${t.perWeek}편`)
    ok(t.kept === 1 && t.keptOf === 3, `첫날 글 중 남은 수 — ${t.kept}/${t.keptOf}`)
    // 순위가 오르내린 것은 「새 진입」이 아니다 — 우리가 알고 싶은 건 자리가 나는가다
    const shuffled = turnoverOf([
      { date: '2026-08-10', urls: ['a', 'b', 'c'] },
      { date: '2026-08-11', urls: ['c', 'a', 'b'] },
    ])
    ok(shuffled.entries === 0, '순서만 바뀐 것은 새 진입이 아니다')
    ok(turnoverOf([{ date: '2026-08-10', urls: ['a'] }]) === null, '하루치로는 회전을 못 센다')
    ok(turnoverOf([]) === null, '기록이 없으면 null (0편이라고 하지 않는다)')
    ok(turnoverNote(null) === null, '없는 값을 문장으로 만들지 않는다')
    ok(turnoverNote(t).includes('주당 7편'), '사람 말로도 같은 숫자를 쓴다', turnoverNote(t))

    // 조사 기록에서 뽑아내기 — ranks 는 키워드→순위 객체다
    const runs = [
      {
        date: '2026-08-11',
        posts: [
          { url: 'x', ranks: { '쌍용동 헬스장': 3, '봉명동 헬스장': 1 } },
          { url: 'y', ranks: { '쌍용동 헬스장': 11 } }, // 1페이지 밖
          { url: 'z', ranks: { '봉명동 헬스장': 2 } },
          { url: 'w' }, // ranks 없음
        ],
      },
      { date: '2026-08-10', posts: [{ url: 'q', ranks: { '쌍용동 헬스장': 1 } }] },
    ]
    const got = dailyTopFrom(runs, '쌍용동 헬스장')
    ok(got.length === 2 && got[0].date === '2026-08-10', '날짜 순으로 정렬한다', got.map((g) => g.date).join())
    ok(got[1].urls.join() === 'x', '1페이지(10위 안) 글만 담는다', got[1].urls.join())
    ok(dailyTopFrom(runs, '없는 키워드').length === 0, '기록에 없는 키워드는 빈 배열')
    // 이 자료로 회전을 세면 「x 가 새로 들어왔다」가 나온다
    ok(turnoverOf(got).entries === 1, '기록에서 바로 회전이 나온다')
  }

  // ── 우회로 재기 — 굳은 자리가 있는 동네만, 이미 잰 것은 빼고
  {
    const { scanDetours } = require(`${OUT}/analysis/openings-scan.js`)
    const mk = (keyword, ages, recent30) => ({
      ...openingOf({ ages, recent30 }),
      keyword,
      stores: [],
      dated: ages.length,
      sampled: ages.length,
      kind: 'store',
    })
    const asked = []
    const fake = {
      now: () => NOW,
      top: async (k) => {
        asked.push(k)
        return { items: [{ date: '2026-08-18' }] }
      },
      recent: async () => ({ count: 30 }),
    }

    // 굳은 자리가 없으면 한 콜도 쓰지 않는다
    const none = await scanDetours([mk('용곡동 PT', [1], 24)], fake)
    ok(none.rows.length === 0 && asked.length === 0, '굳은 자리가 없으면 우회로를 재지 않는다')

    const got = await scanDetours([mk('쌍용동 헬스장', [60], 444), mk('용곡동 PT', [1], 24)], fake, 12)
    ok(asked.length > 0 && asked.length <= 12, `상한까지만 잰다 — ${asked.length}개`)
    ok(
      asked.every((k) => k.startsWith('쌍용동')),
      '굳은 자리가 있는 동네만 잰다 (열린 동네는 재지 않는다)',
      asked.slice(0, 3).join(' · ')
    )
    ok(!asked.includes('쌍용동 헬스장'), '이미 잰 키워드는 두 번 재지 않는다')
    ok(
      got.rows.every((r) => r.kind === 'detour'),
      '우회로 후보는 표에 올라가지 않게 표시된다 (kind=detour)'
    )
  }

  // ── 어제와 비교 — 매일 재는 이유
  const row = (keyword, ages, recent30) => ({ ...openingOf({ ages, recent30 }), keyword, stores: [], dated: ages.length, sampled: ages.length })
  const yesterday = [row('열렸던', [2], 20), row('굳었던', [60], 500), row('그대로', [60], 500)]
  const today = [row('열렸던', [60], 500), row('굳었던', [1], 20), row('그대로', [60], 500), row('새키워드', [1], 20)]
  const ch = openingChanges(yesterday, today)
  ok(ch.get('굳었던') === 'opened', '어제 굳었는데 오늘 열리면 「새로 열림」', ch.get('굳었던'))
  ok(ch.get('열렸던') === 'shut', '어제 열렸는데 오늘 굳으면 「닫힘」', ch.get('열렸던'))
  ok(ch.get('그대로') === 'same', '안 바뀐 줄은 그대로')
  ok(ch.get('새키워드') === 'new', '어제 없던 키워드는 「처음 잼」 — 열렸다고 하지 않는다', ch.get('새키워드'))
  ok(CHANGE_LABEL.opened === '새로 열림', '화면에 쓰는 말도 한 곳에서 온다')
  // 등급이 같으면 편수가 늘어도 「달라졌다」고 하지 않는다 (매일 전부 달라지면 알림이 의미를 잃는다)
  ok(openingChanges([row('k', [1], 20)], [row('k', [1, 2, 3], 20)]).get('k') === 'same', '편수 변화만으로는 알리지 않는다')
  // 첫 측정에는 비교할 어제가 없다
  ok(openingChanges(null, today).get('굳었던') === 'new', '첫 측정은 전부 「처음 잼」')

  // ── 기록 쌓기 — 하루 한 줄, 상한까지
  const many = Array.from({ length: OPENING_RUNS_KEEP }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, tag: i }))
  const rolled = mergeOpeningRuns(many, { date: '2026-08-20', tag: 'new' }, OPENING_RUNS_KEEP)
  ok(rolled.length === OPENING_RUNS_KEEP, `상한을 넘기지 않는다 — ${rolled.length}개`)
  ok(rolled[rolled.length - 1].tag === 'new' && rolled[0].date === '2026-08-02', '오래된 것부터 버린다', rolled[0].date)
  /*
   * ─── 굳은 자리로 들어가는 문 (2026-08-20) ────────────────────────
   *
   * 회원 요청: "굳은 키워드도 돌파할 수 있는 방법을 알아주면 좋겠어." 굳은 자리 6개·열린
   * 자리 5개의 1페이지를 30위까지 재봤더니 **블로그 크기로는 갈리지 않았다** (굳은 자리
   * 1페이지에 누적 314·396·503·769명 블로그가 있었다). 갈린 것은 1페이지 글의 나이였고,
   * 그건 글로 못 바꾼다. 대신 같은 동네의 세부 의도 키워드는 열려 있었다.
   *
   * 그래서 「정면으로 뚫는 규칙」을 만들지 않고 **열린 문을 찾아준다**. 그 문이 우리 동네
   * 것인지, 정말 열려 있는지, 들어갈 만한 자리인지를 여기서 지킨다.
   */
  const { areaOf, detoursFor } = require(`${OUT}/analysis/openings.js`)
  ok(areaOf('천안 두정동 헬스장') === '두정동', '앞에 시 이름이 붙어도 동네를 찾는다', areaOf('천안 두정동 헬스장'))
  ok(areaOf('쌍용동PT') === '쌍용동', '붙여 쓴 키워드에서도 동네를 찾는다', areaOf('쌍용동PT'))
  ok(areaOf('헬스장 추천') === null, '동네가 없으면 null')

  const shutHead = row('성정동 여성전용', [60], 61)
  const pool = [
    shutHead,
    row('성정동 여성전용 헬스장', [6], 28), // 같은 동네 · 열림 · 조용 → 첫 번째 문
    row('성정동 다이어트', [2], 221), // 같은 동네 · 열림 · 발행 많음 → 뒤로
    row('성정동 헬스장 추천', [11], 171), // 같은 동네지만 굳음 → 문이 아니다
    row('용곡동 여성전용 헬스장', [1], 26), // 열렸지만 다른 동네 → 권하면 엉뚱한 글이 된다
  ]
  const doors = detoursFor(shutHead, pool)
  ok(doors.length === 2, `열린 같은 동네 키워드만 문으로 본다 — ${doors.length}개`)
  ok(doors[0].keyword === '성정동 여성전용 헬스장', '발행량이 적은 문을 먼저 권한다', doors[0].keyword)
  ok(!doors.some((d) => d.keyword.startsWith('용곡동')), '다른 동네는 권하지 않는다')
  ok(!doors.some((d) => d.tier === 'shut' || d.tier === 'quiet'), '굳은 자리를 문이라고 하지 않는다')
  ok(!doors.some((d) => d.keyword === shutHead.keyword), '자기 자신은 문이 아니다')
  // 열린 자리에는 문을 붙이지 않는다 (이미 들어갈 수 있는 자리다)
  ok(detoursFor(row('용곡동 PT', [1], 24), pool).length === 0, '열린 자리에는 우회로를 붙이지 않는다')
  // 공백만 다른 같은 키워드를 문으로 권하지 않는다
  ok(
    detoursFor(row('쌍용동 PT', [60], 300), [row('쌍용동PT', [1], 20)]).length === 0,
    '공백만 다른 같은 키워드는 문이 아니다'
  )

  const sameDay = mergeOpeningRuns([{ date: '2026-08-19', tag: 'cron' }], { date: '2026-08-19', tag: 'user' }, OPENING_RUNS_KEEP)
  ok(sameDay.length === 1 && sameDay[0].tag === 'user', '같은 날 다시 재면 나중 것이 그날 값이다')
  ok(mergeOpeningRuns(undefined, { date: '2026-08-19' }, OPENING_RUNS_KEEP).length === 1, '기록이 없어도 첫 줄이 들어간다')
}


/*
 * ─── 홍보 조각이 잘리는 자리에 있으면 통과가 아니다 ────────────────
 *
 * 회원이 나온 제목을 그대로 보여줬다 (2026-08-18):
 *   「쌍용동 PT 지금 받아야 하는 이유, 시간 없는 분도 될까요? 45,000원 안내」 (45자)
 * 홍보 조각(45,000원)이 맨 뒤에 있다. 모바일 검색결과는 35자쯤에서 자르니, 사람이 보는
 * 자리에는 혜택이 없다. 그런데 검사는 「있음」으로 통과시켰다.
 */
{
  const body = ['[이미지: 대표]', '안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동 PT 안내입니다.', '',
    '[이미지: 2]', '## 소제목', '자세와 호흡을 봅니다. ' + '가'.repeat(1800)].join('\n')
  const base = { type: 'promo', body, mainKeyword: '쌍용동 PT', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' }
  const itemOf = (title) => checkPost({ ...base, title }).items.find((i) => i.id === 'titlePromo')

  const stapled = itemOf('쌍용동 PT 지금 받아야 하는 이유, 시간 없는 분도 될까요? 45,000원 안내')
  ok(stapled.level === 'warn', '뒤에 붙은 홍보 조각은 통과가 아니다', `${stapled.level} — ${stapled.value}`)
  ok(stapled.value.includes('잘립니다'), '잘린다는 사실을 값에 적는다', stapled.value)
  ok(stapled.hint.includes('앞으로 당기거나'), '무엇을 하라고 알려준다')

  const front = itemOf('쌍용동 PT 45,000원으로 먼저 한 번 받아보세요')
  ok(front.level === 'pass', '앞쪽에 있으면 통과', `${front.level} — ${front.value}`)

  // 없는 것과 안 보이는 것은 구별한다
  const none = itemOf('쌍용동 PT 처음이라 걱정되시는 분들께 드리는 이야기')
  ok(none.level === 'fail', '아예 없으면 즉시수정', none.level)

  /*
   * **금액은 앞쪽에** (2026-08-18, 회원 요청 "금액이 중요하니까 금액이 제목에 앞에 위치하면
   * 좋겠어"). 실측 표본이 7편뿐이라 막지 않고 권한다 — 통과시키되 자리를 값에 적는다.
   */
  const early = itemOf('쌍용동 PT 45,000원으로 먼저 한 번 받아보세요')
  ok(early.level === 'pass' && !early.value.includes('낫습니다'), '앞 20자 안이면 군말이 없다', early.value)
  ok(/\d+번째 글자/.test(early.value), '자리를 늘 값에 적는다', early.value)

  // 금액이 25번째 글자에 오도록 만든다 (20자 뒤 · 35자 안 = 보이지만 앞쪽은 아님)
  const middle = itemOf(`쌍용동 PT ${'가'.repeat(15)} 45,000원 안내`)
  ok(middle.level === 'pass', '보이는 자리면 통과시킨다 (막지 않는다)', middle.level)
  ok(middle.value.includes('앞 20자 안이 낫습니다'), '앞으로 당기라고 권한다', middle.value)
  ok(middle.hint.includes('메인 키워드 바로 뒤'), '어디로 당길지 알려준다')
  ok(middle.hint.includes('7편뿐'), '근거가 약하다는 사실을 숨기지 않는다')

  // 35자 경계 — 34번째 글자에서 시작하면 아직 보인다
  const edge = itemOf('쌍용동 PT 처음 오시는 분들께 드리는 안내입니다 이용권')
  ok(edge.level === 'pass' || edge.value.includes('잘립니다'), '경계에서 값이 뜻을 밝힌다', edge.value)
}


/*
 * ─── 요청한 내용이 글에 들어갔는가 ──────────────────────────────
 *
 * 회원이 요청과 결과를 나란히 보여줬다 (2026-08-19): "요청사항이 거의 반영되지 않았어."
 * 아래 REQ·BODY 는 그 실제 요청과 그때 나온 글의 소제목이다.
 */
{
  const R = require(`${OUT}/writing/request.js`)
  const REQ =
    '24시 내용 빼주고 지금 PT를 등록해야하는 이유, PT 를 추천드리는 사람들, PT등록할때 망설이는 점 (효과, 가격, 트레이너가 안맞을까봐) 을 해결하는 방식으로 글을 작성해줘'

  const topics = R.requestedTopics(REQ)
  const texts = topics.map((x) => x.text)
  ok(topics.length === 6, `요청을 항목 6개로 읽는다 — ${topics.length}`, texts.join(' / '))
  /*
   * 「24시 … 빼주고 지금 PT를 등록해야하는 이유」는 한 조각에 빼달라와 써달라가 함께 있다.
   * 앞 판은 조각째 버려서 「등록해야 하는 이유」가 사라졌다.
   */
  ok(texts.some((x) => x.includes('등록해야하는 이유')), '「빼주고」 뒤의 요청을 살린다', texts.join(' / '))
  ok(!texts.some((x) => x.includes('24시')), '빼달라고 한 것은 항목으로 세지 않는다')
  // 괄호 열거는 각각 센다 — 셋을 나열한 것은 셋 다 답해 달라는 뜻이다
  ok(texts.includes('효과') && texts.includes('가격'), '괄호 안 열거를 각각 센다', texts.join(' / '))
  ok(!texts.some((x) => x.includes('작성해줘')), '마무리 문구를 항목으로 세지 않는다', texts.join(' / '))
  // 「효과」의 「과」를 조사로 떼면 낱말이 사라진다 (실제로 그랬다)
  ok(R.topicWords('효과').includes('효과'), '두 글자 낱말을 조사로 깎지 않는다', R.topicWords('효과').join(','))

  const MISSING_BODY = [
    '## 등록을 망설이게 만드는 세 가지',
    '효과가 있을지, 가격이 부담되지 않을지 걱정하시더라고요.',
    '## 다이어트 시작하는 첫 달, 이렇게 잡으세요',
    '체중계 숫자보다 몸 둘레를 재는 걸 권합니다.',
    '## 쌍용동 PT, 이런 환경에서 진행됩니다',
    '웨이트실과 프리웨이트실이 나뉘어 있습니다.',
  ].join('\n')
  const cov = R.coverageOf(topics, MISSING_BODY)
  ok(cov.missing.length === 3, `빠진 항목 3개를 찾는다 — ${cov.missing.length}`, cov.missing.map((m) => m.text).join(' / '))
  ok(
    cov.missing.some((m) => m.text.includes('추천드리는 사람들')),
    '「추천드리는 사람들」이 없다는 것을 잡는다'
  )
  ok(cov.rate === 50, `반영률을 센다 — ${cov.rate}%`)

  // 요청을 다 다룬 글은 통과
  const FULL_BODY = `${MISSING_BODY}\n## 지금 등록해야하는 이유\n마감이 있어서요.\n## PT를 추천드리는 사람들\n혼자 하다 자세가 무너지는 분들.\n## 트레이너가 안맞을까봐 걱정되신다면\n첫 수업 전에 맞춰봅니다.`
  ok(R.coverageOf(topics, FULL_BODY).missing.length === 0, '다 다루면 빠진 것이 없다')

  // ── 검수 항목으로 실제로 걸리는가 ──
  const body = ['[이미지: 대표]', '안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동 PT 안내입니다.', '',
    '[이미지: 2]', MISSING_BODY, '자세와 호흡을 봅니다. ' + '가'.repeat(1700)].join('\n')
  const withReq = checkPost({ type: 'promo', title: '쌍용동 PT 45,000원으로 먼저 받아보세요', body,
    mainKeyword: '쌍용동 PT', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점', request: REQ })
  const item = withReq.items.find((i) => i.id === 'request-coverage')
  ok(item && item.level === 'fail', '절반 넘게 빠지면 즉시수정', item?.level)
  ok(item.weight === 5, '요청은 화자와 같은 무게로 본다', String(item?.weight))
  ok(item.value.includes('추천드리는 사람들'), '빠진 항목을 값에 적는다', item?.value)
  ok(item.hint.includes('본문 소제목이 되어야'), '무엇을 해야 하는지 알려준다')

  // 요청이 없으면 이 항목을 아예 만들지 않는다 (없는 요구로 점수를 깎지 않는다)
  const noReq = checkPost({ type: 'promo', title: '쌍용동 PT 45,000원으로 먼저 받아보세요', body,
    mainKeyword: '쌍용동 PT', subKeywords: [], tags: [], legalName: 'MTO 피트니스 쌍용점' })
  ok(!noReq.items.some((i) => i.id === 'request-coverage'), '요청이 없으면 항목을 만들지 않는다')

  /*
   * 지시문 쪽도 같은 말을 해야 한다. 이 문구는 시스템 지시문이 아니라 **요청 블록**
   * (buildUserPrompt)에 들어간다 — 요청은 맨 마지막에 둬야 모델이 가장 강하게 따른다.
   */
  const up = buildUserPrompt({
    type: 'promo',
    mainKeyword: '쌍용동 PT',
    subKeywords: [],
    store: { id: 's', name: '쌍용점', legalName: 'MTO 피트니스 쌍용점' },
    request: REQ,
  })
  ok(up.includes('써달라고 한 것은 그대로 본문 소제목이 된다'), '요청 블록이 소제목을 정한다고 말한다')
  ok(up.includes('요청과 무관한 구간은'), '요청과 무관한 구간을 빼라고 한다')
  ok(up.includes('회원이 쓸 수 없다'), '왜 그래야 하는지 말한다')
  ok(up.includes('「상담 때 알려드릴게요」로 넘기면 해결이 아니다'), '해결을 미루지 말라고 한다')
}
/*
 * ─── 상위 블로그와 블로그 단위로 비교 (2026-08-20) ──────────────
 *
 * 회원 요청: "상위 5편의 블로그와 비교해서 블로그 개설일, 이웃수, 글의 유형, 글 발행 간격,
 * 포스팅당 좋아요나 댓글 수 등을 비교분석해달라."
 *
 * 실측에서 앱이 적어둔 조언 하나가 뒤집혔다 — 상위 블로그는 헬스 전문이 아니라 **잡블로그**
 * 였다(헬스·운동 글 중간값 10% · 우리 87%). 그래서 이 비교는 **점수로 합치지 않는다.**
 * 어느 축이 순위를 만드는지 모르는데 합치면 모르는 것을 아는 것처럼 만든다.
 */
{
  const { paceOf, typeMixOf, onTopicShare, typeOf, summarizePeer, comparePeers, missingTypes } = require(
    `${OUT}/analysis/peers.js`
  )

  // ── 발행 속도: 최근 표본의 간격으로 본다 (전체 글÷운영일수로 하면 옛날에 많이 쓴 블로그가 부지런해 보인다)
  const mkPosts = (dates) => dates.map((date, i) => ({ title: `글 ${i}`, date, commentCount: 0 }))
  const weekly = paceOf(mkPosts(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']))
  ok(weekly.perWeek === 1, `이레에 한 편이면 주당 1편 — ${weekly.perWeek}`)
  ok(weekly.gapMedian === 7, `간격 중간값 — ${weekly.gapMedian}일`)
  const daily = paceOf(mkPosts(['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']))
  ok(daily.perWeek === 7, `매일 쓰면 주당 7편 — ${daily.perWeek}`)
  ok(paceOf(mkPosts(['2026-08-20'])).perWeek === null, '글이 한 편이면 속도를 못 잰다 (0 이라고 하지 않는다)')
  // 오래 쉰 구간을 숨기지 않는다 — 꾸준함을 보는 값이다
  const gappy = paceOf(mkPosts(['2026-05-01', '2026-08-18', '2026-08-19']))
  ok(gappy.gapMax === 109, `가장 길게 쉰 기간을 남긴다 — ${gappy.gapMax}일`)

  // ── 글 유형: 제목으로 가른다
  ok(typeOf('천안 쌍용동 헬스장 다녀온 후기') === '후기·체험', typeOf('천안 쌍용동 헬스장 다녀온 후기'))
  ok(typeOf('헬스 초보 운동 순서 알려드립니다') === '정보·방법', typeOf('헬스 초보 운동 순서 알려드립니다'))
  ok(typeOf('8월 이벤트 3개월 9.9만원 안내') === '홍보·안내', typeOf('8월 이벤트 3개월 9.9만원 안내'))
  ok(typeOf('오늘 점심은 김치찌개') === '일상·기타', typeOf('오늘 점심은 김치찌개'))

  const mix = typeMixOf([
    { title: '헬스장 후기', date: '2026-08-20', commentCount: 0 },
    { title: '운동 방법 알려드려요', date: '2026-08-19', commentCount: 0 },
    { title: '점심 먹은 이야기', date: '2026-08-18', commentCount: 0 },
    { title: '저녁 산책', date: '2026-08-17', commentCount: 0 },
  ])
  ok(mix.find((m) => m.label === '일상·기타').share === 50, '유형 비율을 낸다', JSON.stringify(mix))
  ok(!mix.some((m) => m.count === 0), '0편인 유형은 넣지 않는다')

  // ── 주제 집중도
  ok(
    onTopicShare([
      { title: '쌍용동 헬스장', date: '', commentCount: 0 },
      { title: '맛집 후기', date: '', commentCount: 0 },
    ]) === 50,
    '헬스·운동 글 비중'
  )
  ok(onTopicShare([]) === null, '글이 없으면 비중도 없다')

  // ── 축 비교
  const peer = (blogId, over = {}) =>
    summarizePeer({
      blogId,
      dayVisitors: 40,
      totalVisitors: 30000,
      buddies: 480,
      postCount: 100,
      firstPost: '2025-01-01',
      posts: mkPosts(['2026-08-18', '2026-08-19', '2026-08-20']),
      likes: [10, 14],
      now: Date.parse('2026-08-20T00:00:00Z'),
      ...over,
    })
  const peers = [peer('a'), peer('b'), peer('c')]
  const mineRow = peer('mine', { dayVisitors: 6, buddies: 4231, where: ['우리'] })
  const axes = comparePeers(peers, mineRow)
  const axis = (k) => axes.find((a) => a.key === k)
  ok(axis('dayVisitors').verdict === 'behind', `오늘 방문자가 적으면 뒤짐 — ${axis('dayVisitors').verdict}`)
  ok(axis('buddies').verdict === 'ahead', `이웃이 많으면 앞섬 — ${axis('buddies').verdict}`)
  ok(axis('postCount').verdict === 'same', `10% 안쪽 차이는 같다고 본다 — ${axis('postCount').verdict}`)
  // 간격은 작을수록 좋다 — 방향을 뒤집어 판정한다
  const slow = comparePeers(peers, peer('slow', { posts: mkPosts(['2026-07-01', '2026-08-01', '2026-08-20']) }))
  const gapAxis = slow.find((a) => a.key === 'gapMedian')
  ok(gapAxis.higherIsBetter === false, '간격은 작을수록 좋은 축이다')
  ok(gapAxis.verdict === 'behind', `간격이 길면 뒤짐 — ${gapAxis.verdict}`)
  ok(axes.every((a) => a.provenSignal === false), '어느 축도 「순위를 만든다」고 표시하지 않는다')
  ok(comparePeers(peers, null).every((a) => a.verdict === 'unknown'), '우리 값이 없으면 판정하지 않는다')
  ok(axis('ageYears').mine === 1.6, `첫 글로 나이를 센다 — ${axis('ageYears').mine}년`)

  // ── 우리에게 없는 글 유형 (순위 근거가 아니라 빈칸)
  const reviewers = [
    peer('r1', { posts: [{ title: '헬스장 후기', date: '2026-08-20', commentCount: 0 }] }),
    peer('r2', { posts: [{ title: 'PT 체험 후기', date: '2026-08-19', commentCount: 0 }] }),
    peer('r3', { posts: [{ title: '다녀온 이야기', date: '2026-08-18', commentCount: 0 }] }),
  ]
  const noReview = peer('mine', { posts: [{ title: '8월 이벤트 안내', date: '2026-08-20', commentCount: 0 }] })
  const blanks = missingTypes(reviewers, noReview)
  ok(
    blanks.some((g) => g.label === '후기·체험' && g.peersWith === 3),
    '상위 다수가 쓰는데 우리는 0편인 유형을 찾는다',
    JSON.stringify(blanks)
  )
  ok(missingTypes(reviewers, reviewers[0]).length === 0, '우리도 쓰는 유형은 빈칸이 아니다')
  ok(missingTypes(reviewers, null).length === 0, '우리 값이 없으면 빈칸을 말하지 않는다')
}

/*
 * ─── 경쟁 센 자리용 글쓰기 (2026-08-20) ─────────────────────────
 *
 * 회원 질문: "그래서 홈페이지에 경쟁 높은 키워드용 글쓰기 도구가 있는거야?" **없었다.**
 * 재놓은 발행량이 글쓰기·검수에 하나도 연결돼 있지 않았다. 여기서 지키는 것은 셋:
 *   ① 경쟁이 세지 않으면 **아무 규칙도 붙지 않는다** (규칙을 늘리면 서로 부딪힌다)
 *   ② 모르면 규칙을 붙이지 않는다 (모르는 것을 유리하게도 불리하게도 쓰지 않는다)
 *   ③ 「상호명을 넣으면 오른다」로 말하지 않는다 — 1페이지 안에서는 차이가 없었다
 */
{
  const { arenaOf, arenaGuidance, titleHasBrand, ARENA_HIGH, ARENA_LOW } = require(`${OUT}/writing/arena.js`)

  ok(arenaOf({ recent30: 433 }).level === 'high', '발행 433편은 경쟁 센 자리', arenaOf({ recent30: 433 }).level)
  ok(arenaOf({ recent30: 26 }).level === 'low', '발행 26편은 경쟁 적은 자리')
  ok(arenaOf({ recent30: 160 }).level === 'mid', '사이는 보통')
  ok(arenaOf({ recent30: ARENA_HIGH }).level === 'high', '경계값은 포함')
  ok(arenaOf({ recent30: ARENA_LOW }).level === 'low', '아래 경계값도 포함')
  ok(arenaOf({ recent30: null }).level === 'mid', '모르면 보통으로 둔다 (유리하게도 불리하게도 쓰지 않는다)')
  ok(arenaOf({ recent30: 433 }).why.includes('433'), '왜 그 수준인지 숫자로 말한다', arenaOf({ recent30: 433 }).why)

  // ── 경쟁이 세지 않으면 지시가 아예 없다
  ok(arenaGuidance(arenaOf({ recent30: 26 }), 'promo').length === 0, '경쟁 적은 자리에는 규칙을 붙이지 않는다')
  ok(arenaGuidance(arenaOf({ recent30: null }), 'promo').length === 0, '모르는 자리에도 붙이지 않는다')

  const high = arenaOf({ recent30: 433 })
  const promoLines = arenaGuidance(high, 'promo').join('\n')
  ok(promoLines.includes('제목에 정식 상호명'), '경쟁 센 자리에서는 제목에 상호명을 요구한다')
  ok(promoLines.includes('74%'), '몇 편을 세어서 그런지 밝힌다')
  ok(promoLines.includes('근거는 없지만'), '순위를 만든다고 말하지 않는다')
  ok(!promoLines.includes('후기」를 넣는다'), '홍보글 제목에 「후기」를 넣으라고 하지 않는다 (실측으로 금지한 것)')
  const reviewLines = arenaGuidance(high, 'review').join('\n')
  ok(reviewLines.includes('「후기」를 넣는다'), '후기글에는 「후기」를 넣으라고 한다')
  /*
   * **정보글에는 상호명·관장 형태를 시키지 않는다** (2026-08-27).
   *
   * 이 목록은 08-20 판이다. 그때 정보글 화자는 센터였고 상호명도 1회 쓸 수 있었으니
   * 「제목에 상호명」·「○년차 관장이 알려드립니다」가 성립했다. 그 뒤 화자가 일반
   * 블로거가 되고 상호명이 0회가 되면서 **지시문이 검수와 정반대를 시키게 됐다** —
   * 회원 화면에도 그대로 떴다(메인 키워드가 지역 키워드라고 경고하는 상자 바로 아래에서
   * 「제목에 업체 이름을 넣으라」).
   */
  const infoLines = arenaGuidance(high, 'info').join('\n')
  ok(!infoLines.includes('제목에 정식 상호명을 넣는다'), '정보글에는 제목 상호명을 시키지 않는다')
  ok(!infoLines.includes('「○년차 관장이 알려드립니다」 꼴이다'), '「○년차 관장」 형태도 시키지 않는다')
  ok(infoLines.includes('여기서도 업체를 드러내지 않는다'), '정보글에는 업체를 드러내지 말라고 한다')
  // 경쟁 자체는 사실이므로 그 정보는 남긴다 — 취할 모양만 다르게 준다
  ok(infoLines.includes('74%'), '몇 편을 세어서 그런지는 정보글에도 밝힌다')
  ok(infoLines.includes('제목에 있었다'), '정보글이 그 판에서 취할 모양을 준다')
  ok(infoLines.includes('1,500자'), '분량 규칙은 유형과 무관하게 그대로다')

  // ── 제목에 상호명이 있나
  ok(titleHasBrand('쌍용동 헬스장 MTO 피트니스 쌍용점 3개월 9.9만원', 'MTO 피트니스 쌍용점'), '상호명 전체가 있으면 통과')
  ok(titleHasBrand('쌍용동 헬스장 MTO 3개월 9.9만원', 'MTO 피트니스 쌍용점'), '브랜드 조각만 있어도 통과')
  ok(titleHasBrand('성정동 헬스장 착한헬스 후기', '여성전용 착한헬스 성정점'), '가운데 조각도 브랜드로 본다')
  ok(!titleHasBrand('쌍용동 헬스장 초보도 지금 등록해도 될까? 8월 3개월 9.9만원', 'MTO 피트니스 쌍용점'), '우리 실제 제목은 상호명이 없다')
  // 「성정점」처럼 지역+점 조각은 브랜드가 아니다 (회원이 앞서 지적한 「두정점입니다」와 같은 이유)
  ok(!titleHasBrand('성정동 헬스장 성정점 후기', '여성전용 착한헬스 성정점'), '지역+점 조각은 브랜드로 보지 않는다')
  ok(!titleHasBrand('', 'MTO 피트니스 쌍용점'), '제목이 없으면 없는 것')
  ok(!titleHasBrand('쌍용동 헬스장 후기', undefined), '상호명을 모르면 통과시키지 않는다')

  // ── 검수: 경쟁 센 자리 + 홍보/후기에서만 항목이 생긴다
  const brandItem = (patch) => checkPost({ ...goodPromo, legalName: 'MTO 피트니스 쌍용점', ...patch }).items.find((i) => i.id === 'title-brand')
  ok(!brandItem({}), '경쟁 수준을 모르면 이 항목을 만들지 않는다')
  ok(!brandItem({ arena: 'low' }), '경쟁 적은 자리에서도 만들지 않는다')
  ok(brandItem({ arena: 'high' }), '경쟁 센 자리에서는 항목이 생긴다')
  ok(brandItem({ arena: 'high' }).level === 'warn', `상호명이 없으면 주의 — ${brandItem({ arena: 'high' })?.level}`)
  ok(
    brandItem({ arena: 'high' }).hint.includes('순위를 만든다는 근거는 없습니다'),
    '순위 근거가 아니라고 화면에도 적는다'
  )
  ok(
    brandItem({ arena: 'high', title: '쌍용동 헬스장 MTO 피트니스 쌍용점 8월 3개월 9.9만원 안내' })?.level === 'pass',
    '상호명을 넣으면 통과'
  )
  ok(!brandItem({ arena: 'high', type: 'info' }), '정보글에는 이 항목을 만들지 않는다 (제목 형태가 다르다)')
  // 주의 하나로 점수가 무너지지 않는다 — 형태이지 순위 근거가 아니다
  const withWarn = checkPost({ ...goodPromo, legalName: 'MTO 피트니스 쌍용점', arena: 'high' })
  const without = checkPost({ ...goodPromo, legalName: 'MTO 피트니스 쌍용점' })
  ok(without.score - withWarn.score <= 3, `경쟁 항목이 점수를 크게 깎지 않는다 — ${without.score} → ${withWarn.score}`)

  // ── 지시문에 실제로 들어가나
  const upHigh = buildUserPrompt({
    type: 'promo',
    mainKeyword: '쌍용동 헬스장',
    subKeywords: [],
    store: { id: 's', name: '쌍용점', legalName: 'MTO 피트니스 쌍용점' },
    arena: high,
  })
  ok(upHigh.includes('## 이 키워드 판의 형태'), '지시문에 판 형태 묶음이 들어간다')
  ok(upHigh.includes('제목에 정식 상호명'), '지시문이 제목에 상호명을 요구한다')
  const upLow = buildUserPrompt({
    type: 'promo',
    mainKeyword: '용곡동 PT',
    subKeywords: [],
    store: { id: 's', name: '용곡점', legalName: 'MTO 피트니스 용곡점' },
    arena: arenaOf({ recent30: 24 }),
  })
  ok(!upLow.includes('## 이 키워드 판의 형태'), '경쟁 적은 자리에는 그 묶음이 없다')
  const upNone = buildUserPrompt({ type: 'promo', mainKeyword: '용곡동 PT', subKeywords: [] })
  ok(!upNone.includes('## 이 키워드 판의 형태'), '경쟁 수준을 안 넘기면 아무 것도 안 붙는다')
  /*
   * 회원 요청은 판 형태보다 **뒤에** 있어야 한다 — 뒤쪽 지시가 더 강하게 먹는다.
   * 2026-08-11 에 요청이 가운데로 밀려 「24시 빼줘」가 무시된 일이 있었다.
   */
  const upBoth = buildUserPrompt({
    type: 'promo',
    mainKeyword: '쌍용동 헬스장',
    subKeywords: [],
    store: { id: 's', name: '쌍용점', legalName: 'MTO 피트니스 쌍용점' },
    arena: high,
    request: '24시 내용은 빼주세요',
  })
  ok(
    upBoth.indexOf('## 이 키워드 판의 형태') < upBoth.indexOf('## 이번 글 요청'),
    '회원 요청이 판 형태보다 뒤에 온다 (요청이 이겨야 한다)'
  )
}


/*
 * ─── 정보글에 홍보 표지가 박히나 (2026-08-20) ────────────────────
 *
 * 회원 질문: "정보성 블로그에 상호명이 들어가거나 홍보성이 되는(업체명·스마트플레이스 링크·
 * 전화번호 등) 문구가 들어가?" 들어가고 있었다 — 지시문이 전화번호를 주고 있었다.
 *
 * 1페이지 정보형 글 4편에는 전화번호가 0편(후기형 45% · 일상형 43%), 가격·이벤트도 0편이었다.
 * 그래서 정보글에는 전화번호를 **주지 않고**, 본문에 박히면 검수가 알린다.
 * 상호명은 잡지 않는다 — 누가 쓴 글인지 밝히는 것은 홍보가 아니다.
 */
{
  const store = { id: 's', name: '쌍용점', legalName: 'MTO 피트니스 쌍용점', phone: '010-2455-2896', reserveUrl: 'https://vo.la/Zbynx' }
  const infoPrompt = buildUserPrompt({ type: 'info', mainKeyword: '헬스 초보 운동 순서', localKeyword: '쌍용동 헬스장', subKeywords: [], store })
  ok(!infoPrompt.includes('- 전화: 010-2455-2896'), '정보글 지시문에 전화번호를 주지 않는다')
  ok(!infoPrompt.includes('예약 링크: https://vo.la/Zbynx'), '예약 링크도 주지 않는다 (2026-08-20 개편)')
  /*
   * **상호명을 다시 뺐다** (2026-08-27). 회원: "일반 블로거가 쓰는 느낌으로 해줘."
   *
   * 08-21 에는 인사 형식이 상호명을 요구해서 값을 줘야 했다 (안 주면 「골격이 시키는 값을
   * 지시문이 숨기는」 상태가 된다). 이제 인사 형식에서도 뺐으니 값도 주지 않는다 —
   * **값을 주면 쓰게 되는 것**이 이 파일에서 여러 번 확인된 일이다. 골격·첫 문장·검수를
   * 함께 바꿨다 (한쪽만 고치면 08-21 과 같은 어긋남이 다시 난다).
   */
  ok(!infoPrompt.includes('정식 상호명: MTO 피트니스 쌍용점'), '정보글에는 상호명을 주지 않는다')
  // 표시 이름도 주지 않는다 — 값을 주면 쓰게 된다
  ok(!infoPrompt.includes('표시 이름'), '정보글에는 표시 이름도 주지 않는다')

  /*
   * ─── 첫 문장을 완성해서 준다 (2026-08-21) ─────────────────────
   *
   * 회원 지적: "인사말에 (선택된 키워드) (상호명)으로 했는데 **선택된 키워드가 아니라 다른
   * 키워드가 나와.**"
   *
   * 원인은 예시가 **시스템 지시문에 고정 문자열**로 박혀 있던 것이다. buildSystemPrompt 는
   * 유형만 받으므로 이번 글의 키워드를 모른다. 예시에 「쌍용동 헬스장」이 박혀 있었고 모델이
   * 그대로 베꼈다. 값이 있는 자리는 유저 지시문이므로, 거기서 **문장을 완성해서 준다.**
   */
  const greetP = buildUserPrompt({ type: 'info', mainKeyword: '두정동 헬스장', subKeywords: [], store })
  ok(greetP.includes('## 첫 문장 (이 문장을 글 맨 처음에 그대로 쓴다)'), '첫 문장을 따로 낸다')
  ok(
    greetP.includes('안녕하세요. 오늘은 두정동 헬스장에 대해 정리해 보려고 합니다.'),
    '이번 글의 키워드로 문장을 완성해서 준다'
  )
  ok(greetP.includes('「두정동 헬스장」는 글자 그대로 쓴다'), '바꿔 쓰지 말라고 못 박는다')
  // 2026-08-27: 화자가 일반 블로거다 — 완성해 주는 문장에도 상호명이 없어야 한다
  ok(!greetP.includes('MTO 피트니스 쌍용점입니다'), '첫 문장에 상호명을 붙이지 않는다')
  ok(greetP.includes('상호명·지점명을 붙이지 않는다'), '왜 없는지도 같이 적는다')
  // **시스템 지시문에 다른 키워드가 예시로 박혀 있으면 안 된다** — 그게 이 사고의 원인이었다
  ok(!buildSystemPrompt('info').includes('쌍용동 헬스장 MTO'), '시스템 지시문에 고정 예시가 남아 있지 않다')
  ok(buildSystemPrompt('info').includes('예시 낱말을 그대로 베끼지 않는다'), '예시를 베끼지 말라고 한다')
  // 홍보글·후기글에는 이 묶음이 없다 (인사 형식이 정해진 것은 정보글뿐이다)
  for (const t of ['promo', 'review']) {
    ok(!buildUserPrompt({ type: t, mainKeyword: '두정동 헬스장', subKeywords: [], store }).includes('## 첫 문장 (이 문장을'), `${t} 에는 이 묶음이 없다`)
  }

  /*
   * ─── 키워드 목표를 하한에서 뗐다 (2026-08-21) ──────────────────
   *
   * 회원: "키워드 노출회수가 2번정도 밖에 안되는데 너무 적은거 아니야?"
   *
   * **순위 때문은 아니다** — 관찰소가 33번 잰 메인 키워드 횟수의 평균 advantage 가 +0.046
   * 이고 판마다 부호가 뒤집힌다. 문제는 **목표가 통과 하한에 붙어 있던 것**이다: 통과는
   * 3~5인데 목표가 3이면 한 자리만 놓쳐도 2가 되어 즉시수정이다. 목표를 가운데(4)로 옮기면
   * 하나 놓쳐도 3이라 통과한다.
   */
  ok(SPECS.info.mainTarget === 4, `정보글 키워드 목표는 4회 — ${SPECS.info.mainTarget}`)
  /*
   * **목표는 「통과 구간 안」이면서 「실제로 도달 가능」해야 한다.**
   *
   * 홍보글은 목표가 하한(5)에 붙어 있는데 이건 못 뗀다 — 밀도 상한 2% 때문이다. 7자짜리
   * 지역 키워드를 1,750자 글에 6회 쓰면 2.4% 라 밀도에서 걸린다. 즉 「하한에 붙지 마라」는
   * 어느 유형에나 되는 규칙이 아니고, **밀도가 허락하는 만큼만** 뗄 수 있다.
   * 정보글은 9자 키워드 · 2,200자에서 4회가 1.6% 라 여유가 있어서 뗐다.
   */
  for (const t of ['promo', 'info', 'review']) {
    const sp = SPECS[t]
    const tg = sp.mainTarget ?? sp.mainMin
    ok(tg >= sp.mainMin && tg <= sp.mainMax, `${t} — 목표가 통과 구간 안이다`, `목표 ${tg} / 통과 ${sp.mainMin}~${sp.mainMax}`)
    // 그 유형의 최소 분량 · 실제로 쓰는 길이의 키워드로 목표를 채울 수 있나
    const kw = t === 'info' ? '폭식 멈추는 방법' : '쌍용동 헬스장'
    const r = reachableKeywordRange({ keyword: kw, charCount: sp.charMin, densityMax: sp.densityMax, mainMin: sp.mainMin, mainMax: sp.mainMax, inTitle: 1 })
    ok(tg <= r.max, `${t} — 목표를 밀도 안에서 채울 수 있다`, `목표 ${tg} / 도달 가능 ${r.min}~${r.max} (${kw} · ${sp.charMin}자 · 밀도 ${sp.densityMax}%)`)
  }
  ok(infoPrompt.includes('업체를 드러내는 것이 하나도 들어가지 않는다'), '무엇을 쓰지 말아야 하는지 한 줄로 준다')
  ok(infoPrompt.includes('인사에서 밝히는 정식 상호명 1회를 빼면'), '그 한 줄이 상호명 1회 예외를 함께 적는다')
  /*
   * **막으면서 값을 주지는 않는다** (2026-08-21). 골격이 「쓰지 마라」고 한 것들의 값이
   * 지시문에 실려 오고 있었다 — 위치·시설 특징·고유 강점·24시간 운영·이벤트 텍스트.
   * 상호명과 정반대 방향의 같은 사고다: 저쪽은 시키면서 안 줬고 이쪽은 막으면서 줬다.
   */
  const rich = buildUserPrompt({
    type: 'info',
    mainKeyword: '헬스 초보 운동 순서',
    localKeyword: '쌍용동 헬스장',
    subKeywords: [],
    eventText: '3개월 9.9만원, 선착순 30명',
    store: { ...store, location: '천안시 서북구 쌍용동', features: ['24시간 운영'], strengths: ['자세 교정'], open24: true },
  })
  for (const [needle, label] of [
    ['천안시 서북구 쌍용동', '위치'],
    ['- 시설 특징:', '시설 특징'],
    ['- 고유 강점:', '고유 강점'],
    ['- 24시간 운영:', '운영시간'],
    ['9.9만원', '이벤트 내용'],
    ['## 진행 중인 이벤트', '이벤트 묶음'],
    ['## 이벤트', '이벤트 「없음」 줄'],
  ]) {
    ok(!rich.includes(needle), `정보글 지시문에 ${label}을(를) 주지 않는다`)
  }
  // 홍보글에는 그대로 다 준다 — 그 글이 쓰는 값이다
  const promoRich = buildUserPrompt({
    type: 'promo',
    mainKeyword: '쌍용동 헬스장',
    subKeywords: [],
    eventText: '3개월 9.9만원, 선착순 30명',
    store: { ...store, location: '천안시 서북구 쌍용동', features: ['24시간 운영'], strengths: ['자세 교정'], open24: true },
  })
  for (const [needle, label] of [
    ['천안시 서북구 쌍용동', '위치'],
    ['- 시설 특징:', '시설 특징'],
    ['9.9만원', '이벤트 내용'],
    ['- 전화: 010-2455-2896', '전화번호'],
  ]) {
    ok(promoRich.includes(needle), `홍보글에는 ${label}을(를) 그대로 준다`)
  }
  ok(infoPrompt.includes('홍보성 게시물로 분류한다'), '왜 그런지(네이버 공지) 밝힌다')

  const promoPrompt = buildUserPrompt({ type: 'promo', mainKeyword: '쌍용동 헬스장', subKeywords: [], store })
  ok(promoPrompt.includes('- 전화: 010-2455-2896'), '홍보글에는 전화번호를 그대로 준다')
  ok(promoPrompt.includes('예약 링크: https://vo.la/Zbynx'), '홍보글에는 예약 링크도 준다')
  ok(promoPrompt.includes('정식 상호명: MTO 피트니스 쌍용점'), '홍보글에는 상호명을 준다')

  // ── 검수: 정보글 순수성 (영상이 든 여섯 가지)
  /*
   * 표본은 **개편 전 모양**의 정보글이다 — 인사 + 상호명으로 열고 마지막에 상호명을 한 번 더
   * 쓴다. 개편으로 이게 무엇에 걸리는지 보여주는 것이 이 표본의 일이다.
   */
  const infoPost = {
    type: 'info',
    title: '헬스 초보 운동 순서, 뭐부터 해야 할까요?',
    mainKeyword: '헬스 초보 운동 순서',
    localKeyword: '쌍용동 헬스장',
    subKeywords: [],
    legalName: 'MTO 피트니스 쌍용점',
    tags: ['헬스초보', '운동순서'],
    body: [
      '안녕하세요, MTO 피트니스 쌍용점입니다.',
      '헬스 초보 운동 순서를 물어보시는 분이 많아서 정리해 드립니다.',
      '## 무엇부터 하면 되나',
      '가'.repeat(600),
      '## 오늘부터 할 것',
      '가벼운 무게로 자세부터 익히세요. MTO 피트니스 쌍용점에서 자주 보는 실수입니다.',
    ].join('\n'),
  }
  const pure = (patch) => checkPost({ ...infoPost, ...patch }).items.find((i) => i.id === 'info-purity')
  ok(pure({}), '정보글에는 순수성 항목이 생긴다')
  ok(pure({ legalName: undefined }).level === 'pass', '아무것도 없으면 통과')
  ok(pure({ body: infoPost.body + '\n문의는 010-2455-2896 으로 주세요.' }).value.includes('전화번호'), '전화번호를 잡는다')
  ok(pure({ body: infoPost.body + '\n자세한 건 https://vo.la/Zbynx 에서 보세요.' }).value.includes('링크'), '링크를 잡는다')
  ok(pure({ body: infoPost.body + '\n찾아오시는 길은 아래를 보세요.' }).value.includes('플레이스·위치'), '위치 안내를 잡는다')
  ok(pure({ body: infoPost.body + '\n8월 이벤트로 할인 중입니다.' }).value.includes('혜택 낱말'), '혜택 낱말을 잡는다')
  ok(pure({ body: infoPost.body + '\n궁금하시면 편하게 문의 주세요.' }).value.includes('방문·연락 유도'), '연락 유도를 잡는다')
  // 상호명은 설정이 있을 때만 센다 (infoPost 본문에 상호명이 두 번 들어 있다)
  ok(pure({}).value.includes('상호명'), '상호명이 본문에 있으면 잡는다', pure({}).value)
  ok(!checkPost({ ...goodPromo }).items.some((i) => i.id === 'info-purity'), '홍보글에는 이 항목을 만들지 않는다')

  /*
   * **홍보 멘트는 막는다** (2026-08-27). 회원이 두 번 말했다 — "정보성에는 홍보문구가 아예
   * 들어가면 안돼"(08-21), "정보성글에 홍보성 멘트가 들어가지 않게"(08-27).
   *
   * 예전에 `warn` 이던 근거는 **순위**였다: 1페이지에 링크를 달고도 올라온 글이 26% 있었다.
   * 그 판단은 지금도 유효하고 뒤집지 않는다 — 이건 순위 규칙이 아니라 **목적 규칙**이다.
   * 정보글이 홍보성 게시물로 분류되면 지수를 쌓으려던 목적 자체가 무너진다.
   *
   * fail 이면 점수가 79 에 묶여 발행선(85)을 못 넘고, 자동 초안의 고쳐 쓰기 루프가 그것을
   * 보고 다시 돈다 — 알리는 데서 그치지 않고 실제로 걷어낸다.
   */
  ok(pure({ body: infoPost.body + '\n궁금하시면 편하게 문의 주세요.' }).level === 'fail', '홍보 멘트는 즉시수정이다')
  ok(pure({ body: infoPost.body + '\n문의는 010-2455-2896 으로 주세요.' }).level === 'fail', '전화번호도 즉시수정')
  ok(pure({ body: infoPost.body + '\n8월 이벤트로 할인 중입니다.' }).level === 'fail', '혜택 낱말도 즉시수정')
  ok(pure({ body: infoPost.body + '\n궁금하시면 편하게 문의 주세요.' }).hint.includes('66%'), '왜 그런지 실측으로 말한다')

  /*
   * **「우리 회원」 관계도 홍보 문구다** (2026-08-27 회원 요청: "정보성글에는 제가 센타
   * 상담하다보면 등록하는 회원님들 이런 문구들도 모두빼줘").
   *
   * 08-21 에 「상담」을 막으면서 대체 표현으로 「회원분들 보면」을 권했다. 그게 잘못이었다 —
   * 낱말만 바뀌었지 **「나는 이 사람들의 업체다」라는 관계는 그대로**다. 읽는 사람에게는
   * 「당신도 등록하면 저 회원분들처럼 된다」로 읽히므로 홍보 문구가 맞다.
   *
   * 겪은 것은 여전히 쓸 수 있다 — 관계를 빼고 쓰면 된다 (「수업하다 보면」).
   */
  {
    // 상호명은 따로 검사한다 — 여기서는 문장만 보려고 뺀다 (안 빼면 전부 warn 이 깔린다)
    const rel = (line) => pure({ legalName: undefined, body: infoPost.body + '\n' + line })
    ok(rel('회원님들이 가장 많이 물어보시는 게 이겁니다.').level === 'fail', '「회원님들」을 잡는다', rel('회원님들이 가장 많이 물어보시는 게 이겁니다.').value)
    ok(rel('제가 상담하다 보면 등록하는 회원분들이 이걸 놓칩니다.').level === 'fail', '회원이 든 문장 그대로 잡는다')
    ok(rel('저희 회원 중에 이런 분이 많습니다.').level === 'fail', '「저희 회원」도 잡는다')
    ok(rel('등록하신 분들 얘기를 들어보면 그렇습니다.').level === 'fail', '「등록하신 분들」도 잡는다')
    ok(rel('회원님들이 물어보십니다.').value.includes('회원·등록 관계'), '무엇으로 걸렸는지 이름을 붙인다', rel('회원님들이 물어보십니다.').value)
    /*
     * ─── 운영자·트레이너 신분도 막는다 (2026-08-27 오후) ──────────
     *
     * 아침에 「회원분들 보면」을 막으면서 대체 표현으로 「수업하다 보면」·「가르치다 보면」·
     * 「현장에서 보면」을 권했다. 그 다음 요청이 이것이다:
     *   "그냥 정보성을 쓸때는 센타 입장에서 쓰는게 아니라 일반 블로거가 쓰는 느낌으로 해줘."
     *
     * 그 말들도 결국 「나는 여기서 가르치는 사람이다」를 말한다. 화자가 업체면 글 전체가
     * 그 업체의 홍보로 읽히므로, 신분이 드러나는 자리를 통째로 막는다.
     */
    ok(rel('수업하다 보면 이 질문을 제일 많이 받습니다.').level === 'fail', '「수업하다 보면」도 막는다')
    ok(rel('현장에서 보면 첫 달에 그만두는 경우가 많습니다.').level === 'fail', '「현장에서 보면」도 막는다')
    ok(rel('가르치다 보면 자세가 먼저 무너집니다.').level === 'fail', '「가르치다 보면」도 막는다')
    ok(rel('저희 센터에서는 이렇게 봅니다.').level === 'fail', '「저희 센터」도 막는다')
    ok(rel('수업하다 보면 그렇습니다.').value.includes('운영자·트레이너 신분'), '무엇으로 걸렸는지 이름을 붙인다', rel('수업하다 보면 그렇습니다.').value)

    /*
     * **근거를 댈 자리가 없어지는 것은 아니다.** 다 막고 끝내면 「팩트 우선」 규칙이 갈 곳을
     * 잃고 모델이 출처를 지어내는 쪽으로 샌다 — 그게 더 나쁘다. 지시문이 출처(「대한비만학회
     * 자료를 보면」)나 조건을 붙인 설명으로 쓰게 하고, 검수 안내도 그것을 알려준다.
     */
    ok(rel('대한비만학회 자료를 보면 그렇습니다.').level === 'pass', '출처를 앞에 세운 문장은 통과')
    ok(rel('하루 세 끼를 챙기기 어려운 경우라면 이 순서가 낫습니다.').level === 'pass', '조건을 붙인 설명도 통과')
    ok(rel('검색해 보면 이 질문이 제일 먼저 나옵니다.').level === 'pass', '신분을 안 드러낸 도입도 통과')
    // 검수 안내가 대체 표현을 알려준다 — 「빼세요」만 하면 무엇으로 바꿀지 모른다
    ok(rel('회원님들이 물어보십니다.').hint.includes('대한비만학회'), '무엇으로 바꾸면 되는지 말해준다')
    // 없는 체험을 지어내는 쪽으로 열어주지 않는다 (이 글을 실제로 쓰는 사람은 센터 운영자다)
    ok(rel('회원님들이 물어보십니다.').hint.includes('지어내지는 마세요'), '없는 경험을 지어내지 말라고 함께 적는다')

    /*
     * ─── 「전문가와 상담」은 홍보가 아니다 (2026-08-28) ────────────────
     *
     * 회원: "아직도 안돼." 「상담」이 이 갈래에서 가장 새기 쉬운 낱말인데, 우리를 부르는
     * 말일 때만 홍보다:
     *   「궁금하시면 상담 주세요」        → 홍보 (막는다)
     *   「몸에 이상이 있으면 전문가와 상담」 → 안전 안내 (정보글에 있어도 되는 말)
     *
     * 뒤엣것까지 막으면 **고칠 방법이 없는 즉시수정**이 된다 — 건강 주제에서 모델은 그
     * 문장을 자연스럽게 다시 쓰고, 점수는 79 에 묶인 채 돌기만 한다 (「칼로리」와 같은 모양).
     */
    ok(rel('몸에 이상이 있으면 전문가와 상담하세요.').level === 'pass', '「전문가와 상담」은 통과')
    ok(rel('통증이 있으면 병원과 상담해 보세요.').level === 'pass', '「병원과 상담」도 통과')
    ok(rel('영양사에게 상담을 받아보셔도 좋습니다.').level === 'pass', '「영양사에게 상담」도 통과')
    ok(rel('궁금하시면 상담 주세요.').level === 'fail', '우리를 부르는 「상담」은 그대로 막는다')
    ok(rel('상담은 언제든 가능합니다.').level === 'fail', '앞말이 없는 「상담」도 막는다')
    // 봐줄 만한 문장 하나가 글 전체를 통과시키면 안 된다
    ok(rel('전문가와 상담하세요. 그리고 궁금하시면 문의 주세요.').level === 'fail', '한 문장이 봐줄 만해도 뒤엣것은 잡는다')

    /*
     * ─── 「등록」은 시키는 꼴일 때만 (2026-08-28) ──────────────────────
     *
     * 회원: "그래도 안돼." 실제 초안을 받아 돌려보니 **이 한 항목만** 남아 있었고, 걸린
     * 말이 「등록하」였다. 문장은 이랬다:
     *
     *   「헬스장을 처음 **등록하고** 이제 막 기구 이름을 외우기 시작한 분」
     *
     * 읽는 사람이 누구인지 적은 말이지 우리에게 등록하라는 말이 아니다. 게다가 **골격이
     * 그 문장을 시킨다** — 「①이 글을 누가 어떤 상황에서 읽는지 한 문장으로 못 박는다」.
     * 우리 지시문이 시키는 문장을 우리 검수가 막고 있었다. 고칠 방법이 없는 즉시수정이다.
     */
    ok(rel('헬스장을 처음 등록하고 기구 이름을 외우기 시작한 분이라면 이 글이 맞습니다.').level === 'pass',
      '상황을 적은 「등록하고」는 통과', rel('헬스장을 처음 등록하고 기구 이름을 외우기 시작한 분이라면 이 글이 맞습니다.').value)
    ok(rel('등록한 지 두 달쯤 되면 여기서 막힙니다.').level === 'pass', '「등록한 지」도 통과')
    ok(rel('헬스장에 등록했는데 뭘 해야 할지 모르겠다는 분이 많습니다.').level === 'pass', '「등록했는데」도 통과')
    // 권유·거래 꼴은 그대로 막는다
    ok(rel('지금 등록하세요.').level === 'fail', '「등록하세요」는 막는다')
    ok(rel('이번 달에 등록하시면 좋습니다.').level === 'fail', '「등록하시면」도 막는다')
    ok(rel('등록비는 따로 없습니다.').level === 'fail', '「등록비」도 막는다')
    ok(rel('등록 문의는 아래로 주세요.').level === 'fail', '「등록 문의」도 막는다')
  }

  /*
   * **상호명 예외도 없앴다** (2026-08-27 오후). 08-21 에는 「인사말에 업체명 한번을 소개되게」
   * 해서 1회를 허용했다 — 그때는 화자가 센터였다. 일반 블로거가 된 지금은 인사에 상호명이
   * 있으면 그 한 줄로 화자가 도로 업체가 된다.
   */
  ok(pure({}).level === 'fail', '상호명이 있으면 즉시수정', pure({}).value)
  ok(pure({}).hint.includes('일반 블로거'), '화자가 누구인지 말해준다', pure({}).hint)
  ok(pure({ legalName: undefined }).level === 'pass', '아무것도 없으면 통과')

  /*
   * ─── 구매력 있는 키워드 (2026-08-27) ─────────────────────────
   *
   * 회원: "구매력 있는 키워드가 들어가지 않게해줘."
   *
   * info-purity 는 **본문 문장**을 본다. 홍보는 그보다 먼저 **키워드**로 들어온다 — 메인이
   * 「쌍용동 헬스장」이면 본문이 아무리 깨끗해도 업체를 찾는 검색에 놓인 글이다.
   */
  {
    const kw = (patch) => checkPost({ ...infoPost, ...patch }).items.find((i) => i.id === 'info-keyword-purity')
    ok(kw({}).level === 'pass', '정보성 검색어면 통과', kw({}).value)
    ok(kw({ mainKeyword: '쌍용동 헬스장' }).level === 'fail', '업체를 찾는 말이 메인이면 즉시수정')
    ok(kw({ mainKeyword: '헬스장 가격' }).level === 'fail', '값을 묻는 말도 즉시수정')
    ok(kw({ mainKeyword: '헬스장 가격' }).hint.includes('조연'), '어디로 옮기면 되는지 말해준다', kw({ mainKeyword: '헬스장 가격' }).hint)
    // 보조는 주의 — 본문 안에서 쓰이는 자리라 되돌리기 쉽다
    ok(kw({ subKeywords: ['헬스장 등록비'] }).level === 'warn', '보조 키워드는 주의에 그친다')
    /*
     * **지역 키워드(조연)는 세지 않는다.** 정보글에서도 지역 신호를 본문 1~2회·해시태그로
     * 잡기로 한 것이고(localKeyword·tagLocal), 그건 회원이 고른 자리다. 여기서 잡으면
     * 한 화면의 두 항목이 서로 반대를 시킨다.
     */
    ok(kw({ localKeyword: '쌍용동 헬스장' }).level === 'pass', '조연 칸의 지역 키워드는 잡지 않는다')
    ok(kw({ subKeywords: ['쌍용동 헬스장'], localKeyword: '쌍용동 헬스장' }).level === 'pass', '조연과 같은 말이 보조에 겹쳐도 잡지 않는다')
    ok(!checkPost({ ...goodPromo }).items.some((i) => i.id === 'info-keyword-purity'), '홍보글에는 이 항목을 만들지 않는다')
  }
}

/*
 * ─── 네이버 공지 최신화 (2026-08-20) ────────────────────────────
 *
 * 회원 요청: "네이버 로직과 공지사항을 항상 최신화해서 그에 맞는 글을 쓸 수 있도록 해줘."
 *
 * 앞 판은 가이드에 기준일을 손으로 박아 두고 「3개월 지났습니다」 배너만 띄웠다. 그건
 * 최신화가 아니라 알림이었고, 실제로 못 보고 지나간 공식 문서가 셋 있었다 (웹 콘텐츠 스팸
 * 사례 안내 · AI 콘텐츠 작성 가이드 1·2편).
 *
 * **여기서 지키는 것: 자동은 「모아서 알리는 것」까지다.** 제목만 보고 지시문을 고치면 읽지도
 * 않은 문장으로 글쓰기 규칙이 바뀐다 — 이 저장소에서 짐작으로 넣은 규칙이 실측에 두 번
 * 뒤집혔다(「굳은 자리」 등급 · 주제 집중도).
 */
{
  const { classifyNotice, mergeNotices, unreviewed, activeRules, lastReviewed, noticeKey, NOTICE_SOURCES } = require(
    `${OUT}/naver/notice.js`
  )

  ok(NOTICE_SOURCES.some((s) => s.id === 'naver_search'), '네이버 검색 공식 블로그를 본다')
  ok(NOTICE_SOURCES.every((s) => s.why), '각 채널을 왜 보는지 적어 둔다')

  // ── 무엇을 읽어야 하는가 (실제 제목으로 확인한다)
  const real = [
    ["알아두면 도움이 되는 '웹 콘텐츠 스팸 사례' 안내", true],
    ['AI 시대에 사용자의 선택을 받는 콘텐츠 작성 가이드', true],
    ['AI 시대에 사용자의 선택을 받는 콘텐츠 작성 가이드_실전편', true],
    ['연관검색어 서비스 종료 안내드립니다.', true],
    ['[당첨 공지] 모두의 회고 프로젝트 7월 당첨자를 발표합니다!', false],
    ['[블로그 있어요!] 여섯번째 주인공은 누구일까요?', false],
    ['[네이버 메이트] 2026년 8월, 스페셜 지원금 대상자를 공개합니다!', false],
  ]
  for (const [title, want] of real) {
    ok(classifyNotice(title).relevant === want, `${want ? '읽어야 함' : '걸러냄'} — ${title.slice(0, 34)}`)
  }
  ok(classifyNotice("알아두면 도움이 되는 '웹 콘텐츠 스팸 사례' 안내").tags.includes('스팸·저품질'), '스팸 공지에 꼬리표를 단다')
  ok(classifyNotice('검색 알고리즘 변경 이벤트 안내').relevant === true, '로직 얘기는 이벤트라는 말이 있어도 읽는다')
  /*
   * **꼬리표가 붙었다고 다 읽어야 하는 것은 아니다** (프로덕션에서 고쳤다).
   *
   * 처음엔 꼬리표 하나면 「읽어야 함」으로 봤다. 실제로 100건을 받아보니 46건이 걸렸다 —
   * 「8월, 이달의 블로그를 소개합니다」까지 「블로그」 꼬리표로 걸렸다. 46건짜리 목록은
   * 아무도 안 읽으니 알림이 아니라 소음이다. 기준을 좁혀 9건이 됐다.
   */
  const weakOnly = [
    ['8월, 이달의 블로그를 소개합니다!', ['블로그']],
    ['AI 브리핑이 클립 영상을 더해 더욱 풍부해집니다.', ['AI']],
    ['사진도, 정보도 한눈에! 네이버 플레이스 검색 화면이 새로워졌습니다.', ['플레이스']],
  ]
  for (const [title, want] of weakOnly) {
    const v = classifyNotice(title)
    ok(v.relevant === false, `약한 꼬리표만으로는 읽어야 함이 아니다 — ${title.slice(0, 26)}`)
    ok(want.every((w) => v.tags.includes(w)), '그래도 꼬리표는 남긴다 (전부 보기에서 확인한다)', v.tags.join())
  }
  // 실제로 받은 것 중 읽어야 하는 것들
  ok(classifyNotice('신뢰도 중심 통합 랭킹 모델 A/B 테스트 진행 안내').relevant === true, '랭킹 모델 공지는 읽는다')
  ok(classifyNotice("블로그 검색결과에서 '내돈내산' 글만 모아볼 수 있어요!").relevant === true, '내돈내산 정책은 읽는다')
  ok(classifyNotice('블로그 내돈내산 방문 인증 대상 확대 안내 (MY플레이스 결제내역)').relevant === true, '대가성 표기 관련은 읽는다')
  ok(classifyNotice('').relevant === false, '제목이 없으면 걸러낸다')

  // ── 병합: 회원이 남긴 것을 지운다면 그게 제일 나쁜 버그다
  const mk = (url, date, title, over = {}) => ({ url, date, title, source: 's', tags: [], relevant: true, ...over })
  const before = [mk('https://a/1', '2026-08-01', '가', { reviewedAt: '2026-08-02T00:00:00Z', rule: '전화번호 금지' })]
  const after = mergeNotices(before, [mk('https://a/1?fromRss=true', '2026-08-01', '가 (제목 수정)')], 50)
  ok(after.length === 1, '추적 파라미터가 붙어도 같은 글로 본다', String(after.length))
  ok(after[0].reviewedAt === '2026-08-02T00:00:00Z', '확인 표시를 지우지 않는다')
  ok(after[0].rule === '전화번호 금지', '적어둔 규칙을 지우지 않는다')
  ok(after[0].title === '가 (제목 수정)', '제목은 새것으로 갱신한다')
  ok(noticeKey('https://a/1?x=1') === noticeKey('https://a/1'), '주소 열쇠는 파라미터를 뗀다')

  const many = mergeNotices([], [mk('https://a/1', '2026-08-01', '가'), mk('https://a/2', '2026-08-05', '나')], 1)
  ok(many.length === 1 && many[0].date === '2026-08-05', '최신부터 남긴다', JSON.stringify(many.map((m) => m.date)))

  // ── 안 읽은 것 / 규칙 / 마지막 확인일
  const list = [
    mk('https://a/1', '2026-08-01', '스팸 안내', { reviewedAt: '2026-08-10T00:00:00Z', rule: '전화번호 금지' }),
    mk('https://a/2', '2026-08-05', '로직 변경'),
    mk('https://a/3', '2026-08-06', '이벤트', { relevant: false }),
  ]
  ok(unreviewed(list).length === 1, '안 읽은 중요한 공지만 센다', String(unreviewed(list).length))
  ok(unreviewed(list)[0].url === 'https://a/2', '걸러진 글은 안 읽음으로 세지 않는다')
  ok(activeRules(list).length === 1 && activeRules(list)[0].rule === '전화번호 금지', '적어둔 규칙만 지시문으로 간다')
  ok(activeRules([mk('https://a/9', '2026-08-01', '가', { rule: '   ' })]).length === 0, '빈 규칙은 반영하지 않는다')
  ok(lastReviewed(list) === '2026-08-10T00:00:00Z', '마지막 확인일을 데이터에서 읽는다')
  ok(lastReviewed([]) === null, '확인한 적이 없으면 null (날짜를 지어내지 않는다)')

  // ── 받아오기 루프 — 크론과 버튼이 같은 함수를 쓴다 (라우트는 테스트가 못 읽는다)
  {
    const { collectNotices } = require(`${OUT}/naver/notice.js`)
    const feeds = {
      naver_search: { items: [{ title: "'웹 콘텐츠 스팸 사례' 안내", link: 'https://a/1', date: '2026-07-06' }] },
      blogpeople: { items: [{ title: '[당첨 공지] 7월 당첨자 발표', link: 'https://b/1', date: '2026-08-19' }] },
    }
    const got = await collectNotices({ feed: async (id) => feeds[id] ?? null })
    ok(got.items.length === 2, `채널을 모두 돈다 — ${got.items.length}건`)
    ok(got.items.find((n) => n.url === 'https://a/1').relevant === true, '스팸 공지는 읽어야 함으로 표시한다')
    ok(got.items.find((n) => n.url === 'https://b/1').relevant === false, '당첨 공지는 걸러낸다')
    ok(got.items[0].source === '네이버 검색 공식 블로그', '어느 채널에서 왔는지 남긴다')
    ok(got.failed.length === 0, '다 읽었으면 실패 목록이 비어 있다')

    // 한 채널이 죽어도 다른 채널은 살린다
    const half = await collectNotices({ feed: async (id) => (id === 'naver_search' ? feeds.naver_search : null) })
    ok(half.items.length === 1 && half.failed.length === 1, '한 채널만 죽으면 나머지는 받는다', half.failed.join())
    // 전부 죽으면 빈 결과 — 라우트가 이걸 보고 저장을 건너뛴다 (빈 목록으로 덮으면 「새 공지 없음」이 된다)
    const none = await collectNotices({ feed: async () => null })
    ok(none.items.length === 0 && none.failed.length === 2, '전부 죽으면 아무것도 안 준다')
  }

  // ── 지시문에 실제로 들어가나
  const upRule = buildUserPrompt({
    type: 'info',
    mainKeyword: '헬스 초보 운동 순서',
    subKeywords: [],
    noticeRules: [{ rule: '이미지로만 전달한 핵심은 텍스트로도 쓴다', title: 'AI 콘텐츠 가이드', date: '2026-06-04' }],
  })
  ok(upRule.includes('## 네이버 공지에서 확인한 규칙'), '지시문에 공지 규칙 묶음이 들어간다')
  ok(upRule.includes('이미지로만 전달한 핵심은 텍스트로도 쓴다'), '적어둔 문장이 그대로 들어간다')
  ok(upRule.includes('2026-06-04'), '어느 공지에서 왔는지 함께 적는다')
  const upNo = buildUserPrompt({ type: 'info', mainKeyword: '헬스 초보 운동 순서', subKeywords: [] })
  ok(!upNo.includes('## 네이버 공지에서 확인한 규칙'), '적어둔 규칙이 없으면 아무 줄도 안 붙는다')
}

/*
 * ─── 네이버 「콘텐츠 셀프 체크」 반영 (2026-08-20) ──────────────────
 *
 * 회원이 영상에서 시작된 흐름으로 네이버 공식 문서를 읽고 "1. 반영하고" 라고 했다.
 * 네이버가 낸 자가 점검표 5가지 중 **우리 앱에 없던 셋**을 넣었다:
 *   ① 독자 및 목적 — 누가 어떤 상황에서 읽는지 (후킹)
 *   ③ 대안 및 비교 분석 — 다른 선택지와 장단점 (새 구간)
 *   ⑤ 맥락에 맞는 이미지 — 사진으로 전한 내용을 텍스트로도 (검수)
 * ②절차·경험과 ④객관적 근거는 이미 있었다 (voice·info-substance·fact-source·source-lead).
 */
{
  const { imagesOnlyInCaption } = require(`${OUT}/writing/checker.js`)
  const sys = buildSystemPrompt('info')

  // ── ① 독자 및 목적
  ok(sys.includes('누가 어떤 상황에서 읽는지 한 문장으로 못 박는다'), '후킹에서 독자를 못 박게 한다')
  ok(sys.includes('회의 30분 전에 식사를 마쳐야 하는 직장인'), '네이버가 든 좋은 예를 그대로 준다')
  ok(sys.includes('「많은 분들이」·「요즘 다들」로 열지 않는다'), '일반론으로 열지 말라고 한다')

  // ── ③ 대안 및 비교
  ok(sys.includes('4) 고를 때 기준'), '대안 비교 구간이 골격에 있다')
  ok(sys.includes('방법이 하나뿐인 것처럼 쓰지 않는다'), '대안을 들라고 한다')
  ok(sys.includes('우리가 실제로 안 해본 것을 해봤다고 쓰지 않는다'), '겪지 않은 비교를 지어내지 말라고 한다')

  /*
   * **골격 예산이 스펙 안에 들어가는가.** 구간을 하나 늘리면 합계가 상한을 넘어서 골격대로
   * 써도 검수에 걸린다 — 2026-08-05 에 홍보글에서 실제로 겪었다.
   */
  {
    /*
     * **「소제목 있음」까지 붙여서 센다.** 「소제목」에서 끊으면 후킹의 「소제목 **없음**」도
     * 걸려서, 아래에서 후킹을 한 번 더 더할 때 이중으로 세진다 — 2026-08-20 에 실제로
     * 2,900 을 3,200 으로 읽고 멀쩡한 골격이 상한을 넘은 것처럼 나왔다.
     */
    const budgets = [...sys.matchAll(/(\d[\d,]*)~(\d[\d,]*)자, 소제목 있음/g)].map((m) => [
      Number(m[1].replace(/,/g, '')),
      Number(m[2].replace(/,/g, '')),
    ])
    // 후킹은 「소제목 없음」이라 위 정규식에 안 걸린다 — 따로 더한다
    const hook = /후킹 (\d+)~(\d+)자/.exec(sys)
    ok(Boolean(hook) && budgets.length >= 4, `골격 구간을 다 읽었다 — 후킹 + ${budgets.length}구간`)
    const lo = budgets.reduce((a, b) => a + b[0], Number(hook?.[1] ?? 0))
    const hi = budgets.reduce((a, b) => a + b[1], Number(hook?.[2] ?? 0))
    ok(lo >= SPECS.info.charMin, `골격 최소 합계가 분량 하한 이상 — ${lo} ≥ ${SPECS.info.charMin}`)
    ok(hi <= SPECS.info.charMax, `골격 최대 합계가 분량 상한 이하 — ${hi} ≤ ${SPECS.info.charMax}`)
  }

  // ── ⑤ 사진 내용이 본문에도 있나
  ok(imagesOnlyInCaption(['스쿼트 자세 시범'], '스쿼트 자세를 이렇게 잡으세요').length === 0, '설명 낱말이 본문에 있으면 통과')
  ok(imagesOnlyInCaption(['인바디 결과지'], '오늘은 호흡 얘기만 합니다').length === 1, '사진에만 있는 내용을 찾는다')
  ok(imagesOnlyInCaption(['대표 이미지'], '아무 말').length === 0, '「대표 이미지」처럼 표기용 말은 세지 않는다')
  ok(imagesOnlyInCaption(['전경 사진'], '아무 말').length === 0, '「전경·사진」도 표기용으로 본다')
  ok(imagesOnlyInCaption([''], '아무 말').length === 0, '빈 설명은 건너뛴다')
  // 띄어쓰기가 달라도 같은 말로 본다
  ok(imagesOnlyInCaption(['천국의 계단'], '천국의계단이 네 대 있습니다').length === 0, '띄어쓰기 차이로 거짓 경고를 내지 않는다')

  const imgItem = (patch) => checkPost({ ...goodPromo, ...patch }).items.find((i) => i.id === 'image-text')
  ok(imgItem({}), '이미지가 있는 글에는 항목이 생긴다')
  ok(imgItem({}).level === 'pass' || imgItem({}).level === 'warn', '통과 아니면 주의까지만 (막지 않는다)')
  const orphaned = imgItem({
    body: ['[이미지: 인바디 결과지]', '[이미지: 라커룸 열쇠]', '[이미지: 주차장 입구]', '안녕하세요, MTO 피트니스 쌍용점입니다.', '## 소제목', '가'.repeat(1800)].join('\n'),
  })
  ok(orphaned.level === 'warn', `사진에만 있는 내용이 셋이면 주의 — ${orphaned?.level}`)
  ok(orphaned.hint.includes('텍스트로도'), '네이버가 뭐라고 했는지 알려준다')
  ok(!checkPost({ ...goodPromo, body: '이미지 없는 글입니다.' }).items.some((i) => i.id === 'image-text'), '이미지가 없으면 항목을 만들지 않는다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[87] 홍보글에서 운동 정보 구간을 뺐다 (2026-08-21)')
/*
 * 회원: "일단 홍보글에 운동 정보 넣는것도 빼주고."
 *
 * **정보 종류 하한(5)이 실측이라 먼저 쟀다.** 운동 정보 구간 없이 시설·신뢰·이벤트만으로
 * 홍보글을 써서 countSignals 로 세니 정보 7종류였다. 아래가 그 측정을 테스트로 굳힌 것이다 —
 * 이 값이 5 아래로 떨어지면 구간을 빼는 근거가 무너진다.
 */
{
  const { countSignals, INFO_MIN_BY_TYPE } = require(`${OUT}/analysis/content.js`)
  /** 운동을 가르치지 않고 「우리가 무엇을 하는지」만 쓴 홍보글 */
  const NO_LECTURE = [
    '안녕하세요, MTO 피트니스 쌍용점입니다. 8월 등록분만 3개월 이용권을 10만 원 아래로 맞췄어요.',
    '',
    '## 등록해놓고 못 가게 되는 이유',
    '갈 때마다 기다리는 게 쌓여서입니다. 그래서 상담 오시면 이 얘기부터 합니다.',
    '',
    '## 무엇이 있는지부터',
    '웨이트존과 유산소존이 벽으로 나뉘어 있습니다. 천국의 계단이 4대라 몰리는 시간에도 바로 올라가실 수 있어요. 라커와 샤워실은 각 열두 칸이고 24시간 운영입니다. 궁금한 점은 상담 때 물어보세요.',
    '',
    '## 자세를 어떻게 봐드리나',
    '자세가 무너지면 무게를 먼저 내립니다. 스쿼트에서 무릎이 안쪽으로 말리면 그 세트는 멈추고 다시 잡아드려요. 처음 오신 초보 회원은 첫 2주 동안 루틴을 같이 짭니다. 샤워실은 매일 두 번 정리합니다.',
    '',
    '## 8월 등록 혜택',
    '3개월 이용권을 10만 원 아래로 맞췄고 선착순 30분까지입니다. 상담 때 조건 안내드릴게요.',
    '',
    '## 예약은 이렇게',
    '전화 010-2455-2896 으로 편하게 주세요.',
  ].join('\n')
  const sig = countSignals(NO_LECTURE)
  ok(
    sig.info >= INFO_MIN_BY_TYPE.promo,
    `운동을 안 가르쳐도 정보 하한을 넘는다 — ${sig.info}종류 ≥ ${INFO_MIN_BY_TYPE.promo} (${sig.infoFound.join('·')})`
  )
  // 하한 자체는 실측이라 그대로 둔다 — 구간을 빼면서 기준을 같이 낮추면 근거가 없어진다
  ok(INFO_MIN_BY_TYPE.promo === 5, `홍보글 정보 하한은 5 그대로 — ${INFO_MIN_BY_TYPE.promo}`)

  // 골격 합계가 분량 스펙 안에 들어가는가 (구간을 빼고 자수만 안 옮기면 하한에 걸린다)
  const psys = buildSystemPrompt('promo')
  const budgets = [...psys.matchAll(/(\d[\d,]*)~(\d[\d,]*)자, 소제목 있음/g)].map((m) => [Number(m[1]), Number(m[2])])
  const phook = /후킹 (\d+)~(\d+)자/.exec(psys)
  ok(Boolean(phook) && budgets.length === 5, `골격은 후킹 + 5구간이다 — ${budgets.length}구간`)
  const plo = budgets.reduce((a, b) => a + b[0], Number(phook?.[1] ?? 0))
  const phi = budgets.reduce((a, b) => a + b[1], Number(phook?.[2] ?? 0))
  ok(plo >= SPECS.promo.charMin, `홍보 골격 최소 합계가 하한 이상 — ${plo} ≥ ${SPECS.promo.charMin}`)
  ok(phi <= SPECS.promo.charMax, `홍보 골격 최대 합계가 상한 이하 — ${phi} ≤ ${SPECS.promo.charMax}`)

  // 소제목 검사도 같이 옮겼는가 (골격 5구간 = 소제목 5개)
  const h5 = checkPost({ ...goodPromo, body: ['안녕하세요, MTO 피트니스 쌍용점입니다.', ...Array.from({ length: 5 }, (_, i) => `## 소제목${i + 1}\n` + '가'.repeat(360))].join('\n') })
  ok(h5.items.find((i) => i.id === 'headings')?.level === 'pass', `소제목 5개가 통과한다 — ${h5.items.find((i) => i.id === 'headings')?.value}`)
  ok(h5.items.find((i) => i.id === 'headings')?.target === '4~5개', '홍보글 목표가 4~5개로 돌아왔다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[88] 정보글 신뢰 — 전언으로 쓰지 않는다 (2026-08-21)')
/*
 * 회원: "정보글을 조금더 신뢰성있고 사람들에게 도움이 될만한 정보로 작성할 수 있게 해줘."
 *
 * 출처 쪽은 이미 `fact-source`(출처가 있나)와 `source-lead`(앞에 세웠나)가 본다. 비어 있던
 * 것은 그 사이 — 출처 없이 「~라고 하더라구요」로 넘어가는 문장이다. 회원이 처음 이 얘기를
 * 꺼낼 때 든 예가 정확히 이 모양이었다 ("이렇게 됬다더라 하면 안 되는 거잖아").
 */
{
  const infoOf = (body) =>
    checkPost({
      type: 'info',
      title: '폭식 멈추는 방법, 순서부터 바꿔보세요',
      mainKeyword: '폭식 멈추는 방법',
      subKeywords: ['다이어트 폭식'],
      tags: ['폭식멈추는방법'],
      body,
    }).items.find((i) => i.id === 'hearsay')

  const BASE = '## 왜 저녁에 몰리나\n혈당이 낮게 유지되다 떨어지면서 생깁니다.'
  ok(!infoOf(BASE), '전언이 없으면 항목을 만들지 않는다')
  ok(infoOf(`${BASE} 낮에 단백질을 챙기면 줄어든다고 하더라구요.`)?.level === 'warn', '「~하더라구요」를 잡는다')
  ok(infoOf(`${BASE} 그렇게 하면 낫다던데요.`)?.level === 'warn', '「~다던데요」도 잡는다')
  ok(infoOf(`${BASE} 아침을 거르면 안 된다는 말이 있죠.`)?.level === 'warn', '「~라는 말이 있죠」도 잡는다')
  const hit = infoOf(`${BASE} 줄어든다고 하더라구요. 그렇다고 하네요.`)
  ok(hit.value.includes('하더라구요'), `무엇이 걸렸는지 보여준다 — ${hit.value}`)
  ok(hit.hint.includes('제가 상담하면서 보면'), '어떻게 바꾸면 되는지 알려준다')
  /*
   * **막지는 않는다.** 순위 근거가 아니라 신뢰 문제이고, 한 번쯤 섞이는 것은 사람이 쓴
   * 글에서도 흔하다. 점수를 79로 묶는 `fail` 은 확인 안 된 사실 쪽(fact-source)의 몫이다.
   */
  ok(hit.level === 'warn', '주의까지만 한다 (막지 않는다)')

  /*
   * **후기글은 대상에서 뺀다.** 방문객이 실제로 들은 말을 옮기는 자연스러운 말투이고,
   * 거기서는 이게 무기다 — 「~하시더라구요」는 이 앱이 후기글에 권장까지 한다.
   */
  const rev = checkPost({
    type: 'review',
    title: '쌍용동 헬스장 등록 후기, 상담만 받아봤어요',
    mainKeyword: '쌍용동 헬스장',
    subKeywords: [],
    tags: ['쌍용동헬스장'],
    body: '## 가보니\n자세를 봐주시더라구요. 처음이라 그랬는데 괜찮다고 하네요.',
  })
  ok(rev.items.every((i) => i.id !== 'hearsay'), '후기글에는 항목이 안 생긴다 (거기서는 들은 말이 무기다)')

  // 지시문·골격에도 같은 셋이 들어갔는가 (한쪽만 적으면 손으로 쓴 글과 기준이 갈린다)
  const isys = buildSystemPrompt('info')
  const iskel = buildTemplate('info', { mainKeyword: '폭식 멈추는 방법', subKeywords: ['다이어트 폭식'] })
  for (const [needle, label] of [
    ['이 방법이 안 맞는 경우를 한 줄 밝힌다', '①한계를 밝히라고 한다'],
    ['전언으로 쓰지 않는다', '②전언으로 쓰지 말라고 한다'],
    ['수량은 숫자로 적는다', '③얼버무리는 부사 대신 숫자를 쓰라고 한다'],
  ]) {
    ok(isys.includes(needle), `지시문 — ${label}`)
    ok(iskel.includes(needle), `골격 — ${label}`)
  }
  ok(isys.includes('모르는 것을 밝히는 데서 온다'), '왜 그런지도 한 줄 적는다')
  // 숫자를 지어내라는 말로 읽히면 안 된다 — 이 앱은 확인 안 된 수치를 계속 막아 왔다
  ok(isys.includes('모르면 범위, 알면 숫자'), '모르면 범위로 쓰라고 함께 못 박는다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[89] 정보글 제목에 업체 말이 섞이는 것 (2026-08-21)')
/*
 * 회원이 나온 결과물을 보여줬다 — 제목이 「쌍용동 헬스장 PT추천, 다이어트 정체기 폭식
 * 질문 4가지 답변」. 회원: "키워드에 pt는 없는데 제목에 왜 pt가 들어가는지 모르겠고."
 *
 * 원인은 지시문이었다 — 「지역 키워드를 1~2회 넣는다」라고만 하고 **어디에** 넣으라는 말이
 * 없어서 모델이 제일 눈에 띄는 자리(제목 맨 앞)에 넣었다. 지시문도 고쳤지만, 지시문만
 * 고치면 다음에 또 나온다 (`event-hook` 이 그 경로였다). 그래서 검수도 만든다.
 */
{
  const titleOf = (title, patch = {}) =>
    checkPost({
      type: 'info',
      title,
      body: '## 소제목\n' + '가'.repeat(600),
      mainKeyword: '다이어트 정체기',
      subKeywords: ['폭식'],
      localKeyword: '쌍용동 헬스장',
      tags: [],
      legalName: 'MTO 피트니스 쌍용점',
      ...patch,
    }).items.find((i) => i.id === 'info-title-purity')

  const bad = titleOf('쌍용동 헬스장 PT추천, 다이어트 정체기 폭식 질문 4가지 답변')
  ok(bad?.level === 'warn', `회원이 물린 그 제목을 잡는다 — ${bad?.value}`)
  ok(bad.value.includes('쌍용동 헬스장'), '지역 키워드가 제목에 있는 것을 짚는다')
  ok(bad.value.includes('PT추천'), '키워드에 없는 「PT추천」을 짚는다')
  ok(bad.hint.includes('제목 맨 앞은 정보 메인 키워드 자리'), '어떻게 고치는지 알려준다')

  const good = titleOf('다이어트 정체기 폭식, 자주 받는 질문 4가지 답변')
  ok(good?.level === 'pass', `정보 키워드로만 연 제목은 통과 — ${good?.value}`)

  // 상호명·홍보 낱말도 같이 본다
  ok(titleOf('다이어트 정체기, MTO 피트니스 쌍용점이 답해드립니다')?.value.includes('상호명'), '제목의 상호명도 잡는다')
  ok(titleOf('다이어트 정체기 폭식, 무료 상담으로 풀어드려요')?.level === 'warn', '제목의 홍보 낱말도 잡는다')
  /*
   * **키워드에 들어 있으면 잡지 않는다.** 「PT」가 메인 키워드인 글도 있다 — 그때까지
   * 잡으면 이 검사가 회원이 정한 키워드를 못 쓰게 막는 셈이 된다.
   */
  ok(
    titleOf('PT 상담 전에 알아둘 것 5가지', { mainKeyword: 'PT 상담', subKeywords: [] })?.level === 'pass',
    '키워드 자체에 든 말은 잡지 않는다'
  )
  // 홍보글·후기글에는 이 항목이 없다 (거기서는 지역·상호명이 제목에 들어가는 게 정상이다)
  for (const t of ['promo', 'review']) {
    ok(
      checkPost({ ...goodPromo, type: t, title: '쌍용동 헬스장 3개월 10만 원대 후기' }).items.every(
        (i) => i.id !== 'info-title-purity'
      ),
      `${t} 에는 항목이 안 생긴다`
    )
  }

  /*
   * ─── 자리 수가 곧 횟수여야 한다 ──────────────────────────────
   * 같은 결과물에서 메인 키워드가 **제목 1회 · 본문 0회**였다. 목표는 3회인데 지시문이
   * 자리를 다섯 개 불러줬고, 그중 「이벤트/후반」은 정보글에 없는 구간이었다.
   */
  for (const [t, n] of [['promo', 5], ['info', 4], ['review', 3]]) {
    const line = buildSystemPrompt(t).split('\n').find((l) => l.includes('메인 키워드 **정확히'))
    const slots = (line.match(/[①②③④⑤⑥⑦]/g) ?? []).length
    ok(slots === n, `${t} — 자리 수가 목표 횟수와 같다`, `${slots}자리 / 목표 ${n}회`)
    ok(line.includes(`(${n}자리 = ${n}회)`), `${t} — 자리 수가 곧 횟수라고 못 박는다`)
  }
  // 정보글 자리 목록에 없어진 구간이 남아 있지 않다
  const infoSlotLine = buildSystemPrompt('info').split('\n').find((l) => l.includes('메인 키워드 **정확히'))
  ok(!infoSlotLine.includes('이벤트'), '정보글 자리 목록에 이벤트 구간이 없다')
  ok(!infoSlotLine.includes('시설'), '정보글 자리 목록에 시설 구간이 없다')
  // 글자 그대로 쓰라는 말 — 「다이어트 중 정체기」로 쓰면 0회로 세어진다
  ok(buildSystemPrompt('info').includes('키워드는 주어진 글자 그대로 쓴다'), '키워드를 쪼개 쓰지 말라고 한다')
  ok(buildSystemPrompt('info').includes('한 번도 안 쓴 것으로 센다'), '왜 그런지(세는 방식)도 밝힌다')
  // 지역 키워드는 본문에만
  ok(buildSystemPrompt('info').includes('지역 키워드를 **본문에만**'), '지역 키워드 자리를 본문으로 못 박는다')
  ok(buildSystemPrompt('info').includes('제목에는 넣지 않는다'), '제목에는 넣지 말라고 한다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[90] 본문이 없는 소제목 (2026-08-21)')
/*
 * 같은 결과물에 있었다 — 「## 자주 나오는 질문 1, 2 …」 다음에 이미지 한 장만 오고 바로
 * 다음 소제목이 왔다. 읽는 사람에게는 빈 칸이고, 소제목 수만 늘어서 기준(5~6개)을 넘긴다.
 * 개수만 세는 `headings` 는 오히려 이걸로 개수가 채워져 통과에 가까워진다.
 */
{
  const emptyOf = (body) =>
    checkPost({ ...goodPromo, body }).items.find((i) => i.id === 'empty-heading')

  const FULL = ['안녕하세요, MTO 피트니스 쌍용점입니다.', '## 하나', '내용입니다.', '## 둘', '내용입니다.'].join('\n')
  ok(!emptyOf(FULL), '소제목마다 본문이 있으면 항목을 만들지 않는다')

  const EMPTY = ['안녕하세요, MTO 피트니스 쌍용점입니다.', '## 비어 있는 소제목', '## 둘', '내용입니다.'].join('\n')
  ok(emptyOf(EMPTY)?.level === 'warn', `본문 없이 넘어간 소제목을 잡는다 — ${emptyOf(EMPTY)?.value}`)
  ok(emptyOf(EMPTY).value.includes('비어 있는 소제목'), '어느 소제목인지 보여준다')

  // 사진만 두는 것도 빈 것으로 본다 — 검색은 사진 속 글자를 못 읽는다
  const IMG_ONLY = ['안녕하세요, MTO 피트니스 쌍용점입니다.', '## 사진만 있는 소제목', '[이미지: 전경]', '## 둘', '내용입니다.'].join('\n')
  ok(emptyOf(IMG_ONLY)?.level === 'warn', '사진만 있는 구간도 빈 것으로 본다')
  // 마지막 소제목이 비어도 잡는다 (루프가 끝난 뒤라 놓치기 쉽다)
  const LAST = ['안녕하세요, MTO 피트니스 쌍용점입니다.', '## 하나', '내용입니다.', '## 마지막이 비었다'].join('\n')
  ok(emptyOf(LAST)?.value.includes('마지막이 비었다'), '마지막 소제목이 비어도 잡는다')
  // 막지는 않는다 — 붙여넣기 전에 채우면 되는 것이다
  ok(emptyOf(EMPTY).level !== 'fail', '주의까지만 한다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[91] 골격이 요구하는 값이 지시문에 실제로 들어 있나 (2026-08-21)')
/*
 * 회원 지적: "인사말에 상호명이 안나오고 검수 항목 고쳐쓰기가 되지 않아."
 *
 * **두 증상이 한 원인이었다.** 2026-08-21 에 정보글 인사 형식을 「안녕하세요, (키워드)
 * (업체명)입니다」로 정했는데, 지시문의 지점 정보 블록은 2026-08-20 부터 정보글에
 * 「정식 상호명: **주지 않는다**」를 보내고 있었다. **모델은 없는 것을 쓸 수 없다.**
 * 고쳐 쓰기도 같은 지시문을 다시 쓰므로 몇 번을 눌러도 그 항목만은 못 고친다.
 *
 * 이 저장소에서 반복된 사고의 또 다른 얼굴이다 — 한쪽만 고쳤다. 골격을 바꿀 때
 * **그 골격이 필요로 하는 값이 지시문에 있는지**까지 봐야 한다. 그래서 검사로 만든다.
 */
{
  const STORE_FULL = {
    id: 's',
    name: 'MTO 쌍용점',
    legalName: 'MTO 피트니스 쌍용점',
    localKeywords: ['쌍용동 헬스장'],
    phone: '010-2455-2896',
    reserveUrl: 'https://booking.naver.com/x',
  }
  for (const t of ['promo', 'info', 'review']) {
    const p = buildUserPrompt({ type: t, store: STORE_FULL, mainKeyword: '쌍용동 헬스장', subKeywords: [] })
    const spec = SPECS[t]
    /*
     * **상호명을 쓰라고 시키면 상호명을 줘야 한다.** 이 한 줄이 회원이 물린 그 사고를 잡는다.
     */
    if (spec.legalNameMin > 0) {
      ok(p.includes(STORE_FULL.legalName), `${t} — 상호명을 ${spec.legalNameMin}회 시키니 값도 준다`)
    }
    // 반대로 「주지 않는다」가 남아 있으면 안 된다 (옛 판의 잔재)
    ok(!p.includes('정식 상호명: **주지 않는다**'), `${t} — 「상호명을 주지 않는다」가 남아 있지 않다`)
  }

  // 정보글에는 상호명 자리가 아예 없다 (2026-08-27, 화자가 일반 블로거)
  const infoP = buildSystemPrompt('info')
  ok(infoP.includes('상호명·지점명은 이 글 어디에도 넣지 않는다'), '정보글에는 상호명 자리가 없다고 적는다')
  ok(!infoP.includes('정식 상호명을 정확히 1회 이상 쓴다 (후킹·본문 중반·마무리)'), '홍보글 자리 목록을 정보글에 흘리지 않는다')
  ok(buildSystemPrompt('promo').includes('후킹·본문 중반·마무리'), '홍보글은 세 자리를 그대로 준다')

  /*
   * **정보글에 주지 않는 값도 그대로 지킨다.** 상호명만 되살린 것이지 연락 수단까지
   * 되살린 게 아니다 — 값을 주면 쓰게 된다는 원칙은 그쪽에 그대로 남아 있다.
   */
  const infoUser = buildUserPrompt({ type: 'info', store: STORE_FULL, mainKeyword: '쌍용동 헬스장', subKeywords: [] })
  ok(!infoUser.includes('- 전화: 010-2455-2896'), '정보글 지시문에는 전화번호를 주지 않는다')
}

// ─────────────────────────────────────────────────────────────
console.log('\n[92] 유형별 — 지시문·골격·검수 세 판이 같은 말을 하나 (2026-08-21)')
/*
 * 회원 요청: "전체적으로 글쓸때 오류는 없는지 확인해줘 유형별로 모두."
 *
 * 훑어보니 이 저장소의 사고는 전부 같은 모양이었다 — **세 판 중 한쪽만 고친 것.**
 * 그래서 눈으로 보지 말고 **값을 뽑아서 맞춰 본다.** 처음 돌렸을 때 잡힌 것:
 *   · 후기글 골격 합계가 1,560~1,890 인데 분량 하한이 1,700 이었다 (골격대로 쓰면 미달)
 *   · 홍보글·후기글 골격의 단계 번호·이름이 지시문과 달랐다 (마무리 vs CTA, 후킹 vs 도입)
 *
 * 이 검사는 **새 구간을 넣거나 자수를 옮길 때마다** 돈다. 골격만 고치고 스펙을 안 옮기면
 * 여기서 걸린다.
 */
{
  const SW_STORE = {
    id: 's', name: 'MTO 쌍용점', legalName: 'MTO 피트니스 쌍용점',
    womenOnly: false, open24: true, localKeywords: ['쌍용동 헬스장'],
    location: '천안시 서북구 쌍용동', features: ['24시간 운영'], strengths: ['자세 교정'],
    phone: '010-2455-2896', reserveUrl: 'https://booking.naver.com/x',
  }
  const KW = { promo: '쌍용동 헬스장', info: '다이어트 정체기', review: '쌍용동 헬스장' }
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  for (const t of ['promo', 'info', 'review']) {
    const sys = buildSystemPrompt(t)
    const user = buildUserPrompt({ type: t, store: SW_STORE, mainKeyword: KW[t], subKeywords: ['쌍용동 PT'], localKeyword: '쌍용동 헬스장', eventText: '3개월 9.9만원' })
    const skel = buildTemplate(t, { store: SW_STORE, mainKeyword: KW[t], subKeywords: ['쌍용동 PT'], localKeyword: '쌍용동 헬스장', eventText: '3개월 9.9만원' })
    const spec = SPECS[t]

    /** 지시문에서 구간을 그대로 뽑는다 — 「N) 이름 lo~hi자, 소제목 있음/없음」 */
    const spans = [...sys.matchAll(/^(\d)\) (.+?) (\d[\d,]*)~(\d[\d,]*)자, 소제목 (있음|없음)/gm)].map((m) => ({
      n: +m[1], name: m[2].replace(/\*\*/g, ''),
      lo: +m[3].replace(/,/g, ''), hi: +m[4].replace(/,/g, ''), head: m[5] === '있음',
    }))
    ok(spans.length >= 5, `${t} — 골격 구간을 읽었다`, `${spans.length}개`)

    // ① 자수 합계가 분량 스펙 안인가 — 골격대로 써도 걸리지 않아야 한다
    const lo = spans.reduce((a, x) => a + x.lo, 0)
    const hi = spans.reduce((a, x) => a + x.hi, 0)
    ok(lo >= spec.charMin, `${t} — 골격 최소 합계가 분량 하한 이상`, `${lo} ≥ ${spec.charMin}`)
    ok(hi <= spec.charMax, `${t} — 골격 최대 합계가 분량 상한 이하`, `${hi} ≤ ${spec.charMax}`)

    // ② 단계 번호가 1부터 빠짐없이
    ok(spans.map((s) => s.n).join() === spans.map((_, i) => i + 1).join(), `${t} — 단계 번호가 이어진다`, spans.map((s) => s.n).join('·'))

    // ③ 소제목 수(=「소제목 있음」 구간 수)가 검수 통과 범위 안인가
    const headCount = spans.filter((s) => s.head).length
    const h = checkPost({
      type: t,
      title: t === 'review' ? '쌍용동 헬스장 등록 후기, 3개월 10만 원대' : `${KW[t]} 3개월 10만 원대 안내`,
      body: ['안녕하세요, MTO 피트니스 쌍용점입니다.', ...Array.from({ length: headCount }, (_, i) => `## 소제목${i + 1}\n` + '가'.repeat(300))].join('\n'),
      mainKeyword: KW[t], subKeywords: [], tags: [], legalName: SW_STORE.legalName,
    }).items.find((i) => i.id === 'headings')
    ok(h?.level === 'pass', `${t} — 골격 소제목 ${headCount}개가 검수 통과`, `목표 ${h?.target}`)
    const said = /소제목은 `## 소제목` 형식\. (\d)~(\d)개/.exec(sys)
    ok(said && headCount >= +said[1] && headCount <= +said[2], `${t} — 지시문이 말하는 소제목 수와도 맞는다`, `골격 ${headCount}개 / 지시문 ${said?.[1]}~${said?.[2]}개`)

    // ④ 메인 키워드 자리 수 == 목표 횟수, 그리고 자리 이름이 실제 구간인가
    const slotLine = sys.split('\n').find((l) => l.includes('메인 키워드 **정확히'))
    const slotNames = (slotLine?.match(/[①②③④⑤⑥⑦][^ ]+/g) ?? []).map((x) => x.slice(1).replace(/[.,·]+$/, ''))
    const target = spec.mainTarget ?? spec.mainMin
    ok(slotNames.length === target, `${t} — 메인 키워드 자리 수가 목표 횟수와 같다`, `${slotNames.length}자리 / ${target}회`)
    for (const name of slotNames) {
      const known = ['제목', '첫', '마무리'].some((k) => name.startsWith(k)) || spans.some((s) => s.name.includes(name))
      ok(known, `${t} — 키워드 자리 「${name}」이 실제로 있는 구간이다`)
    }

    // ⑤ 상호명을 N회 쓰라고 시키면 값도 줘야 한다 (2026-08-21 회원이 물린 그 사고)
    if (spec.legalNameMin > 0) ok(user.includes(SW_STORE.legalName), `${t} — 상호명을 시키니 값도 준다`)

    // ⑥ 골격(손으로 쓰는 판)의 단계 자수가 지시문과 같은가
    for (const s of spans) {
      const nm = esc(s.name)
      const same = new RegExp(`${nm}[^(]*\\(${s.lo}~${s.hi}자`).test(skel)
      const other = new RegExp(`${nm}[^(]*\\((\\d[\\d,]*)~(\\d[\\d,]*)자`).exec(skel)
      ok(same, `${t} — 골격의 「${s.name}」 자수가 지시문과 같다`, other ? `골격 ${other[1]}~${other[2]} / 지시문 ${s.lo}~${s.hi}` : '골격에 그 구간이 없다')
    }
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[93] 완성된 예시 글 세 편이 그대로 통과하나 (2026-08-21)')
/*
 * **이 저장소에서 네 번 난 사고를 잡으려고 만든 검사다** (scripts/golden.mjs 머리말).
 * 전부 「골격은 바꾸고 검수는 안 옮긴 것」이고, 문구 검사로는 안 잡힌다 — 완성된 글을
 * 넣어 봐야 잡힌다.
 *
 * **걸렸을 때 예시 글부터 고치지 않는다.** 어느 쪽이 틀렸는지 먼저 정한다:
 *   · 골격이 맞으면 → 예시 글을 새 골격에 맞게 고친다
 *   · 검수가 안 옮겨진 것이면 → 검수를 고친다 (예시 글은 그대로 둔다)
 * 글만 고쳐서 통과시키면 검수가 반대를 시키는 상태가 그대로 남는다.
 */
for (const g of GOLDEN_POSTS) {
  const r = checkPost(g.input)
  const failed = r.items.filter((i) => i.level === 'fail')
  const warned = r.items.filter((i) => i.level === 'warn')
  ok(
    failed.length === 0,
    `${g.label} — 즉시수정 0건`,
    failed.map((i) => `${i.id}(${i.value})`).join(' · ') || '없음'
  )
  ok(r.score >= PUBLISH_THRESHOLD, `${g.label} — 발행선 통과`, `${r.score} ≥ ${PUBLISH_THRESHOLD}`)
  /*
   * 주의도 0 으로 둔다. 「막지는 않는 항목」이라 느슨하게 두고 싶지만, 그러면 골격을 바꿔
   * 통과가 주의로 내려앉아도 이 검사가 조용하다 — 그게 정확히 우리가 놓쳤던 자리다.
   */
  ok(
    warned.length === 0,
    `${g.label} — 주의 0건`,
    warned.map((i) => `${i.id}(${i.value})`).join(' · ') || '없음'
  )
  /*
   * 골격을 바꿀 때 제일 먼저 어긋나는 둘을 따로 못 박는다 — 구간을 늘리거나 줄이면
   * 이 둘이 같이 안 움직여서 사고가 났다 (2026-08-05 · 2026-08-20 · 2026-08-21).
   */
  const spec = SPECS[g.input.type]
  const chars = r.items.find((i) => i.id === 'charCount')
  const heads = r.items.find((i) => i.id === 'headings')
  ok(chars?.level === 'pass', `${g.label} — 분량이 스펙 안 (${spec.charMin}~${spec.charMax})`, chars?.value)
  ok(heads?.level === 'pass', `${g.label} — 소제목 수가 스펙 안`, `${heads?.value} / 목표 ${heads?.target}`)
}
/*
 * 정보글은 「업체가 안 드러나는 것」이 이 글의 정의다. 위 항목들과 겹치지만, 겹쳐도
 * 여기 한 줄 더 둔다 — 이 글의 성격이 바뀌면 다른 어떤 항목보다 먼저 알아야 한다.
 */
{
  const info = GOLDEN_POSTS.find((g) => g.input.type === 'info')
  const r = checkPost(info.input)
  const purity = r.items.find((i) => i.id === 'info-purity')
  ok(purity?.level === 'pass', '정보글 예시에 업체 흔적이 하나도 없다', purity?.value)
  // 지점을 통째로 넘겼는데도 새지 않아야 한다 (지시문·골격이 값을 흘리는지 함께 본다)
  ok(Boolean(info.input.store && info.input.legalName), '지점 정보를 넘긴 상태로 검사한다')
  // 상호명 0회 (2026-08-27, 화자가 일반 블로거). 연락 수단도 여전히 0회여야 한다
  ok((info.input.body.match(/MTO 피트니스 쌍용점/g) ?? []).length === 0, '정보글 예시에 상호명이 없다')
  ok(!info.input.title.includes('MTO'), '정보글 예시 제목에는 상호명이 없다')
  for (const leak of ['010-2455-2896', 'booking.naver.com']) {
    ok(!info.input.body.includes(leak), `정보글 본문에 연락 수단이 없다 — ${leak}`)
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[94] 매일 정보글 초안 — 무엇을 쓸 차례인가 (2026-08-21)')
/*
 * 회원 요청: "정보성 블로그가 매일 1편씩 자동으로 작성되게 만들고 싶어."
 *
 * **네이버 자동 발행은 안 한다** (글쓰기 API 가 없어졌고, 로그인 대행은 계정이 위험하다).
 * 자동인 것은 「매일 초안 한 편을 써서 검수까지 돌려 둔다」까지다.
 *
 * 여기서 테스트하는 것은 **결정** 부분이다 — 틀리면 매일 같은 글을 쓰거나 하루에 여러 편을
 * 쓰는 종류의 실수이고, 둘 다 유사문서·발행간격 쪽에서 손해가 난다.
 */
{
  const { INFO_TOPICS, isAutoDraft, hasTodayAutoDraft, pickAssignment, draftNote } =
    require(`${OUT}/writing/autodraft.js`)

  const post = (patch) => ({ id: 'p', type: 'info', status: 'draft', storeId: 's', title: '', body: '', mainKeyword: '', subKeywords: [], tags: [], createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '', ...patch })

  // ── 하루 한 편 (크론 재시도·손으로 한 번 더 눌러도)
  const auto = post({ auto: true, createdAt: '2026-08-21T20:00:00.000Z' })
  ok(isAutoDraft(auto), '자동 초안임을 글에 남긴다')
  /*
   * **유사성 3축을 자동 초안 표시로 쓰지 않는다** (2026-08-21 프로덕션 데이터에서 발견).
   * 처음엔 format 에 'auto' 를, topicGroup 에 주제를 박았는데 그 둘은 로테이션이 쓰는 칸이다
   * (INFO_FORMATS 「① 단계형」·TOPIC_GROUPS 「B. 다이어트」). 거기에 다른 값을 넣으면
   * 「최근에 안 쓴 형식」 계산이 망가져 **매번 같은 형식으로 쓰게 된다** — 자동화가
   * 유사문서를 만드는 바로 그 경로다.
   */
  ok(!isAutoDraft(post({ format: 'auto' })), 'format 에 auto 가 있어도 자동 초안으로 세지 않는다')
  ok(isAutoDraft(post({ auto: true, format: '① 단계형 — 순서대로 정리 (1→2→3)' })), '3축은 그대로 두고 자기 칸으로 가린다')
  {
    // 로테이션이 쓰는 값이 살아 있으면 다음 글이 다른 조합을 고를 수 있다
    const real = post({ auto: true, autoTopic: INFO_TOPICS[0], format: '② Q&A형 — 자주 받는 질문 3~4개에 답', topicGroup: 'B. 다이어트 (식단·정체기·공복 유산소·근손실·야식·칼로리)' })
    ok(real.format.startsWith('②') && real.topicGroup.startsWith('B.'), '자동 초안도 3축을 제 값으로 들고 있다')
    ok(isAutoDraft(real) && real.autoTopic === INFO_TOPICS[0], '주제는 따로 남는다')
  }
  /*
   * **한국 날짜로 센다** (2026-08-26 회원 지적: "8/26일이면 이미 쓰여진게 정상인거 아니야?").
   * 20:00 UTC 는 한국에서 **다음 날 새벽 5시**다 — 그 글은 8월 22일 몫이다.
   */
  ok(hasTodayAutoDraft([auto], '2026-08-22'), '새벽 5시에 쓴 글은 그 날(한국 날짜) 몫이다')
  ok(!hasTodayAutoDraft([auto], '2026-08-21'), 'UTC 날짜로 세지 않는다 (그러면 하루씩 밀린다)')
  ok(!hasTodayAutoDraft([auto], '2026-08-23'), '날이 바뀌면 다시 쓴다')
  ok(!hasTodayAutoDraft([post({ createdAt: '2026-08-21T20:00:00.000Z' })], '2026-08-22'), '손으로 쓴 글은 오늘 몫으로 세지 않는다')
  ok(!hasTodayAutoDraft([], '2026-08-21') && !hasTodayAutoDraft(undefined, '2026-08-21'), '글이 없어도 터지지 않는다')

  // ── 무엇을 쓸 차례인가
  const KWS = ['쌍용동 헬스장', '두정동 헬스장']
  const first = pickAssignment({ posts: [], keywords: KWS })
  ok(first?.localKeyword === KWS[0], `글이 없으면 첫 키워드부터 — ${first?.localKeyword}`)
  ok(INFO_TOPICS.includes(first.topic), '주제도 목록 안에서 고른다')
  /*
   * **메인 키워드는 주제(정보성 검색어)다** (2026-08-27 회원 결정: "중요한건 상업성키워드가
   * 아닌 순수 정보성 키워드를 찾는 기능을 넣어야하고 … 그 키워드는 구매력이 있는 키워드면
   * 안돼"). 지역 키워드는 조연 칸으로 내려간다.
   *
   * 이게 뒤집히면 「쌍용동헬스장 벌크업식단, …」 같은 제목이 다시 나온다 — 정보글로
   * 신뢰를 쌓겠다면서 매출 키워드를 앞세우는 꼴이다.
   */
  ok(first.mainKeyword === first.topic, '메인 키워드는 정보성 주제다', first.mainKeyword)
  ok(first.mainKeyword !== first.localKeyword, '지역 키워드를 메인으로 올리지 않는다')
  ok(first.why.includes('아직 안 쓴'), '왜 이 조합인지 밝힌다')

  /*
   * **구매력 있는 말은 메인이 될 수 없다** — 회원이 그은 선이다.
   *
   * 판단은 탐색기(classifyIntent)가 이미 하고 있으므로 같은 기준을 쓴다. 두 곳에 따로
   * 적으면 한쪽만 늘어난다.
   */
  {
    const { pureInfoTopics } = require(`${OUT}/writing/autodraft.js`)
    const { classifyIntent } = require(`${OUT}/writing/topic-explore.js`)
    // 기본 목록은 전부 순수 정보성이어야 한다 — 아니면 탐색기를 안 돌린 날 매출 키워드가 나간다
    const impure = INFO_TOPICS.filter((t) => ['buy', 'local'].includes(classifyIntent(t)))
    ok(impure.length === 0, '기본 주제 10개가 전부 순수 정보성이다', impure.join(' · '))
    // 문장이 아니라 검색어여야 한다 — 메인 키워드는 제목 앞과 해시태그에 그대로 들어간다
    const { isTaggable } = require(`${OUT}/writing/checker.js`)
    const unusable = INFO_TOPICS.filter((t) => !isTaggable(t))
    ok(unusable.length === 0, '기본 주제가 전부 해시태그로 쓸 수 있는 꼴이다', unusable.join(' · '))

    const mixed = ['쌍용동 헬스장', '헬스장 가격', '천안 헬스장 추천', '어깨 뭉침 스트레칭']
    ok(pureInfoTopics(mixed).join() === '어깨 뭉침 스트레칭', '업체·값을 묻는 말을 뺀다', pureInfoTopics(mixed).join())
    // 다 걸러 하나도 안 남으면 기본 목록으로 — 안 쓰는 것보다 낫다
    ok(pureInfoTopics(['쌍용동 헬스장']).length === INFO_TOPICS.length, '전부 걸러지면 기본 목록으로 돌아간다')
    // 회원이 손으로 적은 주제는 지우지 않는다 (구매력만 막는다)
    ok(pureInfoTopics(['아무 주제나']).join() === '아무 주제나', '구매력이 아니면 그대로 둔다')

    // 실제로 골라도 마찬가지 — 순위 추적 키워드가 전부 지역 키워드여도 메인은 정보성이다
    const picked = pickAssignment({ posts: [], keywords: KWS, topics: ['쌍용동 헬스장', '헬스장 가격', '공복 유산소 효과'] })
    ok(picked.mainKeyword === '공복 유산소 효과', '구매력 있는 말은 메인 자리에 못 온다', picked.mainKeyword)
  }

  /*
   * **문장을 해시태그로 요구하지 않는다** (2026-08-27). 메인 키워드가 주제 자리로 오면서
   * 「주 2회밖에 못 갈 때 짜는 순서」 같은 긴 말도 이 자리에 올 수 있게 됐다. 그걸 태그로
   * 요구하면 「#주2회밖에못갈때짜는순서」가 나오고, 없으면 fail 이라 점수가 79 에 묶인다.
   */
  {
    const { isTaggable } = require(`${OUT}/writing/checker.js`)
    ok(isTaggable('공복 유산소 효과'), '검색어 꼴은 태그가 된다')
    ok(!isTaggable('주 2회밖에 못 갈 때 짜는 순서'), '문장은 태그가 아니다')
    ok(!isTaggable('체중이 안 빠질 때 점검할 것'), '어절이 넷 넘으면 태그가 아니다')
    ok(!isTaggable(''), '빈 말은 태그가 아니다')
  }
  // 같은 입력이면 늘 같은 답 — 크론이 두 번 돌아도 흔들리지 않는다
  ok(JSON.stringify(pickAssignment({ posts: [], keywords: KWS })) === JSON.stringify(first), '같은 입력이면 같은 답')
  /*
   * ─── 지역 키워드 없이도 돈다 (2026-08-28 회원 요청: "아예 이 칸을 없앨래") ────────
   *
   * 자동 초안 설정에서 지역 키워드 칸을 없앴다. 축이 주제 하나뿐이어도 로테이션이 돌아야
   * 한다 — 예전에는 키워드가 없으면 null 을 돌려 **아무 글도 안 썼다.**
   */
  ok(pickAssignment({ posts: [], keywords: [] })?.topic, '지역 키워드가 없어도 주제로 돈다')
  ok(pickAssignment({ posts: [] })?.localKeyword === '', '지역 키워드 자리는 비워 둔다')
  ok(pickAssignment({ posts: [], keywords: ['  '] })?.topic, '빈 키워드만 있어도 마찬가지')
  // 주제를 비워 보내도 기본 목록으로 돌아간다 (pureInfoTopics) — 「글이 안 나오는 날」을 만들지 않는다
  ok(INFO_TOPICS.includes(pickAssignment({ posts: [], topics: [] })?.topic), '주제를 비워도 기본 목록으로 돈다')

  /*
   * ─── 하루에 여러 편 (2026-08-28 회원 요청: "하루에 여러편 작성할 수 있게해줘") ────────
   *
   * **한 번에 몰아 쓰지 않는다.** 한 편에 생성 1회 + 고쳐 쓰기 최대 3회가 들고 함수 실행
   * 한도가 300초라, 두세 편을 한 번에 쓰면 한도를 넘겨 **아무것도 저장되지 않는다.**
   * 그래서 크론을 새벽 5·6·7시로 세 번 돌리고 한 번에 한 편씩 쓴다.
   */
  {
    const { AUTO_DRAFT_MAX_PER_DAY, perDayOf, todayAutoDraftCount, doneForToday, planAssignment } =
      require(`${OUT}/writing/autodraft.js`)
    const at5 = (d) => post({ auto: true, autoTopic: '가', createdAt: `${d}T20:00:00.000Z` })

    /*
     * ─── 하루 여러 편은 **다른 주제로 각 1편씩**이다 (2026-08-28 회원 정리) ──────────
     *
     * "같은주제로 2편을 쓰고 싶다는게 아니라 다른 주제로 각 1편씩 쓰고 싶단 이야기였어."
     *
     * 같은 주제로 두 편을 쓰면 그건 유사문서다 — 자동화가 스스로 감점을 만드는 짓이다.
     * 한 편 채울 때마다 그 글이 쓰인 셈 치고 다음 것을 고르므로 같은 날 안에서도 겹치지
     * 않는다. 화면 문구도 그 사실을 적는다.
     */
    {
      const { fillDays } = require(`${OUT}/writing/autodraft.js`)
      const two = fillDays({ plan: { perDay: 2, topics: ['가주제', '나주제', '다주제'] }, posts: [], from: '2026-08-29', days: 2 })
      ok(two.length === 2 && two.every((d) => d.date === '2026-08-29'), '고른 날 하루에 두 줄을 채운다', JSON.stringify(two))
      ok(new Set(two.map((d) => d.topic)).size === 2, '두 줄의 주제가 서로 다르다', JSON.stringify(two))
      const three = fillDays({ plan: { perDay: 3 }, posts: [], from: '2026-08-29', days: 3 })
      ok(new Set(three.map((d) => d.topic)).size === 3, '세 편도 전부 다른 주제다', JSON.stringify(three.map((d) => d.topic)))
      // 화면이 그 사실을 적어야 회원이 「같은 주제로 두 편인가」를 묻지 않는다
      const panelSrc = require('node:fs').readFileSync(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
      ok(panelSrc.includes('편마다 다른 주제'), '편마다 다른 주제라고 화면에 적는다')
    }

  /*
   * ─── 회원이 하는 그대로 처음부터 끝까지 (2026-08-28) ─────────────────
   *
   * 회원: "하루 몇 편에서 2편 선택 → 언제부터를 내일로 → 이 날 주제 채우기 → 설정 저장.
   * 이렇게 하면 서로다른 주제가 각 1편씩 나오는거야?"
   *
   * 조각조각 맞는지는 위에서 봤다. 그런데 회원이 묻는 것은 **그 순서대로 했을 때 실제로
   * 그렇게 되느냐**다 — 이 저장소에서 여러 번 겪은 실패가 「조각은 다 맞는데 이어 붙이면
   * 안 되는 것」이라, 이어 붙인 것도 못 박아 둔다.
   *
   * 새벽 5·6·7시 실행을 크론이 저장하는 모양 그대로 흉내 낸다.
   */
  {
    const { fillDays: fd, normalizePlan: np } = require(`${OUT}/writing/autodraft.js`)
    const PLAN2 = { perDay: 2, topics: ['가주제', '나주제', '다주제'] }
    // ① 채우기 → ② 저장
    const filled = fd({ plan: PLAN2, posts: [], from: '2026-08-29', days: perDayOf(PLAN2) })
    const saved = np({ ...PLAN2, days: filled })
    ok(saved.days.length === 2, '저장해도 두 줄이 남는다', JSON.stringify(saved.days))

    // ③ 새벽 5·6·7시
    const wrote = []
    let posts2 = []
    for (const hour of ['20', '21', '22']) {
      if (doneForToday(posts2, '2026-08-29', saved)) {
        wrote.push('skip')
        continue
      }
      const a = planAssignment({ plan: saved, posts: posts2, date: '2026-08-29' })
      wrote.push(a ? a.topic : 'null')
      if (a)
        posts2 = [
          post({ auto: true, autoTopic: a.topic, mainKeyword: a.mainKeyword, createdAt: `2026-08-28T${hour}:00:00.000Z` }),
          ...posts2,
        ]
    }
    ok(wrote.join() === '가주제,나주제,skip', '5시·6시에 다른 주제로 한 편씩, 7시는 넘어간다', wrote.join())
    // 메인 키워드가 곧 그 주제다 — 제목이 그 말로 열린다
    ok(posts2.every((p) => p.mainKeyword === p.autoTopic), '주제가 그대로 메인 키워드가 된다')
    ok(new Set(posts2.map((p) => p.autoTopic)).size === 2, '하루에 같은 글이 두 편 나오지 않는다')
  }

    ok(perDayOf(undefined) === 1, '안 정하면 하루 한 편')
    ok(perDayOf({ perDay: 2 }) === 2, '정한 값을 그대로 쓴다')
    ok(perDayOf({ perDay: 0 }) === 1 && perDayOf({ perDay: -3 }) === 1, '0 이하는 한 편으로 본다')
    ok(perDayOf({ perDay: 99 }) === AUTO_DRAFT_MAX_PER_DAY, '상한을 넘기지 않는다')
    /*
     * **상한은 크론 시각 수와 같아야 한다.** 이 값이 크론 개수보다 크면 설정할 수는 있는데
     * 실제로는 안 써지는 편수가 생긴다 — 화면이 거짓말을 하는 셈이다.
     */
    const vercel = JSON.parse(require('node:fs').readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    const draftCrons = vercel.crons.filter((c) => c.path === '/api/cron/draft')
    ok(draftCrons.length === AUTO_DRAFT_MAX_PER_DAY, `크론 시각 수가 상한과 같다 — ${draftCrons.length}/${AUTO_DRAFT_MAX_PER_DAY}`)
    ok(new Set(draftCrons.map((c) => c.schedule)).size === draftCrons.length, '같은 시각이 두 번 있지 않다')

    // 오늘 몇 편 썼나 — 한국 날짜로 센다 (20:00 UTC = 다음 날 새벽 5시)
    ok(todayAutoDraftCount([at5('2026-08-21'), at5('2026-08-21')], '2026-08-22') === 2, '오늘 쓴 편수를 센다')
    ok(todayAutoDraftCount([at5('2026-08-21')], '2026-08-23') === 0, '다른 날 것은 안 센다')
    ok(!doneForToday([at5('2026-08-21')], '2026-08-22', { perDay: 2 }), '두 편 중 한 편 썼으면 아직 남았다')
    ok(doneForToday([at5('2026-08-21'), at5('2026-08-21')], '2026-08-22', { perDay: 2 }), '두 편 다 쓰면 끝이다')
    ok(doneForToday([at5('2026-08-21')], '2026-08-22'), '안 정했으면 한 편으로 끝이다')

    /*
     * **같은 날 같은 주제를 두 번 쓰지 않는다.** 그냥 첫 줄을 집으면 두 번째 실행이 같은
     * 주제를 또 써서 하루에 똑같은 글이 두 편 생긴다.
     */
    const twoRows = { topics: ['가주제', '나주제'], days: [
      { date: '2026-08-22', topic: '가주제' },
      { date: '2026-08-22', topic: '나주제' },
    ] }
    const firstRun = planAssignment({ plan: twoRows, posts: [], date: '2026-08-22' })
    ok(firstRun?.topic === '가주제', '첫 실행은 첫 줄을 쓴다', firstRun?.topic)
    const wrote1 = [post({ auto: true, autoTopic: '가주제', createdAt: '2026-08-21T20:00:00.000Z' })]
    const secondRun = planAssignment({ plan: twoRows, posts: wrote1, date: '2026-08-22' })
    ok(secondRun?.topic === '나주제', '두 번째 실행은 다음 줄을 쓴다', secondRun?.topic)

    // 화면·크론이 같은 기준을 쓴다 — 한쪽만 고치면 「설정은 2편인데 1편만 나온다」가 된다
    const cronSrc = require('node:fs').readFileSync(new URL('../app/api/cron/draft/route.ts', import.meta.url), 'utf8')
    ok(cronSrc.includes('doneForToday'), '크론이 그 날 몫을 다 썼는지로 막는다')

    /*
     * ─── 상위노출 분석을 하고 쓴다 (2026-08-28 회원 지적) ─────────────────
     *
     * 회원: "자동작성하는게 관련키워드 상위노출 분석을 안하고 작성하는거 같아."
     *
     * 맞았다. 손으로 쓰는 화면은 처방을 지시문에 함께 넣는데(Editor 의 `prescription`)
     * **크론은 그 자리를 비워 보내고 있었다** — 같은 앱인데 새벽에 쓴 글만 그 판의 실측
     * 없이 나갔다 (제목 길이·분량·이미지 수가 전부 일반 기준으로).
     */
    ok(/prescription: rxForInfo/.test(cronSrc), '크론이 처방을 함께 보낸다')
    ok(cronSrc.includes("fetch(`${base}/api/serp`"), '없으면 그 자리에서 상위노출 분석을 돌린다')
    // 저장된 것이 싱싱하면 다시 재지 않는다 — 조회를 아끼고 화면과 같은 처방을 쓴다
    ok(cronSrc.includes('isPrescriptionStale'), '저장된 처방이 싱싱하면 그것을 쓴다')
    // 후기글에게 할 말이 섞여 있다 — 정보글에 그대로 넣으면 화자 검수와 부딪힌다
    ok(cronSrc.includes("prescriptionForType(prescription, 'info')"), '정보글에 맞게 걸러서 넣는다')
    /*
     * **분석 시간을 고쳐 쓰기 예산에서 뺀다.** 분석에 30초쯤 걸리는데 그것을 안 세면
     * 예산이 넘쳐 함수 실행 한도(300초)를 넘길 수 있다 — 그러면 아무것도 저장되지 않는다.
     */
    const askIdx = cronSrc.indexOf('const askedAt = Date.now()')
    const serpIdx = cronSrc.indexOf("fetch(`${base}/api/serp`")
    ok(askIdx > 0 && serpIdx > askIdx, '시간 재기를 분석보다 먼저 시작한다')
    // 분석이 실패해도 글은 쓴다 — 처방 없이 쓰는 것이 안 쓰는 것보다 낫다
    ok(cronSrc.includes('처방 없이 씁니다'), '분석이 실패해도 글은 쓴다')
    // 분석하고 썼는지 화면이 말한다 — 안 적으면 회원이 알 방법이 없다 (그래서 물었다)
    ok(/rx: rxNote/.test(cronSrc), '분석 결과를 실행 기록에 남긴다')
    const dayUi2 = require('node:fs').readFileSync(new URL('../app/autodraft/DayList.tsx', import.meta.url), 'utf8')
    ok(dayUi2.includes('상위노출: '), '날짜별 목록이 그것을 보여준다')
    ok(!cronSrc.includes('hasTodayAutoDraft'), '「한 편이라도 있으면 그만」으로 막지 않는다')
    const panel3 = require('node:fs').readFileSync(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
    ok(panel3.includes('하루 몇 편'), '화면에서 편수를 고른다')
    ok(/perDay: n/.test(panel3), '고른 값을 설정에 담는다')
  }
  ok(pickAssignment({ posts: [] })?.why.includes('주제'), '왜 이 주제인지 밝힌다', pickAssignment({ posts: [] })?.why)

  /*
   * **같은 조합을 이어서 고르지 않는다.** 이게 틀리면 매일 같은 글이 나온다 — 자동화가
   * 오히려 유사문서를 만드는 가장 흔한 실패다.
   */
  {
    const used = []
    let posts = []
    for (let i = 0; i < 8; i++) {
      const a = pickAssignment({ posts, keywords: KWS })
      used.push(`${a.localKeyword}|${a.topic}`)
      posts = [post({ mainKeyword: a.mainKeyword, localKeyword: a.localKeyword, autoTopic: a.topic, auto: true, createdAt: `2026-08-${String(10 + i).padStart(2, '0')}T20:00:00.000Z` }), ...posts]
    }
    ok(new Set(used).size === used.length, `여덟 번 돌려도 조합이 겹치지 않는다 — ${new Set(used).size}/8`)
    // 주제도 바로 되풀이하지 않는다 (키워드가 달라도 본문이 닮는다)
    const topics = used.map((u) => u.split('|')[1])
    let repeated = 0
    for (let i = 1; i < topics.length; i++) if (topics[i] === topics[i - 1]) repeated++
    ok(repeated === 0, `주제가 연달아 나오지 않는다 — 연속 ${repeated}회`)
  }

  // 조합을 다 쓰면 가장 오래된 것부터 다시 돈다 (멈추지 않는다)
  {
    const oneTopic = ['새벽 운동 시작하기']
    const posts = [post({ mainKeyword: KWS[0], autoTopic: oneTopic[0], createdAt: '2026-08-20T00:00:00.000Z' })]
    const a = pickAssignment({ posts, keywords: [KWS[0]], topics: oneTopic })
    ok(a?.localKeyword === KWS[0] && a.topic === oneTopic[0], '쓸 조합이 하나뿐이면 그것을 다시 고른다')
    ok(a.why.includes('오래 안 썼'), '되돌아온 것임을 밝힌다')
  }

  // 홍보글·후기글은 로테이션을 흔들지 않는다 (본문이 전혀 다르다)
  {
    const noise = [post({ type: 'promo', mainKeyword: KWS[0], autoTopic: INFO_TOPICS[0] })]
    ok(
      JSON.stringify(pickAssignment({ posts: noise, keywords: KWS })) === JSON.stringify(first),
      '정보글이 아닌 글은 차례 계산에 넣지 않는다'
    )
  }

  /*
   * **점수로 거르지 않는다.** 발행선에 못 미쳐도 남기고 화면에서 알린다 — 지우면 회원이
   * 무엇이 모자랐는지 볼 기회가 없고, 「오늘은 왜 글이 없지」가 된다.
   */
  ok(draftNote(92, PUBLISH_THRESHOLD).level === 'good', '발행선을 넘으면 그렇게 알린다')
  ok(draftNote(79, PUBLISH_THRESHOLD).level === 'warn', '못 미치면 주의로 알린다')
  ok(draftNote(79, PUBLISH_THRESHOLD).text.includes('고쳐 쓰기'), '무엇을 하면 되는지 알려준다')

  /*
   * **글 작성 화면은 주제 목록을 들고 있지 않다** (2026-08-24 회원 요청으로 지웠다).
   *
   * 거기 있던 칩 여섯 개는 이 목록에서 잘라 쓴 것이었는데, 그 목록 자체가 우리가 지어낸
   * 것이다. 탐색기를 붙여 놓고 지어낸 예시를 나란히 두면 그쪽을 고르게 된다 — 실제로
   * 검색되는 것에서 고르라는 것이 탐색기를 만든 이유다.
   *
   * 기본 목록(INFO_TOPICS)은 **자동 초안이 아무것도 안 골랐을 때의 예비**로만 남는다.
   */
  const { readFileSync: rf } = require('node:fs')
  const editor = rf(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
  ok(!/const INFO_TOPIC_IDEAS/.test(editor), '주제 칩 목록을 들고 있지 않다')
  ok(!editor.includes("from '@/lib/writing/autodraft'"), '주제 목록을 가져다 쓰지도 않는다')
  ok(!editor.includes('다이어트 첫 달에 할 것'), '지어낸 주제를 예시로 남겨두지 않는다')
}

console.log('\n[95] 자동 초안이 조용히 실패하지 않는가 (2026-08-23)')
/*
 * 회원: "안뜨는데? 제대로 하고 있는거 맞아?"
 *
 * 그날 크론은 **돌다가 실패했다.** 자기 앱을 부를 때 배포별 주소(VERCEL_URL)를 썼는데
 * 배포 보호가 로그인 페이지를 돌려줘서 JSON 파싱이 깨졌고, 아무 기록도 남기지 않아서
 * 화면에서는 「실패했나 안 돌았나」조차 구별할 수 없었다.
 *
 * 그래서 세 가지를 테스트한다 — **어느 주소로 부르나 · 실행 기록을 어떻게 읽나 ·
 * 무엇을 알리고 무엇을 삼키나.**
 */
{
  const { AUTO_DRAFT_RUNS_KEEP, AUTO_DRAFT_STALE_DAYS, baseUrlFor, autoDraftAlert, autoDraftStatus } =
    require(`${OUT}/writing/autodraft.js`)

  // ── ① 어느 주소로 자기 앱을 부르나
  /*
   * **운영 도메인이 먼저다.** VERCEL_URL 은 배포마다 달라지는 주소라 배포 보호에 막힌다 —
   * 이번 실패의 원인이 정확히 이것이었다.
   */
  ok(
    baseUrlFor({ VERCEL_PROJECT_PRODUCTION_URL: 'naver-blog-eta.vercel.app', VERCEL_URL: 'naver-blog-abc123.vercel.app' }) ===
      'https://naver-blog-eta.vercel.app',
    '운영 도메인이 배포별 주소보다 앞선다'
  )
  ok(baseUrlFor({ VERCEL_URL: 'x.vercel.app' }) === 'https://x.vercel.app', '운영 도메인이 없으면 배포별 주소라도 쓴다')
  ok(
    baseUrlFor({ NEXT_PUBLIC_BASE_URL: 'https://blog.example.com/', VERCEL_URL: 'x.vercel.app' }) ===
      'https://blog.example.com',
    '직접 적은 주소가 배포별 주소보다 앞서고, 끝 슬래시는 뗀다'
  )
  ok(baseUrlFor({ VERCEL_PROJECT_PRODUCTION_URL: 'https://a.com' }) === 'https://a.com', 'https 가 붙어 있어도 두 번 붙이지 않는다')
  ok(baseUrlFor({ VERCEL_URL: '  ' }) === null, '빈 값은 주소로 치지 않는다')
  ok(baseUrlFor({}) === null, '아무것도 없으면 null — 라우트가 그걸 기록에 남긴다')

  // ── ② 기록은 얼마나 남기나
  ok(AUTO_DRAFT_RUNS_KEEP >= 14, `두 주 넘게 남긴다 — ${AUTO_DRAFT_RUNS_KEEP}건`)
  ok(AUTO_DRAFT_STALE_DAYS >= 2, '하루 비었다고 「멈췄다」고 하지 않는다 (크론은 새벽에 돈다)')

  const TODAY = '2026-08-23'
  const run = (patch) => ({ date: TODAY, ok: true, ...patch })

  // ── ③ 대시보드는 **알릴 일이 있을 때만** 끼어든다
  ok(autoDraftAlert([run({ ok: true })], TODAY) === null, '오늘 성공했으면 아무 말도 하지 않는다')
  const bad = autoDraftAlert([run({ ok: false, error: 'JSON 이 아닌 응답 (상태 401)' })], TODAY)
  ok(bad?.level === 'bad', '오늘 실패했으면 알린다')
  ok(bad.text.includes('401'), '왜 실패했는지 그대로 보여준다', bad.text)
  ok(
    autoDraftAlert([run({ ok: false, error: 'x' }), run({ ok: true })], TODAY) === null,
    '한 번 실패했어도 다시 돌아 성공했으면 알리지 않는다'
  )
  ok(autoDraftAlert([run({ ok: false })], TODAY).text.includes('기록되지 않았습니다'), '이유가 없으면 없다고 말한다')

  /*
   * **「아직 안 돌았습니다」는 띄우지 않는다.** 처음엔 기록이 없으면 경고를 띄웠는데,
   * 그러면 ⓐ 방금 켠 지점과 ⓑ 고장난 크론을 구별하지 못하고 ⓒ 크론 시각(새벽 5시) 전까지
   * 하루의 대부분이 경고로 덮인다. 실제로 「초안 N편을 검수하세요」를 밀어내서 테스트가 깨졌다.
   */
  ok(autoDraftAlert(undefined, TODAY) === null, '기록이 아예 없으면 조용하다')
  ok(autoDraftAlert([], TODAY) === null, '빈 목록도 마찬가지')
  ok(autoDraftAlert([run({ date: '2026-08-22' })], TODAY) === null, '어제 돌았고 오늘 아직이면 조용하다 (정상이다)')

  // 대신 **끊긴 것**은 잡는다 — 이틀이 비면 크론이 멈춘 것이다
  const stale = autoDraftAlert([run({ date: '2026-08-20' })], TODAY)
  ok(stale?.level === 'warn', '이틀 넘게 안 돌면 알린다')
  ok(stale.text.includes('3일째') && stale.text.includes('2026-08-20'), '며칠째인지·마지막이 언제인지 말한다', stale.text)
  // 순서가 뒤죽박죽인 기록에서도 **가장 최근**을 본다
  ok(
    autoDraftAlert([run({ date: '2026-08-10' }), run({ date: '2026-08-22' })], TODAY) === null,
    '기록 순서가 어떻든 마지막 실행으로 판단한다'
  )

  // ── ④ 발행 관리 화면은 **아무 일이 없어도** 지금 상태를 말한다
  const done = autoDraftStatus([run({ ok: true })], TODAY, true)
  ok(done.level === 'good' && !done.canRun, '오늘 초안이 있으면 좋다고 하고 버튼을 숨긴다')
  const failedNow = autoDraftStatus([run({ ok: false, error: '지점이 없습니다.' })], TODAY, false)
  ok(failedNow.level === 'bad' && failedNow.canRun, '실패한 날에는 직접 돌릴 수 있게 한다')
  ok(failedNow.text.includes('지점이 없습니다.'), '무엇 때문인지 화면에 그대로 적는다')
  const never = autoDraftStatus(undefined, TODAY, false)
  ok(never.text.includes('새벽 5시'), '기록이 없어도 언제 도는지는 알려준다', never.text)
  ok(never.canRun, '기록이 없을 때도 손으로 돌려볼 수 있다')
  ok(autoDraftStatus([run({ date: '2026-08-22' })], TODAY, false).text.includes('어제'), '어제 돈 것은 「어제」라고 읽어준다')
  ok(
    autoDraftStatus([run({ date: '2026-08-22', manual: true })], TODAY, false).text.includes('직접 실행'),
    '손으로 돌린 것은 그렇다고 밝힌다 — 크론이 도는지와 다른 이야기다'
  )
  ok(autoDraftStatus([run({ date: '2026-08-18' })], TODAY, false).level === 'warn', '오래 끊기면 발행 관리에서도 주의로')

  /*
   * **화면이 약속한 버튼이 실제로 있어야 한다.** 대시보드 문구가 「지금 한 편 쓰기로 직접
   * 돌려보실 수 있습니다」라고 하는데 그 버튼이 없으면, 회원은 없는 것을 찾아 헤맨다.
   */
  const { readFileSync: rf2 } = require('node:fs')
  const panel = rf2(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
  const nextAction = rf2(new URL('../lib/writing/next-action.ts', import.meta.url), 'utf8')
  ok(nextAction.includes('지금 한 편 쓰기'), '대시보드가 그 버튼을 가리킨다')
  ok(panel.includes('지금 한 편 쓰기'), '가리킨 그 버튼이 화면에 있다')
  ok(panel.includes("'/api/cron/draft', { method: 'POST' }"), '버튼이 실제로 초안 쓰기를 부른다')
  const route = rf2(new URL('../app/api/cron/draft/route.ts', import.meta.url), 'utf8')
  ok(/export async function POST/.test(route), '그 주소가 POST 를 받는다')
  ok(/export async function GET/.test(route) && route.includes('CRON_SECRET'), '크론용 GET 은 비밀값을 그대로 검사한다')
  // 실패해도 기록은 남는다 — 이번 사고의 핵심이다
  ok((route.match(/await record\(/g) ?? []).length >= 4, '성공·실패·건너뜀을 모두 기록한다')
  ok(route.includes('res.text()'), 'JSON 이 아닌 응답(로그인 HTML)도 읽어서 남긴다')
  ok(route.includes('x-vercel-protection-bypass'), '배포 보호 우회 비밀값이 있으면 함께 보낸다')

  /*
   * **자동 작성은 자기 화면을 갖는다** (2026-08-24 회원 요청: "어디 있는지 모르겠으니까
   * 자동작성 탭을 하나 만들어서 볼수 있게 해줘"). 매일 결과가 나오는 기능이 발행 관리
   * 화면의 접이식 칸 안에 있었다.
   */
  const auto = rf2(new URL('../app/autodraft/page.tsx', import.meta.url), 'utf8')
  ok(auto.includes('AutoDraftPanel') && auto.includes('autoDraftRuns'), '자동 작성 화면이 실행 기록을 넘긴다')
  // 「자동으로 쓴 글」·「실행 기록」 두 카드를 날짜별 한 목록으로 합쳤다 (2026-08-24)
  ok(auto.includes('autoDraftDays'), '날짜별 목록으로 실제 결과를 보여준다')
  ok(auto.includes('DayList'), '날짜별 목록 화면을 쓴다')
  // 이 화면 전체가 자동 작성이다 — 설정을 접어 두면 「저장한 목록이 안나오는데?」가 된다
  ok(auto.includes('settingsOpen'), '자동 작성 화면에서는 설정이 펼쳐진 채로 열린다')
  ok(panel.includes('<details open={settingsOpen}'), '펼침 여부를 화면이 정한다')
  const shell = rf2(new URL('../components/AppShell.tsx', import.meta.url), 'utf8')
  ok(/TAB_HREFS = \[[^\]]*'\/autodraft'/.test(shell), '하단 탭에 자동작성이 있다 (손가락이 닿는 자리)')
  ok(shell.includes("label: '자동 작성'"), '메뉴에도 있다')
  // 두 곳에 두면 어디서 고쳐야 하는지 회원이 판단해야 한다 — 발행 관리에는 길만 남긴다
  const posts = rf2(new URL('../app/posts/page.tsx', import.meta.url), 'utf8')
  ok(!posts.includes('<AutoDraftPanel'), '발행 관리에는 설정을 두 벌 두지 않는다')
  ok(posts.includes('href="/autodraft"'), '발행 관리에서 가는 길은 남긴다')
  // 대시보드 안내도 새 화면을 가리켜야 한다 (없는 자리를 가리키면 회원이 헤맨다)
  ok(nextAction.includes("href: '/autodraft'"), '대시보드 안내가 자동 작성 화면을 가리킨다')

  // 기록 목록이 DB 저장/복원 목록에 들어 있어야 내려받기·올리기에서 사라지지 않는다
  const { DB_LIST_KEYS: keys } = require(`${OUT}/store.js`)
  ok(keys.includes('autoDraftRuns'), '실행 기록도 백업에 포함된다')
}

console.log('\n[96] 크론이 /api/write 의 응답을 제대로 읽는가 (2026-08-23)')
/*
 * **주소보다 이게 먼저였다.**
 *
 * 자동 초안이 한 편도 안 나온 진짜 이유는 크론이 `data.body` 를 읽은 것이었다. /api/write 는
 * `{ draft: { title, body, tags }, ... }` 를 돌려준다. JSON 파싱은 성공하고 `body` 만
 * undefined 라서 「글을 쓰지 못했습니다」로 조용히 끝났다 — 배포 주소를 고쳤어도 한 편도
 * 안 나왔을 것이다.
 *
 * **타입 검사가 못 잡는 종류다.** fetch 응답은 그냥 any 이고, 라우트 파일은 테스트가
 * 컴파일하지도 않는다. 그래서 두 파일의 **글자를 맞대어** 본다 — 이 저장소에서 「한쪽만
 * 고친 것」을 잡는 데 이미 여러 번 쓴 방법이다.
 */
{
  const { readFileSync: rf } = require('node:fs')
  const write = rf(new URL('../app/api/write/route.ts', import.meta.url), 'utf8')
  const cron = rf(new URL('../app/api/cron/draft/route.ts', import.meta.url), 'utf8')

  /*
   * /api/write 의 성공 응답은 **초안을 draft 안에 담는다.** 이게 바뀌면 아래 검사들이
   * 근거를 잃으므로 먼저 못 박는다.
   */
  ok(/return NextResponse\.json\(\{\s*\n\s*draft,/.test(write), '/api/write 는 초안을 draft 로 감싸 돌려준다')
  ok(!/^\s{6}body: draft\.body,/m.test(write), '본문을 최상위 body 로도 돌려주지 않는다 (하나만 있어야 한다)')

  // 크론은 그 모양대로 읽는다
  ok(cron.includes('draft?.body'), '크론이 draft.body 를 읽는다')

  /*
   * ─── 새벽 초안도 지점 없이 쓴다 (2026-08-28) ────────────────────
   *
   * 회원: "자동완성되는것도 적용해줘."
   *
   * 손으로 쓰는 화면은 08-27 에 정보글에서 지점 칸을 없앴는데(회원 요청 "정보성글에는 구지
   * 지점정보가 필요하지 않을것 같아") **새벽 크론만 예전처럼 지점을 실어 보내고 있었다.**
   * 그러면 같은 정보글인데 손으로 쓴 것은 지점이 없고 자동으로 쓴 것은 지점이 붙어,
   * 발행 관리·로테이션에서 두 갈래로 갈린다 — 이 저장소가 반복해서 겪은 「한쪽만 고친 것」이다.
   */
  {
    const cronCode2 = cron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/storeId: store\.id/.test(cronCode2), '크론이 글에 지점을 싣지 않는다')
    ok((cronCode2.match(/storeId: ''/g) ?? []).length === 2, '보내는 요청과 저장하는 글 둘 다 비운다')
    /*
     * 지점은 **키워드 풀을 고를 때만** 쓴다 — 글에 안 들어가므로 지점이 없어도 쓸 수 있다.
     * 막아야 하는 것은 지점이 없는 것이 아니라 **쓸 키워드가 없는 것**이다.
     */
    ok(/store\?\.localKeywords/.test(cronCode2), '지점이 없어도 터지지 않는다')
    ok(/쓸 키워드가 없습니다/.test(cron), '막는 조건이 「키워드 없음」으로 바뀌었다')
    ok(!/지점이 없습니다\. 지점을 먼저 등록해주세요/.test(cron), '지점이 없다고 막지 않는다')
  }
  // 주석은 빼고 본다 — 「예전에 data.body 를 읽어서 깨졌다」고 적어둔 주석까지 걸리면 안 된다
  const code = cron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok(!/\bdata\.body\b/.test(code) && !/\bdata\.title\b/.test(code), '최상위 body·title 을 읽지 않는다')
  ok(cron.includes('best.draft?.title') && cron.includes('best.draft?.tags'), '제목·태그도 같은 자리에서 꺼낸다')

  /*
   * **모자라면 한 번 더 부른다.** /api/write 는 한 요청에 한 번만 쓴다 (두 번 쓰면 함수
   * 실행 한도를 넘긴다). 그래서 「85점 미만·분량 미달」이면 부르는 쪽이 초안을 들고 다시
   * 부르게 돼 있다 — 화면(Editor.tsx)이 그렇게 하고 있고, 크론도 같아야 손으로 쓴 글과
   * 같은 수준이 나온다.
   */
  ok(write.includes('needsRevise') && write.includes('charMin'), '/api/write 가 「더 고쳐야 한다」를 알려준다')
  ok(cron.includes('needsRevise') && cron.includes('charMin'), '크론이 그 신호를 본다')
  // 회차마다 **그때까지 가장 좋은 초안**의 걸린 항목을 넘긴다 (2026-08-26: 한 번이 아니라 여러 번 돈다)
  ok(/issues: best\.fixIssues/.test(cron), '고쳐 쓰기에 걸린 항목을 그대로 넘긴다')
  ok(/draft: best\.draft/.test(cron), '직전 회차 결과를 들고 다시 부른다 (첫 초안으로 되돌아가지 않는다)')
  const editor = rf(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
  ok(editor.includes('fixIssues'), '화면도 같은 항목을 넘긴다 (둘이 같은 절차를 쓴다)')

  // 고쳐 쓰기 응답에는 rotation 이 없다 — 첫 응답 것을 지켜야 3축이 빈 값으로 저장되지 않는다
  ok(/rotation: first\.data\.rotation/.test(cron), '고쳐 써도 유사성 3축은 첫 응답 값을 지킨다')
}

console.log('\n[97] 자동 초안 — 무엇으로 쓸지 회원이 고른다 (2026-08-23)')
/*
 * 회원 요청: "매일 새벽에 정보성 글이 발행되잖아 그거 주제랑 키워드 내가 원하는걸로
 * 선택해서 하고 싶어."
 *
 * 세 단계로 정할 수 있다 — 아무것도 안 정하면 여태처럼 돈다.
 *   ① 아무 설정 없음 → 순위 추적 키워드 × 기본 주제
 *   ② 범위만 고름   → 고른 것 안에서 로테이션
 *   ③ 차례까지 지정 → 줄 세운 순서대로
 */
{
  const { normalizePlan, planAssignment, popQueue, planSummary, writesEveryDay, fillDays, INFO_TOPICS: TOPICS } =
    require(`${OUT}/writing/autodraft.js`)
  const FALLBACK = ['쌍용동 헬스장', '두정동 헬스장']

  // ── ① 아무것도 안 정했으면 여태 방식 그대로
  const auto = planAssignment({ plan: undefined, posts: [] })
  ok(auto && TOPICS.includes(auto.topic), '설정이 없으면 기본 주제로 돈다')
  /*
   * **지역 키워드는 자동 초안에서 안 쓴다** (2026-08-28 회원 요청: "아예 이 칸을 없앨래").
   * 화면만 지우고 안에서 계속 고르면 저장된 옛 목록으로 조용히 돌아간다.
   */
  ok(auto.localKeyword === '', '지역 키워드 자리는 비어 있다', auto.localKeyword)
  ok(planAssignment({ plan: {}, posts: [] })?.localKeyword === '', '빈 설정도 마찬가지')
  ok(planAssignment({ plan: { keywords: ['성정동 헬스장'] }, posts: [] })?.localKeyword === '',
    '옛 설정에 키워드가 남아 있어도 쓰지 않는다')

  // ── 꺼두면 아무것도 안 쓴다 (지우는 것보다 끄는 편이 낫다 — 설정이 남는다)
  ok(!planAssignment({ plan: { off: true }, posts: [] }), '꺼두면 쓰지 않는다')
  ok(planSummary({ off: true }).includes('꺼두셨습니다'), '꺼둔 것을 화면에 밝힌다')

  // ── ② 고른 범위 안에서만
  const scoped = planAssignment({ plan: { topics: ['어깨가 자주 뭉칠 때'] }, posts: [] })
  ok(scoped?.topic === '어깨가 자주 뭉칠 때', '직접 적어 넣은 주제도 그대로 쓴다', scoped?.topic)
  ok(scoped?.mainKeyword === '어깨가 자주 뭉칠 때', '그 주제가 곧 메인 키워드다')

  /*
   * **예약(줄 세우기) 칸은 뺐다** (2026-08-24 회원 요청: "위에 칸은 삭제하고").
   *
   * 매일 하나씩 지정하게 하면 결국 손으로 쓰는 것과 같아진다 — 한 번 정해두면 그 뒤로
   * 손대지 않아도 되는 것이 이 기능의 값이다. 남아 있던 자리에 계속 값을 넣게 두면
   * 「고쳤는데 왜 그대로지」가 되므로 타입·저장·크론에서 함께 지웠다.
   */
  ok(!('queue' in normalizePlan({ queue: [{ keyword: 'A', topic: '가' }] })), '예약 칸을 저장하지 않는다')
  ok(
    planAssignment({ plan: { queue: [{ keyword: '엉뚱한 키워드', topic: '가' }], topics: ['어깨가 자주 뭉칠 때'] }, posts: [] })
      ?.topic === '어깨가 자주 뭉칠 때',
    '예전에 저장된 예약이 남아 있어도 무시한다'
  )

  /*
   * **들어오는 자리에서 한 번만 정리한다.** 화면에서 온 값을 그대로 저장하면 빈 줄·중복이
   * 섞이고, 그게 크론까지 가서 「키워드가 없습니다」로 실패하거나 로테이션을 한쪽으로 쏠리게 한다.
   */
  const dirty = normalizePlan({
    keywords: ['  천안 헬스장  ', '천안 헬스장', '', '   '],
    topics: [null, '가', '가'],
  })
  ok(dirty.keywords.length === 1 && dirty.keywords[0] === '천안 헬스장', '공백을 떼고 중복을 없앤다')
  ok(dirty.topics.length === 1, '주제도 마찬가지')
  ok(normalizePlan(undefined).off === false, '설정이 없으면 꺼진 것이 아니다 (기본은 켜짐)')

  // ── 화면 한 줄 요약 — 설정을 열어 세어 보지 않아도 알 수 있어야 한다
  ok(planSummary(undefined).includes('순위 추적 목록 전부'), '아무것도 안 정하면 그렇게 말한다', planSummary(undefined))
  /*
   * **주제가 먼저다** (2026-08-28 회원 요청: "자동작성 키워드 부분 수정해줘").
   *
   * 08-27 에 정보글 메인 키워드가 주제로 바뀌었는데 이 한 줄은 「키워드 … · 주제 …」
   * 순서로 떴다. 제목을 여는 말이 뒤에 오니 무엇이 주인공인지 거꾸로 읽힌다.
   */
  {
    const line = planSummary({ keywords: ['성정동 헬스장'], topics: ['식물성단백질음식'] })
    ok(line.indexOf('식물성단백질음식') < line.indexOf('성정동 헬스장'), '주제를 먼저 적는다', line)
    ok(line.includes('지역 키워드'), '지역 키워드라고 이름 붙인다', line)
    // 화면의 ①② 도 같이 맞바꿨다 — 한쪽만 고치면 요약과 설정칸이 서로 다른 순서를 말한다
    const panel2 = require('node:fs').readFileSync(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
    ok(panel2.includes('= 정보글 메인 키워드'), '주제가 곧 메인 키워드라고 적는다')
    /*
     * ─── 지역 키워드 칸을 아예 없앴다 (2026-08-28 회원 요청: "아예 이 칸을 없앨래") ──────
     *
     * 08-28 오전에 이름과 순서를 바로잡았는데 회원의 다음 말이 이것이었다 — 조연이면
     * 자동 초안 설정에 칸을 둘 이유가 없다. **계산에서도 뺐다** (planAssignment): 화면만
     * 지우고 안에서 계속 고르면 저장된 옛 목록으로 조용히 돌아간다.
     */
    const panelCode2 = panel2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    ok(!panelCode2.includes('② 지역 키워드'), '설정칸에 지역 키워드 칸이 없다')
    ok(!panelCode2.includes('keywordPool'), '고를 목록도 더 이상 받지 않는다')
    // 「지금 저장된 설정」 줄도 같은 순서여야 한다 — 한 화면에서 두 순서가 나오면 안 된다
    const savedTopic = panel2.indexOf('font-semibold">주제</dt>')
    const savedLocal = panel2.indexOf('font-semibold">지역</dt>')
    ok(savedTopic > 0 && savedLocal > savedTopic, '저장된 설정도 주제를 먼저 적는다')
    ok(panel2.includes('(${stored.keywords.length}개) — 조연'), '지역 줄에 조연이라고 붙인다')
  }
  /*
   * **개수가 아니라 이름을 적는다** (2026-08-24). 처음엔 「키워드 1개 지정」이라고만 적었는데
   * 회원이 그 줄을 보고 물었다: "저장한 목록이 안나오는데?" 개수는 목록이 아니다.
   */
  ok(planSummary({ keywords: ['봉명동 헬스장'], topics: ['키토다이어트'] }).includes('봉명동 헬스장'),
    '무엇을 저장했는지 이름으로 보여준다', planSummary({ keywords: ['봉명동 헬스장'], topics: ['키토다이어트'] }))
  ok(planSummary({ topics: ['키토다이어트'] }).includes('키토다이어트'), '주제도 이름으로')
  // 많으면 한 줄에 다 못 넣는다 — 앞의 둘만 적고 나머지는 개수로
  const many = planSummary({ keywords: ['가', '나', '다', '라'] })
  ok(many.includes('가 · 나') && many.includes('외 2개'), '많으면 앞의 둘과 나머지 개수로 줄인다', many)

  /*
   * **날짜별로 무엇을 쓰나** (2026-08-24 회원 요청).
   *
   * "이거는 매일 달라질거야 그래서 날짜별로 목록이 보이게 만들어달란 소리였어."
   *
   * 「지금 저장된 설정」은 범위만 말해준다 (키워드 3개 · 주제 5개). 실제로 쓰이는 조합은
   * 매일 달라지고, 회원이 알고 싶은 것은 「그래서 내일은 뭘 쓰지」다.
   */
  {
    const { forecastAutoDrafts, autoDraftDays, fillDays, rerollTopic } = require(`${OUT}/writing/autodraft.js`)
    const fc = forecastAutoDrafts({
      plan: { topics: ['가주제', '나주제', '다주제', '라주제'] },
      posts: [],
      from: '2026-08-25',
      days: 4,
    })
    ok(fc.length === 4, `이레치를 미리 계산한다 — ${fc.length}일`)
    ok(fc[0].date === '2026-08-25' && fc[3].date === '2026-08-28', '날짜가 하루씩 늘어난다', fc.map((f) => f.date).join())
    // **매일 달라져야 한다** — 예정이 같은 조합만 늘어놓으면 볼 이유가 없다
    // **매일 달라져야 한다.** 축이 주제 하나뿐이므로(2026-08-28) 담은 주제 수만큼 돌아간다
    ok(new Set(fc.map((f) => f.topic)).size === 4, '주제가 날마다 다르다', fc.map((f) => f.topic).join())
    // 같은 입력이면 같은 답 — 화면을 새로고침할 때마다 예정이 바뀌면 못 믿는다
    ok(
      JSON.stringify(forecastAutoDrafts({ plan: { topics: ['가주제', '나주제', '다주제', '라주제'] }, posts: [], from: '2026-08-25', days: 4 })) === JSON.stringify(fc),
      '새로고침해도 같은 예정이 나온다'
    )
    ok(forecastAutoDrafts({ plan: { off: true }, posts: [], from: '2026-08-25', days: 4 }).length === 0, '꺼두면 예정도 없다')
    ok(forecastAutoDrafts({ plan: {}, posts: [], from: '엉뚱한날짜', days: 4 }).length === 0, '날짜가 이상하면 터지지 않는다')

    /*
     * ── 지난 기록과 **회원이 채워 둔 앞날**을 한 목록으로 ──────────
     *
     * 회원 지적 (2026-08-25): "나는 하루씩만 설정하고 싶다고. 근데 왜 자꾸 그 후의 일정까지
     * 설정되게 하는거야!" — 그래서 앞날은 **채운 날만** 넣는다. 계산한 예정은 넣지 않는다.
     */
    const PLANNED = [{ date: '2026-08-26', topic: '채운주제' }]
    const rows = autoDraftDays({
      runs: [
        { date: '2026-08-24', ok: true, keyword: 'A', topic: '가', score: 98, postId: 'p1' },
        { date: '2026-08-23', ok: false, keyword: 'B', topic: '나', error: '글을 쓰지 못했습니다' },
      ],
      planned: PLANNED,
      today: '2026-08-25',
    })
    ok(rows[0].date === '2026-08-26' && rows[rows.length - 1].date === '2026-08-23', '최신이 위로 온다', rows.map((r) => r.date).join())
    ok(rows.find((r) => r.date === '2026-08-24')?.score === 98, '지난 것에는 점수가 붙는다')
    ok(rows.find((r) => r.date === '2026-08-23')?.error?.includes('쓰지 못했습니다'), '실패한 날은 이유가 붙는다')
    ok(rows.find((r) => r.date === '2026-08-26')?.when === 'upcoming', '채워 둔 앞날은 예정')
    // 회원이 정하지 않은 날은 목록에 없다 — 있으면 「그 후 일정까지 설정됐다」로 읽힌다
    ok(!rows.some((r) => ['2026-08-27', '2026-08-28', '2026-08-29'].includes(r.date)),
      '채우지 않은 앞날은 목록에 없다', rows.map((r) => r.date).join())
    /*
     * **채워 둔 앞날에는 키워드도 붙는다** (2026-08-26 회원 요청: "키워드도 보이게 해줘").
     * 그 날 아침에 정해지지만 규칙이 있어 미리 셀 수 있다 — `plannedAssignments` 가 센다.
     * 넘겨준 것이 없으면 없다 (지어내지 않는다).
     */
    ok(rows.find((r) => r.date === '2026-08-26')?.keyword === undefined, '넘겨준 키워드가 없으면 비워 둔다')
    const withKw = autoDraftDays({
      runs: [],
      planned: [{ date: '2026-08-26', topic: '채운주제', keyword: '쌍용동헬스장' }],
      today: '2026-08-26',
    })
    ok(withKw[0].keyword === '쌍용동헬스장', '넘겨준 키워드는 그대로 붙는다', withKw[0].keyword)

    /*
     * **여러 날을 채워 뒀으면 날마다 다른 키워드가 나와야 한다.** 앞의 날이 쓰인 셈 치고
     * 다음 날을 세지 않으면 채운 날 전부에 같은 키워드가 붙는다.
     */
    const { plannedAssignments } = require(`${OUT}/writing/autodraft.js`)
    const three = plannedAssignments({
      plan: { keywords: ['가키워드', '나키워드', '다키워드'], topics: ['가주제', '나주제', '다주제'], days: [
        { date: '2026-08-27', topic: '가주제' },
        { date: '2026-08-28', topic: '나주제' },
        { date: '2026-08-29', topic: '다주제' },
      ] },
      posts: [],
      from: '2026-08-26',
    })
    ok(three.length === 3 && three.every((d) => d.topic), '채워 둔 날마다 주제를 센다', JSON.stringify(three))
    // 자동 초안은 지역 키워드를 쓰지 않는다 (2026-08-28) — 화면도 그 칸을 비워 둔다
    ok(three.every((d) => !d.keyword), '지역 키워드 칸은 비어 있다', JSON.stringify(three.map((d) => d.keyword)))
    ok(three.map((d) => d.topic).join() === '가주제,나주제,다주제', '주제는 회원이 채운 것 그대로다')
    // 지난 날짜로 채워 둔 것과 쉬는 날은 세지 않는다
    const skipped = plannedAssignments({
      plan: { keywords: ['가키워드'], topics: ['가주제'], skip: ['2026-08-27'], days: [
        { date: '2026-08-20', topic: '옛날' },
        { date: '2026-08-27', topic: '쉬는날' },
        { date: '2026-08-28', topic: '쓰는날' },
      ] },
      posts: [], from: '2026-08-26',
    })
    ok(skipped.map((d) => d.date).join() === '2026-08-28', '지난 날짜와 쉬는 날은 빼고 센다', skipped.map((d) => d.date).join())
    // 꺼두면 키워드를 세지 않는다 (그 날 안 쓰므로 거짓말이 된다)
    ok(
      plannedAssignments({ plan: { off: true, days: [{ date: '2026-08-27', topic: '가' }] }, posts: [], from: '2026-08-26' })
        .every((d) => d.keyword === undefined),
      '꺼두면 키워드를 세지 않는다'
    )
    // 지나간 날짜로 채워 둔 것이 남아 있어도 「앞으로 쓸 것」이라고 하지 않는다
    ok(!autoDraftDays({ runs: [], planned: [{ date: '2026-08-01', topic: '옛날' }], today: '2026-08-25' }).length,
      '지난 날짜로 채워 둔 것은 앞날에 넣지 않는다')

    /*
     * **이미 기록이 있는 날은 앞날에서 뺀다.** 같은 날이 두 줄이면 어느 쪽이 맞는지 알 수 없다.
     */
    const dup = autoDraftDays({
      runs: [{ date: '2026-08-25', ok: true, keyword: 'A', topic: '가' }],
      planned: [{ date: '2026-08-25', topic: '채운주제' }],
      today: '2026-08-25',
    })
    ok(dup.filter((r) => r.date === '2026-08-25').length === 1, '같은 날이 두 줄이 되지 않는다')
    ok(dup.find((r) => r.date === '2026-08-25')?.ok === true, '기록이 있으면 기록 쪽을 쓴다')

    /*
     * **하루에 여러 번 돌 수 있다** (실패하고 손으로 다시 누르는 등). 그 날을 대표하는 것은
     * 성공한 실행이다 — 실패 줄만 보이면 실제로는 글이 있는데 없는 줄 안다.
     */
    const twice = autoDraftDays({
      runs: [
        { date: '2026-08-24', ok: false, keyword: 'A', topic: '가', error: '실패' },
        { date: '2026-08-24', ok: true, keyword: 'A', topic: '가', score: 98 },
      ],
      planned: [],
      today: '2026-08-25',
    })
    ok(twice.length === 1 && twice[0].ok === true, '한 날에 성공과 실패가 섞이면 성공을 보여준다')

    /*
     * **날짜는 회원이, 주제는 앱이** (2026-08-25 회원 요청 두 가지를 같이 지킨다).
     *
     *   · "내가 주제 계속 확정하는거 아니라 했잖아. 근데 왜 또 주제 고르라고 나오는거야."
     *   · "지금 저장된 설정에서 날짜가 있어서 같은 주제로 매일 돌지 않게 해줘야해.
     *      그럴려면 날짜 선택하는게 있어야해."
     *
     * 서로 어긋난 요구로 보였지만 아니다 — **누가 주제를 정하느냐**만 다르다. 회원은
     * 날짜를 고르고, 주제는 로테이션이 채운다.
     */
    const PLAN = { keywords: ['가키워드', '나키워드'], topics: ['한가지주제'] }
    // 주제가 하나뿐이면 로테이션은 매일 그것을 낸다 (이게 회원이 겪은 상황이다)
    const sameEveryDay = forecastAutoDrafts({ plan: PLAN, posts: [], from: '2026-08-25', days: 3 })
    ok(sameEveryDay.every((f) => f.topic === '한가지주제'), '주제가 하나면 매일 같은 주제가 나온다 (그래서 화면이 경고한다)')

    // 몇 개만 담으면 날마다 다른 주제가 나온다 — 회원이 원한 것이 이것이다
    const varied = forecastAutoDrafts({
      plan: { keywords: ['가키워드'], topics: ['가주제', '나주제', '다주제'] },
      posts: [], from: '2026-08-25', days: 3,
    })
    ok(new Set(varied.map((f) => f.topic)).size === 3, '주제를 여럿 담으면 날마다 다른 주제가 나온다', varied.map((f) => f.topic).join())

    /*
     * **날짜만 고르면 앱이 채운다** (fillDays). 회원이 적거나 고르는 것이 아니므로 「주제
     * 고르라고 나온다」로 돌아가지 않는다.
     */
    const MANY = { keywords: ['가키워드'], topics: ['가주제', '나주제', '다주제', '라주제'] }
    const filled = fillDays({ plan: MANY, posts: [], from: '2026-08-26', days: 4 })
    ok(filled.length === 4, '고른 날 수만큼 채운다', String(filled.length))
    ok(filled[0].date === '2026-08-26', '고른 날짜부터 채운다', filled[0].date)
    ok(new Set(filled.map((d) => d.topic)).size === 4, '날마다 다른 주제를 채운다', filled.map((d) => d.topic).join())
    ok(filled.every((d) => d.topic && !('keyword' in d)), '주제만 채운다 — 키워드는 ①에서 돈다')
    /*
     * **하루만 채울 수 있어야 한다** (2026-08-25 회원 지적: "최소가 3일치네. 난 선택한 날
     * 하루면 돼"). 처음에 고를 수 있는 값을 3·5·7·14·30 으로 둔 것이 잘못이다 — 가장 흔한
     * 일(그 날 하루만 정하기)이 아예 안 됐다.
     */
    const oneDay = fillDays({ plan: MANY, posts: [], from: '2026-08-26', days: 1 })
    ok(oneDay.length === 1 && oneDay[0].date === '2026-08-26', '고른 날 하루만 채울 수 있다', JSON.stringify(oneDay))
    // 이미 채워 둔 날이 있어도 새로 계산한다 — 옛 값을 베끼면 「다시 채우기」가 안 듣는다
    const refilled = fillDays({
      plan: { ...MANY, days: [{ date: '2026-08-26', topic: '엉뚱한옛주제' }] },
      posts: [], from: '2026-08-26', days: 2,
    })
    ok(!refilled.some((d) => d.topic === '엉뚱한옛주제'), '다시 채우면 옛 값을 베끼지 않는다', JSON.stringify(refilled))
    // 쉬는 날은 채우지 않는다 (그 날은 애초에 안 쓴다)
    ok(!fillDays({ plan: { ...MANY, skip: ['2026-08-27'] }, posts: [], from: '2026-08-26', days: 3 })
      .some((d) => d.date === '2026-08-27'), '쉬는 날은 채우지 않는다')

    /*
     * **채워 둔 날은 로테이션보다 우선한다** — 안 그러면 채운 의미가 없다. 다만 키워드는
     * 여기서도 로테이션이 고른다 (회원에게 두 번 묻지 않는다).
     */
    const withDay = { ...PLAN, days: [{ date: '2026-08-26', topic: '그날만다른주제' }] }
    const fixedDay = planAssignment({ plan: withDay, posts: [], date: '2026-08-26' })
    ok(fixedDay?.topic === '그날만다른주제', '채워 둔 날은 그 주제를 쓴다', fixedDay?.topic)
    ok(fixedDay.localKeyword === '', '지역 키워드는 안 고른다 (2026-08-28)', fixedDay.localKeyword)
    ok(fixedDay.mainKeyword === '그날만다른주제', '채워 둔 날도 메인은 주제다', fixedDay.mainKeyword)
    /*
     * ── 안 채운 날은 쉰다 (2026-08-31 회원 지적) ──────────────────
     *
     * 회원: "근데 애초에 그날 하루 주제 설정한건데 멋대로 다음날 까지 간게 이상한거 아니야?"
     *
     * 맞는 말이다. 회원은 ③ 날짜별 주제를 08-30 까지만 채웠는데 08-31 에도 세 편이 나갔다.
     * 그때까지 규칙은 「안 채운 날은 ① 목록에서 골라 매일」이었다 — 날짜를 정하는 행동은
     * 「그 날만 쓴다」로 읽히는데 우리는 「그 날 주제만 정한다」로 만들어 뒀다.
     */
    ok(planAssignment({ plan: withDay, posts: [], date: '2026-08-27' }) === null,
      '날짜를 채워 뒀으면 안 채운 날은 쉰다')
    // 날짜를 한 번도 안 채운 회원에게서 매일 초안을 뺏지는 않는다
    ok(planAssignment({ plan: PLAN, posts: [], date: '2026-08-27' })?.topic === '한가지주제',
      '채워 둔 날이 하나도 없으면 예전처럼 매일 쓴다')
    // 명시로 뒤집을 수 있다 — 조용히 바뀌는 규칙은 또 놀람이 된다
    ok(planAssignment({ plan: { ...withDay, everyDay: true }, posts: [], date: '2026-08-27' })?.topic === '한가지주제',
      '「매일 쓰기」를 켜면 안 채운 날에도 쓴다')
    ok(planAssignment({ plan: { ...PLAN, everyDay: false }, posts: [], date: '2026-08-27' }) === null,
      '「매일 쓰기」를 끄면 채워 둔 날이 없어도 안 쓴다')
    ok(writesEveryDay(withDay) === false && writesEveryDay(PLAN) === true, '어느 쪽인지 한 함수가 답한다')
    /*
     * **채우기 계산은 이 규칙에 걸리면 안 된다.** fillDays 는 날짜를 비우고 앞날을
     * 계산하는데, 그 상태로 「정한 날에만」을 적용하면 아무것도 안 나온다 — 채우기
     * 버튼이 제 발등을 찍는다.
     */
    ok(fillDays({ plan: withDay, posts: [], from: '2026-09-01', days: 2 }).length === 2,
      '날짜 채우기는 여전히 앞날을 계산한다')
    ok(planAssignment({ plan: withDay, posts: [] })?.topic === '한가지주제', '날짜가 없으면 로테이션')
    // 예정 계산도 채워 둔 것을 반영해야 한다 (화면과 실제가 다르면 못 믿는다)
    ok(forecastAutoDrafts({ plan: withDay, posts: [], from: '2026-08-25', days: 3 })
      .find((f) => f.date === '2026-08-26')?.topic === '그날만다른주제', '예정에도 채워 둔 날이 그대로 뜬다')

    // 엉뚱한 값·키워드는 저장하지 않는다 (키워드까지 저장하면 ①과 두 곳에서 정해진다)
    const cleaned = normalizePlan({ days: [
      { date: '2026-08-26', topic: ' 가 ', keyword: 'A' },
      { date: '엉뚱', topic: '나' },
      { date: '2026-08-27' },
      { date: '2026-08-26', topic: '라' },
    ] })
    ok(!cleaned.days.some((d) => d.date === '엉뚱' || d.date === '2026-08-27'), '엉뚱한 날짜도 주제 없는 날도 남지 않는다')
    ok(cleaned.days.every((d) => !('keyword' in d)), '키워드는 저장하지 않는다')
    /*
     * **하루에 여러 줄이 남는다** (2026-08-28 회원 요청: "하루에 여러편 작성할 수 있게해줘").
     * 예전에는 날짜를 열쇠로 덮어써서 하루 한 줄만 남았다 — 그러면 두 편을 채워 둬도 한 편만
     * 남는다. 이제 **날짜 + 주제**로 본다: 같은 날 같은 주제만 겹치지 않게 한다.
     */
    ok(cleaned.days.length === 2, '같은 날 다른 주제는 둘 다 남는다', JSON.stringify(cleaned.days))
    ok(cleaned.days.map((d) => d.topic).join() === '가,라', '적어 넣은 순서를 지킨다', JSON.stringify(cleaned.days))
    const sameTwice = normalizePlan({ days: [{ date: '2026-08-26', topic: '가' }, { date: '2026-08-26', topic: '가' }] })
    ok(sameTwice.days.length === 1, '같은 날 같은 주제는 한 번만 남긴다')

    /*
     * **「다른 주제로」는 앱이 다음 것을 준다** — 목록을 열어 고르게 하면 결국 회원이 확정하는
     * 것으로 돌아간다. 다른 날에 이미 쓴 주제는 건너뛴다 (안 그러면 옆날과 겹친다).
     */
    const before = { keywords: ['가키워드'], topics: ['가주제', '나주제', '다주제'],
      days: [{ date: '2026-08-26', topic: '가주제' }, { date: '2026-08-27', topic: '나주제' }] }
    const rolled = rerollTopic(before, '2026-08-26')
    const rolledTopic = rolled.days.find((d) => d.date === '2026-08-26').topic
    ok(rolledTopic !== '가주제', '누르면 그 날 주제가 바뀐다', rolledTopic)
    ok(rolledTopic !== '나주제', '옆날에 쓴 주제는 피한다', rolledTopic)
    ok(rolled.days.find((d) => d.date === '2026-08-27').topic === '나주제', '다른 날은 건드리지 않는다')
    /*
     * 채워 둔 날이 없으면 바꿀 것도 없다 (2026-08-28: 어느 줄인지 못 찾으면 그대로 둔다).
     * 담은 주제가 하나도 없어도 기본 목록에서 고른다.
     */
    ok(rerollTopic({ topics: [] }, '2026-08-26').days.length === 0, '채워 둔 날이 없으면 아무 일도 안 한다')
    const rolledDefault = rerollTopic({ topics: [], days: [{ date: '2026-08-26', topic: TOPICS[0] }] }, '2026-08-26')
    ok(rolledDefault.days[0].topic !== TOPICS[0] && TOPICS.includes(rolledDefault.days[0].topic),
      '담은 주제가 없으면 기본 주제에서 준다', rolledDefault.days[0].topic)

    /*
     * **하루 여러 편이면 어느 줄인지 알려줘야 한다** (2026-08-28 회원 요청: "하루에 여러편
     * 작성할 수 있게해줘"). 날짜만 주면 첫 줄이 바뀌어 회원이 누른 줄과 다른 줄이 바뀐다.
     */
    const twoRows = { topics: ['가주제', '나주제', '다주제', '라주제'],
      days: [{ date: '2026-08-26', topic: '가주제' }, { date: '2026-08-26', topic: '나주제' }] }
    const rolledSecond = rerollTopic(twoRows, '2026-08-26', '나주제')
    ok(rolledSecond.days.length === 2, '줄 수는 그대로다', JSON.stringify(rolledSecond.days))
    ok(rolledSecond.days.some((d) => d.topic === '가주제'), '누르지 않은 줄은 그대로 둔다')
    ok(!rolledSecond.days.some((d) => d.topic === '나주제'), '누른 줄만 바뀐다')
    // 같은 날 다른 줄과 겹치면 그날 똑같은 글이 두 편 나온다
    ok(new Set(rolledSecond.days.map((d) => d.topic)).size === 2, '같은 날 다른 줄과 겹치지 않는다')
    /*
     * **담은 주제가 하나뿐이면 바꿀 것이 없다** — 눌러도 그대로다. 화면이 그렇다고 말해야
     * 한다 (조용히 아무 일도 안 하면 버튼이 고장 난 줄 안다). 실제로 회원 설정이 그랬다.
     */
    const stuck = rerollTopic({ topics: ['하나뿐'], days: [{ date: '2026-08-26', topic: '하나뿐' }] }, '2026-08-26')
    ok(stuck.days.find((d) => d.date === '2026-08-26').topic === '하나뿐', '주제가 하나뿐이면 바꿀 것이 없다')

    /*
     * **삭제** (2026-08-24 회원 요청: 날짜별 목록에 "이거 삭제기능 만들어줘").
     *
     * 앞날과 지난 날은 지우는 뜻이 다르다:
     *   · 예정 줄은 **계산해서 만든 것**이라 지울 실체가 없다 — 지워도 다음에 다시 생긴다.
     *     그래서 「이 날은 쓰지 않는다」고 적어 둔다 (skip)
     *   · 지난 줄은 실행 기록이라 진짜로 지운다 (글은 그대로 둔다)
     */
    const skipPlan = { keywords: ['가키워드'], topics: ['가주제'], skip: ['2026-08-26'] }
    ok(!planAssignment({ plan: skipPlan, posts: [], date: '2026-08-26' }), '건너뛴 날은 아무것도 쓰지 않는다')
    ok(planAssignment({ plan: skipPlan, posts: [], date: '2026-08-27' }), '다른 날은 그대로 쓴다')

    /*
     * **건너뛴 날은 세지 않는다.** 이레를 보여달라고 했으면 「쓰는 날」 이레여야 한다 —
     * 건너뛴 날을 채워 넣으면 볼 수 있는 앞날이 그만큼 줄어든다.
     */
    const fcSkip = forecastAutoDrafts({ plan: skipPlan, posts: [], from: '2026-08-25', days: 3 })
    ok(fcSkip.length === 3, `건너뛰어도 이레는 이레 — ${fcSkip.length}일`)
    ok(!fcSkip.some((f) => f.date === '2026-08-26'), '건너뛴 날은 예정에 없다', fcSkip.map((f) => f.date).join())
    ok(fcSkip.map((f) => f.date).join() === '2026-08-25,2026-08-27,2026-08-28', '그만큼 뒤를 더 본다', fcSkip.map((f) => f.date).join())

    ok(normalizePlan({ skip: ['2026-08-26', '2026-08-26', '엉뚱', ''] }).skip.length === 1, '엉뚱한 날짜·중복은 버린다')
    ok(planSummary({ skip: ['2026-08-26'] }).includes('건너뛰는 날 1일'), '요약에도 쉬는 날을 밝힌다')

    // 화면이 실제로 이 목록을 그린다
    const { readFileSync: rf } = require('node:fs')
    const page = rf(new URL('../app/autodraft/page.tsx', import.meta.url), 'utf8')
    ok(page.includes('autoDraftDays'), '자동 작성 화면이 날짜별 목록을 만든다')
    /*
     * **화면이 앞날을 계산해 그리지 않는다** (2026-08-25 회원 지적: "나는 하루씩만 설정하고
     * 싶다고. 근데 왜 자꾸 그 후의 일정까지 설정되게 하는거야!").
     */
    const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!pageCode.includes('forecastAutoDrafts'), '정하지 않은 앞날을 계산해 그리지 않는다')
    ok(/planned/.test(pageCode), '앞날은 회원이 채워 둔 날에서만 온다')
    // 화면·크론이 UTC 로 오늘을 세면 하루씩 밀린다 (2026-08-26)
    ok(pageCode.includes('seoulToday()') && !pageCode.includes('toISOString().slice(0, 10)'), '화면이 한국 날짜로 오늘을 센다')
    /*
     * **쉬는 날과 채운 날이 겹치면 안 보여준다** (2026-08-26). 화면에 08/26 이 「삭제함 — 이
     * 날은 쓰지 않습니다」와 「미리 채워둠」으로 동시에 떴다. 크론은 쉬는 날을 먼저 보므로
     * 그 날은 실제로 안 쓴다 — 「채워뒀다」고 적어두면 거짓말이다.
     */
    ok(pageCode.includes('plannedAssignments'), '쉬기로 한 날·지난 날짜는 plannedAssignments 가 걸러 준다')
    ok(page.includes('날짜별 목록'), '그 이름으로 보여준다')
    const dayUi = rf(new URL('../app/autodraft/DayList.tsx', import.meta.url), 'utf8')
    const cronDraft = rf(new URL('../app/api/cron/draft/route.ts', import.meta.url), 'utf8')
    // 크론이 UTC 로 오늘을 세면 회원 화면의 날짜가 매일 하루씩 밀린다 (2026-08-26)
    const cronNoComment = cronDraft.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(cronNoComment.includes('seoulToday()') && !/const today = new Date\(\)\.toISOString/.test(cronNoComment),
      '크론도 한국 날짜로 적는다')

    /*
     * **날짜를 고르는 칸은 있고, 주제를 고르는 칸은 없다** (2026-08-25 회원 요청 두 가지).
     *
     *   · "내가 주제 계속 확정하는거 아니라 했잖아. 근데 왜 또 주제 고르라고 나오는거야."
     *   · "날짜 선택하는게 있어야해."
     *
     * 이 두 줄이 같은 화면에서 동시에 지켜지는지 여기서 확인한다. 한쪽만 지키면 회원이 또
     * 되돌리라고 한다 — 실제로 네 번 그랬다.
     */
    const { existsSync } = require('node:fs')
    ok(!existsSync(new URL('../components/DayAssign.tsx', import.meta.url)), '주제를 고르라고 묻던 칸은 없앤 채로 둔다')
    const dayCodeAll = dayUi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!dayCodeAll.includes('DayAssign') && !dayCodeAll.includes('이 날 바꾸기'), '날짜별 목록에서 주제를 고치라고 하지 않는다')
    ok(dayUi.includes('미리 채워둠'), '미리 채운 날은 그렇게 표시한다 (설정을 바꿔도 그대로 나간다)')

    const panel = rf(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
    const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!panelCode.includes('DayAssign'), '설정 화면도 주제 고르는 칸을 다시 들이지 않는다')
    // 다시 채운 날은 쉬는 날에서 뺀다 — 두 곳에 남으면 화면이 서로 반대말을 한다 (2026-08-26)
    ok(/skip: \(p\.skip \?\? \[\]\)\.filter/.test(panelCode), '다시 채운 날은 쉬는 날에서 뺀다 (나중에 한 일이 이긴다)')

    // ① 날짜를 고르는 자리가 있다 (회원이 「왜 또 날짜 선택하는게 없어」라고 한 자리)
    ok(/type="date"/.test(panelCode) && panelCode.includes('언제부터'), '언제부터 채울지 날짜를 고른다')
    ok(panelCode.includes('이 날 주제 채우기'), '고른 날 하나를 채운다')
    /*
     * **한 번에 하루만** (2026-08-25 회원 지적: "나는 하루씩만 설정하고 싶다고. 근데 왜 자꾸
     * 그 후의 일정까지 설정되게 하는거야!"). 며칠치를 고르는 칸이 있으면 또 여러 날이 잡힌다.
     */
    ok(!panelCode.includes('며칠치') && !/fillCount/.test(panelCode), '며칠치를 고르는 칸이 없다')
    /*
     * 2026-08-28: 하루 편수만큼 채운다. **날짜는 여전히 하나다** — 「며칠치」 칸은 없다.
     * 두 편으로 정해 놓고 한 줄만 채우면 나머지 한 편은 그날 아침 로테이션이 아무거나 고른다.
     */
    ok(/count: perDayOf\(plan\)/.test(panelCode), '채우기는 고른 날 하루에 편수만큼 보낸다')
    ok(panelCode.includes('min={today}'), '지난 날짜는 고르지 못하게 한다')
    ok(panelCode.includes("fetch('/api/autodraft/fill'"), '주제는 서버 로테이션이 채운다 (화면이 지어내지 않는다)')

    // ② 그런데 주제를 적거나 고르라고는 하지 않는다
    ok(panel.includes('한 번에 고른 날 하루만 채웁니다') && panel.includes('주제는 앱이 넣으니'),
      '한 번에 하루만 채운다는 것과, 주제는 앱이 넣는다는 것을 밝힌다')
    /*
     * **문구를 뒤집었다** (2026-08-31 회원: "나는 31일날 자동작성 설정한적이 없는데
     * 자동설정 되어 있어"). 예전에는 「채우지 않은 날은 잡히지 않습니다」로 시작했는데,
     * 그 앞 반절이 「그 날은 안 쓴다」로 읽혔다. 실제로는 켜 두면 매일 쓴다.
     */
    ok(panel.includes('지금은 <b>매일 씁니다.</b>') && panel.includes('정해 둔 날에만 씁니다.'),
      '지금 어느 쪽으로 도는지 그 자리에서 말한다')
    ok(panelCode.includes('rerollTopic') && panelCode.includes('다른 주제로'), '마음에 안 들면 앱이 다른 것으로 바꿔준다')
    ok(panel.includes('바꿀 것이 없습니다'), '바꿀 주제가 없으면 그렇다고 말한다 (조용히 안 바뀌면 고장으로 읽힌다)')
    /*
     * ③ 칸 안에 주제를 고르는 입력이 섞이면 도로 「주제 고르라고 나온다」가 된다. ② 칸의
     * 탐색기와 섞이지 않게 ③ 구간만 잘라서 본다.
     */
    const thirdAt = panelCode.indexOf('③ 날짜별 주제')
    const third = thirdAt < 0 ? '' : panelCode.slice(thirdAt, panelCode.indexOf('</section>', thirdAt))
    ok(third.length > 200, '③ 칸을 찾았다', String(third.length))
    ok(!third.includes('TopicExplorer') && !/setTopic|placeholder=/.test(third), '③ 칸에는 주제를 적거나 고르는 자리가 없다')

    ok(panel.includes("save({ off: false, keywords: [], topics: [], days: [], skip: [] })"), '「전부 지우고 자동으로」가 채운 날짜까지 지운다')
    ok(/a\.days \?\? \[\]/.test(panel), '채운 날짜도 저장 여부 비교에 넣는다')
    // 회원이 「지금 저장된 설정에서 날짜가 있어서」라고 한 그 줄
    ok(/<dt[^>]*>날짜<\/dt>/.test(panel), '저장된 설정에 날짜 줄이 있다')

    /*
     * **누가 정하는지 화면이 말해줘야 한다.** 안 그러면 「그래서 내일 주제는 누가 정하지」를
     * 회원이 짐작해야 한다 — 짐작하게 두면 또 확정하려고 든다.
     */
    ok(panel.includes('어느 날 어느 주제를 쓸지는 앱이 정합니다'), '주제는 앱이 고른다고 밝힌다')
    // 하나만 담으면 매일 같은 주제다 — 규칙을 아는 사람만 알 수 있게 두면 안 된다
    ok(panel.includes('날마다 똑같은 주제'), '담은 주제가 모자라면 그 자리에서 말해준다')

    // 채우기 라우트는 계산만 한다 — 여기서 저장하면 고치던 다른 값이 덮인다
    const fillApi = rf(new URL('../app/api/autodraft/fill/route.ts', import.meta.url), 'utf8')
    ok(fillApi.includes('fillDays') && !fillApi.includes('mutate('), '채우기는 계산만 하고 저장은 「설정 저장」이 한다')
    /*
     * **「삭제」라고 부른다** (2026-08-24 회원 지적: "이날 안쓰기 누르면 삭제는 되는데 잘
     * 표시가 나지 않아. 그냥 삭제로 버튼 바꿔주고 삭제하겠습니까? 물어서 삭제될 수 있게").
     *
     * 「이 날 안 쓰기」는 무슨 일이 일어나는지 설명하는 말이라 버튼처럼 안 읽혔다.
     * 실제로 하는 일은 그 줄을 지우는 것이므로 그대로 「삭제」라고 쓴다.
     */
    // 주석은 빼고 본다 — 「예전엔 이 날 안 쓰기였다」는 설명까지 걸리면 안 된다
    const dayCode = dayUi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!dayCode.includes('이 날 안 쓰기'), '설명하는 말 대신 「삭제」로 부른다')
    ok(dayUi.includes('skipDay') && /삭제할까요\?/.test(dayUi), '누르기 전에 물어본다')
    ok(/되돌릴 수 있습니다/.test(dayUi), '되돌릴 수 있다는 것도 함께 말한다')
    // 지운 것처럼 사라지면 「내가 뺐나 원래 없었나」를 구별할 수 없고 되돌릴 수도 없다
    ok(dayUi.includes('삭제함 — 이 날은 쓰지 않습니다') && dayUi.includes('다시 쓰기'), '삭제한 날을 남겨 두고 되돌릴 수 있다')

    /*
     * **앞날은 회원이 채운 것만, 그리고 접어 둔다** (2026-08-25).
     *
     * 회원이 세 번 지우려 했고("엥? 25일부터 다시 생겼는데?"), 끝내 화를 냈다 — "나는
     * 하루씩만 설정하고 싶다고. 근데 왜 자꾸 그 후의 일정까지 설정되게 하는거야!"
     *
     * 계산한 예정 줄을 「참고용」이라고 적어 둬도 **줄로 서 있으면 정해진 일정으로 읽힌다.**
     * 이제 여기 있는 앞날 줄은 전부 회원이 채운 것이고, 그마저 접어 둔다.
     */
    ok(/const written = days\.filter/.test(dayUi) && /const upcoming = days\.filter/.test(dayUi),
      '쓴 것과 앞으로 쓸 것을 가른다')
    ok(/<details[\s\S]{0,400}채워 두신 앞날/.test(dayUi), '채워 둔 앞날은 접어 둔다')
    ok(!dayCode.includes('앞으로 쓸 예정'), '정하지 않은 날을 「예정」이라고 부르지 않는다')
    ok(dayUi.includes('아직 안 쓴 것입니다'), '앞날이 기록이 아니라는 것을 밝힌다')
    ok(dayUi.includes('아직 쓴 글이 없습니다'), '쓴 것이 없으면 그렇게 말한다 (빈 화면을 남기지 않는다)')
    /*
     * 2026-08-28: 자동 초안이 지역 키워드를 안 쓰게 되면서(회원: "아예 이 칸을 없앨래")
     * 「지금 설정이면 이 키워드가 나갑니다」가 말할 것이 없어졌다. 앞날 줄이 밝혀야 하는
     * 것은 이제 **그 주제가 곧 제목을 연다**는 사실이다.
     */
    ok(dayUi.includes('이 주제가 그대로 제목을 엽니다'), '앞날 주제가 곧 메인 키워드라는 것을 밝힌다')
    ok(pageCode.includes('plannedAssignments'), '화면이 채워 둔 날의 키워드를 센다')
    const autoPage = rf(new URL('../app/autodraft/page.tsx', import.meta.url), 'utf8')
    ok(autoPage.includes('채우지 않은 날은 여기 나오지 않습니다'), '카드 설명도 같은 말을 한다')
    ok(dayUi.includes("'/api/autodraft/runs'") && /기록을 삭제할까요/.test(dayUi), '지난 기록도 물어보고 지운다')
    ok((dayUi.match(/>\s*삭제\s*</g) ?? []).length >= 2, '예정과 지난 기록 둘 다 같은 이름의 버튼을 쓴다')
    // 기록만 정리하려다 글이 날아가면 안 된다
    const runsApi = rf(new URL('../app/api/autodraft/runs/route.ts', import.meta.url), 'utf8')
    ok(!runsApi.includes('d.posts'), '기록을 지울 때 글은 건드리지 않는다')
    ok(dayUi.includes('그날 쓴 글은 지워지지 않습니다'), '무엇이 지워지는지 미리 말해준다')
    // 건너뛴 날을 실패로 기록하면 화면에 빨간 줄이 뜨고 알림까지 나간다
    ok(/skip\?\.includes\(today\)/.test(cronDraft) && /건너뛰기로 정해두셨습니다/.test(cronDraft),
      '크론이 건너뛴 날을 실패로 적지 않는다')
    /*
     * ── 검수까지 마치고 저장한다 (2026-08-26 회원 요청) ──────────
     *
     * "새벽에 자동 글 작성하는거 검수까지 마칠 수 있게 해줘."
     *
     * 여태 고쳐 쓰기를 딱 한 번만 돌려서, 한 번에 안 붙으면 79점짜리가 그대로 저장됐다.
     * 이제 나아지는 동안은 계속 돌리되 **울타리 셋**을 친다 — 횟수·시간·나아짐.
     */
    /*
     * ── 날짜는 한국 시간으로 센다 (2026-08-26 회원 지적) ───────────
     *
     * "8/26일이면 채워두신 앞날이 아니라 이미 쓰여진게 정상인거 아니야?"
     *
     * 맞다. 크론은 20:00 UTC 에 도는데 한국에서는 **다음 날 새벽 5시**다. 날짜를 UTC 로
     * 세니 「8월 26일 새벽에 쓴 글」이 08/25 로 적히고, 08/26 은 「앞날」에 남았다.
     */
    const { seoulDay, seoulToday } = require(`${OUT}/writing/autodraft.js`)
    ok(seoulDay('2026-08-25T20:16:18.229Z') === '2026-08-26', '20:16 UTC 는 한국에서 다음 날이다', seoulDay('2026-08-25T20:16:18.229Z'))
    ok(seoulDay('2026-08-26T14:59:00.000Z') === '2026-08-26', '14:59 UTC 는 아직 같은 날 (23:59 KST)', seoulDay('2026-08-26T14:59:00.000Z'))
    ok(seoulDay('2026-08-26T15:00:00.000Z') === '2026-08-27', '15:00 UTC 부터 다음 날 (00:00 KST)', seoulDay('2026-08-26T15:00:00.000Z'))
    ok(seoulDay('엉뚱') === '' && seoulDay(undefined) === '', '읽을 수 없으면 빈 값 (조용히 오늘로 만들지 않는다)')
    ok(/^\d{4}-\d{2}-\d{2}$/.test(seoulToday()), '오늘도 같은 꼴로 낸다', seoulToday())

    /*
     * **저장된 옛 기록도 제자리로 온다.** `date` 는 UTC 로 적혀 있지만 `at` 에 정확한 시각이
     * 있으므로 거기서 한국 날짜를 다시 뽑는다 — 데이터를 손대지 않고 지난 목록까지 고쳐진다.
     * 회원 화면에 실제로 있던 값으로 잰다.
     */
    const shifted = autoDraftDays({
      runs: [{ date: '2026-08-25', at: '2026-08-25T20:16:18.229Z', ok: true, keyword: '쌍용동헬스장', topic: '다이어트간식', score: 79 }],
      planned: [{ date: '2026-08-26', topic: '다이어트간식' }],
      today: '2026-08-26',
    })
    ok(shifted[0].date === '2026-08-26', '새벽에 쓴 글은 그 날(한국 날짜)로 올라온다', shifted[0].date)
    ok(shifted[0].when === 'today' && shifted[0].ok === true, '오늘 이미 쓴 것으로 보인다', shifted[0].when)
    ok(shifted.length === 1, '같은 날이 「쓴 것」과 「앞날」로 두 줄이 되지 않는다', String(shifted.length))
    // at 이 없거나 이상하면 적힌 날짜를 쓴다 (옛 기록을 잃지 않는다)
    ok(autoDraftDays({ runs: [{ date: '2026-08-20', ok: true }], planned: [], today: '2026-08-26' })[0].date === '2026-08-20',
      'at 이 없으면 적힌 날짜를 쓴다')

    const { shouldRevise, REVISE_MAX_ROUNDS } = require(`${OUT}/writing/autodraft.js`)
    const R = (over = {}) => shouldRevise({ round: 0, needsRevise: true, short: false, elapsedMs: 60_000, lastCallMs: 40_000, improved: true, ...over })
    ok(R(), '아직 발행선 아래면 고쳐 쓴다')
    ok(!R({ needsRevise: false }), '발행선을 넘었으면 그만둔다')
    ok(R({ needsRevise: false, short: true }), '분량이 모자라면 점수와 무관하게 고쳐 쓴다')
    ok(R({ round: 1 }) && R({ round: REVISE_MAX_ROUNDS - 1 }), '한 번으로 끝내지 않는다 (예전에는 한 번뿐이었다)')
    ok(!R({ round: REVISE_MAX_ROUNDS }), `${REVISE_MAX_ROUNDS}번까지만 — AI 호출은 값이 든다`)
    // 제자리면 그만둔다 — 같은 것을 또 물어도 같은 답이 온다
    ok(!R({ round: 1, improved: false }), '안 나아졌으면 그만둔다')
    ok(R({ round: 0, improved: false }), '첫 판단은 「직전」이 없으므로 나아짐을 묻지 않는다')
    /*
     * **시간 초과가 가장 나쁘다.** 한도를 넘기면 함수가 통째로 죽어서 글이 하나도 안 남는다 —
     * 79점짜리라도 저장하는 편이 낫다.
     */
    ok(!R({ elapsedMs: 200_000, lastCallMs: 60_000 }), '한 번 더 부르면 한도를 넘길 것 같으면 멈춘다')
    ok(R({ elapsedMs: 100_000, lastCallMs: 40_000 }), '여유가 있으면 한 번 더 부른다')

    // 크론이 실제로 그렇게 돌아야 한다 — 규칙만 만들고 라우트가 안 쓰면 아무것도 안 달라진다
    const cronCode = cronDraft.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(cronCode.includes('shouldRevise'), '크론이 이 규칙으로 고쳐 쓰기를 돌린다')
    ok(/while \(\s*shouldRevise/.test(cronCode), '한 번이 아니라 될 때까지 돌린다')
    ok(/rounds\+\+/.test(cronCode), '몇 번 돌렸는지 센다')
    // 나아졌는지는 점수가 아니라 수정필요 개수로 본다 (점수는 79에 붙어 있어 제자리로 보인다)
    ok(/check\?\.fail/.test(cronCode), '남은 수정필요 개수를 본다')
    ok(/fails: best\.check\?\.fail/.test(cronCode) && /rounds,/.test(cronCode), '결과를 기록에 남긴다')
    // 화면이 그 값을 실제로 보여준다 — 아침에 손댈 것이 있는지 알아야 한다
    ok(dayUi.includes('검수 통과') && dayUi.includes('수정필요'), '목록이 검수까지 마쳤는지 보여준다')
    ok(/d\.rounds/.test(dayUi), '몇 번 고쳐 썼는지도 보여준다')

    // 이미 쓴 날에 「그 날 쉬기」를 두면 「눌렀는데 왜 글이 그대로지」가 된다
    ok(/d\.when !== 'past' && !d\.postId/.test(dayUi), '이미 쓴 날은 손대지 못하게 한다')
    ok(/planAssignment\(\{[^)]*date: today/.test(cronDraft), '크론이 그 날을 넘긴다 (안 넘기면 쉬는 날이 무시된다)')
  }

  /*
   * **덩어리 설정이 저장 후 살아 돌아와야 한다.** normalizeDB 는 목록만 옮기고 있었다 —
   * 이름을 안 적으면 저장은 성공하고 다음 읽기에서 조용히 사라진다 (이미 겪은 사고다).
   */
  const { DB_OBJECT_KEYS, normalizeDB: norm } = require(`${OUT}/store.js`)
  ok(DB_OBJECT_KEYS.includes('autoDraftPlan'), '덩어리 항목 목록에 이름이 있다')
  const back = norm({ posts: [], autoDraftPlan: { keywords: ['천안 헬스장'], topics: ['가'] } })
  ok(back.autoDraftPlan?.keywords?.[0] === '천안 헬스장', '저장한 설정이 살아 돌아온다')
  ok(norm({ posts: [] }).autoDraftPlan === undefined, '설정한 적 없으면 빈 값을 만들지 않는다 (「없음」과 구별된다)')
  ok(norm({ autoDraftPlan: [] }).autoDraftPlan === undefined, '엉뚱한 모양이면 무시한다')

  /*
   * **DB 에 목록이 아닌 항목을 만들면 반드시 여기 이름을 적어야 한다.** 이 검사가 없으면
   * 다음에 설정 덩어리를 하나 더 만들 때 같은 사고가 그대로 반복된다.
   */
  {
    const { readFileSync: rf } = require('node:fs')
    const types = rf(new URL('../lib/types.ts', import.meta.url), 'utf8')
    const block = types.match(/export interface DB \{([\s\S]*?)\n\}/)
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const objects = [...body.matchAll(/^\s*(\w+)\??:\s*([^\n]*)$/gm)]
      .filter((m) => !m[2].includes('[]'))
      .map((m) => m[1])
    const missing = objects.filter((k) => !DB_OBJECT_KEYS.includes(k))
    ok(missing.length === 0, 'DB 의 덩어리 항목이 전부 DB_OBJECT_KEYS 에 있다 (없으면 읽을 때 사라진다)', missing.join(' · '))
  }

  // 화면·크론이 실제로 이 설정을 본다 (만들어만 두고 안 쓰면 아무것도 달라지지 않는다)
  {
    const { readFileSync: rf } = require('node:fs')
    const cron = rf(new URL('../app/api/cron/draft/route.ts', import.meta.url), 'utf8')
    ok(cron.includes('planAssignment'), '크론이 회원 설정을 보고 고른다')
    ok(!cron.includes('popQueue'), '예약 칸을 지운 뒤 크론에도 흔적이 없다')
    const panel = rf(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
    ok(panel.includes('/api/autodraft/plan'), '화면이 설정을 저장한다')
    ok(panel.includes('planSummary'), '접힌 상태에서도 무엇으로 쓰는지 보여준다')
    /*
     * **회원 요청으로 뺀 것들** (2026-08-24): 예약 칸(줄 세우기), 그리고 기본 주제 칩과
     * 직접 적기 칸. 주제는 **탐색기에서 담은 것만** 쓴다 — 실제로 검색되는 것에서 고르라는
     * 것이 탐색기를 만든 이유인데, 지어낸 기본 목록을 나란히 두면 그쪽을 고르게 된다.
     */
    ok(!panel.includes('줄 세우기'), '예약 칸이 화면에서 사라졌다')
    ok(!panel.includes('주제 더하기'), '직접 적기 칸도 없앴다')
    ok(!/topicPool/.test(panel), '기본 주제 칩 목록을 나란히 두지 않는다')
    ok(panel.includes('<TopicExplorer picked=') && panel.includes('onPick={addTopic}'), '주제는 탐색기에서만 담는다')
    const api = rf(new URL('../app/api/autodraft/plan/route.ts', import.meta.url), 'utf8')
    ok(api.includes('normalizePlan'), '저장 전에 정리한다')
  }
}

console.log('\n[98] 정보글 주제 탐색기 — 지어내지 않고 재서 고른다 (2026-08-23)')
/*
 * 회원 요청: "주제도 단순히 새벽운동 어떻게 하나 이런게 아니라 실제로 다이어트나 체중증량을
 * 원하는 주제들을 리서치해서 그에 맞는 주제를 탐색하는 탐색기를 만들어서 그거중에 내가
 * 선택해서 하고 싶어."
 *
 * 기본 주제 10개는 **우리가 앉아서 지어낸 것**이다. 그럴듯해 보이지만 사람들이 실제로
 * 검색하는지 확인한 적이 없다. 그래서 씨앗만 우리가 넣고 후보는 네이버에서 가져온다.
 */
{
  const {
    TOPIC_SEEDS,
    SEED_QUERY_PER_RUN,
    classifyIntent,
    toTopic,
    rankCandidates,
    candidateWhy,
    buildCandidates,
    topicCore,
    dedupeByCore,
    dayIndex,
    rotateWindow,
    seedQueries,
    normalizePage,
  } = require(`${OUT}/writing/topic-explore.js`)

  /*
   * ─── 뜻이 같은 말은 한 줄로 묶는다 (2026-08-28 회원 요청) ──────────────
   *
   * "주제가 비슷한게 너무 많아. 예를들어 기초대사량 / 기초대사량 높이기 이런것들 사실은
   * 다 기초대사량에 관한거잖아. 이런거는 하나로만 묶어서."
   *
   * 열두 줄 중 여럿이 같은 글이 될 말이면 넘겨 봐도 볼 것이 없다.
   */
  /*
   * ─── 실제 결과를 놓고 거른다 (2026-08-28 회원 요청: "그것도 걸러줘") ───────
   *
   * 프로덕션 탐색기에서 **실제로 나온 48줄**을 받아 놓고 판정을 고정한다. 목록을 조일 때
   * 가장 무서운 것은 멀쩡한 후보까지 함께 사라지는 것이라, 지어낸 예가 아니라 나온 값으로
   * 양쪽을 다 못 박는다.
   */
  {
    // ① 파는 물건 — 우리가 파는 것이 아니고, 효과를 말하면 건강기능식품 광고가 된다
    for (const t of ['다이어트환', '탄수화물컷팅제', '체지방컷팅제', '단백질쿠키', '칼로리바다이어트'])
      ok(classifyIntent(t) === 'offlimit', `파는 물건은 뺀다 — ${t}`, classifyIntent(t))
    // ② 남의 방법론 이름 — 우리 글이 그 이름의 설명서가 된다
    for (const t of ['클렌즈다이어트', '연예인다이어트', '예신다이어트'])
      ok(classifyIntent(t) === 'offlimit', `남이 이름 붙인 방법은 뺀다 — ${t}`, classifyIntent(t))
    // ③ 우리가 다루면 위험한 몸 상태 — 잘못 말하면 사람이 다친다
    for (const t of ['임산부다이어트', '갱년기다이어트', '혈당다이어트'])
      ok(classifyIntent(t) === 'offlimit', `몸이 특수한 상태는 뺀다 — ${t}`, classifyIntent(t))
    /*
     * ④ **접미사가 없는 지명** — 회원이 이미 「매탄동운동」을 두고 지적한 것과 같은 갈래인데
     *    「동·구·시」가 없어서 새어 나왔다.
     */
    for (const t of ['잠실다이어트', '광주다이어트'])
      ok(classifyIntent(t) === 'local', `남의 동네도 뺀다 — ${t}`, classifyIntent(t))
    ok(classifyIntent('경기력 향상 운동') !== 'local', '「경기력」을 지명으로 보지 않는다')

    /*
     * **멀쩡한 후보는 그대로 남아야 한다.** 목록을 조일수록 이쪽이 위험하다.
     * 「출산후다이어트」는 일부러 살렸다 — 산후 회복 운동은 헬스장이 실제로 하는 일이다.
     */
    const KEEP = ['출산후다이어트', '기초대사량', '다이어트식단', '뱃살빼는법', '키토다이어트',
      '허벅지셀룰라이트', '종아리부종', '단기간다이어트', '댄스다이어트', '린다이어트', '다이어트정체기']
    for (const t of KEEP) ok(classifyIntent(t) === 'info', `쓸 만한 주제는 남긴다 — ${t}`, classifyIntent(t))
  }

  ok(topicCore('기초대사량') === topicCore('기초대사량 높이기'), '「높이기」는 떼고 묶는다')
  ok(topicCore('다이어트') === topicCore('다이어트방법'), '「방법」도 뗀다')
  ok(topicCore('뱃살빼기') === topicCore('뱃살 빼는 법'), '「빼기」와 「빼는 법」은 같은 말이다')
  /*
   * **앞말이 다르면 다른 주제다.** 화면에 「종아리알빼는법」과 「허벅지살빼는법」이 나란히
   * 떴는데, 그 둘은 부위가 달라 서로 다른 글이다 — 묶으면 안 된다.
   */
  ok(topicCore('종아리알빼는법') !== topicCore('허벅지살빼는법'), '부위가 다르면 안 묶는다')
  /*
   * **앞말이 겹친다고 묶지 않는다.** 「다이어트운동」과 「다이어트식단」은 앞이 같지만 전혀
   * 다른 글이다. 그렇게까지 묶으면 볼 수 있는 후보가 확 줄고, 그건 회원이 말한 것과 다르다.
   */
  ok(topicCore('다이어트운동') !== topicCore('다이어트식단'), '앞말만 같은 것은 안 묶는다')
  // 두 글자 밑으로 깎이면 그건 이미 말이 아니다
  ok(topicCore('방법') === '방법', '낱말 전체가 꼬리면 그대로 둔다')
  /*
   * **2026-08-29, 프로덕션 화면에서 다시 새어 나온 짝.**
   *
   * 「다이어트」 갈래 첫 화면에 「기초대사량」과 「기초대사량높이는방법」이 **나란히** 떴다 —
   * 회원이 이미 한 번 짚은 바로 그 짝이다. 꼬리 목록에 「높이는방법」이 없어서 `방법`만
   * 떨어지고 「기초대사량높이는」이 남았고, 그건 「기초대사량」과 다른 열쇠였다.
   */
  ok(topicCore('기초대사량높이는방법') === topicCore('기초대사량'), '「높이는방법」도 통째로 뗀다', topicCore('기초대사량높이는방법'))
  ok(topicCore('뱃살빼는방법') === topicCore('뱃살'), '「빼는방법」도 뗀다', topicCore('뱃살빼는방법'))
  ok(topicCore('근육늘리는법') === topicCore('근육'), '「늘리는법」도 뗀다', topicCore('근육늘리는법'))
  // 앞말을 건드리지 않는지 다시 확인한다 — 부위가 다르면 여전히 다른 주제여야 한다
  ok(topicCore('종아리알빼는방법') !== topicCore('허벅지살빼는방법'), '꼬리를 더 떼도 부위는 안 묶는다')

  {
    const cand = (topic, recent30) => ({ topic, seedId: 's', monthlySearch: 1000, recent30, intent: 'info', from: 'searchad', why: '' })
    // 줄 세운 뒤에 묶으므로 **앞에 오는 것이 남는다** (발행량이 적은 쪽)
    const merged = dedupeByCore(rankCandidates([
      cand('기초대사량 높이기', 4286),
      cand('기초대사량', 900),
      cand('허벅지살빼는법', 2936),
    ]))
    ok(merged.length === 2, '같은 뜻은 한 줄로 줄인다', merged.map((c) => c.topic).join())
    ok(merged[0].topic === '기초대사량', '발행량이 적은 쪽이 남는다', merged[0].topic)
    // **조용히 버리지 않는다** — 무엇이 묶였는지 그 줄에 적는다
    ok(merged[0].variants?.join() === '기초대사량 높이기', '묶인 말을 그 줄에 적어 준다', String(merged[0].variants))
    ok(!merged[1].variants, '묶인 것이 없으면 비워 둔다')

    const route = require('node:fs').readFileSync(new URL('../app/api/autodraft/topics/route.ts', import.meta.url), 'utf8')
    ok(route.includes('dedupeByCore'), '탐색기 라우트가 묶어서 내려준다')
    ok(/merged,/.test(route), '몇 개를 묶었는지 함께 내려준다')
    const ui = require('node:fs').readFileSync(new URL('../components/TopicExplorer.tsx', import.meta.url), 'utf8')
    ok(ui.includes('같은 뜻으로 묶음'), '묶인 말을 화면에 적는다')
    ok(/note\.merged > 0/.test(ui), '몇 개를 묶었는지도 밝힌다')
  }

  // 회원이 콕 집어 말한 두 갈래가 있어야 한다
  /*
   * ─── 자동 작성이 「정한 날에만」 도는 것으로 읽혔다 (2026-08-31) ────
   *
   * 회원: "나는 31일날 자동작성 설정한적이 없는데 자동설정 되어 있어 왜그런거야."
   *
   * 저장된 설정을 실제로 열어 봤다 — `days` 는 08-30 까지만 채워져 있는데 08-31 에도
   * 세 편이 나갔다. 규칙대로다: `planAssignment` 는 그 날 채워 둔 줄이 없으면 ① 주제
   * 목록에서 골라 쓴다. **켜 두면 매일 쓴다**는 뜻인데, ③ 칸 문구가 「채우지 않은 날은
   * 잡히지 않습니다」로 시작해서 그 날은 안 쓰는 것으로 읽혔다.
   *
   * 그리고 더 나쁜 것이 겹쳐 있었다 — 회원 설정이 **주제 3개 · 하루 3편**이라 하루에
   * 목록을 한 바퀴 다 돌았다. 08/30 과 08/31 이 같은 세 주제였다. 예전 경고는 「하나만
   * 담았을 때」만 떠서 이 경우를 못 잡았다.
   */
  {
    const panel = require('node:fs').readFileSync(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
    /*
     * ── 규칙을 뒤집었다 (2026-08-31, 회원 지적) ────────────────
     * "애초에 그날 하루 주제 설정한건데 멋대로 다음날 까지 간게 이상한거 아니야?"
     * 이제 날짜를 채워 두면 정한 날에만 쓴다. 뒤집었으니 **어느 쪽인지 화면이 늘 말하고**,
     * 되돌리는 길도 같은 자리에 둔다 — 조용히 바뀌는 규칙은 또 놀람이 된다.
     */
    ok(panel.includes('정해 둔 날에만 씁니다.'), '정한 날에만 쓰는 상태를 말한다')
    ok(panel.includes('안 정한 날에도 매일 쓰기'), '되돌리는 스위치가 같은 자리에 있다')
    ok(/everyDay: e\.target\.checked/.test(panel), '그 스위치가 설정을 바꾼다')
    ok(panel.includes('③에 정해 둔 날에만 씁니다'), '맨 위 상태 줄도 같은 말을 한다')
    /*
     * **멈춘 채로 조용히 두지 않는다.** 「정한 날에만」으로 바꾸면 채워 둔 날이 다 지나간
     * 뒤부터 아무것도 안 쓴다. 회원이 정한 것이라도 화면이 말해주지 않으면 일주일 뒤에
     * 「왜 안 써?」가 된다 — 그게 이번 지적의 거울 상이다.
     */
    ok(panel.includes('지금 상태로는 자동 작성이 쉽니다.'), '앞날이 비면 멈춘다고 미리 말한다')
    ok(/\(plan\.days \?\? \[\]\)\.some\(\(d\) => d\.date >= today\)/.test(panel), '오늘 이후 채워 둔 날이 있는지로 본다')
    ok(!panel.includes('채우지 않은 날은 잡히지 않습니다'), '「그 날은 안 쓴다」로 읽히던 문구를 뺐다')
    ok(panel.includes('「쉬는 날」') && panel.includes('맨 위 스위치를 끄세요'), '안 쓰게 하려면 어디를 만져야 하는지 말한다')
    // 주제 수를 **하루 편수와 함께** 본다 — 3개·3편이면 날마다 같은 셋이다
    ok(
      /\(plan\.topics \?\? \[\]\)\.length <= perDayOf\(plan\)/.test(panel),
      '주제가 하루 편수 이하면 경고한다 (하나일 때만 보던 것을 고쳤다)'
    )
    ok(panel.includes('날마다 똑같은 주제'), '무엇이 잘못되는지 말한다')
    ok(panel.includes('문서로 볼 수 있습니다'), '왜 나쁜지도 말한다')
    ok(panel.includes('일</b>마다 한 바퀴를 돕니다'), '넉넉해도 며칠 만에 겹치는지 알려준다')
  }

  ok(TOPIC_SEEDS.some((s) => s.label.includes('다이어트')), '다이어트 갈래가 있다')
  ok(TOPIC_SEEDS.some((s) => s.label.includes('체중 증량')), '체중 증량 갈래가 있다')
  ok(TOPIC_SEEDS.every((s) => s.queries.length > 0), '갈래마다 물어볼 말이 있다')
  ok(new Set(TOPIC_SEEDS.map((s) => s.id)).size === TOPIC_SEEDS.length, '갈래 id 가 겹치지 않는다')

  /*
   * ─── 매일 다른 주제가 나오게 (2026-08-29 회원 요청) ──────────────
   *
   * 회원: "주제탐색기가 매일 돌릴때마다 같은 주제가 나와. 조금더 다양한 주제가 나오게 해줘."
   *
   * **프로덕션에서 재고 고쳤다.** 「다이어트」 갈래를 실제로 불러 보니 정보글로 쓸 만한
   * 후보가 **339개**인데 화면에는 늘 같은 열두 줄이 떴다. 원인이 셋이었다:
   *   ① 갈래마다 물어볼 말이 **딱 세 개**로 고정 — 네이버 연관검색어는 같은 질의에 같은
   *      순서로 답하므로 어제 물어본 것을 오늘 그대로 물으면 어제 목록이 그대로 온다.
   *   ② 갈래를 누를 때 **언제나 0 번 묶음** — 검색량 큰 열두 개가 늘 첫 화면이었다.
   *   ③ **이미 글로 쓴 주제를 안 뺐다** — 어제 쓴 그 주제가 오늘 또 첫 줄에 있었다.
   *
   * 셋 다 여기서 지킨다. 하나만 고치면 나머지가 다시 같은 화면을 만든다.
   */
  ok(TOPIC_SEEDS.every((s) => s.queries.length >= 6), '갈래마다 물어볼 말이 넉넉하다 (돌려 쓸 것이 있어야 한다)')
  ok(
    TOPIC_SEEDS.every((s) => new Set(s.queries).size === s.queries.length),
    '한 갈래 안에서 같은 말을 두 번 적지 않았다'
  )
  /*
   * **검색광고 키워드도구는 한 번에 다섯 개까지만 받는다** (searchad.ts 의 `slice(0, 5)`).
   * 그 위로 보내면 조용히 잘리는데, 잘린 말은 물어본 적 없는 셈이 된다.
   */
  ok(SEED_QUERY_PER_RUN <= 5, '한 번에 묻는 말이 검색광고 상한을 넘지 않는다', SEED_QUERY_PER_RUN)

  {
    // 하루에 한 칸씩만 밀린다 — 날짜를 못 읽으면 예전과 같이 맨 앞이다
    ok(dayIndex('2026-08-30') - dayIndex('2026-08-29') === 1, '하루가 지나면 하나 는다')
    ok(dayIndex('2026-08-29') === dayIndex('2026-08-29T23:59:00+09:00'), '같은 날은 같은 값이다')
    ok(dayIndex('') === 0 && dayIndex(undefined) === 0, '날짜를 못 읽으면 0 (예전과 같은 화면)')

    const abc = ['a', 'b', 'c', 'd', 'e']
    ok(JSON.stringify(rotateWindow(abc, 0, 3)) === JSON.stringify(['a', 'b', 'c']), '첫 창')
    ok(JSON.stringify(rotateWindow(abc, 1, 3)) === JSON.stringify(['b', 'c', 'd']), '하루 뒤에는 한 칸 밀린다')
    ok(JSON.stringify(rotateWindow(abc, 4, 3)) === JSON.stringify(['e', 'a', 'b']), '끝에 닿으면 처음으로 돌아온다')
    ok(rotateWindow([], 3, 3).length === 0, '빈 목록에도 터지지 않는다')
    ok(rotateWindow(['a'], 7, 3).length === 1, '있는 것보다 많이 달라고 해도 있는 만큼만')

    const seed = TOPIC_SEEDS[0]
    const d1 = seedQueries(seed.queries, '2026-08-29')
    const d2 = seedQueries(seed.queries, '2026-08-30')
    ok(d1.length === SEED_QUERY_PER_RUN, '하루에 정해진 개수만 묻는다', String(d1.length))
    ok(JSON.stringify(d1) !== JSON.stringify(d2), '날이 바뀌면 묻는 말이 바뀐다', `${d1}|${d2}`)
    // **같은 날 다시 눌러도 같은 말**이어야 한다 — 안 그러면 「다른 주제 보기」로 넘긴 자리가 흔들린다
    ok(JSON.stringify(d1) === JSON.stringify(seedQueries(seed.queries, '2026-08-29')), '같은 날은 같은 말을 묻는다')
    ok(d1.every((q) => seed.queries.includes(q)), '묻는 말은 갈래에 적어 둔 것뿐이다 (지어내지 않는다)')
  }

  {
    // 날짜를 그대로 페이지 번호로 쓰면 「20693/29」가 된다 — 화면에 돌려줄 때는 접어 보낸다
    ok(normalizePage(dayIndex('2026-08-29'), 29) < 29, '큰 수도 목록 길이 안으로 접는다')
    ok(normalizePage(3, 3) === 0, '끝나면 처음으로 돌아온다')
    ok(normalizePage(-1, 5) === 4, '음수는 뒤에서부터 센다')
    ok(normalizePage(2, 0) === 0, '묶음이 없으면 0')
  }

  {
    /*
     * **이미 쓴 주제는 글자가 아니라 뜻으로 뺀다.** 「기초대사량」을 이미 썼는데 다음 날
     * 「기초대사량 높이기」가 새 후보인 척 올라오면 회원이 보기엔 같은 주제가 또 나온 것이다.
     */
    const built = buildCandidates({
      seedId: 's',
      suggestions: ['기초대사량 높이기', '뱃살빼는법', '어깨 스트레칭 순서'],
      adRows: [],
      recent: {},
      exclude: ['기초대사량', '뱃살 빼는 법'],
    })
    const got = built.map((c) => c.topic)
    ok(!got.includes('기초대사량 높이기'), '이미 쓴 주제의 다른 꼴도 뺀다', got.join())
    ok(!got.includes('뱃살빼는법'), '띄어쓰기만 다른 것도 뺀다', got.join())
    ok(got.includes('어깨 스트레칭 순서'), '상관없는 주제는 남긴다', got.join())
    ok(buildCandidates({ seedId: 's', suggestions: ['기초대사량'], adRows: [], recent: {} }).length === 1, '뺄 것이 없으면 그대로 둔다')
  }

  {
    const api = require('node:fs').readFileSync(new URL('../app/api/autodraft/topics/route.ts', import.meta.url), 'utf8')
    ok(api.includes('seedQueries(seed.queries, today)'), '라우트가 날마다 다른 말로 묻는다')
    // 이미 쓴 글의 주제 세 칸을 모두 본다 — 담아 두지 않고 바로 쓴 주제는 plan 에 없다
    ok(/p\.mainKeyword, p\.autoTopic, p\.infoTopic/.test(api), '이미 쓴 글의 주제를 뺄 목록에 넣는다')
    ok(/exclude = \[\.\.\.\(db\.autoDraftPlan\?\.topics \?\? \[\]\), \.\.\.written\]/.test(api), '담아 둔 주제와 함께 넘긴다')
    ok(/const page = asked \? /.test(api) && /dayIndex\(today\)/.test(api), '번호를 안 보내면 날짜로 시작 자리를 정한다')
    ok(api.includes('normalizePage'), '화면에 돌려줄 번호는 접어서 보낸다')

    const ui = require('node:fs').readFileSync(new URL('../components/TopicExplorer.tsx', import.meta.url), 'utf8')
    ok(ui.includes('날마다 다른 말로'), '왜 매일 다른지 화면에 적는다')
    ok(ui.includes('note.queries'), '오늘 무엇으로 물어봤는지 밝힌다')
    ok(ui.includes('note.excluded'), '몇 개를 뺐는지 밝힌다')
  }

  /*
   * **업체를 찾는 말을 정보글 주제로 쓰면 홍보글이 된다.** 정보글은 신뢰도를 쌓으려고 쓰는
   * 것이고(정보 : 홍보 = 2 : 1 의 '2'), 그 자리는 이미 홍보글이 맡고 있다.
   */
  ok(classifyIntent('다이어트 정체기') === 'info', '순수한 정보성 말은 정보로')
  ok(classifyIntent('쌍용동 헬스장') === 'local', '「○○동」이 붙으면 업체 찾는 말')
  ok(classifyIntent('헬스장 근처') === 'local', '「근처」도 마찬가지')
  ok(classifyIntent('헬스장 가격') === 'buy', '가격은 구매 의도')
  ok(classifyIntent('헬스장 추천') === 'buy', '추천도 구매 의도')
  ok(classifyIntent('PT 일일권') === 'buy', '일일권도')
  // 우리 지역 키워드는 띄어쓰기가 달라도 걸러야 한다 (「쌍용동헬스장」·「쌍용동 헬스장」)
  ok(classifyIntent('쌍용동헬스장 후기', ['쌍용동 헬스장']) === 'local', '우리 지역 키워드는 띄어쓰기와 무관하게 거른다')
  // 정보성 말에 우연히 지역처럼 보이는 글자가 있어도 잘못 걸지 않는다
  ok(classifyIntent('공복 유산소') === 'info', '멀쩡한 정보성 말을 잘못 거르지 않는다')
  ok(classifyIntent('단백질 섭취량') === 'info', '식단 관련도 정보성')

  /*
   * **「남의 동네 + 운동」은 주제가 아니다** (2026-08-26 회원 지적: "이게 과연 주제로서
   * 쓸만한 운동이 맞아? 그냥 키워드인거 아니야?").
   *
   * 화면에 이것들이 「주제」로 올라와 있었다 — 전부 다른 동네에서 헬스장을 찾는 말이다.
   * 위 `AREA_RE` 는 **띄어쓰기**를 요구하는데 자동완성은 붙여서 온다.
   */
  for (const away of ['매탄동운동', '상암동운동', '군자역운동', '신림역운동', '달서구운동', '남성역운동', '수지구헬스', '분당동다이어트']) {
    ok(classifyIntent(away) === 'local', `「${away}」 는 남의 동네 검색어다`)
  }
  /*
   * **띄어쓰기를 빼면 멀쩡한 말이 걸린다** — 「기초운동」의 「초운+동」, 「헬스기구운동」의
   * 「스기+구」. 그래서 지역 꼬리 **바로 뒤에** 운동·헬스가 붙을 때만, 그리고 우리 낱말로
   * 시작하지 않을 때만 잡는다. 이 줄들이 그 울타리다.
   */
  for (const fine of ['기초운동', '전신운동', '맨몸운동', '고강도운동', '실내운동', '유산소운동', '근력운동', '무릎 아플때 운동', '3대운동']) {
    ok(classifyIntent(fine) !== 'local', `「${fine}」 를 지역으로 잘못 걸지 않는다`, classifyIntent(fine))
  }

  /*
   * **아직도 새고 있었다** (2026-08-26 회원 재지적: "아직도 주제가 이상하게 나와").
   * 화면에 올라온 것들 — 세 가지 꼴이 남아 있었다.
   */
  // ① 관공서·시설 — 「금천구청 근처에서 운동할 곳」을 찾는 말이다
  for (const gov of ['금천구청운동', '시청운동', '주민센터운동', '체육관운동']) {
    ok(classifyIntent(gov) === 'local', `「${gov}」 는 장소를 찾는 말이다`, classifyIntent(gov))
  }
  // ② 모일 곳 — 정보를 찾는 말이 아니다
  for (const club of ['헬스커뮤니티', '헬스동호회', '운동모임', '다이어트카페']) {
    ok(classifyIntent(club) === 'local', `「${club}」 는 모일 곳을 찾는 말이다`, classifyIntent(club))
  }
  /*
   * ③ **「운동」이 몸 쓰는 일이 아닐 때.** 자동완성에 「운동 순서」를 물으면 역사 사건까지
   * 끌고 온다 — 「동학농민운동 순서」가 그대로 주제로 올라왔다.
   */
  for (const hist of ['동학농민운동 순서', '독립운동', '민주화운동', '새마을운동']) {
    ok(classifyIntent(hist) === 'offlimit', `「${hist}」 는 우리 주제가 아니다`, classifyIntent(hist))
  }
  // 숫자로 시작하는 동네도 잡는다 (「2동탄운동」)
  ok(classifyIntent('2동탄운동') === 'local', '숫자로 시작하는 동네도 잡는다', classifyIntent('2동탄운동'))
  /*
   * **숫자 뒤가 세는 말이면 동네가 아니다.** 이 울타리가 없으면 「60대 근력운동 순서」가
   * 「60 + 대근력 + 운동」으로 걸린다 — 실제로 걸렸다.
   */
  for (const num of ['60대 근력운동 순서', '3개월운동', '1시간운동', '3대운동', '10분운동', '30일운동']) {
    ok(classifyIntent(num) !== 'local', `「${num}」 를 동네로 잘못 걸지 않는다`, classifyIntent(num))
  }
  // 우리 말이 앞에 붙은 것은 그대로 둔다
  for (const keep of ['남자 가슴운동 순서', '등운동 순서', '여성 근력운동', '공원 운동기구 사용법']) {
    ok(classifyIntent(keep) === 'info', `「${keep}」 는 주제로 남는다`, classifyIntent(keep))
  }

  /*
   * **실제로 돌려보고 넣은 검사** (2026-08-24). 「다이어트」 씨앗으로 프로덕션에서 돌렸더니
   * 검색광고가 이런 것들을 검색량 순으로 돌려줬다:
   *
   *   다이어트약 22,120 · 다이어트유산균 21,020 · 자이로토닉 20,540 · 축농증 18,940
   *   후두염 17,100 · 스테비아 16,210 · 엉덩이 16,090 · 변비약 15,980 · 지방분해주사 14,750
   *
   * **검색량이 크다고 우리가 쓸 주제가 되지 않는다.** 약·주사·질병은 의료 영역이라
   * 헬스장이 효과를 말하면 광고심의에 걸리고(banned.ts), 전문 분야가 흔들려 블로그
   * 주제 일관성에도 손해다.
   */
  for (const bad of ['다이어트약', '변비약', '한약', '지방분해주사', '지방흡입', '보톡스', '다이어트 클리닉', '다이어트 보조제', '다이어트유산균', '다이어트도시락']) {
    ok(classifyIntent(bad) === 'offlimit', `「${bad}」 는 우리 영역이 아니다`)
  }
  for (const disease of ['축농증', '후두염', '위염', '불면증', '갑상선암']) {
    ok(classifyIntent(disease) === 'offlimit', `병 이름 「${disease}」 은 주제가 아니다`)
  }
  // 제외 목록에 없으면서 우리 영역도 아닌 말 — 이건 「쓸 수 있는 말」 쪽으로만 막을 수 있다
  ok(classifyIntent('자이로토닉') === 'offlimit', '우리가 하지 않는 종목은 뺀다')
  ok(classifyIntent('스테비아') === 'offlimit', '제품 이름도 뺀다')

  /*
   * **두 번째 실행에서 새어 나온 것들** (2026-08-24). 첫 걸름망을 통과했지만 여전히 우리
   * 주제가 아니다 — 걸러낸 뒤 실제 결과를 다시 보고 넣은 검사다.
   */
  ok(classifyIntent('지방간치료') === 'offlimit', '「치료」가 붙으면 의료다')
  ok(classifyIntent('비만치료제') === 'offlimit', '치료제도 마찬가지')
  ok(classifyIntent('다이어트식품') === 'offlimit', '파는 물건은 우리 주제가 아니다')
  ok(classifyIntent('디톡스다이어트') === 'offlimit', '유사의료·제품도 뺀다')
  ok(classifyIntent('숀리다이어트캠프') === 'offlimit', '남의 브랜드 프로그램도 뺀다')
  // 병 이름이 낱말 **가운데** 있으면 끝자리 검사로는 안 걸린다
  ok(classifyIntent('허리협착증운동') === 'offlimit', '가운데 낀 병 이름도 잡는다')
  ok(classifyIntent('거북목증후군 스트레칭') === 'offlimit', '증후군도 의료 영역')

  /*
   * **업체 이름이 든 말은 방법을 묻고 있을 때만 정보다.** 「여성전용헬스장」이 후보로
   * 올라왔었다 — 지역명이 없어서 지역 검사를 통과했지만 이건 업체를 찾는 말이다.
   */
  ok(classifyIntent('여성전용헬스장') === 'local', '업체를 가리키는 말은 업체 찾기로')

  /*
   * **세 번째 실행** (2026-08-24). 「체중 증량」 갈래가 보충제로 뒤덮였다 —
   * 단백질보충제 33,800회 · 탄수화물보충제 · 벌크업보충제 · 벌크업프로틴 · 헬스부스터.
   * 우리가 파는 물건이 아니고, 효과를 말하면 건강기능식품 광고가 된다.
   */
  for (const bad of ['단백질보충제', '탄수화물보충제', '벌크업프로틴', '헬스부스터', '크레아틴']) {
    ok(classifyIntent(bad) === 'offlimit', `「${bad}」 는 파는 물건이다`)
  }
  // 「계산기」는 도구를 찾는 검색이라 정보글로는 그 자리에 못 간다
  ok(classifyIntent('비만도계산기') === 'offlimit', '도구를 찾는 검색은 뺀다')
  // 막다가 멀쩡한 식단 주제까지 막으면 안 된다
  ok(classifyIntent('운동 후 단백질 섭취 시간') === 'info', '단백질을 「언제 먹나」는 정보다')
  ok(classifyIntent('벌크업 식단 짜는 법') === 'info', '식단 짜는 법도 정보다')

  /*
   * **네 번째 실행** (2026-08-24). 약과 병이 또 새어 나왔다 —
   * 근육이완제 13,450회 · 근육강화제 · 섬유근육통 · 손목결절종.
   * 약 이름을 낱개로 적으면 끝이 없어서 「~제」 꼴로 막는다.
   */
  ok(classifyIntent('근육이완제') === 'offlimit', '「~이완제」는 약이다')
  ok(classifyIntent('근육강화제') === 'offlimit', '「~강화제」도 약이다')
  ok(classifyIntent('섬유근육통') === 'offlimit', '병 이름은 뺀다')
  ok(classifyIntent('손목결절종') === 'offlimit', '「결절종」도 병이다')
  // 「~제」로 막되 멀쩡한 말까지 막지 않는다 (「문제」·「과제」와 겹친다)
  ok(classifyIntent('무릎 통증 문제 해결 방법') === 'info', '「문제」로 끝나는 말을 약으로 보지 않는다')

  /*
   * **물건과 기구는 살 것을 찾는 검색이다** — 허리마사지기 · 홈트운동기구 · 복근운동기구 ·
   * 스트레칭밴드가 후보로 올라왔다. 다만 **쓰는 법을 물으면 정보다.**
   */
  ok(classifyIntent('홈트운동기구') === 'buy', '기구 자체를 찾는 말은 뺀다')
  ok(classifyIntent('허리마사지기') === 'buy', '마사지기도 마찬가지')
  ok(classifyIntent('스트레칭밴드') === 'buy', '용품도')
  ok(classifyIntent('헬스 기구 사용 순서') === 'info', '기구를 「어떻게 쓰나」는 정보다')
  ok(classifyIntent('스트레칭 밴드 쓰는 방법') === 'info', '용품도 쓰는 법을 물으면 정보다')
  ok(classifyIntent('헬스장 처음 가는 순서') === 'info', '같은 「헬스장」이라도 방법을 물으면 정보다')
  ok(classifyIntent('헬스 루틴 짜는 방법') === 'info', '운동 방법은 그대로 정보')
  // 한 낱말짜리 짧은 말로는 글을 못 쓴다
  ok(classifyIntent('엉덩이') === 'thin', '「엉덩이」로는 주제가 안 된다')
  ok(classifyIntent('뱃살') === 'thin', '두 글자짜리도 마찬가지')
  ok(classifyIntent('뱃살빼는운동') === 'info', '한 낱말이어도 길고 구체적이면 주제가 된다')
  ok(classifyIntent('기초대사량') === 'info', '다섯 글자면 통과')
  /*
   * **막다가 멀쩡한 것까지 막으면 안 된다.** 실제 응답에 있던 쓸 만한 후보들이 살아남는지
   * 확인한다 — 필터가 세지면 이쪽이 조용히 죽는다.
   */
  for (const good of ['내장지방빼는법', '다이어트 정체기', '체지방 감량', '공복 유산소 시간', '단백질 하루 섭취량', '스쿼트 자세', '무릎 아플때 운동', '벌크업 식단']) {
    ok(classifyIntent(good) === 'info', `「${good}」 은 살아남는다`)
  }

  /*
   * **말을 바꾸지 않는다.** 검색어를 다듬어 「예쁘게」 만들면 그건 다시 우리가 지어낸 주제다.
   * 공백만 정리한다.
   */
  ok(toTopic('  다이어트   정체기  ') === '다이어트 정체기', '앞뒤·겹친 공백만 정리한다')
  ok(toTopic('다이어트정체기') === '다이어트정체기', '붙여 쓴 말을 임의로 띄우지 않는다')

  /*
   * **줄 세우는 기준은 이미 실측으로 정한 값을 쓴다** (arena.ts 의 300편 / 100편).
   * 같은 사실에 두 기준이 생기면 어느 쪽이 맞는지 아무도 모르게 된다.
   */
  const c = (topic, monthlySearch, recent30) => ({ topic, seedId: 's', monthlySearch, recent30, intent: 'info', from: 'searchad', why: '' })
  const sorted = rankCandidates([
    c('많이 올라오는 것', 90000, 4286),
    c('적게 올라오는 것', 1000, 40),
    c('중간', 50000, 900),
    c('못 잰 것', 99999, null),
  ])
  ok(sorted[0].topic === '적게 올라오는 것', '발행량이 적은 것부터', sorted[0].topic)
  ok(sorted[1].topic === '중간', '그다음이 중간', sorted[1].topic)
  // 못 잰 것은 뒤로 밀되 버리지 않는다 — 0 으로 바꿔 유리하게 쓰지 않는다
  ok(sorted[3].topic === '못 잰 것', '못 잰 것은 검색량이 커도 맨 뒤', sorted[3].topic)
  ok(sorted.length === 4, '못 쟀다고 버리지 않는다')

  // 한 줄 설명 — 못 쟀으면 못 쟀다고 말한다
  ok(candidateWhy(1200, 40).includes('월 1,200회 검색'), '검색량을 그대로 적는다')
  ok(candidateWhy(1200, 40).includes('최근 30일 40편'), '발행량도 그대로 적는다')
  ok(candidateWhy(null, 40).includes('검색광고 키가 없습니다'), '왜 검색량을 모르는지 밝힌다')
  ok(candidateWhy(1200, null).includes('발행량은 못 쟀습니다'), '못 잰 것을 못 쟀다고 말한다')

  /*
   * **잘린 값을 잰 값처럼 쓰지 않는다.** 블로그 섹션은 1,000건에서 잘려서 그 위는 전부 같은
   * 숫자(4,286)로 온다. 실제로 열두 줄 중 여덟 줄이 똑같이 4,286편으로 떴는데, 그건 우연이
   * 아니라 전부 상한에 걸린 값이었다 — 정확한 값처럼 보여주면 회원이 그 둘을 비교해 판단한다.
   */
  ok(candidateWhy(1200, 4286, true).includes('4,286편 이상'), '잘린 값은 「이상」으로 적는다')
  ok(candidateWhy(1200, 4286, true).includes('정확히 세지 못했습니다'), '왜 이상인지도 밝힌다')
  ok(!candidateWhy(1200, 40).includes('이상'), '안 잘린 값에는 「이상」을 붙이지 않는다')

  /*
   * **등급을 붙이지 않는다.** 지역 키워드로 잰 경계(300편/100편)를 전국 정보 키워드에 쓰면
   * 열두 줄이 전부 「경쟁 센 자리」가 된다 — 모든 줄이 같은 말이면 아무 정보도 아니다.
   */
  ok(!candidateWhy(1200, 4286, true).includes('경쟁'), '전국 키워드에 지역 경계로 등급을 붙이지 않는다')

  /*
   * **두 곳에서 온 같은 말은 한 번만.** 자동완성과 연관검색어는 겹치는데, 겹칠 때 검색량을
   * 아는 쪽을 버리면 회원이 볼 수 있는 정보가 줄어든다.
   */
  const built = buildCandidates({
    seedId: 'diet',
    suggestions: ['다이어트 정체기', '다이어트 식단', '쌍용동 헬스장 가격'],
    adRows: [
      { keyword: '다이어트 정체기', monthlySearch: 8000 },
      { keyword: '공복 유산소', monthlySearch: 3000 },
    ],
    recent: { '다이어트 정체기': 40 },
    myLocalKeywords: ['쌍용동 헬스장'],
  })
  const jeongche = built.find((x) => x.topic === '다이어트 정체기')
  ok(built.filter((x) => x.topic === '다이어트 정체기').length === 1, '겹친 말은 한 번만 나온다')
  ok(jeongche.monthlySearch === 8000, '겹칠 때 검색량을 아는 쪽을 살린다')
  ok(jeongche.recent30 === 40, '잰 발행량이 붙는다')
  ok(built.find((x) => x.topic === '다이어트 식단').from === 'autocomplete', '자동완성에서 온 것은 그렇게 표시한다')
  // 업체 찾는 말은 목록에 남되 갈래가 붙는다 (버리지 않고 화면이 걸러 보여준다)
  ok(built.find((x) => x.topic === '쌍용동 헬스장 가격')?.intent !== 'info', '업체 찾는 말에 정보 갈래를 주지 않는다')
  // 이미 고른 주제는 다시 권하지 않는다
  const again = buildCandidates({
    seedId: 'diet',
    suggestions: ['다이어트 정체기'],
    adRows: [],
    recent: {},
    exclude: ['다이어트정체기'],
  })
  ok(again.length === 0, '이미 고른 주제는 띄어쓰기가 달라도 다시 권하지 않는다')

  /*
   * **개수 상한이 있어야 한다.** 첫 실행에서 후보가 1,152개 나왔다 — 검색광고 연관검색어는
   * 아낌없이 준다. 그걸 그대로 뿌리면 고를 수 있는 목록이 아니라 스크롤 지옥이다.
   */
  const { SHOW_MAX, attachRecent, pageOf, pageRange } = require(`${OUT}/writing/topic-explore.js`)

  /*
   * **넘겨 볼 수 있어야 한다** (2026-08-24). 회원: "주제가 매번 같은게 나와 새로고침 버튼
   * 만들어서 다른것들이 나오게 해줘."
   *
   * 상위 12개만 보여주고 있었는데 「다이어트」 갈래에서 남는 후보가 **409개**였다 —
   * 397개가 한 번도 눈에 안 띄었다. 검색광고는 같은 씨앗에 같은 순서로 답하므로 다시
   * 눌러도 열두 줄이 그대로였다.
   */
  {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1)
    ok(JSON.stringify(pageOf(nums, 0, 10)) === JSON.stringify([1,2,3,4,5,6,7,8,9,10]), '첫 묶음')
    ok(JSON.stringify(pageOf(nums, 1, 10)) === JSON.stringify([11,12,13,14,15,16,17,18,19,20]), '두 번째 묶음은 다른 것')
    ok(JSON.stringify(pageOf(nums, 2, 10)) === JSON.stringify([21,22,23,24,25]), '마지막 묶음은 짧아도 된다')
    // 끝에서 처음으로 돌아온다 — 「더 없습니다」로 막히면 회원이 그 자리에서 멈춘다
    ok(JSON.stringify(pageOf(nums, 3, 10)) === JSON.stringify(pageOf(nums, 0, 10)), '끝나면 처음으로 돌아온다')
    // 음수는 뒤에서부터 — 마지막 묶음(21~25)으로 돌아온다
    ok(pageOf([], 5, 10).length === 0, '빈 목록에도 터지지 않는다')
    ok(JSON.stringify(pageOf(nums, -1, 10)) === JSON.stringify([21,22,23,24,25]), '음수는 뒤에서부터 센다')

    const r = pageRange(409, 1, 12)
    ok(r.from === 13 && r.to === 24, `몇 번째를 보고 있는지 안다 — ${r.from}~${r.to}`)
    ok(pageRange(409, 0, 12).pages === 35, '묶음이 몇 개인지 안다')
    ok(pageRange(25, 2, 10).to === 25, '마지막 묶음은 전체 수에서 멈춘다')
    ok(pageRange(0, 0, 12).pages === 0, '후보가 없으면 0')
  }
  ok(SHOW_MAX > 0 && SHOW_MAX <= 40, `화면에 보여줄 개수 상한이 있다 — ${SHOW_MAX}개`)

  /*
   * **보여줄 것을 먼저 정하고 그것만 잰다** (2026-08-24에 순서를 뒤집었다).
   *
   * 처음엔 검색량 상위 10개를 먼저 재고 그다음 줄 세웠는데, 화면에 뜬 24개가 **전부**
   * 「발행량은 못 쟀습니다」였다 — 잰 것들은 경쟁이 세서(300편 이상) 맨 뒤로 밀렸고, 못 잰
   * 것들이 그 앞을 채웠다. 조회를 열 번 하고 결과를 한 줄도 못 보여준 셈이다.
   */
  {
    const pick = [c('많이 검색되는 것', 9000, null), c('덜 검색되는 것', 1000, null)]
    const done = attachRecent(pick, {
      '많이 검색되는 것': { count: 4286, capped: true },
      '덜 검색되는 것': { count: 20, capped: false },
    })
    ok(done.every((x) => x.recent30 !== null), '보여줄 것에 전부 발행량이 붙는다')
    ok(done.every((x) => !x.why.includes('발행량은 못 쟀습니다')), '화면 문구도 함께 갱신된다')
    ok(done[0].topic === '덜 검색되는 것', '붙이고 나서 발행량 적은 순으로 다시 줄 세운다', done[0].topic)
    ok(done.find((x) => x.topic === '많이 검색되는 것').why.includes('이상'), '잘린 값은 「이상」으로 전해진다')
    // 못 잰 것이 섞여도 그 줄만 「못 쟀다」로 남는다
    const partial = attachRecent(pick, { '많이 검색되는 것': { count: 20, capped: false } })
    ok(partial.find((x) => x.topic === '덜 검색되는 것').why.includes('못 쟀습니다'), '못 잰 줄만 그렇게 남는다')
  }

  /*
   * **화면·라우트가 실제로 이걸 쓴다.** 만들어만 두고 안 쓰면 아무것도 달라지지 않는다.
   */
  {
    const { readFileSync: rf } = require('node:fs')
    const api = rf(new URL('../app/api/autodraft/topics/route.ts', import.meta.url), 'utf8')
    ok(api.includes('gatherSuggestions'), '자동완성에서 가져온다')
    ok(api.includes('keywordTool'), '검색광고 연관검색어에서 가져온다')
    ok(api.includes('recentBlogCount'), '경쟁(최근 30일 발행량)을 잰다')
    // 정보성인 것만 남긴다 — 업체 찾는 말에 조회를 쓰면 회원 시간만 버린다
    ok(/candidates\.filter\(\(c\) => c\.intent === 'info'\)/.test(api), '잴 대상을 정보성으로 좁힌다')
    ok(api.includes('note'), '몇 개를 걸렀고 못 쟀는지 함께 돌려준다')

    /*
     * **연달아 두드리면 막힌다.** 첫 실행에서 발행량 12개를 쉬지 않고 물었더니 12개 전부
     * 실패했고, 화면에는 「발행량은 못 쟀습니다」만 열두 줄 떴다. 블로그 섹션은 공식 API 가
     * 아니라 간격이 필요하다.
     */
    ok(/GAP_MS/.test(api) && /setTimeout\(r, GAP_MS\)/.test(api), '발행량 조회 사이에 간격을 둔다')
    ok(/measured\+\+/.test(api), '몇 개가 실제로 답했는지 센다 (물어본 횟수와 다르다)')
    // 재는 대상은 **보여줄 것**이어야 한다 — 안 그러면 잰 결과가 화면에 한 줄도 안 뜬다
    ok(/const pick = pageOf\(info, at\)/.test(api), '보여줄 것을 먼저 정한다')
    ok(/for \(const c of pick/.test(api), '그 목록만 잰다')
    ok(/attachRecent\(pick, recent\)/.test(api), '잰 값을 붙여 다시 줄 세운다')
    ok(/note === 'atLeast'/.test(api), '잘린 값인지도 함께 넘긴다 (4,286편과 4,286편 이상은 다르다)')

    const ui = rf(new URL('../components/TopicExplorer.tsx', import.meta.url), 'utf8')
    ok(ui.includes('TOPIC_SEEDS'), '화면이 같은 갈래 목록을 쓴다 (두 곳에 적지 않는다)')
    ok(ui.includes('note.offlimit') && ui.includes('note.measured'), '무엇을 걸렀고 몇 개를 쟀는지 화면에 밝힌다')
    // 「업체를 찾는 말」만으로는 무슨 뜻인지 모른다 — 회원이 본 그 말로 예를 든다 (2026-08-26)
    ok(ui.includes('「매탄동운동」처럼 남의 동네에서'), '무엇을 걸렀는지 예를 들어 말한다')
    ok(ui.includes('note.total') && ui.includes('note.from'), '몇 개 중 몇 번째를 보고 있는지 밝힌다')
    ok(ui.includes('다른 주제 보기'), '다음 묶음으로 넘기는 버튼이 있다')
    ok(/explore\(seedId, note\.page \+ 1\)/.test(ui), '누르면 다음 묶음을 가져온다')
    /*
     * **갈래를 누를 때는 번호를 안 보낸다** (2026-08-29 회원: "매일 돌릴때마다 같은 주제가
     * 나와"). 예전에는 언제나 0 을 보내서 매일 아침 첫 화면이 늘 같은 열두 줄이었다 —
     * 번호가 없으면 라우트가 날짜로 시작 자리를 정한다.
     */
    ok(/explore\(s\.id\)/.test(ui), '갈래를 누르면 시작 자리는 서버가 날짜로 정한다')
    ok(/page: next \?\? null/.test(ui), '번호가 없으면 비워서 보낸다')
    ok(api.includes('pageOf') && api.includes('body.page'), '라우트가 묶음 번호를 받아 자른다')
    ok(ui.includes('막은 것 같습니다'), '한 건도 못 쟀으면 왜 그런지 말해준다')

    /*
     * **글 작성 화면에서도 쓴다** (2026-08-24 회원 요청: "정보글 작성할때도 주제 탐색기
     * 사용할 수 있게 해줘"). 거기 있던 주제 칩 여섯 개는 우리가 지어낸 것이라, 실제로
     * 검색되는지 확인한 적이 없었다.
     *
     * **재는 방법과 거르는 규칙은 한 벌이어야 한다** — 두 벌이 되면 한쪽만 고치는 날이 온다.
     * 그래서 화면을 복사하지 않고 같은 컴포넌트를 쓴다 (쓰임이 달라 버튼 글자만 바꾼다).
     */
    const editor2 = rf(new URL('../app/write/Editor.tsx', import.meta.url), 'utf8')
    ok(editor2.includes("import TopicExplorer from '@/components/TopicExplorer'"), '글 작성 화면이 같은 탐색기를 쓴다')
    ok(/pickLabel="이 주제로"/.test(editor2), '글 작성에서는 하나를 고른다 (담기가 아니다)')
    ok(/picked=\{infoTopic\.trim\(\) \? \[infoTopic\.trim\(\)\] : \[\]\}/.test(editor2), '이미 고른 주제를 「고름」으로 표시한다')
    /*
     * **고른 주제가 메인 키워드가 된다** (2026-08-27 회원 지적: "주제 골라도 메인키워드는
     * 바뀌지 않는데?").
     *
     * 자동 초안은 같은 날 메인/지역 자리를 맞바꿨는데(pickAssignment) 손으로 쓰는 화면은
     * 그대로여서 이런 상태가 남았다 — 메인 「성정동 헬스장」 · 주제 「벌크업식단」.
     * 그대로 쓰면 제목이 「성정동 헬스장 벌크업식단…」으로 나간다. 한쪽만 고친 것이다.
     */
    ok(/setInfoTopic\(t\)/.test(editor2) && /setMainKeyword\(t\)/.test(editor2), '고른 주제가 주제 칸과 메인 키워드에 함께 들어간다')
    // 지역 키워드는 버리지 않고 조연 칸으로 내린다 — 비어 있을 때만 (회원이 고른 값을 덮지 않는다)
    ok(/!localKeyword\.trim\(\)[\s\S]{0,120}setLocalKeyword\(before\)/.test(editor2), '밀려난 지역 키워드는 조연 칸으로 내려간다')
    // 구매력 있는 말이 메인에 남아 있으면 화면이 말해준다 (막지는 않는다)
    ok(/classifyIntent/.test(editor2) && /구매력 있는 말이라/.test(editor2), '메인 칸에 업체·값을 찾는 키워드가 있으면 알린다')
    /*
     * **알리는 데서 끝내지 않는다** (2026-08-27 회원 지적: "바뀐게 없는데?").
     * 경고만 띄우면 회원이 이 칸을 손으로 지우고 아래 칸에 다시 적어야 한다 — 무엇이
     * 잘못인지 아는 앱이 고치는 일은 회원에게 미룬 셈이다.
     */
    ok(/지역 키워드\(조연\) 칸으로 내리기/.test(editor2), '버튼 하나로 조연 칸에 옮겨준다')

    /*
     * ─── 정보글에는 지점 칸이 없다 (2026-08-27) ────────────────────
     *
     * 회원: "정보성글에는 구지 지점정보가 필요하지 않을것 같아 … 지점칸은 정보성으로
     * 아무런 정보가 들어가지 않게 해주면 좋겠어."
     *
     * 08-27 에 화자가 일반 블로거가 되면서 지점에서 오던 값이 지시문에서 전부 빠졌다 —
     * 상호명·표시 이름·위치·24시간·시설·강점·전화번호. 남은 건 **칸 하나뿐**이었고,
     * 고르든 안 고르든 글이 같았다. 「고르라고 해놓고 아무 일도 안 하는 칸」이 제일 헷갈린다.
     */
    ok(/type === 'info' \? \([\s\S]{0,400}해당 없음/.test(editor2), '정보글에는 지점 대신 「해당 없음」을 보여준다')

    /*
     * ─── 고쳐 쓰기가 보내는 목록은 「지금 걸린 것」이어야 한다 (2026-08-27) ──────
     *
     * 회원: "검수항목 고쳐쓰기해도 반영이 안돼."
     *
     * 예전에는 **서버가 지난번 응답에 실어 보낸 목록**(fixIssues state)을 그대로 되보내면서
     * 본문은 **지금 화면에 있는 글**을 보냈다. 둘이 어긋나면 모델은 이미 없는 항목을 고치라는
     * 말을 듣고 지금 걸린 항목은 듣지 못한다 — 그러면 아무것도 안 고쳐지고 「나아지지 않아
     * 원래 글을 두었습니다」가 뜬다.
     */
    ok(/issues: liveFixIssues/.test(editor2), '고쳐 쓰기에 지금 걸린 항목을 넘긴다')
    ok(!/issues: fixIssues/.test(editor2), '서버가 준 옛 목록을 되보내지 않는다')
    ok(/fixList\(result\.items, result\.risks\)/.test(editor2), '서버와 같은 fixList 를 쓴다 (두 곳에 따로 적지 않는다)')
    // 저장해 둔 79점짜리 글을 열어도 고칠 방법이 화면에 있어야 한다
    ok(/body\.trim\(\) && liveFixIssues\.length > 0/.test(editor2), 'AI 로 안 쓴 글에도 고쳐 쓰기 버튼이 나온다')
    // 무엇이 버티고 있는지 이름을 적는다 — 그게 곧 다음 할 일이다
    ok(/failNames/.test(editor2), '남은 수정필요 항목 이름을 화면에 적는다')

    /*
     * ─── 「Failed to fetch」를 그대로 보여주지 않는다 (2026-08-28) ──────────
     *
     * 회원: "글쓰기에서 오류나" — 화면에 그 영어 한 줄만 떠 있었다.
     *
     * 서버가 낸 오류가 아니라 **브라우저가 연결을 놓은 것**이다. 같은 요청을 프로덕션에
     * 직접 넣어 보니 56초 만에 200 으로 글이 나왔다 — 서버는 멀쩡했다. 휴대폰에서 글 한
     * 편에 1~2분이 걸리는 사이 화면이 꺼지거나 다른 앱으로 넘어가면 요청이 끊긴다.
     *
     * 회원이 할 일은 「화면 켜 두고 다시 누르기」인데 영어 한 줄로는 알 수 없다.
     */
    ok(/Failed to fetch\|NetworkError\|Load failed/.test(editor2), '연결이 끊긴 경우를 따로 알아본다')
    ok(editor2.includes('서버 오류가 아니라'), '서버 탓이 아니라고 밝힌다')
    ok(editor2.includes('화면을 켜 둔 채로 다시 눌러 주세요'), '무엇을 하면 되는지 말해준다')
    // 끊겨도 안 잃는 길 — 자동 작성의 「지금 한 편 쓰기」는 서버에서만 돌아 초안이 저장된다
    ok(editor2.includes('지금 한 편 쓰기'), '끊겨도 잃지 않는 길을 함께 알려준다')

    /*
     * 08-27 에 정보글 화자를 일반 블로거로 바꾸면서 「상담 경험」이라는 말이 없어졌는데
     * 안내 문구에 남아 있었다 — 화면이 검수가 막는 말을 권하고 있었던 셈이다.
     */
    ok(!editor2.includes('상담 경험'), '옛 안내(상담 경험)가 남아 있지 않다')

    /*
     * **버튼의 화자 라벨은 지시문과 같아야 한다.** 08-27 에 정보글 화자를 일반 블로거로
     * 바꿔 놓고 라벨만 「센터 · 정보 전달」로 남아 있었다 — 누르기 전에 보라고 만든 라벨이
     * 거짓말을 하고 있었다.
     */
    ok(/info: '일반 블로거'/.test(editor2), '정보글 버튼이 화자를 일반 블로거로 적는다')
    // 주석에 옛 값이 왜 바뀌었는지 적혀 있으므로, 주석을 떼고 본다 (부정 검사의 기본 규칙)
    const editorCode = editor2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    ok(!/센터 · 정보 전달/.test(editorCode), '옛 화자 라벨이 남아 있지 않다')
    // 값도 새어 나가지 않아야 한다 — 「값을 주면 쓰게 된다」가 이 저장소의 반복된 실패다
    ok(/const effStoreId = type === 'info' \? '' : storeId/.test(editor2), '정보글이면 지점 값을 비운다')
    ok(!/storeId: store\.id/.test(editor2), '생성 요청에도 지점을 그대로 싣지 않는다')
    // state 는 지우지 않는다 — 홍보글로 되돌릴 때 고르셨던 지점이 살아 있어야 한다
    ok(/setStoreId/.test(editor2), '지점 선택 자체는 남는다 (유형을 되돌리면 돌아온다)')

    /*
     * **한쪽만 고치면 생성 버튼이 400 으로 죽는다.** 화면에서 칸을 없앴으면 라우트도
     * 지점 없이 받아야 한다 — 이 저장소가 반복해서 겪은 실패다.
     */
    const writeRoute = require('node:fs').readFileSync(new URL('../app/api/write/route.ts', import.meta.url), 'utf8')
    ok(/if \(!store && body\.type !== 'info'\)/.test(writeRoute), '정보글은 지점 없이도 생성된다')
    ok(!/legalName: store\.legalName/.test(writeRoute), '지점이 없어도 터지지 않는다 (검수에 넘기는 값)')
    /*
     * **한 화면에서 반대를 시키지 않는다.** 경고 상자 바로 아래 「경쟁 센 자리」 문단이
     * 정보글에도 「제목에 업체 이름을 넣으라」고 말하고 있었다 (08-20 판이 남아 있었다).
     */
    ok(/type === 'info' \? \(\s*<>[\s\S]{0,400}그건 홍보글·후기글이 하는 일입니다/.test(editor2),
      '경쟁 자리 안내가 정보글에는 다른 말을 한다')
    ok(editor2.includes("from '@/lib/writing/topic-explore'"), '탐색기와 같은 기준을 쓴다 (두 곳에 따로 적지 않는다)')
    // 결과가 펼쳐진 채로 있으면 아래 생성 버튼이 화면 밖으로 밀린다 (자동 작성에서 겪었다)
    ok(/<details[\s\S]{0,300}주제 탐색[\s\S]{0,1600}<TopicExplorer/.test(editor2), '글 작성에서도 접어 둔다')
    // 탐색기가 두 벌이 되지 않았는지 (복사해 두면 한쪽만 고치게 된다)
    const { existsSync } = require('node:fs')
    ok(!existsSync(new URL('../app/posts/TopicExplorer.tsx', import.meta.url)), '탐색기를 복사해 두지 않았다')
    ok(ui.includes('onPick'), '고른 주제를 설정으로 넘긴다')

    const panel = rf(new URL('../app/posts/AutoDraftPanel.tsx', import.meta.url), 'utf8')
    ok(/<TopicExplorer picked=\{plan\.topics \?\? \[\]\} onPick=\{addTopic\} \/>/.test(panel), '탐색기에서 담은 주제가 설정 목록으로 들어간다')

    /*
     * **저장된 것을 어디서 보나** (2026-08-24). 회원 질문: "저장된 내용 수정하거나 삭제
     * 확인하고 싶으면 어디서 봐야해?" 여태 저장값은 편집 칩에 섞여만 있었고, 그 칩들은
     * 탐색 결과 열두 줄 아래에 파묻혀 있었다.
     */
    ok(panel.includes('지금 저장된 설정'), '저장된 것을 한 곳에 모아 보여준다')
    ok(panel.includes('const [stored, setStored]'), '저장본을 편집본과 따로 든다')
    ok(panel.includes('const dirty = !same(plan, stored)'), '둘이 다른지 안다')
    ok(panel.includes('아직 저장 안 됨') && panel.includes('되돌리기'), '안 저장된 변경을 알리고 되돌릴 수 있다')
    /*
     * **저장하면 저장본도 갱신돼야 한다.** 안 그러면 저장한 뒤에도 「아직 저장 안 됨」이
     * 계속 떠서, 회원은 저장이 안 된 줄 알고 다시 누른다.
     */
    ok(/setPlan\(fresh\)[\s\S]{0,80}setStored\(fresh\)/.test(panel), '저장하면 저장본도 함께 갱신한다')
    // 탐색 결과가 펼쳐진 채로 있으면 저장된 설정과 저장 버튼이 화면 밖으로 밀린다
    ok(/<details[\s\S]{0,400}주제 탐색[\s\S]{0,300}<TopicExplorer/.test(panel), '탐색은 접어 둔다')
    /*
     * **담으면서 곧바로 켜야 한다.** 더하기만 하고 꺼진 채로 두면 회원은 담은 줄 알지만
     * 실제로는 안 쓰인다 — 고른 것이 없으면 기본 10개를 전부 쓰는 규칙이라 티도 안 난다.
     */
    ok(/const addTopic[\s\S]{0,400}topics: \[\.\.\.\(p\.topics \?\? \[\]\), t\]/.test(panel), '담으면 켜진 채로 들어간다')
  }
}

console.log(`\n${fails === 0 ? '✅ 전부 통과' : `❌ 실패 ${fails}건`}`)
process.exit(fails ? 1 : 0)
