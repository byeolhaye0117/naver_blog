/**
 * 본문 생성 지시문 만들기.
 *
 * 규칙을 사람이 읽는 안내문으로 두 번 적지 않는다 — 검수기(SPECS)와 위험 표현
 * 사전(RISK_TERMS)에 이미 있는 기준을 그대로 문장으로 풀어 쓴다. 그래서 검수 기준이
 * 바뀌면 생성 지시도 함께 바뀐다.
 *
 * 순수 함수만 둔다 (테스트 대상). 실제 호출은 lib/ai/claude.ts.
 */
import type { Post, PostType, Store } from '../types'
import { POST_TYPE_LABEL } from '../types'
import { SPECS } from '../writing/checker'
import { RISK_TERMS } from '../writing/banned'

export interface WriteRequest {
  type: PostType
  store?: Store
  mainKeyword: string
  subKeywords: string[]
  /** 정보글의 지역 키워드(조연) */
  localKeyword?: string
  /** 진행 중인 이벤트 — 없으면 이벤트 구간을 쓰지 않는다 */
  eventText?: string
  /** 후기글 대가성 — 'sponsored' 면 첫 화면에 표기해야 한다 */
  sponsorship?: 'own' | 'sponsored' | 'unset'
  /** 유사문서를 피하기 위해 참고하는 같은 지점의 최근 글 */
  recent?: Pick<Post, 'type' | 'title' | 'mainKeyword' | 'introType' | 'angle'>[]
  /** 상위노출 분석에서 나온 처방 (있으면 제목·소재에 반영) */
  prescription?: string[]
}

/** 화자와 목적 — 글 유형이 갈리는 지점은 여기다 */
const VOICE: Record<PostType, string> = {
  promo:
    '화자는 센터(사장·운영자) 본인이다. "안녕하세요, ○○점입니다" 처럼 1인칭으로 말하고, 왜 이렇게 운영하는지를 설명한다. 목적은 방문 상담 예약이다.',
  info:
    '화자는 운동을 아는 사람으로서 정보를 주는 쪽이다. 홍보가 목적이 아니다 — 검색해서 들어온 사람이 실제로 써먹을 정보를 준다. 센터 언급은 마지막 구간에서 한 번만 가볍게, 지역 키워드는 조연으로만 넣는다.',
  review:
    '화자는 센터가 아니라 시설구경·상담을 받고 등록한 방문객(제3자)이다. "저희 센터", "우리 지점" 같은 소속 1인칭을 절대 쓰지 않는다. 시설·강점은 "내가 가서 보고 느낀 것"으로 서술한다. 가벼운 아쉬움을 1~2개 반드시 남긴다 — 단점이 하나도 없는 후기는 광고로 읽힌다.',
}

/** 단계별 구조와 분량 — 검수기의 소제목 수·글자수 기준과 맞춘다 */
const STRUCTURE: Record<PostType, string> = {
  promo: [
    '1) 후킹 200~250자, 소제목 없음. 아픈 지점으로 첫 문장 → 짧은 인사(정식 상호명 1회) → 이벤트 예고(내용은 감춘다).',
    '2) 공감 300~350자, 소제목 있음. 메인 키워드를 넣지 않는다.',
    '3) 해결 450~550자, 소제목 있음. 최대 비중. 시설·24시간·강점으로 고민을 하나씩 해소.',
    '4) 신뢰 250~300자, 소제목 있음. 운영 원칙·연차 같은 검증 가능한 사실.',
    '5) 이벤트 280~320자, 소제목 있음. 혜택·조건·기간을 받은 그대로.',
    '6) 마무리 180~220자, 소제목 있음. 상담 예약 안내 + 메인 키워드 마지막 1회.',
  ].join('\n'),
  info: [
    '1) 후킹 200~250자, 소제목 없음. 검색한 사람의 질문을 그대로 꺼낸다. 첫 100자 안에 정보 메인 키워드 1회.',
    '2) 왜 그런지 300~400자, 소제목 있음. 원리·이유를 설명한다.',
    '3) 방법 600~800자, 소제목 있음. 최대 비중. 순서·기준·주의점을 구체적으로. 표나 목록을 써도 된다.',
    '4) 흔한 실수 300~400자, 소제목 있음.',
    '5) 마무리 200~250자, 소제목 있음. 여기서만 센터를 한 번 언급하고 지역 키워드를 조연으로 넣는다. 홍보 문구를 길게 쓰지 않는다.',
  ].join('\n'),
  review: [
    '1) 후킹 200~250자, 소제목 없음. 화자 본인의 망설임·고민으로 시작. 첫 100자 안에 메인 키워드 1회. 끝에 "혜택이 있었다" 정도만 예고.',
    '2) 공감 300~350자, 소제목 있음. 등록해도 안 가게 될까 하는 불안을 본인 이야기로. 메인 키워드를 넣지 않는다.',
    '3) 방문·상담 후기 450~550자, 소제목 있음. 최대 비중. 시간순으로 본 것을 적고, "상담만 받고 부담 없이 나올 수 있었다"를 직접 증언한다.',
    '4) 등록 결정 + 솔직한 아쉬움 250~300자, 소제목 있음. 메인 키워드를 넣지 않는다.',
    '5) 이벤트 280~320자, 소제목 있음. 방문자 시점으로 공개.',
    '6) 마무리 180~220자, 소제목 있음. "저는 이렇게 예약했어요" + 메인 키워드 마지막 1회.',
  ].join('\n'),
}

