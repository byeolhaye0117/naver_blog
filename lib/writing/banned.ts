import type { CheckLevel, RiskHit } from '@/lib/types'

/**
 * 위험 표현 사전 — safe-expressions.md 를 코드로 옮긴 것.
 *
 * 대원칙: 철자를 바꿔 숨기지 않는다. 변칙 표기는 그 자체가 어뷰징 신호라 오히려 위험을 키운다.
 * 위험 표현은 "주장 자체를 사실 기반으로 바꿔서" 치환한다.
 */

export interface RiskTerm {
  /** 정규식 소스 (한글이라 단어경계를 못 쓰므로 문자열 그대로 매칭) */
  pattern: string
  category: 'A. 최상급·단정' | 'B. 효과 보장' | 'C. 의료·치료성' | 'D. 상업 단어 도배' | 'E. 절대 금지'
  fix: string
  level: CheckLevel
}

export const RISK_TERMS: RiskTerm[] = [
  // ─── A. 최상급·단정 ───
  { pattern: '최고의|최고급|최상급|최고예요|최고입니다', category: 'A. 최상급·단정', level: 'fail', fix: '스펙으로 바꾸세요 — "웨이트 머신 60대를 보유한", "천국의 계단 4대라 대기 없이"' },
  { pattern: '지역\\s*1위|1위|No\\.?\\s*1|넘버원|최고\\s*시설', category: 'A. 최상급·단정', level: 'fail', fix: '검증 가능한 사실로 — "28년 이상 한자리에서 운영해온"' },
  { pattern: '최저가|파격가|초특가|반값|떨이', category: 'A. 최상급·단정', level: 'fail', fix: '"비용 부담을 줄인 등록 옵션이 있어요, 상담 때 안내드립니다"로. (후킹에서 체감 표현이 필요하면 "반값 아래로 낮춘" 정도까지만, 본문 반복은 금지)' },
  { pattern: '유일한|유일하게|독보적', category: 'A. 최상급·단정', level: 'fail', fix: '"이 근처에서 보기 드문 프리웨이트실 분리 구조"처럼 범위를 좁혀서' },
  { pattern: '100%|백퍼|완벽한|완벽하게', category: 'A. 최상급·단정', level: 'fail', fix: '"회원님들이 가장 자주 말씀해주시는 부분은 ○○입니다"' },
  /*
   * **맨 「확실히」를 뺐다** (2026-08-07).
   *
   * 회원이 직접 쓴 홍보글이 이 항목에서 즉시수정을 맞았다 — 「등에 자극이 확실히
   * 옮겨갑니다」. 자극이 어디로 오는지 설명하는 문장이고, 최상급도 효과 보장도 아니다.
   * 위험한 것은 「확실히」 자체가 아니라 **결과에 붙는 「확실히」**(확실히 빠집니다)이고,
   * 그건 아래 B 항목이 잡는다. 여기서 맨 낱말까지 즉시수정으로 막으면 정상 문장이 걸린다.
   */
  { pattern: '무조건|절대로|절대\\s|반드시\\s*빠', category: 'A. 최상급·단정', level: 'fail', fix: '삭제하고 이유·과정을 설명하는 문장으로 바꾸세요' },

  // ─── B. 효과 보장 (다이어트 — 가장 신고당하기 쉬운 표현) ───
  { pattern: '감량\\s*보장|보장합니다|보장해|책임\\s*감량', category: 'B. 효과 보장', level: 'fail', fix: '"속도는 회원님마다 다르지만, 꾸준히 나오신 분들의 변화를 함께 기록해드립니다"' },
  { pattern: '\\d+\\s*kg\\s*(감량|빠|감량보장)|한\\s*달\\s*\\d+\\s*kg|\\d+\\s*주\\s*만에', category: 'B. 효과 보장', level: 'fail', fix: '기간·수치 단정은 과장광고 대표 유형입니다. 실제 사례가 있어도 "개인차가 있습니다"를 함께, 없으면 쓰지 마세요' },
  /*
   * 「확실히」는 **결과에 붙을 때만** 잡는다 (위 A 항목 주석 참고).
   * 빠진다·좋아진다·달라진다·효과 같은 결과어가 뒤에 오면 그건 효과 보장이다.
   */
  { pattern: '확실히\\s*(빠|좋아|달라|효과|줄어)|누구나\\s*(살|체중)|무조건\\s*빠|살\\s*빠지는\\s*방법', category: 'B. 효과 보장', level: 'fail', fix: '삭제 → 어떤 과정으로 돕는지 설명으로 대체' },
  { pattern: '비포애프터|비포\\s*앤\\s*애프터|before\\s*after', category: 'B. 효과 보장', level: 'warn', fix: '실제 사례가 있어도 "개인차가 있습니다"를 반드시 함께 적으세요' },
  { pattern: '요요\\s*없|평생\\s*유지', category: 'B. 효과 보장', level: 'fail', fix: '"빠지는 것보다 유지되는 습관을 만드는 걸 목표로 합니다"' },

  // ─── C. 의료·치료성 (헬스장은 의료기관이 아님 — 의료법 오인 위험) ───
  { pattern: '치료|완치|치유', category: 'C. 의료·치료성', level: 'fail', fix: '"치료"라는 단어 자체를 쓰지 않습니다. "몸이 불편하신 분도 무리 없는 강도부터 시작하도록 안내해드립니다"' },
  /*
   * 「낫다」는 문맥을 봐야 한다.
   *
   * 예전에는 `낫는다|낫습니다` 를 그냥 걸었다. 그러면 「교정받고 가시는 편이 낫습니다」
   * (= 더 좋다)가 의료 표현으로 잡혀 수정필요가 되고, fail 이라서 점수 상한까지 걸렸다.
   * 실제 홍보글 검수에서 이 오탐 하나로 79점 캡을 맞았다.
   *
   * 그래서 **아픈 대상이 앞에 있을 때만** 잡는다. 「무릎 통증이 낫습니다」는 걸리고,
   * 「~하는 편이 낫습니다」는 통과한다.
   */
  { pattern: '(통증|허리|무릎|어깨|목|손목|발목|디스크|질환|질병|염증|부상|아픈\\s*곳|아픈\\s*데)[^.!?\\n]{0,25}낫(는다|습니다|아요|았어요|아졌|게\\s*해|도록\\s*해)', category: 'C. 의료·치료성', level: 'fail', fix: '통증·질환이 "낫는다"는 의료 효과 주장입니다. "불편한 부위는 무리 없는 강도부터 시작하도록 안내해드립니다" 처럼 과정으로 바꾸세요' },
  { pattern: '재활|디스크|협착증|측만증', category: 'C. 의료·치료성', level: 'warn', fix: '"운동 목적의 컨디셔닝", "자세를 잡아가는 트레이닝"으로. 질환명 단정은 피하세요' },
  { pattern: '체형\\s*교정|교정\\s*운동|자세\\s*교정해', category: 'C. 의료·치료성', level: 'warn', fix: '"자세와 움직임을 함께 봐드립니다" 정도의 과정 서술로' },
  { pattern: '통증\\s*(잡|없어|사라)|허리\\s*디스크에\\s*좋', category: 'C. 의료·치료성', level: 'fail', fix: '효능 주장은 삭제. 강도 조절·안내 과정으로 대체' },

  // ─── E. 절대 금지 ───
  { pattern: '와\\s*달리\\s*저희|보다\\s*저희가\\s*(더|낫)|타\\s*업체(는|와)', category: 'E. 절대 금지', level: 'fail', fix: '타 업체 비방·비교는 전부 삭제하세요' },
  { pattern: '마감\\s*임박|오늘\\s*단\\s*하루|딱\\s*\\d+명\\s*남', category: 'E. 절대 금지', level: 'warn', fix: '실제 이벤트 정보에 없는 마감일·선착순 인원을 만들어내면 안 됩니다. 사실이면 그대로, 아니면 삭제' },
]

