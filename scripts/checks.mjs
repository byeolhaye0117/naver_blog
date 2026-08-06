// lib/ 검수 로직 테스트. `npm test` 로 실행된다 (scripts/test.mjs 가 먼저 컴파일).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const OUT = process.env.NBM_TEST_OUT
if (!OUT) {
  console.error('직접 실행하지 말고 `npm test` 를 쓰세요.')
  process.exit(1)
}
const { checkPost, parseBody, PUBLISH_THRESHOLD, SPECS, reachableKeywordRange } = require(`${OUT}/writing/checker.js`)
const { scanRisks, countLoose } = require(`${OUT}/writing/banned.js`)
const { buildTemplate, stripGuides } = require(`${OUT}/writing/templates.js`)
const { buildCopyPackage } = require(`${OUT}/writing/export.js`)
const { analyzeSerp, analyzePastedSerp } = require(`${OUT}/analysis/serp.js`)
const { parsePastedSerp, parseEditedList, parseTotalCount, toEditableText, parsePlaceList } = require(
  `${OUT}/analysis/paste.js`
)
const { parseManualRows, buildManualMetrics, buildMetric, areasFromStore, suffixesForStore, combineLocalKeywords, isRelevantKeyword, myRegionTokens, INTENT_SUFFIXES } = require(`${OUT}/analysis/keyword.js`)
const { parseSectionTotal, parseSectionPosts, monthlyFromWeek, resolveRecent, SECTION_CAP, normalizeBlogUrl, SECTION_PAGE_SIZE } = require(
  `${OUT}/naver/blogsection.js`
)
const { parsePlaceRecords, areasFromPlace, findMyPlaceIndex } = require(`${OUT}/naver/place.js`)
const { mockBlogSearch, mockBlogTotal } = require(`${OUT}/naver/search.js`)
const { mockKeywordTool, dedupeAdRows, toRate } = require(`${OUT}/naver/searchad.js`)
const { gradeKeyword, adNoteFor, adPressureOf, ctrNote, keywordVerdict, PLACE_ABOVE_BLOG, AD_HEAVY, AD_SOME } = require(`${OUT}/analysis/keyword.js`)
const { phaseOf, buildRankViews, autoRankTargets } = require(`${OUT}/analysis/rank.js`)
const { isPartialMonth, completedMonths, momentumOf } = require(`${OUT}/naver/datalab.js`)
const { prescriptionKey, upsertPrescription, findPrescription, prescriptionAgeDays, isPrescriptionStale } = require(
  `${OUT}/analysis/prescription.js`
)
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
  title: '쌍용동 헬스장 새벽 운동 자리, 이번 달 50분까지만',
  mainKeyword: '쌍용동 헬스장',
  subKeywords: ['쌍용동 24시헬스장', '봉명동 PT'],
  legalName: 'MTO 피트니스 쌍용점',
  womenOnly: false,
  tags: ['쌍용동 헬스장','쌍용동 24시헬스장','봉명동 PT','천안헬스장','쌍용동PT','새벽운동','교대근무','헬스장추천','운동기록'],
  body: `[이미지: 새벽 시간대 시설 전경 + 이번 달 등록 혜택 배지]
야간 근무 끝나고 집에 가는 길, 운동하려고 마음먹었는데 문 열린 곳이 없어서 그냥 지나친 날이 있으셨을 거예요. 안녕하세요, MTO 피트니스 쌍용점입니다. 쌍용동 헬스장을 알아보면서 시간이 안 맞아 접어두셨다면 이 글이 도움이 될 것 같아요. 이번 달 새로 오시는 분들께 3개월 등록비를 크게 낮춘 등록 이벤트를 열었는데, 선착순 50분까지만 받습니다.

[이미지: 새벽 시간대 운동하는 회원]
## 상담 때 가장 자주 듣는 첫마디
"제 시간에 문 여는 데가 없어요." 이 말을 정말 많이 듣습니다. 3교대로 근무하시는 분, 새벽에 퇴근하시는 분, 아이 재우고 나서야 겨우 한 시간이 나는 분. 운동할 마음은 있는데 시간이 맞지 않아 포기하신 경우가 대부분이었어요. 등록만 하고 세 번 가고 끝났다는 말씀도 자주 듣습니다. 돈이 아까운 것보다 스스로에 대한 실망이 더 크다고 하시더라고요. 몇 달 지나 다시 오셨을 때 "이번엔 진짜 다닐 수 있을까요" 하고 물으시는 분도 계십니다. 그 마음, 저희도 압니다. 그래서 저희가 먼저 바꿔야 한다고 생각했어요.

[이미지: 프리웨이트실과 웨이트실 분리 구조]
## 문을 닫지 않기로 했습니다
그래서 24시간 운영을 택했습니다. 새벽 세 시에 오셔도 불이 켜져 있어요. 쌍용동 24시헬스장을 찾으시는 분들이 실제로 가장 많이 오시는 시간이 새벽 다섯 시에서 일곱 시 사이입니다. 기다리는 시간이 없어야 운동이 된다고 생각해서 구조도 바꿨습니다. 프리웨이트실과 웨이트실을 아예 분리했어요. 랙과 스미스머신이 네 대, 리니어 로우와 핵스쿼트 머신도 따로 있습니다. 인기 있는 펙덱플라이와 랫풀다운, 롱풀, 레그익스텐션은 두 대 이상 놓았습니다. 한 대뿐이면 결국 누군가는 기다려야 하니까요. 천국의 계단은 네 대라 줄 서는 일이 없습니다.

무동력 트레드밀, 아크트레이너, 제로러너, 스텝퍼도 있어서 유산소가 지겨워지지 않아요. 청소업체가 주 세 번 들어옵니다. 새벽에 오셔도 바닥이 끈적하지 않다는 말씀을 자주 들어요. 쌍용동 헬스장 중에 새벽에 사람이 있는 곳을 찾으셨다면 여기가 맞을 겁니다.

[이미지: 샤워시설]
## 28년을 한자리에서
MTO 피트니스 쌍용점은 이 자리에서 28년 넘게 운영했습니다. 그동안 동네 헬스장 여럿이 문을 열고 닫는 걸 봤어요. 오래 버틴다는 건 회원님들이 계속 오셨다는 뜻이라고 생각합니다. 샤워실은 열 명이 동시에 쓸 수 있고 드라이기와 바디드라이기도 갖췄습니다. 출근 전에 운동하고 씻고 바로 나가시는 분들이 많아서 여기에 특히 신경을 썼어요. 새 기구도 계속 들입니다. 아래까지 안 내려가셔도 됩니다. 지금 궁금한 게 있으시면 전화 주셔도 돼요.

[이미지: 이벤트 안내]
## 이번 달 등록 혜택
이번 달 새로 등록하시는 분께 3개월 등록비를 낮춰 드립니다. 선착순 50분까지고, 이번 달이 지나면 마감됩니다. 봉명동 PT를 알아보시던 분들도 같은 조건으로 상담받으실 수 있어요. 정확한 금액과 조건은 방문 상담 때 안내드립니다. 전화로 여쭤보셔도 됩니다. 조건이 복잡하지 않아서 통화 한 번이면 정리됩니다.

[이미지: 상담 데스크]
## 구경만 하고 가셔도 됩니다
등록하실 마음이 없어도 괜찮습니다. 시설만 보고 가시는 분도 많아요. 저희가 붙잡지 않습니다. 쌍용동 헬스장 알아보시는 중이라면 편하게 들러서 보시고, 아니면 그냥 나가시면 됩니다. 선착순 50분 마감이라 자리 확인은 미리 해두시는 게 좋아요. MTO 피트니스 쌍용점은 신협 뒷건물 4층입니다. 전화 010-2455-2896 으로 주시면 바로 안내드립니다.
`,
}
const c1 = checkPost(goodPromo)
console.log(`  점수 ${c1.score} · ${c1.stats.charCount}자 · 메인KW ${c1.stats.mainKeywordCount}회 (밀도 ${c1.stats.mainKeywordDensity}%) · 상호명 ${c1.stats.legalNameCount}회 · 소제목 ${c1.stats.headings.length} · 이미지 ${c1.stats.imageCount} · 태그 ${c1.stats.tagCount}`)
console.log(`  전화 ${c1.stats.phoneCount}회 · 링크 ${c1.stats.linkCount}개 · 등간격 ${c1.stats.evenSpacing} · 어미 ${JSON.stringify(c1.stats.sentenceEndings)}`)
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
ok(c1.stats.imageCount === 6 && c1.stats.headings.length === 5, '이미지 6 / 소제목 5')
ok(c1.score === PUBLISH_THRESHOLD - 6, '수정필요가 있으면 발행 구간 아래로 캡', `${c1.score} (캡 ${PUBLISH_THRESHOLD - 6})`)
// 미달 항목을 정확히 지적하는지
// 하한을 실측에 맞춰 3회로 내렸으므로 4회는 통과다 (예전 5회 하한에서는 warn 이었다)
ok(c1.items.find(i => i.id === 'mainCount')?.level === 'warn', '메인KW 4회는 warn (하한 5회에 1회 미달)', c1.items.find(i => i.id === 'mainCount')?.value)
// 통과 하한을 1,750자로 내렸으므로 1,558자는 fail 이 아니라 warn 이다 (하한-250 = 1,500)
ok(c1.items.find(i => i.id === 'charCount')?.level === 'warn', '1,558자는 warn (하한 1,750자에 조금 미달)', c1.items.find(i => i.id === 'charCount')?.value)
ok(c1.items.find(i => i.id === 'titleKeyword')?.level === 'pass', '제목 앞쪽 키워드 pass')
ok(c1.items.find(i => i.id === 'first100')?.level === 'pass', '첫 100자 키워드 pass')
ok(c1.items.find(i => i.id === 'imagePlacement')?.level === 'pass', '이미지 배치 pass')

