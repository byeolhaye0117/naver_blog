/**
 * 제목 유형 — 상위권이 어떤 제목을 쓰는지.
 *
 * **왜 만들었나.** 두 판의 상위 8편 제목을 실제로 열어봤다 (2026-08-05, 프로덕션).
 *
 * 전국 정보 키워드 「다이어트 정체기」 (누적 4,286편)
 *   1위 다이어트 정체기 극복! 치팅데이 주기와 실패 없는 탄수화물 리피딩 방법
 *   3위 열심히 하는데 왜 안 빠질까? 원인과 과학적으로 탈출하는 확실한…
 *   4위 다이어트 정체기 왜 올까? 원인 분석과 극복 방법과 팁
 *   5위 치팅데이 후 2kg 증가? 다이어트 정체기가 아닌 과학적 이유
 *   6위 여름인데 살이 안 빠진다면? 정체기 때 바꾼 3가지 습관
 *   → **8편 중 6편이 물음표로 궁금증을 만든다.**
 *
 * 우리 판 「쌍용동 헬스장」 (누적 455편)
 *   1위 천안 쌍용동 헬스장 미녀와야수짐 1:1 PT 1주일 수업 후기…
 *   4위 천안 쌍용동 헬스장 [미녀와 야수짐] 추천 !
 *   6위 쌍용동헬스장 필라테스 솔직후기 '고위드짐'
 *   → **물음표 0편.** 「추천」·「후기」 + 상호명이 전부다.
 *
 * 즉 지역 판의 제목은 단조롭고, 전국 판에서 통하는 방식이 아직 안 들어와 있다.
 * 다만 **「전국이 그렇게 하니까 우리도」로 쓰지 않는다** — 판마다 규칙이 달랐다
 * (최신성 지역 +0.63 vs 전국 +0.04, 홍보 지역 -0.18 vs 전국 +0.63). 그래서 제목
 * 유형도 관찰 신호로 넣어 **우리 판에서 실제로 유리한지 계속 재본다** (factors.ts).
 *
 * 이 파일은 판정만 한다 (순수 함수 — 테스트 대상).
 */

export type TitleShape =
  /** 물음표·의문사로 궁금증을 만든다 — 「왜 안 빠질까?」 */
  | 'question'
  /** 숫자로 묶는다 — 「바꾼 3가지 습관」 */
  | 'listicle'
  /** 후기·추천을 내세운다 — 지역 판의 기본형 */
  | 'review'
  /** 위 어디에도 없는 평서형 나열 */
  | 'plain'

export const TITLE_SHAPE_LABEL: Record<TitleShape, string> = {
  question: '질문형',
  listicle: '숫자형',
  review: '후기·추천형',
  plain: '평서형',
}

/** 의문사·의문 어미 — 물음표를 안 붙이고 묶는 제목도 있다 */
const QUESTION_WORDS = [
  '왜',
  '어떻게',
  '어떤',
  '무엇',
  '언제',
  '얼마',
  '될까',
  '할까',
  '일까',
  '있을까',
  '괜찮을까',
  '안 빠질까',
  '맞을까',
]

/** 후기·추천을 내세우는 말 */
const REVIEW_WORDS = ['후기', '추천', '리뷰', '내돈내산', '체험']

/**
 * 「3가지」「5단계」처럼 **개수를 세는** 제목.
 *
 * 단위(주·일·달·분·kg)는 넣지 않는다 — 「1:1 PT 1주일 수업 후기」의 「1주」나
 * 「쌍용역 5분 거리」가 숫자형으로 잡혀서 실측 분포가 틀리게 나왔다.
 */
const LISTICLE_RE = /\d+\s*(가지|개(?![인월])|단계|things)/

/** 제목에 물음표 성격이 있는지 (순수 함수 — 테스트 대상) */
export function isQuestionTitle(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  if (t.includes('?') || t.includes('？')) return true
  return QUESTION_WORDS.some((w) => t.includes(w))
}