/** 도배 방지 — 각 단어의 글 전체 허용 횟수 (safe-expressions.md D) */
export const COMMERCIAL_LIMITS: { term: string; max: number; note: string }[] = [
  { term: '할인', max: 2, note: '이벤트 섹션에만 모으세요. 공감·해결·신뢰 구간에는 넣지 않습니다' },
  { term: '특가', max: 1, note: '광고 단어입니다. 혜택 조건 서술로 바꾸는 편이 안전합니다' },
  { term: '이벤트', max: 3, note: '후킹 예고 1회 + 이벤트 섹션 1~2회면 충분합니다' },
  { term: '무료', max: 2, note: '"무료 방문 상담"처럼 실제 제공하는 것에만' },
  { term: '혜택', max: 2, note: '반복되면 광고성 문서 신호가 됩니다' },
  { term: '이벤트가', max: 1, note: '' },
]

/**
 * 도배로 걸린 낱말을 **바꿔 쓸 말**.
 *
 * 회원 요청 (2026-08-11): "이거를 지우는 게 아니라 단어를 수정하는 쪽으로 고치면 좋겠어."
 * 맞는 말이다 — 「무료 상담」에서 「무료」를 지우면 무료라는 사실이 사라지지만, 「비용 없는
 * 상담」으로 바꾸면 **뜻은 그대로 남고 도배 횟수만 줄어든다.**
 *
 * 고를 때 지킨 것 둘.
 *   ① **다른 상한에 걸리는 말로 바꾸지 않는다.** 「혜택」을 「할인」으로 바꾸면 할인 상한(2회)
 *      으로 옮겨가는 것뿐이다. 그래서 후보에 상업 낱말을 넣지 않았다.
 *   ② **광고심의에 걸리는 말도 넣지 않는다** (최저가·파격가·무조건). RISK_TERMS 와 겹치면
 *      한 항목을 고치고 다른 항목을 만드는 셈이다.
 *
 * 문장에 그대로 끼워도 읽히게 **꾸미는 말 꼴**로 뒀다 (「비용 없는」·「낮춘 금액」).
 * 다만 조사와 붙는 자리는 사람이 봐야 한다 — 그래서 바꾼 뒤 그 자리에 커서를 둔다.
 */
