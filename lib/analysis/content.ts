/**
 * 글 내용의 균형 — 「읽는 사람이 가져갈 게 있나」 vs 「홍보만 하고 있나」.
 *
 * **왜 만들었나.** 회원이 물었다 — "시설 안내·이벤트 안내 같은 홍보성 글로만 하면 잘 안
 * 띄어주는 것 같다. 시설+이벤트 +알파를 써야 되는 것 같은데?" 그래서 상위 글 본문을
 * 실제로 세봤다 (2026-08-05, 「쌍용동 헬스장」·「봉명동 헬스장」 상위 11편):
 *
 *                  1~3위 평균   4위 이하 평균
 *   정보 요소        5.2개        3.6개
 *   홍보 요소        2.0개        3.8개
 *   경험 요소        3.7개        4.8개
 *
 *   순위 상관 (11편): 정보 +0.59 · 홍보 -0.37 · 경험 -0.13
 *
 * 가설의 앞부분은 맞았다 — 홍보 표현이 많은 글이 아래에 있었다. 그런데 「+알파」의 정체는
 * **후기 형식이 아니라 운동 정보**였다. 경험 요소는 순위와 관계가 없었고(-0.13), 반례가
 * 분명했다 — 「신방동헬스장 고민 끝! … 피앤피짐 소개」는 경험 요소 0개인 순수 소개글인데
 * 2위였다. 그 글은 정보 요소 4개(자세·식단·유산소·스트레칭)에 홍보 요소는 2개뿐이었다.
 *
 * 즉 갈린 지점은 「후기냐 홍보냐」가 아니라 **「읽는 사람이 가져갈 게 있느냐」** 였다.
 *
 * **표본이 작다.** 11편·키워드 2개이고, 두 키워드에서 결과가 갈렸다 (봉명동 정보 +0.79 /
 * 쌍용동 +0.15). 그래서 이 값을 「법칙」으로 쓰지 않는다 — 관찰소(factors.ts)가 매일 다시
 * 재고, 방향이 뒤집히면 화면에서 그게 보인다.
 */

/**
 * 정보 요소 — 읽는 사람이 가져갈 수 있는 실행 지식.
 *
 * 「어떤 기구가 있다」가 아니라 「그 기구로 무엇을 어떻게 한다」에 나오는 말들이다.
 */
export const INFO_WORDS = [
  '자세', '루틴', '식단', '칼로리', '단백질', '유산소', '근력', '근육', '스트레칭',
  '세트', '횟수', '호흡', '자극', '부위', '방법', '순서', '주의', '초보', '코어',
  '하체', '상체', '가슴', '등운동', '어깨', '스쿼트', '데드리프트', '벤치프레스',
  '워밍업', '회복', '수분', '체지방', '인바디', '무게', '반복', '유의', '팁',
]

/**
 * 홍보 요소 — 파는 말.
 *
 * 하나도 없으면 안 된다 (우리 글은 상담으로 이어져야 한다). 다만 많아지면 순위가
 * 내려갔다 — 4위 글은 상담·예약·할인·영업시간을 다 넣어 6개였다.
 */
export const PROMO_WORDS = [
  '문의', '상담', '예약', '오픈', '이벤트', '할인', '프로모션', '특가', '혜택', '신규',
  '회원권', '영업시간', '오시는 길', '주차 가능', '전화', '카톡', '마감', '선착순',
  '지금 바로', '서둘러', '무료 체험', '등록 문의',
]

/** 경험 요소 — 겪은 사람만 쓸 수 있는 말 (순위와는 관계가 없었지만 신뢰도에는 쓰인다) */
export const EXPERIENCE_WORDS = [
  '다녀왔', '다니고 있', '등록했', '등록하고', '수업', '받아봤', '받았는데', '느꼈',
  '좋았', '아쉬', '솔직', '후기', '체험', '처음 갔', '가봤', '주차', '개월', '주째',
  '일차', '일째', '변화', '줄었', '빠졌', '늘었',
]

