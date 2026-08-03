// lib/ 검수 로직 테스트. `npm test` 로 실행된다 (scripts/test.mjs 가 먼저 컴파일).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const OUT = process.env.NBM_TEST_OUT
if (!OUT) {
  console.error('직접 실행하지 말고 `npm test` 를 쓰세요.')
  process.exit(1)
}
const { checkPost, parseBody, PUBLISH_THRESHOLD } = require(`${OUT}/writing/checker.js`)
const { scanRisks, countLoose } = require(`${OUT}/writing/banned.js`)
const { buildTemplate, stripGuides } = require(`${OUT}/writing/templates.js`)
const { buildCopyPackage } = require(`${OUT}/writing/export.js`)
const { analyzeSerp, analyzePastedSerp } = require(`${OUT}/analysis/serp.js`)
const { parsePastedSerp, parseEditedList, parseTotalCount, toEditableText, parsePlaceList } = require(
  `${OUT}/analysis/paste.js`
)
const { parseManualRows, buildManualMetrics, buildMetric, areasFromStore, suffixesForStore, combineLocalKeywords, isRelevantKeyword, myRegionTokens, INTENT_SUFFIXES } = require(`${OUT}/analysis/keyword.js`)
const { parseSectionTotal, parseSectionPosts, monthlyFromWeek, resolveRecent, SECTION_CAP } = require(
  `${OUT}/naver/blogsection.js`
)
const { parsePlaceRecords, areasFromPlace, findMyPlaceIndex } = require(`${OUT}/naver/place.js`)
const { mockBlogSearch, mockBlogTotal } = require(`${OUT}/naver/search.js`)
const { mockKeywordTool } = require(`${OUT}/naver/searchad.js`)
const { gradeKeyword } = require(`${OUT}/analysis/keyword.js`)
const { phaseOf, buildRankViews } = require(`${OUT}/analysis/rank.js`)
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
그래서 24시간 운영을 택했습니다. 새벽 세 시에 오셔도 불이 켜져 있어요. 쌍용동 24시헬스장을 찾으시는 분들이 실제로 가장 많이 오시는 시간이 새벽 다섯 시에서 일곱 시 사이입니다. 기다리는 시간이 없어야 운동이 된다고 생각해서 구조도 바꿨습니다. 프리웨이트실과 웨이트실을 아예 분리했어요. 랙과 스미스머신이 네 대, 리니어 로우와 핵스쿼트 머신도 따로 있습니다. 인기 있는 펙덱플라이와 랫풀다운, 롱풀, 레그익스텐션은 두 대 이상 놓았습니다. 한 대뿐이면 결국 누군가는 기다려야 하니까요. 천국의 계단은 네 대라 줄 서는 일이 없습니다. 무동력 트레드밀, 아크트레이너, 제로러너, 스텝퍼도 있어서 유산소가 지겨워지지 않아요. 청소업체가 주 세 번 들어옵니다. 새벽에 오셔도 바닥이 끈적하지 않다는 말씀을 자주 들어요. 쌍용동 헬스장 중에 새벽에 사람이 있는 곳을 찾으셨다면 여기가 맞을 겁니다.

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
ok(c1.items.find(i => i.id === 'mainCount')?.level === 'warn', '메인KW 4회는 warn (하한 5회 미달)')
ok(c1.items.find(i => i.id === 'charCount')?.level === 'fail', '1,558자는 fail (하한 1,900자 미달)')
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
const base = { stores: [{ id: 's' }], posts: [], rankTargets: [], fallenCount: 0, balance: OKB, cadence: OKC, keys: KEYS }

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
ok(sysReview.includes('방문객'), '후기글 화자는 방문객')
ok(sysReview.includes('"후기"'), '후기글은 제목에 후기 명시 지시')
ok(sysReview.includes('1,900') && sysReview.includes('2,100'), '후기글 글자수 기준이 지시문에 있다')
ok(sysReview.includes('3~5회'), '후기글 메인 키워드 3~5회')
const sysPromo = buildSystemPrompt('promo')
ok(sysPromo.includes('센터'), '홍보글 화자는 센터')
ok(sysPromo.includes('5~7회'), '홍보글 메인 키워드 5~7회')
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
const { splitKeyword, pairSynergy, buildKeywordSets, writeHrefForSet, INTENT_META } = require(
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

console.log(`\n${fails === 0 ? '✅ 전부 통과' : `❌ 실패 ${fails}건`}`)
process.exit(fails ? 1 : 0)
