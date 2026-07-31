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
const { parsePastedSerp, parseEditedList, parseTotalCount, toEditableText } = require(
  `${OUT}/analysis/paste.js`
)
const { parseManualRows, buildManualMetrics } = require(`${OUT}/analysis/keyword.js`)
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
// 목업 값이 한쪽 등급으로 몰리면 도구가 쓸모없어진다. 분포가 살아 있는지 지킨다.
const AREAS = ['쌍용동','봉명동','성정동','두정동','용곡동','신방동','불당동','청당동']
const BASES = ['헬스장','PT','피트니스','24시 헬스장','여성전용 헬스장']
const INFO = ['다이어트 정체기 극복','헬스 초보 운동 순서','직장인 다이어트 식단','공복 유산소 효과',
  '교대근무 운동 시간','하체 운동 순서','운동 후 근육통','힙업 운동','거북목 운동','새해 운동 계획']
const hints = [...AREAS.flatMap(a => BASES.map(b => `${a} ${b}`)), ...INFO]
const dist = {}
let n = 0
for (const h of hints) {
  for (const row of mockKeywordTool([h])) {
    const g = gradeKeyword(row.monthlySearch, mockBlogTotal(row.keyword)).grade
    dist[g] = (dist[g] ?? 0) + 1
    n++
  }
}
const pctOf = (g) => ((dist[g] ?? 0) / n) * 100
console.log(`  n=${n} ` + Object.entries(dist).map(([g, c]) => `${g}=${((c/n)*100).toFixed(0)}%`).join(' '))
ok(pctOf('gold') >= 15 && pctOf('gold') <= 45, '황금 키워드 15~45%', `${pctOf('gold').toFixed(0)}%`)
ok(pctOf('good') >= 10, '노려볼 만함 10% 이상', `${pctOf('good').toFixed(0)}%`)
ok(pctOf('hard') >= 10, '경쟁 과열 10% 이상 (전부 쉬워 보이면 안 됨)', `${pctOf('hard').toFixed(0)}%`)
ok(Math.max(...Object.values(dist)) / n < 0.5, '한 등급이 절반을 넘지 않음')

// 등급 경계 자체도 확인
ok(gradeKeyword(1500, 15000).grade === 'gold', '검색량 1500 / 경쟁률 10 → 황금')
ok(gradeKeyword(1500, 150000).grade === 'hard', '검색량 1500 / 경쟁률 100 → 과열')
ok(gradeKeyword(120, 1000).grade === 'toosmall', '검색량 120 → 검색량 부족')
ok(gradeKeyword(50000, 500000).grade === 'toobig', '검색량 5만 → 대형 키워드')

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
  paDated.prescription.some((p) => p.includes('2,345건')),
  '발행량을 넣으면 처방에 반영'
)

console.log('\n[19] 직접 입력 → 경쟁률 등급')
const mr = parseManualRows(`쌍용동 헬스장, 1,200, 45,000
성정동 여성전용 헬스장 | 320회 | 3,100건
두정동 헬스장\t2500\t30000
이건 숫자가 없음
봉명동 헬스장, 1200`)
ok(mr.rows.length === 3, `읽은 줄 3개 — ${mr.rows.length}개`)
ok(mr.bad.length === 2, `못 읽은 줄 2개 — ${mr.bad.length}개`)
ok(mr.rows[0].keyword === '쌍용동 헬스장', '천단위 콤마를 구분자로 착각하지 않음', mr.rows[0].keyword)
ok(mr.rows[0].monthlySearch === 1200 && mr.rows[0].blogTotal === 45000, '숫자 두 개 파싱')
ok(mr.rows[1].monthlySearch === 320 && mr.rows[1].blogTotal === 3100, '| 구분 + 회/건 단위 허용')
ok(mr.rows[2].blogTotal === 30000, '탭 구분 허용')

const mm = buildManualMetrics(mr.rows)
ok(mm.every((m) => m.mock === false && m.source === 'manual'), '직접 입력은 실측값으로 표시')
ok(mm[0].competition === 37.5, `경쟁률 45,000÷1,200 = 37.5 — ${mm[0].competition}`)
ok(mm[0].grade === 'good', `등급 good — ${mm[0].grade}`)
ok(mm[2].grade === 'gold', `2,500회·경쟁률 12 → gold — ${mm[2].grade}`)
ok(
  buildManualMetrics([{ keyword: 'k', monthlySearch: 1000, blogTotal: 200000 }])[0].grade === 'hard',
  '경쟁률 200 → hard'
)

console.log(`\n${fails === 0 ? '✅ 전부 통과' : `❌ 실패 ${fails}건`}`)
process.exit(fails ? 1 : 0)
