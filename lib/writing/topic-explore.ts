/**
 * **정보글 주제 탐색기** — 무엇을 쓸지 지어내지 않고 재서 고른다.
 *
 * ── 회원 요청 (2026-08-23) ───────────────────────────────────
 * "주제도 단순히 새벽운동 어떻게 하나 이런게 아니라 실제로 다이어트나 체중증량을 원하는
 * 주제들을 리서치해서 그에 맞는 주제를 탐색하는 탐색기를 만들어서 그거중에 내가 선택해서
 * 하고 싶어."
 *
 * 맞는 지적이다. 기본 주제 10개(INFO_TOPICS)는 **우리가 앉아서 지어낸 것**이다. 그럴듯해
 * 보이지만 그 주제를 사람들이 실제로 검색하는지는 한 번도 확인한 적이 없다.
 *
 * ── 무엇이 지어낸 것이고 무엇이 잰 것인가 ──────────────────
 * 정직하게 나눠 둔다:
 *   · **씨앗(TOPIC_SEEDS)은 우리가 넣는다.** 「다이어트」·「체중 증량」 같은 큰 갈래다.
 *     회원이 어느 갈래를 볼지 고르는 출발점일 뿐, 이게 주제가 되지는 않는다.
 *   · **후보는 네이버에서 가져온다.** 검색창 자동완성(사람들이 실제로 치는 말)과 검색광고
 *     키워드도구(연관 검색어 + 월간 검색량)다.
 *   · **경쟁은 잰다.** 그 검색어로 최근 30일에 블로그 글이 몇 편 올라왔는지.
 *
 * ── 이 파일에는 네트워크가 없다 ─────────────────────────────
 * 고르고 거르고 줄 세우는 규칙만 둔다 (라우트가 조회해서 넘겨준다). 「무엇을 정보글 주제로
 * 볼 것인가」는 틀리면 매일 엉뚱한 글이 나오는 종류라, 테스트가 볼 수 있는 자리에 있어야 한다.
 */

/**
 * 탐색 씨앗 — **회원이 고르는 큰 갈래**.
 *
 * 여기 적힌 말이 그대로 주제가 되지 않는다. 이 말들을 자동완성·연관검색어에 넣어 **실제로
 * 검색되는 문구**를 받아오고, 그중에서 정보글로 쓸 만한 것만 남긴다.
 *
 * 갈래를 고를 때 기준: **헬스장에 오는 사람이 실제로 가진 목적**이어야 한다. 회원이 콕
 * 집어 말한 두 가지(다이어트·체중 증량)를 맨 앞에 둔다.
 */
export const TOPIC_SEEDS: { id: string; label: string; queries: string[] }[] = [
  { id: 'diet', label: '다이어트 · 체중 감량', queries: ['다이어트', '체지방 감량', '다이어트 정체기'] },
  { id: 'bulk', label: '체중 증량 · 벌크업', queries: ['벌크업', '체중 증량', '마른 사람 근육'] },
  { id: 'beginner', label: '헬스 처음 시작', queries: ['헬스 초보', '헬스장 처음', '운동 순서'] },
  { id: 'form', label: '운동 자세 · 방법', queries: ['스쿼트 자세', '데드리프트 자세', '헬스 루틴'] },
  { id: 'body', label: '부위별 고민', queries: ['뱃살 빼는법', '허벅지 살 빼기', '팔뚝살'] },
  { id: 'time', label: '시간 · 습관 만들기', queries: ['새벽 운동', '퇴근 후 운동', '홈트'] },
  { id: 'pain', label: '통증 · 부상 피하기', queries: ['무릎 통증 운동', '허리 아플때 운동', '어깨 통증'] },
  { id: 'food', label: '식단 · 영양', queries: ['단백질 섭취량', '야식 끊기', '공복 유산소'] },
]

export type TopicIntent = 'info' | 'local' | 'buy' | 'offlimit' | 'thin'

export const INTENT_LABEL: Record<TopicIntent, string> = {
  info: '정보',
  local: '업체 찾기',
  buy: '가격·등록',
  offlimit: '우리 영역 아님',
  thin: '주제가 되기엔 짧음',
}