// ─────────────────────────────────────────────────────────────
console.log('\n[5] 위험한 글은 낮은 점수')
const badPromo = { ...goodPromo, title: '최고의 헬스장! 지역 1위!', body: '저희는 최고의 시설과 무조건 확실히 빠지는 프로그램으로 한 달 5kg 감량 보장합니다. 통증 치료도 가능하고 할인 할인 할인 특가 이벤트 이벤트 이벤트 무료 무료 혜택 혜택 혜택입니다. 010-1111-2222 010-3333-4444', tags: [] }
const c2 = checkPost(badPromo)
console.log(`  점수 ${c2.score} · 위험표현 ${c2.risks.length}건 (즉시수정 ${c2.risks.filter(r=>r.level==='fail').length}건)`)
ok(c2.score < 40, '위험한 글은 40점 미만', `${c2.score}`)
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
ok(pkg.imagePlan.length === 6, `이미지 배치표 ${pkg.imagePlan.length}행`)
ok(pkg.imagePlan[0].slot.includes('대표'), '첫 이미지는 대표이미지')
ok(pkg.imagePlan[1].slot.includes('상담 때'), '2번째는 첫 소제목 위', pkg.imagePlan[1].slot)
ok(pkg.tags.startsWith('#'), '태그에 # 붙음')
console.log(`  파일명 예: ${pkg.imagePlan[0].fileName} / alt: ${pkg.imagePlan[0].altText}`)

