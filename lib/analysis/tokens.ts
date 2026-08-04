/**
 * 상위 제목에 반복되는 말을 **쓸 수 있는 것과 못 쓰는 것으로 가른다.**
 *
 * 실제 진단에서 이런 게 나왔다:
 *   "미녀와야수짐", "추천", "필라테스" 를 소제목에 넣으세요
 * 셋 중 쓸 수 있는 건 "추천" 하나다. 미녀와야수짐은 **다른 업체 상호**이고,
 * 필라테스는 **우리가 하지 않는 종목**이다. 그대로 넣으면 남의 가게를 홍보하거나
 * 안 하는 걸 한다고 쓰는 글이 된다.
 *
 * 그래서 지시로 쓸 말은 **허용 목록** 방식으로 좁힌다. 잘못된 지시는 없는 것보다
 * 나쁘기 때문에, 확실히 쓸 수 있는 말만 통과시킨다.
 *
 * 다만 걸러낸 말도 버리지 않는다 — 다른 업체 상호가 상위 제목에 반복되는 것은
 * "그 업체가 이 키워드를 먹고 있다" 는 중요한 정보다. 지시가 아니라 정보로 쓴다.
 */

export type TokenKind =
  /** 소제목·본문 소재로 쓸 수 있는 말 */
  | 'useful'
  /** 다른 업체 상호 — 정보로는 쓰되 지시로는 쓰지 않는다 */
  | 'rival'
  /** 우리가 하지 않는 종목 */
  | 'otherTrade'
  /** 그 밖 (문체 조각·지역명 등) */
  | 'noise'

/**
 * 글에 실제로 넣을 수 있는 말.
 *
 * 헬스장 블로그에 한정된 목록이라 손으로 관리한다. 새 소재가 필요하면 여기에 넣는다.
 */
const USEFUL = new Set([
  // 검색 의도
  '후기', '추천', '가격', '비용', '요금', '회원권', '등록', '할인', '이벤트', '상담', '체험',
  '비교', '솔직후기', '내돈내산',
  // 운영·시간
  '24시', '24시간', '새벽', '아침', '심야', '주말', '평일', '연중무휴', '무인', '운영시간',
  // 대상
  '여성전용', '초보', '헬린이', '직장인', '학생', '중년', '남성',
  // 서비스
  'PT', '퍼스널', '퍼스널트레이닝', '트레이너', '식단', '인바디', '체형분석', '자세교정',
  '그룹운동', '오픈시간',
  // 시설
  '시설', '기구', '머신', '프리웨이트', '유산소', '러닝머신', '천국의계단', '스트레칭존',
  '샤워실', '샤워', '탈의실', '락커', '주차', '주차장', '청결', '위치', '교통', '접근성',
  '운동복', '수건',
  // 목표·결과
  '다이어트', '체지방', '감량', '근력', '벌크업', '바디프로필', '체중', '근육',
])

/** 우리가 하지 않는 종목 — 소재로 넣으면 거짓이 된다 */
const OTHER_TRADE = [
  '필라테스', '요가', '주짓수', '복싱', '크로스핏', '태권도', '검도', '유도', '수영', '골프',
  '테니스', '배드민턴', '클라이밍', '스쿼시', '무에타이', '발레', '댄스', '스피닝',
  '피부관리', '에스테틱', '한의원', '병원', '의원', '정형외과', '도수치료', '마사지',
]

/** 상호명에 흔히 붙는 꼬리 — 이걸로 끝나면 업체 이름으로 본다 */
const BRAND_TAIL = ['짐', 'GYM', '피트니스', '휘트니스', '헬스클럽', '클럽', '센터', '스튜디오', '랩']

/** 기간·무게처럼 숫자에 단위가 붙은 말은 소재가 된다 ("3개월", "5kg") */
const NUMBER_UNIT = /^\d+(개월|달|주|주차|일|년|kg|킬로|만원|원|회|세트|분)$/i

const flat = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/**
 * 이 말을 어떻게 다룰지 정한다.
 *
 * myNames 에 우리 지점 이름·상호를 넣으면 그건 남의 상호로 보지 않는다.
 */
export function classifyToken(token: string, myNames: string[] = []): TokenKind {
  const t = (token ?? '').trim()
  if (!t) return 'noise'
  const f = flat(t)

  // 우리 상호는 남의 상호가 아니다. 다만 지시로 쓸 말도 아니다 (이미 우리 글에 있다)
  if (myNames.some((n) => n && flat(n).includes(f))) return 'noise'

  if (OTHER_TRADE.some((w) => f.includes(flat(w)))) return 'otherTrade'

  if (USEFUL.has(t) || USEFUL.has(t.toUpperCase())) return 'useful'
  if (NUMBER_UNIT.test(t)) return 'useful'

  // "미녀와야수짐" 처럼 상호 꼬리로 끝나는 고유명사
  if (BRAND_TAIL.some((tail) => f.length > flat(tail).length && f.endsWith(flat(tail)))) {
    return 'rival'
  }

  return 'noise'
}

export interface SplitTokens {
  /** 소제목·본문에 넣으라고 지시할 수 있는 말 */
  usable: { token: string; count: number }[]
  /** 상위 제목에 반복되는 다른 업체 상호 */
  rivals: { token: string; count: number }[]
  /** 상위 제목에 반복되는 다른 종목 */
  otherTrades: { token: string; count: number }[]
}

export function splitTokens(
  tokens: { token: string; count: number }[],
  myNames: string[] = []
): SplitTokens {
  const usable: SplitTokens['usable'] = []
  const rivals: SplitTokens['rivals'] = []
  const otherTrades: SplitTokens['otherTrades'] = []
  for (const t of tokens) {
    const kind = classifyToken(t.token, myNames)
    if (kind === 'useful') usable.push(t)
    else if (kind === 'rival') rivals.push(t)
    else if (kind === 'otherTrade') otherTrades.push(t)
  }
  return { usable, rivals, otherTrades }
}