/**
 * **헬스장이 손대면 안 되는 영역** (2026-08-24, 첫 실행 결과를 보고 넣었다).
 *
 * 「다이어트」 씨앗으로 실제로 돌려봤더니 검색광고 연관검색어가 이런 것들을 돌려줬다:
 *
 *   다이어트약 22,120회 · 다이어트유산균 21,020회 · 축농증 18,940회 · 후두염 17,100회
 *   변비약 15,980회 · 지방분해주사 14,750회 · 자이로토닉 20,540회 · 스테비아 16,210회
 *
 * 검색량이 크다고 우리가 쓸 주제가 되지 않는다. **약·주사·시술·질병은 의료 영역**이라
 * 헬스장 블로그가 효과를 말하면 광고심의에 걸리고(banned.ts 가 이미 그 표현들을 막는다),
 * 전문 분야가 흔들려 블로그 주제 일관성(C-Rank)에도 손해다. 「스테비아」·「도시락」처럼
 * 제품을 파는 말도 마찬가지다 — 우리가 파는 것이 아니다.
 */
const OFF_LIMIT_WORDS = [
  '주사',
  '시술',
  '수술',
  '성형',
  '지방흡입',
  '보톡스',
  '필러',
  '클리닉',
  '병원',
  '한의원',
  '의원',
  '처방',
  '약국',
  '한약',
  '보조제',
  '영양제',
  '유산균',
  '비타민',
  '도시락',
  '밀키트',
  '배달',
  '부작용',
  '자격증',
  '보험',
  /*
   * 2026-08-24 두 번째 실행에서 새어 나온 것들. 첫 걸름망을 통과했지만 여전히 우리가 쓸
   * 주제가 아니다 — 「지방간치료」·「비만치료제」는 의료, 「다이어트식품」·「디톡스다이어트」는
   * 제품, 「숀리다이어트캠프」는 남의 브랜드다.
   */
  '치료',
  '지방간',
  '식품',
  '디톡스',
  '캠프',
  '체험단',
  // 병 이름이 낱말 가운데 있으면 끝자리 검사로는 안 걸린다 (「허리협착증운동」)
  '협착증',
  '증후군',
  '디스크',
  '당뇨',
  '고혈압',
  '갑상선',
  '통풍',
  '역류성',
  '골다공',
  '우울증',
  '불면증',
  /*
   * 2026-08-24 세 번째 실행. 「체중 증량」 갈래가 보충제로 뒤덮였다 — 단백질보충제 33,800회 ·
   * 탄수화물보충제 · 벌크업보충제 · 벌크업프로틴 · 헬스부스터. 우리가 파는 물건이 아니고,
   * 효과를 말하면 건강기능식품 광고가 된다.
   *
   * 「계산기」도 뺀다 — 도구를 찾는 검색이라 정보글로는 그 자리에 못 간다.
   */
  '보충제',
  '프로틴',
  '부스터',
  '쉐이크',
  '파우더',
  '크레아틴',
  '계산기',
  /*
   * 2026-08-24 네 번째 실행. 약과 병이 또 새어 나왔다 —
   * 근육이완제 13,450회 · 근육강화제 · 섬유근육통 · 손목결절종.
   * 「~제」로 끝나는 약 이름은 낱말이 끝없이 나오므로 꼴로 막는다 (아래 DRUG_TAIL).
   */
  '섬유근육통',
  '결절종',
  '종양',
  '염좌',
  '탈출증',
]

/**
 * **물건과 기구** — 살 것을 찾는 검색이다.
 *
 * 「허리마사지기」·「홈트운동기구」·「복근운동기구」·「스트레칭밴드」가 후보로 올라왔다.
 * 다만 **쓰는 법을 묻고 있으면 정보다** — 「헬스 기구 사용 순서」는 우리가 쓸 주제다.
 * 그래서 업체 이름과 같은 규칙을 쓴다 (방법을 묻는 말이 함께 있으면 통과).
 */