// ─────────────────────────────────────────────────────────────
console.log('\n[8] 후기글 협찬 표기')
const rev = { type:'review', title:'쌍용동 헬스장 3개월 다녀본 후기', mainKeyword:'쌍용동 헬스장', subKeywords:['쌍용동PT'], tags:['쌍용동 헬스장','쌍용동PT'], body:'쌍용동 헬스장을 알아보다 다녀왔습니다.', sponsorship:'sponsored' }
const c4 = checkPost(rev)
ok(c4.items.find(i=>i.id==='sponsorship')?.level === 'fail', '협찬인데 표기 없으면 fail')
const c5 = checkPost({ ...rev, tags:[...rev.tags,'협찬후기'] })
ok(c5.items.find(i=>i.id==='sponsorship')?.level === 'pass', '#협찬후기 있으면 pass')
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
const base = { stores: [{ id: 's' }], posts: [], rankTargets: [], fallenCount: 0, stuck: [], balance: OKB, cadence: OKC, keys: KEYS }

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

// 순위 하락은 균형·주기보다 급하다
const fallen = nextActions({
  ...base,
  posts: [{ status: 'published' }],
  rankTargets: [{ id: 't' }],
  fallenCount: 2,
  stuck: [],
  balance: { level: 'warn', ratio: '0 : 1', info: 0, promo: 1, review: 0 },
})
ok(fallen[0].id === 'fallen', `밀린 키워드가 먼저 — ${fallen[0].id}`)
ok(fallen[0].title.includes('2개'), '몇 개가 밀렸는지 밝힌다')

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
const { extractJson, extractText, pickModel } = require(`${OUT}/ai/llm.js`)
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
const { buildBlogProfile, classifyBlogger, queryFromTitle, meaningForUs, gradeBlog, KIND_LABEL, GRADE_LABEL, GRADE_LADDER } =
  require(`${OUT}/analysis/blogscore.js`)

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