/**
 * 정보 요소는 이만큼은 있어야 한다.
 * 실측 1~3위 평균 5.2개 · 4위 이하 3.6개 → 그 사이인 4를 기준선으로 둔다.
 */
export const INFO_MIN = 4

/**
 * 정보 하한은 **글의 목적에 따라 다르다.**
 *
 * 회원이 물었다 — "후기 블로그에 정보를 욱여넣으면 이상하지 않을까?" 맞는 말이고,
 * 실측도 같은 쪽을 가리킨다. 경험 요소는 순위와 관계가 없었고(-0.13) 오히려 4위 이하가
 * 더 많았다 (경험 4.8 vs 1~3위 3.7). 결정적인 반례는 2위였던 「신방동헬스장 고민 끝!
 * … 피앤피짐 소개」 — **경험 요소 0개인 순수 소개글**이 정보 4개·홍보 2개로 2위였다.
 *
 * 그래서 후기글에 정보를 밀어넣어 순위를 노리는 것은 두 번 틀린다. 후기의 유일한 무기인
 * 「제3자가 실제로 겪은 말투」를 잃고, 그 대가로 얻는 순위 근거도 없다.
 *
 * 역할을 나눈다.
 *   info   5 — 정보가 주인공이다. 상위권 평균(5.2)을 그대로 목표로 둔다.
 *   promo  4 — 시설·이벤트만 쓰면 안 된다. 해결 단락에 실행 정보를 녹인다.
 *   review 2 — 순위는 다른 글이 뚫는다. 후기는 상담 직전에 읽는 신뢰용이다.
 *              그래도 0 은 아니다 — 「가서 뭘 알게 됐는지」가 하나도 없는 후기는
 *              읽는 사람이 가져갈 게 없다. 다만 **들은 말을 옮기는 정도**로 족하다.
 */
export const INFO_MIN_BY_TYPE: Record<'promo' | 'info' | 'review', number> = {
  promo: 4,
  info: 5,
  review: 2,
}
/**
 * 홍보 요소는 이만큼까지.
 * 실측 1~3위 평균 2.0개 · 4위 이하 3.8개 → 3까지는 상위권 범위 안이다.
 */
export const PROMO_MAX = 3

/**
 * 홍보 상한도 **목적에 따라 다르다.**
 *
 * 실전 검수에서 걸렸다 — 홍보글 하나가 상담·혜택·신규·전화 4종류로 주의를 맞았는데,
 * 그중 「상담」과 「전화」는 **이 글이 존재하는 이유**다. 홍보글에서 CTA 수단을 쓰면
 * 필연적으로 2종류가 소진되므로, 상한 3 은 홍보글에 사실상 「혜택 이름 하나만 쓰라」는
 * 뜻이 된다.
 *
 * 대신 정보글은 조여 놓는다 — 마무리에 문의 한 줄이면 1~2종류로 끝나고, 그 이상은
 * 정보글의 목적(신뢰 축적)을 깨는 신호다. 전체 압력은 그대로 두고 배분만 바꿨다.
 *
 * 방향의 근거는 그대로다: 홍보 표현이 많은 글이 아래에 있었다 (1~3위 평균 2.0종류 /
 * 4위 이하 3.8종류). 이 신호는 관찰에서 거꾸로 나온 적이 있는 유일한 항목이라
 * 조이는 쪽으로 기울인다.
 */
export const PROMO_MAX_BY_TYPE: Record<'promo' | 'info' | 'review', number> = {
  promo: 4,
  info: 2,
  review: 3,
}

export interface ContentSignals {
  /** 몇 종류가 들어 있는지 (같은 말을 여러 번 써도 1로 센다) */
  info: number
  promo: number
  experience: number
  /** 실제로 들어 있던 말 — 화면에서 근거로 보여준다 */
  infoFound: string[]
  promoFound: string[]
  experienceFound: string[]
}

/**
 * 글에 든 신호를 센다 (순수 함수 — 테스트 대상).
 *
 * **횟수가 아니라 종류를 센다.** 「자세」를 열 번 써도 1개다. 같은 말을 반복하는 것은
 * 정보를 더한 게 아니고, 횟수로 세면 키워드 반복하듯 채워 넣어 점수를 올릴 수 있다.
 */