const PRODUCT_WORDS = ['기구', '머신', '마사지기', '밴드', '용품', '매트', '보호대', '벨트']
/**
 * 약 이름의 꼴 — 「다이어트약」·「변비약」, 그리고 「근육이완제」·「근육강화제」.
 *
 * 약 이름을 낱개로 적으면 끝이 없다. 「~제」는 「문제」·「과제」와 겹치므로 **약에만 쓰이는
 * 앞말과 함께** 볼 때만 막는다.
 */
const DRUG_TAIL = /(약|이완제|강화제|억제제|촉진제|치료제|주사제)$/
/** 「축농증」·「후두염」 — 병 이름은 대개 이렇게 끝난다 */
const DISEASE_TAIL = /(염|증|암)$/

/**
 * **헬스장이 쓸 수 있는 말인가** — 이 중 하나는 들어 있어야 한다.
 *
 * 제외 목록만으로는 부족하다. 「자이로토닉」·「스테비아」처럼 **제외 목록에 없으면서 우리
 * 영역도 아닌** 말이 끝없이 나오기 때문이다. 그래서 반대로 **우리가 쓸 수 있는 말**을
 * 정해 두고, 하나도 안 걸리면 후보에서 뺀다.
 *
 * 목록이 좁으면 좋은 후보를 놓치므로 넉넉히 적되, 전부 **운동·몸·먹는 습관**에 관한 말이다.
 */
const GYM_WORDS = [
  // 목적
  '다이어트', '감량', '증량', '벌크업', '체중', '체지방', '근육', '근력', '근손실', '체형', '비만',
  // 운동
  '운동', '헬스', '웨이트', '유산소', '무산소', '러닝', '달리기', '걷기', '자전거', '스트레칭',
  '스쿼트', '데드리프트', '벤치프레스', '풀업', '턱걸이', '플랭크', '런지', '홈트', '맨몸',
  '루틴', '자세', '폼', '세트', '횟수', '분할', '피티', 'pt',
  // 몸
  '뱃살', '복근', '코어', '하체', '상체', '허벅지', '종아리', '팔뚝', '어깨', '등', '가슴', '힙',
  '무릎', '허리', '목', '손목', '골반', '체력', '기초대사량', '인바디', '부종', '엉덩이', '옆구리',
  // 먹는 습관
  '식단', '단백질', '탄수화물', '지방', '칼로리', '공복', '폭식', '야식', '치팅', '간헐적',
  '정체기', '요요', '식습관',
]

/** 낱말 하나짜리 짧은 말은 주제가 못 된다 — 「엉덩이」·「감기」로는 글을 못 쓴다 */
const MIN_SOLO_LENGTH = 5

/**
 * **업체를 찾는 말** — 정보글 주제로 쓰면 안 된다.
 *
 * 「쌍용동 헬스장」으로 정보글을 쓰면 홍보글이 된다. 그건 이미 홍보글이 맡은 자리이고,
 * 정보글은 신뢰도를 쌓으려고 쓰는 것이라 목적이 다르다 (정보 : 홍보 = 2 : 1 전략의 '2').
 */
const BUY_WORDS = [
  '가격',
  '비용',
  '얼마',
  '등록',
  '회원권',
  '이용권',
  '일일권',
  '1일권',
  '할인',
  '이벤트',
  '추천',
  '후기',
  '리뷰',
  '순위',
  '저렴',
  '싼곳',
  '영업시간',
  '몇시',
  '주차',
  '위치',
  '전화번호',
]

/**
 * 지역 이름처럼 보이는 낱말 — 「쌍용동」·「서북구」·「천안시」.
 *
 * **이것만으로 「업체 찾기」라고 하면 안 된다** (2026-08-24에 실제로 걸렸다).
 * 「무릎 아플때 운동」의 **「운동」이 동으로 끝나서** 지역으로 잡혔다 — 이 판에서 가장
 * 중요한 낱말이 통째로 막힌 것이다. 「기구」·「연구」·「즉시」도 같은 꼴이다.
 *
 * 그래서 **지역 이름과 업체를 함께 가리킬 때만** 업체 찾는 말로 본다.
 */
const AREA_RE = /(^|\s)[가-힣]{2,4}(동|읍|면|구|시|군)(\s|$)/