// 업계 은어(최적·준최·저품질)를 표본으로 흉내낸 등급 — 두 축(30위 내 / 1페이지)으로 쪼갠다
ok(gradeBlog({ samples: 0 }).grade === 'unknown', '표본이 없으면 판정하지 않는다')

// 색인부터 본다 — 제목 완전일치인데도 안 나오면 그게 "저품질" 의 실체다
const DROP = gradeBlog({ indexedRate: 0, exposureRate: 0, samples: 5 })
ok(DROP.grade === 'dropped', '제목 그대로 검색해도 안 나오면 누락 의심', DROP.grade)
ok(DROP.reason.includes('색인 전일 수 있'), '방금 올린 글일 수 있다는 여지를 남긴다')
const PART = gradeBlog({ indexedRate: 67, exposureRate: 90, firstPageRate: 80, samples: 6 })
ok(PART.grade === 'partial', '일부만 색인되면 노출력이 좋아도 부분 누락', PART.grade)

// 최적 구간은 1페이지 비율로 갈린다
ok(gradeBlog({ indexedRate: 100, exposureRate: 90, firstPageRate: 70, samples: 10 }).grade === 'optimal1', '최적 1')
ok(gradeBlog({ indexedRate: 100, exposureRate: 90, firstPageRate: 45, samples: 10 }).grade === 'optimal2', '최적 2')
ok(gradeBlog({ indexedRate: 100, exposureRate: 75, firstPageRate: 25, samples: 10 }).grade === 'optimal3', '최적 3')
// 같은 노출률이어도 1페이지가 없으면 준최다 — 이게 쪼갠 이유다
const SAME = gradeBlog({ indexedRate: 100, exposureRate: 90, firstPageRate: 0, samples: 10 })
ok(SAME.grade === 'semi1', '30위 안에 다 걸려도 1페이지가 없으면 준최 1', SAME.grade)

ok(gradeBlog({ indexedRate: 100, exposureRate: 45, firstPageRate: 10, samples: 10 }).grade === 'semi2', '준최 2')
ok(gradeBlog({ indexedRate: 100, exposureRate: 30, firstPageRate: 0, samples: 10 }).grade === 'semi3', '준최 3')
ok(gradeBlog({ indexedRate: 100, exposureRate: 15, firstPageRate: 0, samples: 10 }).grade === 'normal', '일반')

// **핵심**: 노출력만으로 저품질을 말하면 안 된다 (hyoni2_ 는 0% 였는데 우리 키워드 1위였다)
const LOW = gradeBlog({ indexedRate: 100, exposureRate: 0, firstPageRate: 0, samples: 10 })
ok(LOW.grade === 'weak', '색인 정상인데 노출률 0 이면 "약함" 이지 저품질이 아니다', LOW.grade)
ok(LOW.reason.includes('저품질이 아닙니다'), '저품질이 아니라고 분명히 말한다')
ok(gradeBlog({ indexedRate: 100, samples: 3 }).grade === 'normal', '노출력을 못 재면 색인만으로 일반')

// 사다리는 강한 것부터 약한 것 순서여야 화면에서 위치가 읽힌다
ok(GRADE_LADDER[0] === 'optimal1' && GRADE_LADDER[GRADE_LADDER.length - 1] === 'dropped', '사다리 순서')
ok(GRADE_LADDER.length === 10, '10칸', String(GRADE_LADDER.length))
ok(GRADE_LADDER.every((g) => GRADE_LABEL[g]), '모든 칸에 한국어 이름이 있다')
ok(GRADE_LABEL['optimal1'] === '최적 1' && GRADE_LABEL['semi3'] === '준최 3', '이름 표기')
// 사다리 순서가 실제 판정 강도와 맞는지 (위 칸이 더 좋은 조건에서 나와야 한다)
const strong = gradeBlog({ indexedRate: 100, exposureRate: 90, firstPageRate: 70, samples: 10 }).grade
const weaker = gradeBlog({ indexedRate: 100, exposureRate: 30, firstPageRate: 0, samples: 10 }).grade
ok(GRADE_LADDER.indexOf(strong) < GRADE_LADDER.indexOf(weaker), '좋은 조건이 사다리 위쪽에 온다')

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
const { diagnose, diagnosisToPrescription, shouldDiagnose, fromAppPost, fromPublished, OUT_OF_RANGE, FIRST_PAGE, SETTLE_DAYS } =
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
    freshWithin30dRate: 70, datedCount: 12, bloggerKnownCount: 12,
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
const { indexVerdict, buildIndexCheck, summarizeIndex, verdictNote, VERDICT_LABEL, VERDICT_TONE } =
  require(`${OUT}/analysis/indexcheck.js`)

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
const { countSignals, contentBalance, INFO_MIN, INFO_MIN_BY_TYPE, PROMO_MAX, PROMO_MAX_BY_TYPE, INFO_WORDS, PROMO_WORDS } =
  require(`${OUT}/analysis/content.js`)