/** 위험 표현은 개수가 많으므로 범주별 대표 예시만 넣는다 (전체는 검수기가 잡는다) */
function riskSummary(): string {
  const byCat = new Map<string, string[]>()
  for (const t of RISK_TERMS) {
    const list = byCat.get(t.category) ?? []
    // 정규식 대안 중 첫 두 개만 예시로
    list.push(
      ...t.pattern
        .split('|')
        .slice(0, 2)
        .map((s) => s.replace(/\\s\*/g, ' ').replace(/[\\^$.*+?()[\]{}]/g, '').trim())
        .filter(Boolean)
    )
    byCat.set(t.category, list)
  }
  return Array.from(byCat.entries())
    .map(([cat, ex]) => `- ${cat}: ${Array.from(new Set(ex)).slice(0, 8).join(', ')}`)
    .join('\n')
}

export function buildSystemPrompt(type: PostType): string {
  const spec = SPECS[type]
  return [
    `당신은 네이버 블로그 상위노출을 10년 해온 헬스장 마케팅 글쓴이다. ${POST_TYPE_LABEL[type]}을 쓴다.`,
    '',
    '## 화자',
    VOICE[type],
    '',
    '## 구조 (이 순서대로, 각 구간 분량을 지킨다)',
    STRUCTURE[type],
    '',
    '## 형식 규칙 (앱이 기계로 검사한다)',
    `- 본문 글자수 ${spec.charMin.toLocaleString()}~${spec.charMax.toLocaleString()}자 (공백 포함, 이미지 표기·소제목 제외).`,
    '- 소제목은 `## 소제목` 형식. 4~5개.',
    '- 이미지는 각 소제목 바로 위에 `[이미지: 무엇을 찍을지 설명]` 한 줄로. 총 5~8장. 첫 대표 이미지는 글 맨 위.',
    `- 메인 키워드 ${spec.mainMin}~${spec.mainMax}회, 밀도 ${spec.densityMax}% 이내. 함께 찾는 키워드는 각 1~2회.`,
    `- 메인 키워드를 등간격으로 흩지 않는다. 한두 구간은 아예 비우고, 대신 다른 구간에서 가깝게 두 번 쓴다.`,
    spec.legalNameMin > 0
      ? `- 정식 상호명을 정확히 ${spec.legalNameMin}회 이상 쓴다 (후킹·본문 중반·마무리).`
      : '- 정식 상호명은 필요한 곳에만 쓴다.',
    spec.requireLocalKeyword ? '- 지역 키워드를 1~2회 넣는다 (조연으로만).' : '',
    spec.requireReviewWord ? '- 제목에 "후기" 라는 단어를 반드시 넣는다.' : '',
    '- 제목 28~40자. 메인 키워드를 앞쪽(앞 7자 안)에 둔다.',
    '- 해시태그 8~12개. 메인 키워드와 함께 찾는 키워드를 포함한다.',
    '',
    '## 쓰지 말아야 하는 표현 (광고심의·저품질 위험)',
    riskSummary(),
    '위 표현은 철자를 바꿔 숨기지 말고, 주장 자체를 검증 가능한 사실로 바꿔 쓴다.',
    '',
    '## AI 티 제거',
    '- 어미를 섞는다. 모든 문장을 "~습니다"로 끝내지 않는다.',
    '- 문장 길이를 들쭉날쭉하게. 긴 설명 뒤에 짧은 문장 하나.',
    '- "첫째, 둘째" 나열, "바쁜 현대인의 일상 속에서" 류 도입, 형용사 3개 연속을 쓰지 않는다.',
    '- 모든 문단을 같은 구조로 만들지 않는다.',
    '',
    '## 지어내기 금지',
    '- 주어진 지점 정보·이벤트 정보에 없는 사실을 만들지 않는다 (트레이너·가격·수강생 수·수상 이력 등).',
    '- 이벤트 정보가 없으면 이벤트 구간을 아예 쓰지 않고 그 분량을 다른 구간에 나눈다. 마감일·선착순 인원을 창작하지 않는다.',
    '',
    '## 출력 형식',
    'JSON 객체 하나만 출력한다. 설명·코드펜스 없이.',
    '{"title": "제목", "body": "본문 전체", "tags": ["태그1", "태그2"]}',
    'body 안에서는 줄바꿈을 \\n 으로 쓴다. 이미지 표기와 ## 소제목을 포함한다.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildUserPrompt(req: WriteRequest): string {
  const s = req.store
  const lines: string[] = []

  lines.push(`## 이번 글`)
  lines.push(`- 유형: ${POST_TYPE_LABEL[req.type]}`)
  lines.push(`- 메인 키워드: ${req.mainKeyword}`)
  if (req.subKeywords.filter(Boolean).length)
    lines.push(`- 함께 찾는 키워드: ${req.subKeywords.filter(Boolean).join(', ')}`)
  if (req.localKeyword) lines.push(`- 지역 키워드(조연): ${req.localKeyword}`)

  if (req.type === 'review') {
    lines.push(
      req.sponsorship === 'sponsored'
        ? '- 대가성: 협찬(제공받음). **첫 화면(후킹 앞이나 직후)에 제공받아 작성한 후기임을 명확히 표기하고, 해시태그에 #협찬후기 를 넣는다.**'
        : '- 대가성: 내돈내산. 협찬 표기를 넣지 않는다. 대신 "제공받았다"는 뉘앙스도 쓰지 않는다.'
    )
  }

  if (req.eventText?.trim()) {
    lines.push('', '## 진행 중인 이벤트 (가감 없이 그대로 쓴다)', req.eventText.trim())
  } else {
    lines.push('', '## 이벤트', '없음 — 이벤트 구간을 쓰지 말고 그 분량을 다른 구간에 나눈다.')
  }

  if (s) {
    lines.push('', '## 지점 정보 (여기에 없는 것은 쓰지 않는다)')
    lines.push(`- 정식 상호명: ${s.legalName || s.name}`)
    lines.push(`- 표시 이름: ${s.name}`)
    if (s.womenOnly) lines.push('- 여성전용 지점 — 남성 대상 표현을 쓰지 않는다.')
    lines.push(`- 24시간 운영: ${s.open24 ? '예' : '아니오'}`)
    if (s.location) lines.push(`- 위치: ${s.location}`)
    if (s.features?.length) lines.push(`- 시설 특징:\n${s.features.map((f) => `  · ${f}`).join('\n')}`)
    if (s.strengths?.length) lines.push(`- 고유 강점:\n${s.strengths.map((f) => `  · ${f}`).join('\n')}`)
    if (s.phone) lines.push(`- 전화: ${s.phone}`)
    if (s.reserveUrl) lines.push(`- 예약 링크: ${s.reserveUrl}`)
    if (s.memo) lines.push(`- 메모: ${s.memo}`)
    lines.push('- 트레이너 정보는 주어지지 않았다 — PT·트레이너 관련 서술을 만들지 않는다.')
  } else {
    lines.push('', '## 지점 정보', '없음 — 지점 고유 정보가 필요한 서술을 하지 않는다.')
  }

  if (req.prescription?.length) {
    lines.push('', '## 상위노출 분석 결과 (이 조건을 맞춘다)')
    for (const p of req.prescription.slice(0, 6)) lines.push(`- ${p}`)
  }

  if (req.recent?.length) {
    lines.push('', '## 같은 지점 최근 글 (겹치지 않게 각도를 바꾼다)')
    for (const r of req.recent.slice(0, 5)) {
      const bits = [POST_TYPE_LABEL[r.type], r.mainKeyword, r.introType, r.angle].filter(Boolean)
      lines.push(`- ${r.title || '(제목 없음)'} — ${bits.join(' / ')}`)
    }
    lines.push('도입 방식·주력 앵글·소제목이 위 글들과 겹치면 유사문서로 묶인다. 다르게 잡는다.')
  }

  lines.push('', 'JSON 객체 하나만 출력한다.')
  return lines.join('\n')
}

/** 검수에서 걸린 항목을 고쳐 달라고 다시 부탁하는 메시지 */
export function buildFixPrompt(issues: string[], charCount: number, spec: { charMin: number; charMax: number }): string {
  return [
    '방금 준 글이 기계 검수에서 아래 항목에 걸렸다. 내용의 방향은 유지하고 그 부분만 고쳐서 다시 JSON 으로 출력해라.',
    '',
    ...issues.map((i) => `- ${i}`),
    '',
    `현재 본문 ${charCount.toLocaleString()}자 (기준 ${spec.charMin.toLocaleString()}~${spec.charMax.toLocaleString()}자).`,
    '고칠 때도 지어내기 금지·화자·구조 규칙은 그대로 지킨다. JSON 객체 하나만 출력한다.',
  ].join('\n')
}