/**
 * 제목 유형 판정 (순수 함수 — 테스트 대상).
 *
 * 순서가 있다. 질문형이 가장 강한 신호라 먼저 보고, 그다음 숫자형, 그다음 후기형이다.
 * 「쌍용동 헬스장 추천! 3가지 이유」처럼 겹치면 앞선 것으로 센다.
 */
export function titleShape(title: string): TitleShape {
  const t = title.trim()
  if (isQuestionTitle(t)) return 'question'
  if (LISTICLE_RE.test(t)) return 'listicle'
  if (REVIEW_WORDS.some((w) => t.includes(w))) return 'review'
  return 'plain'
}

export interface TitleShapeCount {
  shape: TitleShape
  label: string
  count: number
  /** 전체에서 몇 % */
  share: number
}

/** 상위 글 제목들의 유형 분포 (순수 함수 — 테스트 대상) */
export function shapeDistribution(titles: string[]): TitleShapeCount[] {
  const shapes: TitleShape[] = ['question', 'listicle', 'review', 'plain']
  const total = titles.filter((t) => t.trim()).length
  return shapes.map((shape) => {
    const count = titles.filter((t) => t.trim() && titleShape(t) === shape).length
    return {
      shape,
      label: TITLE_SHAPE_LABEL[shape],
      count,
      share: total ? Math.round((count / total) * 1000) / 10 : 0,
    }
  })
}

/**
 * 내 제목에 해줄 말 (순수 함수 — 테스트 대상).
 *
 * 「질문형으로 바꾸세요」라고 단정하지 않는다. 전국 판에서 6/8 이었다는 사실과, 우리 판
 * 상위권은 아직 그렇지 않다는 사실을 같이 준다 — 판이 다르면 답도 다를 수 있다.
 */
export function titleAdvice(title: string): string {
  const shape = titleShape(title)
  switch (shape) {
    case 'question':
      return '질문형 제목입니다. 전국 정보 키워드 상위 8편 중 6편이 이 방식이었습니다 (「왜 안 빠질까?」 「왜 올까?」).'
    case 'listicle':
      return '숫자형 제목입니다 — 무엇을 얻는지 세어서 보여주는 방식이라 클릭 이유가 분명합니다.'
    case 'review':
      return '후기·추천형입니다. 지역 키워드 상위권의 기본형이지만 8편이 전부 같은 형태라 눈에 띄지 않습니다. 「왜」나 「~해도 될까?」로 궁금증을 하나 얹으면 같은 내용으로 차이가 납니다.'
    case 'plain':
      return '평서형입니다. 지금 상태로는 클릭할 이유가 제목에 없습니다 — 독자가 실제로 하는 질문(「초보도 괜찮을까?」 「퇴근 늦어도 될까?」)을 제목에 넣어보세요.'
  }
}

/**
 * 우리 판과 참고 판의 제목 유형을 나란히 보여주는 한 줄.
 *
 * 「전국이 이러니 따라하자」가 아니라 **「우리 판에 아직 없는 방식이 있다」**를 말한다.
 * 무엇을 할지는 관찰 결과(factors.ts 의 titleQuestion)가 쌓이면서 정해진다.
 */
export function shapeCompareLine(
  localTitles: string[],
  referenceTitles: string[]
): string | null {
  if (!localTitles.length || !referenceTitles.length) return null
  const q = (titles: string[]) =>
    titles.filter((t) => t.trim() && titleShape(t) === 'question').length
  const lq = q(localTitles)
  const rq = q(referenceTitles)
  return (
    `제목 질문형 비율 — 우리 판 ${lq}/${localTitles.length}편 · 참고 판 ${rq}/${referenceTitles.length}편. ` +
    (rq > lq
      ? '참고 판에서 더 많이 쓰는 방식입니다. 다만 판마다 규칙이 달랐으므로(최신성·홍보 요소가 정반대로 나왔습니다) 우리 판에서도 유리한지는 관찰이 쌓이면서 확인됩니다.'
      : '두 판의 차이가 크지 않습니다.')
  )
}