/**
 * **동네 이름 + 운동**은 주제가 아니라 남의 동네 검색어다 (2026-08-26 회원 지적).
 *
 * 회원: "이게 과연 주제로서 쓸만한 운동이 맞아? 그냥 키워드인거 아니야?"
 * 화면에 올라온 것들 — 「매탄동운동」(수원)·「상암동운동」(서울)·「군자역운동」·「신림역운동」·
 * 「달서구운동」(대구)·「남성역운동」. 전부 **다른 동네에서 헬스장을 찾는 말**이고, 우리가
 * 그걸로 정보글을 쓸 이유가 없다.
 *
 * 위 `AREA_RE` 로는 못 잡는다. 그건 **띄어쓰기**를 요구하는데 자동완성은 붙여서 온다
 * (「매탄동운동」). 그렇다고 띄어쓰기 조건을 빼면 「기초운동」의 「초운+동」이 걸린다 —
 * 그래서 **지역 꼬리 바로 뒤에 운동·헬스 같은 말이 붙어 있을 때만** 잡는다.
 *
 * `역`(지하철역)도 넣는다. 「군자역」·「신림역」·「남성역」은 동네 이름과 똑같이 쓰인다.
 *
 * 맨 앞에서만 본다 — 지역 검색어는 동네가 앞에 온다 (「매탄동운동」). 「헬스기구운동」처럼
 * 우리 낱말로 시작하는 말이 「기+구+운동」으로 잘못 걸리는 것을 막는다.
 */
const AREA_ACTIVITY_RE =
  /^[가-힣]{2,3}(동|읍|면|구|시|군|역)(운동|헬스|짐|피티|pt|다이어트|필라테스|요가|크로스핏|스피닝)/i
/** 이 말로 시작하면 지역 검사를 하지 않는다 — 우리 판 낱말이 앞에 오는 경우다 */
const DOMAIN_HEAD_RE = /^(헬스|운동|다이어트|필라테스|요가|크로스핏|피티|pt|짐|근력|유산소|웨이트)/i
/** 업체를 가리키는 말 */
const PLACE_WORDS = ['헬스장', '피트니스', '짐', '센터', 'pt', '피티', '요가', '필라테스', '크로스핏', '학원', '지점', '매장']
/** 위치를 묻는 말 — 이건 그것만으로 업체를 찾는 뜻이다 */
const NEARBY_WORDS = ['근처', '주변', '가까운']

/**
 * **업체 이름이 들어간 말은 방법을 묻고 있을 때만 정보다** (2026-08-24 두 번째 실행).
 *
 * 「여성전용헬스장」이 후보로 올라왔다. 지역명이 없어서 지역 검사를 통과했지만, 이건
 * 업체를 찾는 말이지 정보를 찾는 말이 아니다. 반대로 「헬스장 처음 가는 순서」는 정보다.
 * 가르는 것은 **방법을 묻는 말이 함께 있는가**다.
 */
const METHOD_WORDS = ['방법', '법', '자세', '루틴', '순서', '효과', '차이', '이유', '시간', '주기', '횟수', '준비물', '처음']

/**
 * **정보글 주제로 쓸 만한 말인가.**
 *
 * 세 갈래로 나눈다 — 버리지 않고 갈래를 붙여 돌려준다. 버리면 회원이 「왜 이건 안 나오지」를
 * 알 수 없고, 이 저장소는 조용히 잘라내는 것을 하지 않는다.
 */