export const ALT_WORDS: Record<string, string[]> = {
  무료: ['비용 없는', '추가 비용 없는', '따로 받지 않는'],
  혜택: ['조건', '챙겨드리는 것', '드리는 것'],
  할인: ['낮춘 금액', '조정한 금액', '맞춰드린 금액'],
  특가: ['이번 달 금액', '맞춘 금액'],
  이벤트: ['이번 달 조건', '진행 중인 안내', '안내'],
  이벤트가: ['이번 달 조건이', '안내가'],
}

/** 그 낱말을 바꿔 쓸 후보 (없으면 빈 배열) */
export function altWords(term: string): string[] {
  return ALT_WORDS[term] ?? []
}

/** 변칙 표기 탐지용 구분자 */
const SEPARATORS = /[.·・‧∙,\-_~^*'"`|/\\\s]/g

/**
 * 위험 표현 스캔.
 *
 * 1) 원문에서 직접 매칭
 * 2) 구분자를 제거한 정규화 문자열에서 추가로 매칭 → 원문엔 없는데 여기서만 걸리면
 *    "최.고" 같은 변칙 표기이므로 E 카테고리로 승격해서 보고한다.
 */
export function scanRisks(text: string): RiskHit[] {
  const hits: RiskHit[] = []
  const flat = text.replace(SEPARATORS, '')

  for (const term of RISK_TERMS) {
    const re = new RegExp(term.pattern, 'g')
    const matches = Array.from(text.matchAll(re))

    if (matches.length) {
      const first = matches[0]
      const at = first.index ?? 0
      hits.push({
        category: term.category,
        term: first[0],
        count: matches.length,
        context: excerpt(text, at, first[0].length),
        fix: term.fix,
        level: term.level,
      })
      continue
    }

    // 변칙 표기 탐지 — 패턴에서 공백 허용(\s*)을 뺀 버전으로 정규화 문자열을 본다
    const flatPattern = term.pattern.replace(/\\s\*/g, '').replace(/\\s/g, '')
    const flatMatches = Array.from(flat.matchAll(new RegExp(flatPattern, 'g')))
    if (flatMatches.length) {
      hits.push({
        category: 'E. 절대 금지',
        term: flatMatches[0][0],
        count: flatMatches.length,
        context: `구분자를 지우면 "${flatMatches[0][0]}" 가 나옵니다`,
        fix: `변칙 표기(특수문자 끼워넣기)로 의심됩니다. 철자를 바꿔 숨기는 건 그 자체가 어뷰징 신호라 위험이 더 큽니다. → ${term.fix}`,
        level: 'fail',
      })
    }
  }

  // 자모 분리 (할ㅇl인) — 단어 "안쪽"에 낱자모가 끼어 있는 경우만 잡는다.
  // 낱자모 뒤가 글자·영문·숫자여야 하므로 "좋아요ㅎㅎ", "아쉽네요ㅠㅠ" 같은
  // 문장 끝 이모티콘은 걸리지 않는다.
  const jamo = Array.from(text.matchAll(/[가-힣][ㄱ-ㅎㅏ-ㅣ][가-힣A-Za-z0-9]/g))
  if (jamo.length) {
    hits.push({
      category: 'E. 절대 금지',
      term: jamo[0][0],
      count: jamo.length,
      context: excerpt(text, jamo[0].index ?? 0, 3),
      fix: '단어 안에 자모가 끼어 있습니다(자모 분리 표기). 어뷰징 신호이니 정상 표기로 되돌리세요',
      level: 'fail',
    })
  }

  return hits
}

/** 상업 단어 빈도 검사 */
export function scanCommercialOveruse(text: string): RiskHit[] {
  const hits: RiskHit[] = []
  for (const { term, max, note } of COMMERCIAL_LIMITS) {
    const count = countOccurrences(text, term)
    if (count > max) {
      hits.push({
        category: 'D. 상업 단어 도배',
        term,
        count,
        context: `"${term}" ${count}회 사용 (허용 ${max}회)`,
        fix: note || `${max}회 이내로 줄이세요`,
        level: count > max + 2 ? 'fail' : 'warn',
      })
    }
  }
  return hits
}

export function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let i = 0
  while ((i = text.indexOf(needle, i)) !== -1) {
    count++
    i += needle.length
  }
  return count
}