// 종류를 센다 — 횟수를 세면 같은 말을 반복해 점수를 올릴 수 있다
const cbRep = countSignals('자세 자세 자세 자세 자세 자세 자세 자세')
ok(cbRep.info === 1, '같은 말을 열 번 써도 1종류', String(cbRep.info))
const cbMany = countSignals('자세와 루틴, 식단과 유산소, 스트레칭까지')
ok(cbMany.info === 5, '다른 말은 각각 센다', String(cbMany.info))
ok(cbMany.infoFound.includes('루틴'), '무엇이 들어 있었는지 담는다')

// 실측한 4위 글 — 홍보 표현을 다 넣은 글
const cbPushy = contentBalance('상담 예약 이벤트 할인 영업시간 문의 주세요. 시설이 넓습니다.')
ok(cbPushy.signals.promo > PROMO_MAX, '홍보 표현이 많은 것을 잡는다', String(cbPushy.signals.promo))
ok(cbPushy.level === 'both' || cbPushy.level === 'pushy', '판정', cbPushy.level)
ok(cbPushy.promoNote.includes('한 곳에 모으고'), '무엇을 하라고 말한다')
ok(cbPushy.promoNote.includes('1~3위 평균 2.0'), '실측 근거를 함께 준다')

// 실측한 2위 글 모양 — 순수 소개글인데도 정보가 들어 있었다 (자세·식단·유산소·스트레칭)
const cbOk = contentBalance(
  '쌍용역 5분 거리입니다. 유산소는 이 시간대에, 자세는 이렇게 잡으세요. 식단은 단백질부터. 스트레칭도 함께. 궁금하면 문의 주세요.'
)
ok(cbOk.level === 'good', '정보가 있고 홍보가 절제되면 통과', cbOk.level)
ok(cbOk.signals.info >= INFO_MIN, `정보 ${INFO_MIN}종류 이상`, String(cbOk.signals.info))
ok(cbOk.infoNote.includes('상위권 수준'), '통과했다고 말해준다')

// 시설·이벤트만 쓴 글 — 회원이 말한 그 글
const cbThin = contentBalance(
  '런닝머신 10대, 스미스머신 2대가 있습니다. 이번 달 신규 등록 이벤트 진행합니다. 문의 주세요.'
)
ok(cbThin.level === 'thin' || cbThin.level === 'both', '시설·이벤트만 쓰면 걸린다', cbThin.level)
ok(cbThin.infoNote.includes('무엇을 어떻게 한다'), '고치는 방법을 말한다', cbThin.infoNote)
ok(cbThin.infoNote.includes('5.2종류'), '상위권 실측값을 근거로 준다')

// 홍보가 하나도 없으면 그것도 알려준다 (우리 글은 상담으로 이어져야 한다)
const cbNoPromo = contentBalance('자세와 루틴, 식단과 유산소, 스트레칭을 다룹니다.')
ok(cbNoPromo.level === 'good', '정보만 있어도 균형 자체는 통과')
ok(cbNoPromo.promoNote.includes('마지막에 한 번은 넣으세요'), '홍보가 0이면 넣으라고 한다')

ok(INFO_MIN === 4 && PROMO_MAX === 3, '실측으로 잡은 기준선')
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
ok(promoItem.level !== 'pass', '홍보 표현이 많으면 걸린다', `${promoItem.value} ${promoItem.level}`)
ok(infoItem.target.includes('5.2'), '목표에 상위권 실측값을 적는다', infoItem.target)

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
ok(promoSkeleton.includes('시설 스펙을 나열하지 않는다'), '시설 나열을 금지한다')
ok(promoSkeleton.includes('자극(어디에 오는지)'), '무엇을 쓰라고 짚어준다 (실측으로 갈린 말)')
ok(promoSkeleton.includes('런닝머신 10대" (X)'), '나쁜 예와 좋은 예를 같이 준다')
ok(promoSkeleton.includes('중간 CTA 를 넣지 않는다'), '중간 CTA 를 없앤다')
ok(promoSkeleton.includes('이벤트 예고는 **한 줄로만**'), '후킹의 이벤트 예고를 한 줄로 줄인다')
/*
 * 영상은 안내(`> `)가 아니라 **표기**로 넣는다 — 안내는 복사할 때 지워지므로,
 * 안내로만 두면 네이버에 붙이는 순간 영상 자리가 사라진다.
 */