export function classifyIntent(query: string, myLocalKeywords: string[] = []): TopicIntent {
  const q = query.trim()
  const flat = q.replace(/\s+/g, '')
  const low = flat.toLowerCase()
  // 우리 지역 키워드가 통째로 들어 있으면 업체를 찾는 말이다
  if (myLocalKeywords.some((k) => k.trim() && flat.includes(k.replace(/\s+/g, '')))) return 'local'
  if (NEARBY_WORDS.some((w) => flat.includes(w))) return 'local'
  const hasPlace = PLACE_WORDS.some((w) => low.includes(w))
  if (AREA_RE.test(q) && hasPlace) return 'local'
  // 「매탄동운동」·「군자역운동」 — 남의 동네에서 헬스장을 찾는 말이다 (2026-08-26)
  if (!DOMAIN_HEAD_RE.test(flat) && AREA_ACTIVITY_RE.test(flat)) return 'local'
  // 값을 묻는 말이 먼저다 — 「헬스장 가격」은 업체보다 가격을 묻고 있다
  if (BUY_WORDS.some((w) => flat.includes(w))) return 'buy'
  const asksHow = METHOD_WORDS.some((w) => flat.includes(w))
  if (hasPlace && !asksHow) return 'local'
  // 기구·용품도 마찬가지 — 쓰는 법을 물으면 정보, 아니면 살 것을 찾는 말이다
  if (PRODUCT_WORDS.some((w) => flat.includes(w)) && !asksHow) return 'buy'

  /*
   * **의료·제품은 검색량이 아무리 커도 뺀다.** 헬스장이 약·주사·질병의 효과를 말하면
   * 광고심의에 걸리고 전문 분야도 흔들린다. 「우리 영역 아님」이라고 이름을 붙여
   * 돌려준다 — 조용히 버리면 회원이 「왜 이건 안 나오지」를 알 수 없다.
   */
  if (OFF_LIMIT_WORDS.some((w) => low.includes(w))) return 'offlimit'
  if (DRUG_TAIL.test(flat) || DISEASE_TAIL.test(flat)) return 'offlimit'

  // 우리가 쓸 수 있는 말이 하나도 없으면 우리 영역이 아니다 (「자이로토닉」·「스테비아」)
  if (!GYM_WORDS.some((w) => low.includes(w))) return 'offlimit'

  /*
   * **한 낱말짜리 짧은 말로는 글을 못 쓴다.** 「엉덩이」를 주제로 주면 AI 가 무엇에 대해
   * 쓸지 스스로 정하게 되는데, 그러면 매번 다른 글이 나오고 유사문서 방지 로테이션이
   * 헛돈다. 두 낱말이거나 다섯 글자는 넘어야 주제 구실을 한다.
   */
  const words = q.split(/\s+/).filter(Boolean).length
  if (words < 2 && flat.length < MIN_SOLO_LENGTH) return 'thin'

  return 'info'
}

export interface TopicCandidate {
  /** 자동 초안 주제로 그대로 들어갈 문구 */
  topic: string
  /** 어느 씨앗에서 나왔나 */
  seedId: string
  /** 월간 검색량 (PC+모바일). null = 못 쟀다 */
  monthlySearch: number | null
  /** 최근 30일 블로그 발행량 = 경쟁. null = 못 쟀다 */
  recent30: number | null
  intent: TopicIntent
  /** 어디서 온 후보인가 — 회원이 믿을 근거 */
  from: 'autocomplete' | 'searchad'
  /** 발행량이 상한에 걸려 잘린 값인가 — 「4,286편」과 「4,286편 이상」은 다르다 */
  cappedRecent?: boolean
  /** 왜 이 순서인지 한 줄 */
  why: string
}

/**
 * **주제로 쓸 문구로 다듬는다.**
 *
 * 검색어는 「다이어트정체기」처럼 붙여 오기도 하고 「다이어트 정체기 극복」처럼 길게 오기도
 * 한다. 그대로 지시문에 넣어도 되지만, 앞뒤 공백과 겹친 공백만 정리한다. **말을 바꾸지는
 * 않는다** — 바꾸면 그건 다시 우리가 지어낸 주제가 된다.
 */