/** 공백 무시 카운트 — "쌍용동 헬스장" 이 "쌍용동헬스장" 으로 쓰인 경우도 센다 */
export function countLoose(text: string, needle: string): number {
  const flatText = text.replace(/\s+/g, '')
  const flatNeedle = needle.replace(/\s+/g, '')
  return countOccurrences(flatText, flatNeedle)
}

function excerpt(text: string, at: number, len: number): string {
  const from = Math.max(0, at - 18)
  const to = Math.min(text.length, at + len + 18)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\n/g, ' ')}${to < text.length ? '…' : ''}`
}

/** 여성전용 지점에서 쓰면 안 되는 남성 대상 표현 */
export function scanMaleTargeting(text: string): RiskHit[] {
  const patterns = [
    '남성분',
    '남자분',
    '남성 회원',
    '남자 회원',
    '남성 타겟',
    '형님',
    '남성 라커',
  ]
  const hits: RiskHit[] = []
  for (const p of patterns) {
    const count = countOccurrences(text, p)
    if (count > 0) {
      hits.push({
        category: 'E. 절대 금지',
        term: p,
        count,
        context: `여성전용 지점 글에 "${p}" 가 ${count}회 있습니다`,
        fix: '여성전용 지점은 남성 대상 표현을 쓰지 않습니다. 여성 타겟 표현으로 바꾸거나 삭제하세요',
        level: 'fail',
      })
    }
  }
  return hits
}