ok(promoSkeleton.includes('[영상:'), '영상 자리를 표기로 넣는다')
ok(promoSkeleton.includes('10~20초'), '영상 길이까지 알려준다')
ok(stripGuides(promoSkeleton).includes('[영상:'), '복사 본문에도 영상 자리가 남는다')
// 홍보를 없애지는 않는다 — 이 글의 목적은 상담이다
ok(promoSkeleton.includes('7단계 CTA'), 'CTA 단계는 그대로 남긴다')
ok(promoSkeleton.includes('6단계 이벤트 본공개'), '이벤트 단계도 그대로 남긴다')
ok(promoSkeleton.includes('해결 (620~720자'), '해결 구간을 늘렸다 (450~550 → 620~720)')


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
ok(INFO_MIN_BY_TYPE.promo === 4, '홍보글은 시설·이벤트 말고 실행 정보까지')
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
ok(tbRevSkel.includes('6단계 이벤트 (180~220자)'), '이벤트 단락을 줄였다 (280~320 → 180~220)')
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
 * 홍보글에서 CTA 수단을 쓰면 상담·전화로 2종류가 필연적으로 소진된다. 상한 3 은
 * 홍보글에 「혜택 이름 하나만 쓰라」는 뜻이 되어, 정상 글이 주의를 맞았다.
 * 대신 정보글은 2 로 조인다 — 전체 압력은 그대로 두고 배분만 바꿨다.
 */
ok(PROMO_MAX_BY_TYPE.promo === 4, '홍보글은 4종류까지 (CTA 수단이 2종류를 쓴다)')
ok(PROMO_MAX_BY_TYPE.info === 2, '정보글은 2종류로 조인다')
ok(PROMO_MAX_BY_TYPE.review === 3, '후기글은 3종류')
const PM_TEXT = '상담은 전화로 받습니다. 신규 등록 혜택이 있습니다.'
ok(countSignals(PM_TEXT).promo === 4, '상담·전화·신규·혜택 = 4종류', String(countSignals(PM_TEXT).promo))
ok(contentBalance(PM_TEXT, 'promo').level !== 'pushy', '홍보글에서는 통과한다')
// 이 짧은 예문은 정보도 0종류라 정보글에서는 두 축이 같이 걸린다 ('both')
const pmInfo = contentBalance(PM_TEXT, 'info')
ok(pmInfo.level === 'both', '정보글에서는 홍보 과다 + 정보 부족이 같이 걸린다', pmInfo.level)
ok(contentBalance(PM_TEXT, 'info').promoNote.includes('상한은 2종류'), '유형 상한을 밝힌다')

// ─────────────────────────────────────────────────────────────
console.log('\n[58] 맞춤법 검사 — 0건과 「못 읽음」을 섞지 않는다')
const { parsePassportKey, parseSpellResult, chunkForSpell, spellHeadline, CHUNK_MAX } =
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
ok(titleAdvice('쌍용동 헬스장 추천!').includes('눈에 띄지 않습니다'), '후기형에 왜 아쉬운지 말한다')
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
ok(buildSystemPrompt('promo').includes('질문형이 0편'), 'AI 지시문에도 넣는다')

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
ok(rkSkel.includes('해결 (620~720자'), '해결 구간을 늘렸다 (500~600 → 620~720)')
ok(rkSkel.includes('이벤트 본공개 (220~260자'), '이벤트를 줄였다 (280~320 → 220~260)')
ok(rkSkel.includes('공감 (280~330자'), '공감도 조금 줄였다')
ok(rkSkel.includes('줄인 자리다'), '왜 줄였는지 적는다')
ok(buildSystemPrompt('promo').includes('해결 620~720자'), 'AI 지시문도 같은 숫자')
ok(buildSystemPrompt('promo').includes('이벤트 220~260자'), 'AI 지시문 이벤트도 같은 숫자')

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

console.log(`\n${fails === 0 ? '✅ 전부 통과' : `❌ 실패 ${fails}건`}`)
process.exit(fails ? 1 : 0)