export function toTopic(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

/**
 * 후보를 줄 세운다 — **발행량이 적은 것부터.**
 *
 * ── 왜 「경쟁 등급」을 붙이지 않나 (2026-08-24) ──────────────
 * 처음엔 arena.ts 의 실측 경계(300편/100편)로 「경쟁 센 자리」·「적은 자리」를 붙였다.
 * 실제로 돌려보니 **열두 줄이 전부 「경쟁 센 자리」**였다:
 *
 *   다이어트식단 4,286편 · 뱃살빼는법 4,286편 · 기초대사량 4,286편 · 내장지방빼는법 2,799편
 *
 * 당연하다. 그 경계는 **지역 헬스 키워드**로 잰 값이다 (쌍용동 헬스장 433편). 전국 단위
 * 정보 키워드는 자릿수가 다르다. 판이 다른데 같은 경계를 쓰면 **모든 줄이 같은 말이 되어
 * 아무 정보도 주지 못한다.**
 *
 * 그렇다고 여기서 새 경계를 지어내지도 않는다 — 전국 정보 키워드로 순위를 재본 적이 없다.
 * 대신 **숫자를 그대로 보여주고 적은 순으로 줄 세운다.** 등급은 우리가 잰 판에서만 쓴다.
 *
 * 못 잰 것은 뒤로 밀되 버리지 않는다 — 모르는 것을 0으로 바꿔 쓰면 없는 사실을 만드는 셈이다.
 */
export function rankCandidates(list: TopicCandidate[]): TopicCandidate[] {
  return [...list].sort(
    (a, b) =>
      Number(a.recent30 === null) - Number(b.recent30 === null) ||
      (a.recent30 ?? 0) - (b.recent30 ?? 0) ||
      (b.monthlySearch ?? -1) - (a.monthlySearch ?? -1) ||
      a.topic.localeCompare(b.topic)
  )
}

/**
 * 후보 한 줄 설명 — 화면에 그대로 쓴다.
 *
 * **잘린 값을 잰 값처럼 쓰지 않는다.** 블로그 섹션은 1,000건에서 잘리므로, 그 위는
 * 「4,286편」이 아니라 「4,286편 이상」이다. 실제로 열두 줄 중 여덟 줄이 똑같이 4,286편으로
 * 떴는데, 그건 우연이 아니라 전부 상한에 걸린 값이었다 — 같은 숫자를 정확한 값처럼
 * 보여주면 회원이 그 둘을 비교해 판단하게 된다.
 */
export function candidateWhy(
  monthlySearch: number | null,
  recent30: number | null,
  /** 상한에 걸려 잘린 값인가 (blogsection 의 note === 'atLeast') */
  capped = false
): string {
  const demand =
    monthlySearch === null
      ? '검색량은 못 쟀습니다 (검색광고 키가 없습니다)'
      : `월 ${monthlySearch.toLocaleString()}회 검색`
  if (recent30 === null) return `${demand} · 발행량은 못 쟀습니다`
  return capped
    ? `${demand} · 최근 30일 ${recent30.toLocaleString()}편 이상 (너무 많아 정확히 세지 못했습니다)`
    : `${demand} · 최근 30일 ${recent30.toLocaleString()}편`
}

/**
 * 조회해 온 것들을 후보 목록으로 합친다.
 *
 * **같은 말이 두 곳에서 오면 한 번만 남긴다** — 자동완성과 연관검색어는 겹친다. 남길 때는
 * 검색량을 아는 쪽(searchad)을 살린다.
 */
export function buildCandidates(args: {
  seedId: string
  /** 자동완성에서 온 말 */
  suggestions: string[]
  /** 검색광고에서 온 말 (검색량 포함) */
  adRows: { keyword: string; monthlySearch: number }[]
  /** 검색어별 최근 30일 발행량 — 잰 것만 */
  recent: Record<string, number | null>
  /** 우리 지역 키워드 — 업체 찾는 말을 가려낸다 */
  myLocalKeywords?: string[]
  /** 이미 고른 주제 — 다시 권하지 않는다 */
  exclude?: string[]
}): TopicCandidate[] {
  const seen = new Map<string, TopicCandidate>()
  const excluded = new Set((args.exclude ?? []).map((t) => toTopic(t).replace(/\s+/g, '')))
  const add = (query: string, from: TopicCandidate['from'], monthlySearch: number | null) => {
    const topic = toTopic(query)
    if (!topic) return
    const key = topic.replace(/\s+/g, '')
    if (excluded.has(key)) return
    const recent30 = args.recent[topic] ?? args.recent[query] ?? null
    const next: TopicCandidate = {
      topic,
      seedId: args.seedId,
      monthlySearch,
      recent30,
      intent: classifyIntent(topic, args.myLocalKeywords),
      from,
      why: candidateWhy(monthlySearch, recent30),
    }
    const prev = seen.get(key)
    // 검색량을 아는 쪽을 살린다 — 겹칠 때 모르는 값으로 덮으면 정보가 줄어든다
    if (!prev || (prev.monthlySearch === null && next.monthlySearch !== null)) seen.set(key, next)
  }
  for (const row of args.adRows) add(row.keyword, 'searchad', row.monthlySearch)
  for (const s of args.suggestions) add(s, 'autocomplete', null)
  return rankCandidates([...seen.values()])
}

/**
 * 화면에 보여줄 개수 상한.
 *
 * 첫 실행에서 **후보가 1,152개 나왔다** (검색광고 연관검색어는 아낌없이 준다). 그걸 그대로
 * 뿌리면 고를 수 있는 목록이 아니라 스크롤 지옥이다. 회원이 실제로 읽고 고를 만한 수로 자르되,
 * **몇 개를 잘랐는지 화면에 밝힌다** — 조용히 자르면 「이게 전부」로 읽힌다.
 */
export const SHOW_MAX = 12

/**
 * 한 번에 보여줄 만큼 잘라낸다 — **넘기면 다음 것이 나오고, 끝나면 처음으로 돌아온다.**
 *
 * ── 왜 필요했나 (2026-08-24) ────────────────────────────────
 * 회원: "주제가 매번 같은게 나와 새로고침 버튼 만들어서 다른것들이 나오게 해줘."
 *
 * 맞는 지적이다. 검색량 상위 12개만 보여주고 있었는데, 「다이어트」 갈래에서 실제로 남는
 * 후보는 **409개**였다 — 397개가 접힌 채로 한 번도 눈에 띄지 않았다. 게다가 검색광고
 * 연관검색어는 같은 씨앗에 같은 순서로 오므로 **다시 눌러도 열두 줄이 그대로**였다.
 *
 * 끝에서 처음으로 돌아오게 한 이유: 「더 없습니다」로 막히면 회원이 그 자리에서 멈춘다.
 * 한 바퀴 도는 편이 낫고, 몇 번째를 보고 있는지는 화면에 적는다.
 */
export function pageOf<T>(list: T[], page: number, size = SHOW_MAX): T[] {
  if (!list.length || size <= 0) return []
  const pages = Math.ceil(list.length / size)
  const p = ((Math.trunc(page) % pages) + pages) % pages
  return list.slice(p * size, p * size + size)
}

/** 지금 몇 번째를 보고 있나 — 「409개 중 13~24번째」 */
export function pageRange(total: number, page: number, size = SHOW_MAX): { from: number; to: number; pages: number } {
  if (!total || size <= 0) return { from: 0, to: 0, pages: 0 }
  const pages = Math.ceil(total / size)
  const p = ((Math.trunc(page) % pages) + pages) % pages
  return { from: p * size + 1, to: Math.min(total, p * size + size), pages }
}

/**
 * 잰 발행량을 후보에 붙이고 다시 줄 세운다.
 *
 * ── 왜 따로 있나 (2026-08-24) ───────────────────────────────
 * 처음엔 **검색량 상위 10개를 먼저 재고 그다음에 줄 세웠다.** 그랬더니 화면에 보이는
 * 24개가 **전부 「발행량은 못 쟀습니다」**였다. 잰 것들은 경쟁이 세서(300편 이상) 맨 뒤로
 * 밀렸고, 못 잰 것들이 그 앞을 채웠기 때문이다 — 조회를 열 번 하고 그 결과를 한 줄도
 * 못 보여준 셈이다.
 *
 * 그래서 순서를 뒤집었다: **보여줄 것을 먼저 정하고, 그것만 잰다.** 그러면 화면에 뜨는
 * 모든 줄에 수요와 경쟁이 함께 있다.
 */
export function attachRecent(
  list: TopicCandidate[],
  recent: Record<string, { count: number | null; capped?: boolean } | number | null>
): TopicCandidate[] {
  return rankCandidates(
    list.map((c) => {
      const got = recent[c.topic]
      const recent30 = typeof got === 'number' ? got : (got?.count ?? null)
      const capped = typeof got === 'object' && got !== null ? got.capped === true : false
      return { ...c, recent30, cappedRecent: capped, why: candidateWhy(c.monthlySearch, recent30, capped) }
    })
  )
}