export function countSignals(text: string): ContentSignals {
  const hay = text ?? ''
  const pick = (words: string[]) => words.filter((w) => hay.includes(w))
  const infoFound = pick(INFO_WORDS)
  const promoFound = pick(PROMO_WORDS)
  const experienceFound = pick(EXPERIENCE_WORDS)
  return {
    info: infoFound.length,
    promo: promoFound.length,
    experience: experienceFound.length,
    infoFound,
    promoFound,
    experienceFound,
  }
}

export type BalanceLevel = 'good' | 'thin' | 'pushy' | 'both'

export interface ContentBalance {
  level: BalanceLevel
  signals: ContentSignals
  /** 정보 쪽 한 줄 */
  infoNote: string
  /** 홍보 쪽 한 줄 */
  promoNote: string
}

/**
 * 균형 판정 (순수 함수 — 테스트 대상).
 *
 * 판정은 두 축을 따로 낸다 — 정보가 모자란 것과 홍보가 과한 것은 고칠 방법이 다르다.
 * 정보가 모자라면 단락을 **더해야** 하고, 홍보가 과하면 **덜어내야** 한다.
 */
export function contentBalance(
  text: string,
  /** 글 유형 — 정보 하한이 목적에 따라 다르다 (INFO_MIN_BY_TYPE 주석) */
  type: 'promo' | 'info' | 'review' = 'promo'
): ContentBalance {
  const signals = countSignals(text)
  const infoMin = INFO_MIN_BY_TYPE[type] ?? INFO_MIN
  const promoMax = PROMO_MAX_BY_TYPE[type] ?? PROMO_MAX
  const thin = signals.info < infoMin
  const pushy = signals.promo > promoMax

  const level: BalanceLevel = thin && pushy ? 'both' : thin ? 'thin' : pushy ? 'pushy' : 'good'

  /*
   * 후기글에는 다른 말을 한다.
   * 「단락을 하나 더하세요」는 정보글·홍보글에 맞는 처방이고, 후기에 그렇게 하면
   * 업체가 쓴 글이 된다. 후기는 들은 말을 옮기는 정도로 족하다.
   */
  const infoNote = thin
    ? type === 'review'
      ? `가서 알게 된 것이 ${signals.info}종류입니다 (${infoMin}종류면 충분). 정보 단락을 만들지 마세요 — 상담 때 들은 말을 한 줄로 옮기면 됩니다. 예) "제 자세를 보면서 어디에 자극이 와야 하는지 짚어주셨어요."`
      : `읽는 사람이 가져갈 정보가 ${signals.info}종류입니다 (${infoMin}종류 이상 · 상위권 1~3위 평균 5.2종류). 자세·루틴·식단·주의점 중 하나로 단락을 하나 더하세요 — 「기구가 있다」가 아니라 「그 기구로 무엇을 어떻게 한다」로 씁니다.`
    : `정보가 ${signals.info}종류 들어 있습니다 (${signals.infoFound.slice(0, 5).join('·')}${signals.infoFound.length > 5 ? ' 등' : ''}) — ${type === 'review' ? '후기로는 충분합니다.' : '상위권 수준입니다.'}`

  const promoNote = pushy
    ? `홍보 표현이 ${signals.promo}종류입니다 (${signals.promoFound.slice(0, 6).join('·')}) — 이 유형 상한은 ${promoMax}종류입니다. 실측에서 홍보 표현이 많은 글이 아래에 있었습니다 (1~3위 평균 2.0종류 / 4위 이하 3.8종류). 이벤트·상담 안내는 한 곳에 모으고 본문에 흩뿌리지 마세요.`
    : `홍보 표현이 ${signals.promo}종류입니다 — 이 글 유형의 범위(${promoMax}종류 이하) 안입니다.${
        signals.promo === 0 ? ' 다만 하나도 없으면 상담으로 이어지지 않습니다 — 마지막에 한 번은 넣으세요.' : ''
      }`

  return { level, signals, infoNote, promoNote }
}
