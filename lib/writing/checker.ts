import {
  contentBalance,
  countCta,
  countSignals,
  CTA_MIN_BY_TYPE,
  INFO_MIN_BY_TYPE,
  PROMO_MAX_BY_TYPE,
} from '../analysis/content'
import { TITLE_SHAPE_LABEL, titleAdvice, titleShape } from '../analysis/title'
import { analyzeReviews, placeReviewUrl, verifyReviewQuotes } from '../analysis/reviews'
import { findHardWords } from './plainwords'
import { coverageOf, requestedTopics } from './request'
import { titleHasBrand, type ArenaLevel } from './arena'
import type { PlaceReview } from '../analysis/reviews'
import { evidenceHeadline, itemEvidence } from './evidence'
import type { PooledFactor } from '../analysis/factors'
import type {
  CheckItem,
  CheckLevel,
  CheckResult,
  CheckStats,
  PostType,
  RiskHit,
  Sponsorship,
} from '@/lib/types'
import {
  countLoose,
  countOccurrences,
  scanCommercialOveruse,
  scanMaleTargeting,
  scanRisks,
} from './banned'

export interface CheckInput {
  type: PostType
  title: string
  body: string
  mainKeyword: string
  subKeywords: string[]
  localKeyword?: string
  tags: string[]
  legalName?: string
  /**
   * 이 키워드의 경쟁 수준 — 키워드 조사에서 잰 최근 30일 발행량으로 정한다.
   *
   * 회원 질문 (2026-08-20): "경쟁 높은 키워드용 글쓰기 도구가 있는거야?" 없었다. 재놓은 값이
   * 글쓰기·검수에 하나도 연결돼 있지 않았다. 경쟁이 세지 않으면 이 값으로 아무 항목도 만들지
   * 않는다 — 규칙을 늘리면 서로 부딪힌다.
   */
  arena?: ArenaLevel
  womenOnly?: boolean
  sponsorship?: Sponsorship
  /**
   * 이 글에 실린 이벤트 정보.
   *
   * 검수에 쓰는 곳은 하나다 — **이벤트가 있는 글인데 후킹에 훅이 없는 것**을 잡는다
   * (`event-hook`). 이벤트가 없으면 그 항목을 아예 만들지 않는다.
   */
  eventText?: string
  /**
   * 회원이 이 글에 적어 보낸 요청.
   *
   * **써달라고 한 내용이 글에 실제로 들어갔는지** 본다 (`request-coverage`).
   * 회원 지적 (2026-08-19): "요청사항이 거의 반영되지 않았어." 앱은 요청을 **거르는 말**로만
   * 읽고 있었다 — 「24시 빼줘」는 지켰지만 「등록해야 하는 이유·추천하는 사람들·망설이는 점을
   * 해결」은 골격에 밀려 사라졌다.
   */
  request?: string
  /**
   * 지점에 붙여넣어 둔 **실제** 플레이스 리뷰.
   *
   * 두 가지를 잰다 — 리뷰가 있는데 안 쓴 것(`review-proof`)과, **없는 리뷰를 지어낸 것**
   * (`review-honesty`). 뒤쪽은 표시광고법에 걸리는 자리라 리뷰가 없어도 검사한다.
   */
  placeReviews?: PlaceReview[]
  /** 플레이스 id — 리뷰 링크를 만드는 데 쓴다 */
  placeId?: string
  /**
   * 정보글 마지막 홍보 구간에 넣기로 적어둔 내용.
   *
   * 이걸로 재는 것은 하나다 — **적지 않은 가격·이벤트가 글에 들어갔는지** (`info-promo-source`).
   * 회원이 적은 것만 쓰기로 했으므로, 없는 조건이 생기면 그건 AI 가 만든 것이다.
   */
  promoNote?: string
  /**
   * 관찰소에 쌓인 근거 (`poolFactors()` 결과).
   *
   * 넣으면 항목마다 「관찰 N회: 유리 x · 거꾸로 y」가 붙고, 거꾸로 나온 항목은 점수
   * 비중이 내려간다 (lib/writing/evidence.ts). 안 넣으면 예전처럼 통설 기준으로 돈다 —
   * 근거가 없는 것과 근거가 나쁜 것을 섞지 않으려고 선택 인자로 뒀다.
   */
  evidence?: PooledFactor[]
}

/** 이 점수 이상이면 "발행해도 좋은 상태" */
export const PUBLISH_THRESHOLD = 85

/** 글 유형별 수치 기준 — 세 스킬의 SEO·키워드 규칙표를 그대로 옮긴 값 */
interface Spec {
  mainMin: number
  mainMax: number
  /**
   * 메인 키워드 **권장 횟수** (없으면 하한이 곧 목표다).
   *
   * 범위가 5~7회인데 실측에서 「더 넣어서 오르지는 않는다」가 나왔으므로, 글을 쓸 때
   * 겨냥할 값은 하한인 5회다. 6~7회도 통과는 하지만 굳이 채울 이유가 없다.
   */
  mainTarget?: number
  /**
   * 함께 쓰는 키워드 **고정 목표 횟수** (없으면 1~2회 통과).
   *
   * 회원 지시로 **서브 하나를 2회**. 밀도로도 안전하다 — 메인 5회 + 서브 1개×2회 =
   * 합산 1.78%(1,915자) · 1.94%(1,750자)로 짧은 글에서도 2% 안에 든다.
   *
   * 2회가 실효 하한이라는 근거도 나왔다 (2026-08-06 실측, 219편). 글마다 가장 잘 걸린
   * 키워드를 주력으로 보고 그걸 뺀 짝에서만 세면, 그 키워드로 상위 10에 드는 비율이
   *
   *   0회 7.2%(5~11) · 1회 10.3%(6~17) · **2회 24.5%(15~38)** · 5회 이상 36.0%(20~55)
   *
   * 0~1회와 2회는 신뢰구간이 거의 겹치지 않는다. 2회면 4편 중 1편이 서브 키워드로도
   * 걸리고, 안 쓰면 14편 중 1편이다.
   *
   * **다만 못 채워도 「수정필요」로 걸지 않는다.** 실측에서 서브를 2회 쓴 상위권이
   * 절반뿐이었다 — 성정동·쌍용동 PT 는 1~3위 중간값이 2회였지만, 봉명동 PT 는
   * **1~3위 3편이 전부 0회**였고 천안 헬스장은 32편 중 18편이 0회였다.
   * 목표는 목표로 두고, 못 지킨 글을 1위와 똑같이 썼다는 이유로 감점하지는 않는다.
   */
  subTarget?: number
  densityMax: number
  charMin: number
  charMax: number
  legalNameMin: number
  requireLocalKeyword: boolean
  requireReviewWord: boolean
}

export const SPECS: Record<PostType, Spec> = {
  /*
   * gym-blog-writer.
   *
   * **2026-08-05 재조정.** 예전 값(1,900~2,100자)은 골격의 단락 예산과 맞지 않았다 —
   * 단락을 다 중간값으로 쓰면 1,875자가 나와 통과 구간에 못 들어갔고, 통과하려면 모든
   * 단락을 상위 42% 로만 써야 했다. 즉 골격대로 써도 걸리는 기준이었다.
   *
   * 새 단락 예산 합계는 1,750~2,080자다 (해결을 늘리고 이벤트를 줄였다). 통과 구간을
   * 거기에 맞췄고, 위쪽은 넉넉히 뒀다 — 실측에서 분량은 순위와 무관했으므로(방향이 갈렸다)
   * 좁은 창을 유지할 근거가 없다.
   *
   * ─── 메인 키워드 5~7회 — **실측으로 두 번 검증했다** (2026-08-06) ───
   *
   * 우리 지역 키워드 4개(쌍용동·봉명동·두정동·성정동 헬스장) 상위 32편.
   *
   * ① **많이 넣어서 오르지는 않는다.** 횟수 상관이 키워드마다 정반대였다
   *    (쌍용동 +0.04 · 봉명동 -0.17 · 두정동 -0.39 · 성정동 +0.75). 반례도 분명하다 —
   *    쌍용동 1위 17회(밀도 4.4%), 봉명동 7위 12회(5.5%), **두정동 1위 0회**,
   *    쌍용동 2위 1회. 1~3위 중간값 4.5회 / 4위 이하 3.5회로 차이가 1회뿐이다.
   *
   * ② **그러나 5회가 위험하지도 않다.** 처음엔 ①만 보고 하한을 3회로 내렸는데,
   *    회원이 「5회로 잡고 싶다」고 해서 안전성을 따로 재봤다.
   *
   *      5회 이상 15편 → 1~3위 6편 · 평균 순위 4.3
   *      4회 이하 17편 → 1~3위 6편 · 평균 순위 4.6
   *
   *    5회 이상이 오히려 평균 순위가 약간 좋았고, 정확히 5~6회 쓴 글에 1위와 2위가
   *    있었다 (성정동 1위 5회/1.3% · 두정동 2위 5회/1.9%).
   *
   *    밀도로 봐도 안전하다 — 5회(제목 1 + 본문 4)를 쓸 때 밀도는 6자 키워드 1.1~1.4%,
   *    8자 1.5~1.8% 로 상위 3위권 중간값(1.5%) 근처다.
   *
   * 결론: **하한 5회는 안전하고, 상한은 밀도가 정한다.** 유일한 예외는 9자 이상 키워드 +
   * 짧은 분량 조합인데(「쌍용동 24시 헬스장」 1,750자에서 5회면 2.06%), 그건
   * reachableKeywordRange 가 자동으로 하한을 낮추고 이유를 설명한다.
   *
   * 다만 ①은 그대로 유효하다 — 하한을 넘겼으면 **더 넣을 이유가 없다.**
   */
  promo: {
    mainMin: 5,
    mainMax: 7,
    mainTarget: 5,
    subTarget: 2,
    densityMax: 2,
    charMin: 1750,
    charMax: 2400,
    legalNameMin: 3,
    requireLocalKeyword: false,
    requireReviewWord: false,
  },
  /*
   * gym-info-writer: 정보 메인 3~5회, 지역 키워드 1~2회.
   *
   * ─── 분량 1,900~2,600 → 2,200~3,000 (2026-08-10) ──────────
   *
   * 회원이 결과물을 보고 말했다 — "정보성 글 분량이 부족한 거 같아 늘려서 업데이트 해줘."
   * 단락 예산도 같이 늘렸다 (합계 2,250~2,800자, prompt.ts 의 STRUCTURE.info).
   *
   * **순위 근거가 아니다.** 실측에서 분량은 순위와 무관했다 (방향이 키워드마다 갈렸다).
   * 다만 올리는 방향이 위험하지도 않다 — 절벽은 1,200자 아래에 있었고 위쪽에는 없었다.
   * 정보글은 이 블로그가 주제 신뢰를 쌓는 글이라, 같은 종류를 얕게 늘어놓는 것보다
   * 깊게 쓰는 쪽을 택한다. 종류 하한(5)은 그대로다 — 그건 실측값이다.
   *
   * legalNameMin 0 → 2: 회원 요청으로 **첫 문장에 인사 + 정식 상호명**이 들어간다
   * (도입 1회 + 마지막 구간 1회). 예전에는 0이라 정보글에서 상호명을 한 번도 안 써도
   * 통과했는데, 그러면 누가 쓴 글인지 모르는 채로 발행됐다.
   */
  info: {
    mainMin: 3,
    mainMax: 5,
    densityMax: 1.8,
    charMin: 2200,
    charMax: 3000,
    /*
     * ─── 2 → 0 → 1 ────────────────────────────────────────────
     *
     * **2 → 0** (2026-08-20). 회원이 영상을 주며 "정보성글 다시 개편하자"고 했다. 영상이 든
     * 여섯 가지 금지 항목 중 세 번째가 「과도한 상호명 반복」이고, 근거는 네이버의 홍보성
     * 게시물 공지다.
     *
     * **0 → 1** (2026-08-21). 회원: "인사말에 업체명 한번을 소개되게 해줘."
     *
     * 다시 보니 **여섯 가지 중 상호명만 우리가 실측한 적이 없다.** 나머지 다섯은 1페이지
     * 정보형 38편에서 실제로 셌다 (전화 5% · 플레이스 11% · 링크 26% · 혜택 3% · 방문 유도
     * 8%). 상호명 칸은 「—」였다 — 세지 않았다는 뜻이고, 그러니 이 항목의 근거는 영상 하나다.
     *
     * 그리고 우리가 잰 것은 오히려 반대쪽을 가리킨다:
     *   · 지역 키워드 1페이지 170편 — 홍보 신호 0종류 26편 1~3위 15% / 1~2종류 71편 38%
     *   · 상호명 유무로 순위 차이 없음 (161편: 있음 5.33위 / 없음 5.38위)
     *   · 경쟁 센 자리 상위 50편 중 37편(74%)이 **제목에** 상호명을 썼다
     * 정보글도 지역 키워드를 메인으로 잡으면 그 판에 들어가는 글이다 (2026-08-21 회원 결정).
     *
     * 그래서 **1회**다. 영상이 말한 것은 「과도한 반복」이지 한 번 밝히는 것이 아니고,
     * 누가 쓴 글인지 밝히는 것은 네이버가 요구하는 출처 명확성 쪽에 가깝다. 2회 이상은
     * 계속 막는다 (`info-purity`).
     */
    legalNameMin: 1,
    requireLocalKeyword: true,
    requireReviewWord: false,
  },
  /*
   * gym-review-writer — **2026-08-06 실측으로 다시 잡았다** (방문자 화자 글 88편).
   *
   * 앞선 값(메인 3~5회 · 밀도 1~1.5% · 1,900~2,100자)은 통설이었다. 후기글은 우리 시장
   * 상위권에 가장 많은 유형이라(161편 중 98편) 표본이 충분했다.
   *
   * ① **분량이 가장 뚜렷한 신호였다.**
   *      ~1,200자      15편 → 1~3위  7%
   *      1,200~1,700   39편 → 1~3위 28%
   *      1,700~2,200   16편 → 1~3위 69%   ← 최고
   *      2,200~3,000   13편 → 1~3위 54%
   *      3,000자 이상    4편 → 1~3위 25%
   *    1~3위 글의 중간값은 1,835자다. 예전 창(1,900~2,100)은 좋은 구간 안에 있었지만
   *    너무 좁아서, 2,200~3,000(54%)까지 걸러냈다. 1,700~2,800 으로 넓혔다.
   *
   * ② **키워드 횟수는 무관했다.** 0~1회 28% · 2회 36% · 3~4회 33% · 5회 30% ·
   *    6~8회 15% · 9회 이상 36%. 신뢰구간이 전부 겹친다. 1~3위 중간값은 2회이고
   *    하위 25%는 0회였다. 그래서 하한을 3 → 2 로 내렸다 (안 쓰면 안 걸리는 건 사실이니
   *    0으로 두지는 않는다).
   *
   * ③ **밀도는 상위권이 훨씬 낮게 쓴다.** 1~3위 밀도 중간값 0.39% · 상위 25% 0.82%.
   *    「1~1.5%」는 목표처럼 읽혔는데 그 구간은 9개뿐이고 1~3위 비율이 11%로 오히려
   *    나빴다. 상한 1.5%는 안전선으로 남기고 목표라는 뉘앙스를 지웠다.
   *
   * ④ 제목의 「후기」는 유리했다 — 있음 52편 4.77위(1~3위 40%) / 없음 36편 5.81위(28%).
   *    requireReviewWord 를 그대로 둔다.
   */
  review: {
    mainMin: 2,
    mainMax: 5,
    mainTarget: 3,
    densityMax: 1.5,
    charMin: 1700,
    charMax: 2800,
    legalNameMin: 0,
    requireLocalKeyword: false,
    requireReviewWord: true,
  },
}

const IMAGE_RE = /^\s*\[이미지\s*:?([^\]]*)\]\s*$/
/**
 * 영상 자리 표기.
 *
 * 이미지와 같은 방식으로 **본문 글자수에서 뺀다.** 표기를 그냥 두면 「[영상: 스쿼트 시범]」
 * 이 본문 12자로 세어져, 글은 그대로인데 분량이 늘어난 것처럼 보인다.
 * 관찰에서 영상이 있는 글이 위에 있었다 (6회 중 유리 2 · 거꾸로 0).
 */
const VIDEO_RE = /^\s*\[영상\s*:?([^\]]*)\]\s*$/
const HEADING_RE = /^\s*(?:##+\s*|■\s*|▶\s*)(.+?)\s*$/

export interface ParsedBody {
  prose: string
  /**
   * 산문 + **소제목까지** 원래 순서로 (이미지·영상 지시문만 뺀 것).
   *
   * **소제목을 세는 데서 빠져 있었다** (2026-08-10). `prose` 는 소제목을 따로 빼내므로
   * 글자수와 키워드 횟수가 소제목을 빼고 계산됐다. 그런데 발행하면 소제목도 본문이고,
   * 기준을 만든 조사 도구는 소제목을 **포함해서** 잰다 (parsePostMetrics 는 se-main-container
   * 안을 통째로 읽는다). 즉 같은 것을 서로 다른 자로 재고 있었다.
   *
   * 회원이 「메인 키워드 2회」로 계속 걸린 이유도 여기 있었다 — 소제목에 넣은 것이 안 세졌다.
   *
   * 구조 검사(문단 쪼개기·어미·이미지 배치)는 그대로 `prose` 를 쓴다. 소제목은 문단이
   * 아니어서 섞으면 문단 통계가 망가진다.
   */
  scan: string
  headings: string[]
  images: string[]
  /** 영상 자리 설명 */
  videos: string[]
  /** 각 소제목 바로 위에 이미지가 있는지 */
  headingsWithImageAbove: number
  /**
   * 본문이 한 줄도 없는 소제목 — 소제목만 세우고 바로 다음 소제목으로 넘어간 자리.
   *
   * 회원이 보여준 정보글에 있었다 (2026-08-21): 「## 자주 나오는 질문 1, 2 …」 다음에
   * 이미지 한 장이 오고 바로 「## 정체기 · 공복 유산소 …」가 왔다. 읽는 사람에게는 빈
   * 칸이고, 소제목 수만 늘어서 스펙(5~6개)을 넘긴다.
   */
  emptyHeadings: string[]
  /** 소제목 없이 본문만 있는 도입부 */
  intro: string
}

export function parseBody(body: string): ParsedBody {
  /*
   * 굵게 표시(`**말**`)는 **글자수·키워드 계산에서 뺀다.**
   *
   * AI 가 강조하려고 별표를 쓴다 (회원 글에 「**첫 번째, 점심 식사 순서를 바꿔보세요.**」가
   * 있었다). 별표는 발행되는 글자가 아니므로 세면 분량이 실제보다 많아 보인다.
   * 서식으로는 살린다 — export.ts 가 `<strong>` 으로 바꿔 붙여넣기에 반영한다.
   */
  const lines = body.replace(/\*\*([^*\n]+)\*\*/g, '$1').split(/\r?\n/)
  const headings: string[] = []
  const images: string[] = []
  const videos: string[] = []
  const proseLines: string[] = []
  /** 산문과 소제목을 원래 순서로 — 키워드 횟수·글자수·위치는 이걸로 센다 */
  const scanLines: string[] = []
  let headingsWithImageAbove = 0
  let lastMeaningful: 'image' | 'heading' | 'prose' | null = null
  let sawHeading = false
  const introLines: string[] = []
  /** 본문 한 줄 없이 다음 소제목으로 넘어간 소제목 (2026-08-21) */
  const emptyHeadings: string[] = []
  let openHeading: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const img = IMAGE_RE.exec(trimmed)
    if (img) {
      images.push(img[1].trim())
      lastMeaningful = 'image'
      continue
    }

    const vid = VIDEO_RE.exec(trimmed)
    if (vid) {
      videos.push(vid[1].trim())
      // 영상은 소제목 위 배치 규칙이 없다 — lastMeaningful 을 건드리지 않는다
      continue
    }

    const h = HEADING_RE.exec(trimmed)
    if (h) {
      // 앞 소제목이 본문 없이 끝났으면 빈 구간이다 (이미지·영상만 있는 것도 빈 것으로 본다)
      if (openHeading !== null) emptyHeadings.push(openHeading)
      openHeading = h[1]
      headings.push(h[1])
      scanLines.push(h[1])
      if (lastMeaningful === 'image') headingsWithImageAbove++
      lastMeaningful = 'heading'
      sawHeading = true
      continue
    }

    proseLines.push(trimmed)
    scanLines.push(trimmed)
    if (!sawHeading) introLines.push(trimmed)
    openHeading = null
    lastMeaningful = 'prose'
  }
  // 마지막 소제목도 본문 없이 끝났을 수 있다
  if (openHeading !== null) emptyHeadings.push(openHeading)

  return {
    prose: proseLines.join('\n'),
    scan: scanLines.join('\n'),
    headings,
    images,
    videos,
    headingsWithImageAbove,
    emptyHeadings,
    intro: introLines.join('\n'),
  }
}

function level(ok: boolean, near: boolean): CheckLevel {
  return ok ? 'pass' : near ? 'warn' : 'fail'
}

/**
 * 밀도 상한 때문에 실제로 쓸 수 있는 메인 키워드 횟수 (순수 함수 — 테스트 대상).
 *
 * **왜 필요한가.** 「메인 5~7회」와 「밀도 2% 이내」가 서로 부딪힌다. 밀도는
 * `키워드 글자수 × 본문 등장 횟수 ÷ 본문 글자수` 라서, 키워드가 길면 몇 번 못 쓴다.
 *
 *   「쌍용동 헬스장」(공백 뺀 6자) · 1,750자 → 본문 5회 + 제목 1 = 6회까지 (7회 불가)
 *   「쌍용동 24시 헬스장」(9자) · 1,750자 → 본문 3회 + 제목 1 = 4회까지 (하한 5회조차 불가)
 *
 * 전에는 이 상황에서 「메인 키워드 미달」과 「밀도 초과」가 동시에 떴다. 회원은 자기가
 * 잘못 쓴 줄 알지만 **애초에 둘을 같이 만족시킬 수 없는 조합**이었다. 그래서 도달 가능한
 * 범위를 계산해 그걸 기준으로 삼고, 좁아진 이유를 말해준다.
 */
export function reachableKeywordRange(args: {
  keyword: string
  charCount: number
  densityMax: number
  mainMin: number
  mainMax: number
  inTitle: number
}): { min: number; max: number; tight: boolean; proseCap: number } {
  const flat = args.keyword.replace(/\s+/g, '')
  if (!flat.length || args.charCount <= 0) {
    return { min: args.mainMin, max: args.mainMax, tight: false, proseCap: args.mainMax }
  }
  const proseCap = Math.floor(((args.densityMax / 100) * args.charCount) / flat.length)
  const max = Math.min(args.mainMax, proseCap + args.inTitle)
  // 하한이 도달 불가면 하한도 내린다 — 못 하는 것을 요구하지 않는다
  const min = Math.min(args.mainMin, max)
  return { min, max, tight: max < args.mainMax, proseCap }
}

/** 메인 키워드 등장 위치가 등간격이면 D.I.A.+ 가 패턴으로 읽는다 */
function detectEvenSpacing(positions: number[]): boolean {
  if (positions.length < 4) return false
  const gaps: number[] = []
  for (let i = 1; i < positions.length; i++) gaps.push(positions[i] - positions[i - 1])
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (mean === 0) return false
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length)
  return sd / mean < 0.28
}

function keywordPositions(text: string, keyword: string): number[] {
  const flatText = text.replace(/\s+/g, '')
  const flatKeyword = keyword.replace(/\s+/g, '')
  if (!flatKeyword) return []
  const out: number[] = []
  let i = 0
  while ((i = flatText.indexOf(flatKeyword, i)) !== -1) {
    out.push(flatText.length ? i / flatText.length : 0)
    i += flatKeyword.length
  }
  return out
}

/**
 * 문장 쪼개기.
 *
 * 상위노출 조사(scripts/study.mjs)가 **이 함수를 그대로** 쓴다 — 검수는 A 로 세고
 * 조사는 B 로 세면 기준이 조용히 어긋난다.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

/** 문장의 어미 갈래 (조사와 검수가 같은 기준을 쓰도록 내보낸다) */
export function endingOf(sentence: string): string {
  const s = sentence.replace(/[.!?…\s]+$/, '')
  if (/습니다$|입니다$|됩니다$|립니다$|십니다$/.test(s)) return '~습니다'
  if (/어요$|아요$|에요$|예요$|해요$|세요$|요$/.test(s)) return '~요'
  if (/거든요$/.test(s)) return '~거든요'
  if (/죠$|지요$/.test(s)) return '~죠'
  if (/다$|였다$|었다$/.test(s)) return '~다'
  if (/[가-힣]$/.test(s)) return '명사형'
  return '기타'
}

/**
 * 한국어 글에 섞인 **로마자 낱말**을 찾는다.
 *
 * 회원 지적 — "글에 영문이 들어가. 모든 글은 한국어로 작성될 수 있게 해줘."
 * 실제로 나온 문장: "같은 양을 먹어도 혈당이 천천히 올라가서 **addictive**한 느낌이 덜합니다."
 * 모델이 한국어로 쓰다가 개념어 하나를 영어로 흘리는 일이 있다.
 *
 * 다 막을 수는 없다 — 우리 글에는 **정말 필요한 로마자**가 있다:
 *   · 정식 상호명 (MTO 피트니스 쌍용점)
 *   · 굳어진 약어 (PT · OT · GX · VAT · CCTV)
 *   · 단위 (kg · kcal · cm)
 *   · 링크
 * 그래서 허용 목록을 두고, 링크는 아예 지운 뒤에 본다. 낱말을 세는 게 아니라
 * **한글로 쓸 수 있는데 영어로 쓴 것**을 찾는 것이 목적이다.
 */
export const LATIN_ALLOWED = [
  // 굳어진 약어 — 한글로 바꾸면 오히려 못 알아본다
  'PT', 'OT', 'GX', 'TRX', 'RM', 'VAT', 'CCTV', 'SNS', 'QR', 'MRI', 'DM', 'TV', 'PC', 'AM', 'PM', 'OK',
  // 단위
  'kg', 'g', 'kcal', 'cal', 'cm', 'mm', 'km', 'ml', 'L', 'kW',
  /*
   * 출처로 쓰는 기관 약어. 「연구를 인용하면 출처를 밝혀라」와 「영문을 쓰지 마라」가 서로
   * 부딪히는 자리다 — 출처를 쓰라고 하면서 기관 이름을 막으면 안 된다.
   */
  'WHO', 'NIH', 'ACSM', 'NSCA', 'CDC', 'FDA',
]

export function findLatinWords(text: string, extraAllow: string[] = []): string[] {
  const allow = new Set([...LATIN_ALLOWED, ...extraAllow].map((w) => w.toLowerCase()).filter(Boolean))
  const cleaned = (text ?? '')
    // 링크·메일은 로마자여야 한다 — 세지 않는다
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/[\w.+-]+@[\w.-]+/g, ' ')
  const found: string[] = []
  for (const m of cleaned.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
    const word = m[0].replace(/[-'’]+$/, '')
    // 한 글자는 보지 않는다 (「L사이즈」·「A타입」처럼 기호에 가깝게 쓰인다)
    if (word.length < 2) continue
    if (allow.has(word.toLowerCase())) continue
    if (!found.includes(word)) found.push(word)
  }
  return found
}

/**
 * **이미지로만 전달한 내용이 있나** — 설명에 있는 말이 본문에도 있는지 본다.
 *
 * 네이버가 낸 「콘텐츠 셀프 체크」 다섯 번째 항목이다: 「멀티미디어로 전달한 내용을
 * 텍스트로도 함께 제공하였나요」. AI 브리핑 인용 FAQ 에도 같은 말이 있다 — 「이미지를
 * 곁들이더라도 이미지의 핵심 정보는 텍스트로 함께 작성해 주시는 것이 인용에 유리합니다」.
 *
 * 판정은 **느슨하게** 한다. 설명에서 두 글자 이상 낱말을 뽑아, **하나라도** 본문에 있으면
 * 통과다. 설명을 본문에 그대로 옮기라는 뜻이 아니라 「사진에만 있고 글에는 없는 내용」을
 * 찾는 것이기 때문이다.
 */
export function imagesOnlyInCaption(captions: string[], prose: string): string[] {
  const flat = (t: string) => (t ?? '').replace(/\s+/g, '')
  const body = flat(prose)
  const out: string[] = []
  for (const raw of captions) {
    const caption = (raw ?? '').trim()
    if (!caption) continue
    /*
     * 조사·기호를 떼고 두 글자 이상만 본다. 「대표」·「전경」처럼 사진 표기용으로만 쓰는
     * 말은 본문에 없는 게 정상이라 뺀다 — 그것까지 잡으면 거짓 경고만 는다.
     */
    const words = caption
      .split(/[\s,·:;()\[\]/]+/)
      .map((w) => w.replace(/[의는은이가을를에서와과로도만]$/, ''))
      .filter((w) => w.length >= 2 && !/^(대표|전경|사진|이미지|모습|배지|썸네일)$/.test(w))
    if (!words.length) continue
    if (!words.some((w) => body.includes(flat(w)))) out.push(caption)
  }
  return out
}

export function checkPost(input: CheckInput): CheckResult {
  const spec = SPECS[input.type]
  const parsed = parseBody(input.body)
  const title = input.title.trim()
  const main = input.mainKeyword.trim()
  const subs = input.subKeywords.map((s) => s.trim()).filter(Boolean)

  /*
   * 검수 대상 텍스트 = 제목 + 본문(산문 + 소제목). 이미지·영상 지시문과 해시태그는 뺀다.
   *
   * **소제목을 포함한다** (2026-08-10 정정 — ParsedBody.scan 주석). 발행하면 소제목도
   * 본문이고, 기준을 만든 조사 도구도 소제목을 포함해서 잰다. 빼고 세면 소제목에 넣은
   * 키워드가 사라져서 「몇 번 더 넣어라」고 잘못 요구하게 된다.
   *
   * 문단·어미 같은 구조 검사는 아래에서 `prose` 를 그대로 쓴다 — 소제목은 문단이 아니다.
   */
  const prose = parsed.prose
  const bodyText = parsed.scan
  const scanText = `${title}\n${bodyText}`
  const charCount = bodyText.replace(/\n/g, '').length

  const mainInTitle = main ? countLoose(title, main) : 0
  const mainInProse = main ? countLoose(bodyText, main) : 0
  const mainKeywordCount = mainInTitle + mainInProse
  const density =
    charCount > 0 && main
      ? Math.round(((main.replace(/\s+/g, '').length * mainInProse) / charCount) * 1000) / 10
      : 0

  // 위치(등간격 패턴·첫 100자)도 소제목을 포함한 본문에서 본다 — 세는 대상과 같아야 한다
  const positions = keywordPositions(bodyText, main)
  const evenSpacing = detectEvenSpacing(positions)

  const subKeywordCounts = subs.map((k) => ({ keyword: k, count: countLoose(scanText, k) }))
  const legalNameCount = input.legalName ? countLoose(scanText, input.legalName) : 0
  const localKeywordCount = input.localKeyword ? countLoose(scanText, input.localKeyword) : 0

  const phoneCount = (prose.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g) ?? []).length
  const linkCount = (prose.match(/https?:\/\/[^\s)]+/g) ?? []).length

  const sentences = splitSentences(prose)
  const sentenceEndings: Record<string, number> = {}
  for (const s of sentences) {
    const e = endingOf(s)
    sentenceEndings[e] = (sentenceEndings[e] ?? 0) + 1
  }

  const stats: CheckStats = {
    charCount,
    titleLength: title.length,
    headings: parsed.headings,
    imageCount: parsed.images.length,
    videoCount: parsed.videos.length,
    tagCount: input.tags.length,
    mainKeywordCount,
    mainKeywordDensity: density,
    subKeywordCounts,
    legalNameCount,
    localKeywordCount,
    phoneCount,
    linkCount,
    keywordPositions: positions,
    evenSpacing,
    sentenceEndings,
  }

  const items: CheckItem[] = []
  const add = (i: CheckItem) => items.push(i)

  // ─── 분량·구조 ───────────────────────────────────────────────
  add({
    id: 'charCount',
    group: '분량·구조',
    label: '본문 글자수 (공백 포함)',
    level: level(
      charCount >= spec.charMin && charCount <= spec.charMax,
      charCount >= spec.charMin - 250 && charCount <= spec.charMax + 400
    ),
    value: `${charCount.toLocaleString()}자`,
    /*
     * 근거의 세기가 **글 유형마다 다르다.**
     *
     * 홍보글에서는 분량이 순위를 가르지 않았다 (1위 2,197자 · 2위 1,422자 · 4위 2,568자).
     * 그런데 후기글에서는 분량이 **가장 뚜렷한 신호**였다 (방문자 화자 88편):
     *
     *   ~1,200자 1~3위 7% · 1,200~1,700 28% · **1,700~2,200 69%** · 2,200~3,000 54% ·
     *   3,000자 이상 25%
     *
     * 같은 항목에 「근거 약함」을 붙여두면 후기글에서는 거짓이 된다. 그래서 유형에 따라
     * 다르게 말한다.
     */
    target:
      input.type === 'review'
        ? `${spec.charMin.toLocaleString()}~${spec.charMax.toLocaleString()}자 — 후기글에서 가장 뚜렷한 신호였습니다 (1,700~2,200자가 1~3위 69%)`
        : `${spec.charMin.toLocaleString()}~${spec.charMax.toLocaleString()}자 (근거 약함)`,
    hint:
      charCount < spec.charMin
        ? input.type === 'review'
          ? '후기글은 분량이 실제로 순위를 갈랐습니다 — 1,200자 미만은 1~3위가 7%뿐이었고 1,700~2,200자는 69%였습니다. 1,800자는 채우는 게 좋습니다.'
          : '너무 짧으면 쓸 내용이 없다는 뜻이라 채우는 게 좋습니다. 다만 실측에서는 분량이 순위와 반대로 갔습니다 (1위 2,197자 · 2위 1,422자 · 4위 2,568자) — 늘리려고 말을 늘리지는 마세요.'
        : charCount > spec.charMax
          ? input.type === 'review'
            ? '후기글은 3,000자를 넘기면 평균 7.5위로 떨어졌습니다 (1~3위 25%). 늘어진 부분을 줄이세요.'
            : '길다고 감점되지는 않습니다. 실측에서도 분량은 순위를 가르지 않았습니다 — 늘어지는지만 보세요.'
          : undefined,
    /*
     * 가중치를 3 → 1 로 내렸다.
     *
     * 「상위 글은 2,000~3,000자」는 업계 통설이고, 우리가 잰 것과 어긋난다 —
     * 실측에서 분량의 유리 방향은 음수였고(1위 2,197 · 2위 1,422 · 4위 2,568),
     * 관찰을 모아도 방향이 갈렸다. 근거가 없는 항목이 85점 문턱을 흔들면 안 된다.
     * 관찰이 쌓여 유리하게 나오면 evidence.ts 가 다시 올린다.
     */
    weight: 1,
  })

  const titleOk = title.length >= 28 && title.length <= 40
  add({
    id: 'titleLength',
    group: '분량·구조',
    label: '제목 길이',
    level: level(titleOk, title.length >= 22 && title.length <= 45),
    value: `${title.length}자`,
    target: '28~40자 (모바일 표시 한계 ~35자)',
    hint:
      title.length > 40
        ? '모바일 검색결과에서 뒤가 잘립니다. 핵심을 앞 35자 안에 넣으세요.'
        : title.length < 28
          ? '짧으면 세부 의도를 담을 자리가 없어 스마트블록 진입이 약해집니다.'
          : undefined,
    weight: 2,
  })

  add({
    id: 'headings',
    group: '분량·구조',
    label: '소제목 개수',
    /*
     * **정보글만 5~6개다.** 네이버 「콘텐츠 셀프 체크」 ③(대안·비교)을 넣느라 「고를 때 기준」
     * 구간이 하나 늘었고, 「방법」은 소제목 둘로 나눠도 되므로 6까지 열어 둔다 (2026-08-20).
     *
     * 홍보글은 2026-08-07 에 「해결」을 둘로 쪼개면서 6개가 됐다가, 2026-08-21 에 회원 요청으로
     * 「운동 정보」 구간을 빼면서 다시 5개가 됐다 — 그래서 4~5 로 되돌린다.
     *
     * 골격을 바꿔 놓고 검수 범위를 안 옮기면 골격대로 쓴 글이 검수에 걸린다. 이 저장소에서
     * 두 번 겪은 일이라(2026-08-05 홍보글 분량, 2026-08-20 정보글 소제목) 같이 옮긴다.
     */
    level:
      input.type === 'info'
        ? level(
            parsed.headings.length >= 5 && parsed.headings.length <= 6,
            parsed.headings.length >= 4 && parsed.headings.length <= 7
          )
        : level(
            parsed.headings.length >= 4 && parsed.headings.length <= 5,
            parsed.headings.length >= 3 && parsed.headings.length <= 6
          ),
    value: `${parsed.headings.length}개`,
    target: input.type === 'info' ? '5~6개' : '4~5개',
    hint: '소제목은 스캔 가능성 = 체류시간입니다. `## 소제목` 형식으로 적으세요.',
    weight: 2,
  })

  /*
   * ─── 본문이 없는 소제목 (2026-08-21) ──────────────────────────
   *
   * 회원이 보여준 정보글에 있었다. 「## 자주 나오는 질문 1, 2 — 공복 유산소와 폭식 타이밍」
   * 다음에 이미지 한 장만 오고 바로 「## 정체기 · 공복 유산소, 이렇게 답해드려요」가 왔다.
   * 읽는 사람에게는 그냥 빈 칸이고, 소제목 수만 늘어서 스펙(5~6개)을 넘긴다.
   *
   * 위 `headings` 는 **개수만** 세므로 이걸 못 잡는다 — 오히려 빈 소제목이 개수를 채워서
   * 통과에 가까워진다. 그래서 따로 본다.
   *
   * 이미지·영상만 있는 것도 빈 것으로 본다. 검색이 읽는 것은 글자이고, 사진만 있는 구간은
   * 네이버 「콘텐츠 셀프 체크」 ⑤(멀티미디어 내용을 텍스트로도)와도 정면으로 어긋난다.
   */
  if (parsed.emptyHeadings.length) {
    add({
      id: 'empty-heading',
      group: '분량·구조',
      label: '본문이 없는 소제목',
      // 막지는 않는다 — 붙여넣기 전에 채우면 되는 것이라 즉시수정까지 갈 일은 아니다
      level: 'warn',
      value: parsed.emptyHeadings.map((h) => `「${h.slice(0, 20)}」`).join(' · '),
      target: '소제목마다 본문 한 문단 이상',
      hint: '소제목만 세우고 바로 다음 소제목으로 넘어간 자리입니다. 읽는 사람에게는 빈 칸이고, 소제목 수만 늘어서 개수 기준을 넘기게 됩니다. 그 아래에 문단을 채우거나, 채울 내용이 없으면 **소제목을 지우세요**. 사진만 두는 것도 빈 것으로 봅니다 — 검색은 사진 속 글자를 읽지 못합니다.',
      weight: 2,
    })
  }

  // ─── 키워드 ─────────────────────────────────────────────────
  /*
   * 도달 가능한 범위로 판정한다 (reachableKeywordRange 주석).
   * 「5~7회」와 「밀도 2%」가 부딪히는 조합에서 두 항목이 동시에 걸리던 자리다.
   */
  const reach = reachableKeywordRange({
    keyword: main,
    charCount,
    densityMax: spec.densityMax,
    mainMin: spec.mainMin,
    mainMax: spec.mainMax,
    inTitle: mainInTitle,
  })
  // 겨냥할 값 — 도달 가능한 범위 안으로 눌러 담는다 (긴 키워드면 권장치도 같이 내려간다)
  const mainGoal = Math.min(Math.max(spec.mainTarget ?? reach.min, reach.min), reach.max)
  add({
    /*
     * 가중치를 5 → 4 로 내렸다 (2026-08-06 실측, 219편).
     *
     * 걸리느냐를 가르는 건 제목이었다 (titleKeyword 참고 — 77% vs 23%). 횟수는 제목에
     * 키워드가 **없을 때만** 일했고(0~1회 19% → 2회 41%), 걸린 다음의 순위와는 무관했다 —
     * 키워드 22개 중 12개가 방향 무관, 평균 ρ=-0.09. 1위 22편이 쓴 횟수는 중간값 2회이고
     * 그중 6편은 0회였다.
     *
     * 그래도 하한은 지킨다 — 안 쓰면 안 걸리는 건 사실이다. 다만 제목보다 무겁게 볼
     * 근거가 없다.
     */
    id: 'mainCount',
    group: '키워드',
    label: `메인 키워드 "${main || '(미입력)'}" 노출 횟수`,
    level: level(
      mainKeywordCount >= reach.min && mainKeywordCount <= reach.max,
      mainKeywordCount >= reach.min - 1 && mainKeywordCount <= reach.max + 2
    ),
    value: `${mainKeywordCount}회 (제목 ${mainInTitle} + 본문 ${mainInProse})`,
    target: reach.tight
      ? `${reach.min}~${reach.max}회 · 해시태그 제외 (밀도 ${spec.densityMax}% 상한 때문에 ${spec.mainMax}회는 불가)`
      : `${mainGoal}회 권장 · ${reach.min}~${reach.max}회 허용 · 해시태그는 계산 제외`,
    hint:
      mainKeywordCount < reach.min
        ? `미달이 가장 자주 나는 항목입니다. 억지 문장을 만들지 말고 배치 슬롯(제목·첫100자·해결 구간·이벤트·CTA) 안에서 ${mainGoal}회를 채우세요.`
        : mainKeywordCount > reach.max
          ? '초과분은 "저희 센터", "○○동에 있는 헬스장" 같은 변형 표현으로 돌리세요.'
          : reach.tight
            ? `키워드가 ${main.replace(/\s+/g, '').length}자라 본문에 ${reach.proseCap}회까지만 쓸 수 있습니다 (그 이상이면 밀도가 넘습니다). 회원님이 잘못 쓴 게 아니라 키워드가 길어서 좁아진 것입니다 — 변형 표현으로 채우세요.`
            : undefined,
    weight: 4,
  })

  add({
    id: 'density',
    group: '키워드',
    label: '메인 키워드 밀도',
    level: level(density <= spec.densityMax, density <= spec.densityMax + 0.5),
    value: `${density}%`,
    target: `${spec.densityMax}% 이내 (순위 규칙이 아니라 스터핑 안전선)`,
    hint:
      density > spec.densityMax
        ? `키워드 스터핑으로 읽힙니다. 변형 표현으로 분산하세요 — 이 분량(${charCount.toLocaleString()}자)에서는 본문 ${reach.proseCap}회까지가 상한입니다.`
        : undefined,
    weight: 3,
  })

  const titlePos = main ? title.replace(/\s+/g, '').indexOf(main.replace(/\s+/g, '')) : -1
  add({
    id: 'titleKeyword',
    group: '키워드',
    label: '제목 앞쪽에 메인 키워드',
    level: level(titlePos >= 0 && titlePos <= 6, titlePos >= 0),
    value: titlePos < 0 ? '제목에 없음' : `${titlePos + 1}번째 글자부터`,
    target: '앞 7자 안 — 검수에서 가장 무겁게 보는 항목',
    hint:
      titlePos < 0
        ? '제목에 메인 키워드가 없으면 그 키워드로는 거의 노출되지 않습니다. 실측 219편에서 제목에 있는 글은 77%가 상위 10에 들었고, 없는 글은 23%였습니다.'
        : titlePos > 6
          ? '상위 글은 대부분 앞 6자 안에 키워드가 있었습니다. 앞으로 당기면 같은 글로 더 유리해집니다.'
          : undefined,
    /*
     * **가장 무거운 항목이다** (2026-08-06 실측, 219편·키워드 22개).
     *
     * 「그 키워드로 상위 10에 걸리느냐」를 갈랐다. 분모는 그 지역을 언급한 글로 좁혔다.
     *
     *   제목에 키워드 있음  119편 → 77.3% 진입
     *   제목에 없음        535편 → 22.6% 진입
     *
     * 게다가 **제목에 있으면 본문 횟수가 거의 무관해진다** — 본문 0회도 61.5% 걸렸고,
     * 1회 82.4% · 2회 73.3% · 3~4회 75.0% · 5회 이상 83.3% 로 신뢰구간이 전부 겹친다.
     *
     * 그래서 mainCount(4)보다 무겁게 뒀다. 예전엔 반대였는데(제목 4 / 횟수 5), 점수가
     * 실제로 순위를 만드는 쪽을 가리키지 않았다.
     */
    weight: 5,
  })

  /*
   * 제목 유형.
   *
   * 두 판의 상위 8편 제목을 열어보니 전국 정보 키워드는 6편이 질문형이었고 우리 지역
   * 판은 0편이었다 (lib/analysis/title.ts 주석). 「전국이 그러니 우리도」로 단정하지 않고
   * 관찰 신호(titleQuestion)로도 재고 있으므로, 여기서는 **낮은 비중으로 권하기만** 한다.
   * 후기·추천형도 통과시킨다 — 우리 판 상위권의 기본형이라 틀렸다고 할 근거가 없다.
   */
  const shape = titleShape(title)
  add({
    id: 'titleShape',
    group: '키워드',
    label: '제목 유형',
    level: shape === 'plain' ? 'warn' : 'pass',
    value: TITLE_SHAPE_LABEL[shape],
    target: '질문형·숫자형·후기형 (평서형만 주의)',
    hint: shape === 'question' ? undefined : titleAdvice(title),
    weight: 2,
  })

  /*
   * ─── 제목에 홍보 한 조각이 있는가 ─────────────────────────────
   *
   * 회원이 같은 말을 두 번 했다 — 처음엔 홍보글에 대해("명색이 홍보글인데 글 제목에
   * 홍보성이 하나도 없어"), 이번엔 후기글에 대해("제목에 홍보 관련 내용이 없고").
   *
   * **지시문만으로는 안 붙었다.** 지시문에 넣어 두고 두 번 더 같은 말을 들었으니
   * 검수가 잡아야 한다 — 이 앱에서 이미 배운 것이다 (`event-hook` 도 같은 경로였다:
   * 지시문에는 있었는데 나온 글에 없어서 검사를 만들었다).
   *
   * 근거: 비방문자 84편에서 제목에 혜택·이벤트·할인·가격·오픈이 있는 글 1~3위 36% /
   * 없는 글 29%. **순위로 잃는 것이 없다.** 그러니 상담을 받으려고 쓰는 글이면 제목에서
   * 밝히는 편이 맞다.
   *
   * 정보글은 대상이 아니다 — 그 글에는 홍보를 아예 넣지 않는다(`info-purity`).
   * 「상담·등록·문의」는 홍보로 세지 않는다. 후기글 제목에 거의 다 들어가는 말이라
   * 그걸 인정하면 이 검사가 아무것도 안 잡는다.
   */
  /**
   * 모바일 검색결과가 제목을 자르는 자리 (대략).
   *
   * 제목 길이 항목의 「모바일 표시 한계 ~35자」와 같은 값을 쓴다. 여기서 다른 수를 쓰면
   * 한 화면에서 두 기준이 어긋난 말을 하게 된다.
   */
  const TITLE_MOBILE_CUT = 35
  /**
   * 홍보 조각(특히 금액)이 있으면 좋은 자리.
   *
   * 회원 요청 (2026-08-18): "금액이 중요하니까 금액이 제목에 앞에 위치하면 좋겠어."
   * 실측에서도 금액이 든 제목 7편 중 0~19자에 둔 4편에는 1~3위가 2편 있었고, 20자 뒤에 둔
   * 3편에는 1~3위가 없었다. 7편은 적은 표본이라 **막지는 않고 권한다**.
   */
  const TITLE_PROMO_FRONT = 20
  const TITLE_PROMO =
    /혜택|이벤트|할인|특가|프로모션|가격|비용|얼마|\d[\d,]*\s*(만\s*원|천\s*원|원)|무료|공짜|오픈|개관|마감|선착순|체험|이용권|회원권|\d+\s*개월|첫\s*달/
  if (input.type !== 'info') {
    const hit = TITLE_PROMO.exec(title)
    const titlePromo = hit?.[0]?.trim()
    /*
     * **잘리는 자리에 있으면 있는 게 아니다** (2026-08-18).
     *
     * 회원이 나온 제목을 보여줬다 — 「쌍용동 PT 지금 받아야 하는 이유, 시간 없는 분도 될까요?
     * 45,000원 안내」(45자). 홍보 조각(45,000원)이 **맨 뒤**에 있다. 모바일 검색결과는 35자쯤에서
     * 뒤를 자르므로, 정작 사람이 보는 자리에는 혜택이 없다. 그런데 검사는 「있음」으로 통과했다.
     *
     * 그래서 자리도 본다. 없는 것과 안 보이는 것은 다르지만, 통과시킬 수 없는 것은 같다.
     */
    const promoAt = titlePromo ? title.indexOf(titlePromo) : -1
    const cutOff = promoAt >= 0 && promoAt >= TITLE_MOBILE_CUT
    /** 보이기는 하지만 앞쪽이 아닌 자리 — 막지 않고 권하기만 한다 */
    const late = promoAt >= TITLE_PROMO_FRONT && !cutOff
    const ev = input.eventText?.trim()
    add({
      id: 'titlePromo',
      group: '키워드',
      label: '제목에 홍보 한 조각',
      level: titlePromo ? (cutOff ? 'warn' : 'pass') : 'fail',
      value: titlePromo
        ? cutOff
          ? `있지만 ${promoAt + 1}번째 글자라 모바일에서 잘립니다 (「${titlePromo}」)`
          : late
            ? `있음 — ${promoAt + 1}번째 글자 (「${titlePromo}」 · 앞 ${TITLE_PROMO_FRONT}자 안이 낫습니다)`
            : `있음 — ${promoAt + 1}번째 글자 (「${titlePromo}」)`
        : '없음',
      target: '혜택·가격·이벤트·기간 중 하나를 제목에 넣는다',
      hint: titlePromo
        ? late
          ? `「${titlePromo}」가 ${promoAt + 1}번째 글자에 있습니다. **메인 키워드 바로 뒤(앞 ${TITLE_PROMO_FRONT}자 안)로 당기면** 검색결과에서 먼저 눈에 들어옵니다 — 상위권 제목이 그렇게 씁니다: 「배방 헬스장 월 3만 원 등록 전 꼭 확인하세요」(9번째 글자) · 「아산헬스장 짐플레이스 헬스 12만원부터」(15번째 글자). 실측 표본이 7편뿐이라 막지는 않습니다.`
          : cutOff
          ? `홍보 조각이 제목 뒤쪽(${promoAt + 1}번째 글자)에 있습니다. 모바일 검색결과는 ${TITLE_MOBILE_CUT}자쯤에서 뒤를 자르니, 사람이 보는 자리에는 혜택이 없는 셈입니다 — 「${titlePromo}」를 앞으로 당기거나 제목을 짧게 줄이세요. 요구를 절로 나눠 이어 붙이면(「…이유, …될까요? …원 안내」) 늘 이렇게 됩니다.`
          : undefined
        : (input.type === 'review'
            ? '후기 제목에도 내가 받은 것을 적으세요 — 「쌍용동 헬스장 3개월 9.9만원에 등록한 후기」·「8월 혜택 받고 등록한 후기」처럼 **방문자 말투로** 씁니다. 「지금 신청하세요」 같은 센터 말투는 쓰지 않습니다. '
            : '「3개월 9.9만원」·「8월 혜택」·「신규 오픈」처럼 혜택 한 조각을 제목에 넣으세요. ') +
          (ev
            ? `글 정보의 이벤트 칸에 적으신 내용에서 한 조각만 가져오면 됩니다 — 「${ev.slice(0, 40)}${ev.length > 40 ? '…' : ''}」.`
            : '이벤트 칸이 비어 있으면 **금액 없이 쓸 수 있는 말**로 넣으세요 — 「이용권」·「체험」·「개월」. 없는 금액을 만들 필요는 없습니다. 「가격」·「비용」·「얼마」도 이 검사는 통과하지만 **되도록 피하세요** — 우리 판 상위 1~3위 55편에 그 말을 쓴 제목이 0편이었습니다(4~10위 3%). 다만 「상담 받아본 후기」·「등록한 후기」만으로는 홍보 조각으로 세지 않습니다 — 후기 제목에 거의 다 들어가는 말이라 구별이 되지 않습니다.') +
          ' 실측에서 제목에 홍보성이 있는 글이 불리하지 않았습니다 (있음 1~3위 36% / 없음 29%). 우리 판 상위 165편에서는 「이벤트·할인·혜택」이 1~3위 7% · 4~10위 3% 였습니다 — 금액이나 기간·이벤트 낱말로 넣는 편이 낫습니다. 「최저가·파격가·반값」은 광고심의 위험이라 쓰지 않습니다.',
      /*
       * 가중치 4 (3 → 4, 2026-08-11). 순위를 만드는 항목(제목 키워드 5)보다는 가볍게 두되,
       * 회원이 **세 번** 요청한 자리다. 고쳐 쓰기에 넘기는 목록은 가중치 순으로 자르므로
       * 3 에서는 본문 항목들에 밀려 전달조차 되지 않았다 (라우트의 fixList 도 함께 고쳤다 —
       * 제목 항목은 개수 제한과 따로 센다).
       */
      weight: 4,
    })
  }

  /*
   * ─── 정보글은 순수해야 한다 (2026-08-20, 영상 개편) ────────────────
   *
   * 회원이 영상을 주며 "이 영상을 분석해서 정보성글 다시 개편하자"고 했다
   * (머니코치 최준호, 「열심히 쓴 글이 쓰레기 취급받는 이유」).
   *
   * 영상의 근거는 **네이버 공식 공지**다 — "홍보성 게시물은 …특정 상품이나 서비스를 구매
   * 사용하도록 권하거나 **연락을 유도하는** 등의 활동이 해당됩니다." 즉 순위 이전에 **분류**의
   * 문제다. 영상이 든 금지 목록 여섯 가지를 그대로 검사한다.
   *
   * 우리 실측도 같은 방향이었다 (정보 키워드 5개 + 지역 2개의 1페이지 67편):
   *   정보형 38편 중 **25편(66%)이 홍보 요소가 하나도 없는 순수 정보글**
   *   전화번호  정보형 5% / 그 밖 28%   ·   혜택 낱말  정보형 3% / 그 밖 31%
   *
   * **`fail` 로 막지 않고 `warn` 으로 알린다.** 1페이지에 링크를 달고도 올라온 글이 26%
   * 있었다 — 「링크가 있으면 못 오른다」는 우리 표본으로 증명되지 않는다(1페이지에 있는 글만
   * 봤으니 못 오른 글은 표본에 없다). 확실한 것은 **분류 위험**이고, 그건 알릴 일이지 막을
   * 일이 아니다.
   */
  if (input.type === 'info') {
    const marks: { label: string; re: RegExp }[] = [
      { label: '전화번호', re: /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/ },
      { label: '링크', re: /(https?:\/\/|naver\.me|talk\.naver|booking\.naver|카카오톡\s*채널|카톡\s*채널|오픈채팅|스마트스토어|네이버\s*톡톡)/ },
      { label: '플레이스·위치', re: /(place\.naver|찾아오시는\s*길|오시는\s*길|위치는\s*아래|지도\s*보기)/ },
      { label: '혜택 낱말', re: /(이벤트|무료\s*체험|무료로\s*(?:드|해|받)|견적|추첨|할인|특가|프로모션)/ },
      /*
       * **넓혔다** (2026-08-21). 상호명 1회를 허용하면서 이 구멍이 드러났다 — 「궁금한 점은
       * 상담 때 여쭤보시면 되고, 예약은 전화로 편하게 주세요」가 통과하고 있었다. 상호명이
       * 잡아주던 글이라 안 보였을 뿐, 처음부터 못 잡던 문장이다.
       *
       * 「상담」·「예약」 낱말 자체는 잡지 않는다 — 정보글은 「제가 상담하면서 보면」처럼
       * 현장 근거로 그 말을 쓴다. 잡는 것은 **읽는 사람에게 연락·방문을 권하는 꼴**이다.
       */
      {
        label: '방문·연락 유도',
        re: /(연락|문의|상담|예약)\s*(주세요|주시면|드릴게요|남겨\s*주|받아\s*보세요|신청\s*하세요)|상담\s*(때|받으러|오시면|오세요)|예약\s*(은|을)?\s*(전화|여기|아래|링크)|(전화|문자|카톡|톡)\s*(으?로)?\s*(편하게\s*)?(주세요|주시면|남겨)|방문\s*(주세요|해\s*보세요)|들러\s*주세요|지금\s*방문|하세요\s*$/,
      },
    ]
    const hit: string[] = []
    for (const m of marks) {
      const found = m.re.exec(bodyText)
      if (found) hit.push(`${m.label}(「${found[0].trim().slice(0, 20)}」)`)
    }
    /*
     * **상호명은 1회까지 통과다** (2026-08-21, 회원 요청 "인사말에 업체명 한번을 소개되게").
     * 영상이 말한 것은 「과도한 상호명 반복」이지 한 번 밝히는 것이 아니고, 여섯 가지 중
     * 상호명만 우리가 실측한 적이 없다 (SPECS.info 의 legalNameMin 주석).
     * 2회 이상은 계속 잡는다 — 그때부터가 「반복」이다.
     */
    if (input.legalName && legalNameCount > 1) hit.push(`상호명 ${legalNameCount}회 (1회까지만)`)

    add({
      id: 'info-purity',
      group: '내용 균형',
      label: '정보글 순수성 (업체를 드러내는 것)',
      level: hit.length ? 'warn' : 'pass',
      value: hit.length ? hit.join(' · ') : '없음 — 순수 정보글',
      target: '하나도 넣지 않는다',
      hint: hit.length
        ? '정보글의 목적은 **블로그 지수를 쌓는 것**이고, 전환은 홍보글이 맡습니다. 네이버 공식 공지가 「연락을 유도하는 활동」을 홍보성 게시물로 규정하므로, 위 요소가 들어가면 이 글이 정보글로 안 세어질 수 있습니다. 실측에서도 1페이지 정보형 38편 중 **25편(66%)이 이런 요소가 하나도 없었습니다**(전화번호는 5%뿐). 지우고 정보만 남기세요 — 상호명·전화·링크·위치·이벤트·「상담 주세요」 전부입니다.'
        : undefined,
      /*
       * 가중치 4. 이 글의 성격을 정하는 항목이라 분량·키워드급으로 둔다. 다만 `fail` 이
       * 아니라서 점수를 79로 묶지는 않는다 — 회원이 알고도 넣을 수 있어야 한다.
       */
      weight: 4,
    })
  }

  /*
   * ─── 정보글 제목에 업체 말이 섞였는가 (2026-08-21) ────────────────
   *
   * 회원이 나온 정보글을 보여줬다 — 제목이 「쌍용동 헬스장 PT추천, 다이어트 정체기 폭식
   * 질문 4가지 답변」이었다. 회원: "키워드에 pt는 없는데 제목에 왜 pt가 들어가는지 모르겠고."
   *
   * 원인은 지시문이었다 (거기도 고쳤다 — 「지역 키워드를 1~2회」라고만 하고 어디에 넣으라는
   * 말이 없었다). 다만 **지시문만 고치면 다음에 또 나온다.** 이 앱에서 이미 배운 것이다 —
   * `event-hook` 도 지시문에는 있었는데 나온 글에 없어서 검사를 만들었다.
   *
   * `info-purity` 는 **본문만** 본다. 그런데 제목은 그 글이 무슨 글인지 정하는 자리라,
   * 본문이 아무리 깨끗해도 제목에 업체 말이 있으면 업체 글로 읽힌다. 그래서 따로 본다.
   *
   * 지역명은 본문에서는 통과다 (조연으로 1~2회, `localKeyword`). **제목에서만** 잡는다 —
   * 제목 맨 앞은 정보 메인 키워드 자리이고, 지역은 해시태그가 맡는다.
   *
   * `warn` 까지만 한다. 순위 근거가 아니라 분류·형태 문제이고, 회원이 알고도 넣을 수 있어야
   * 한다 (`info-purity` 와 같은 무게로 둔다).
   */
  if (input.type === 'info') {
    const hits: string[] = []
    /*
     * 주어진 키워드에 든 말은 어느 것도 잡지 않는다. 회원이 정한 키워드를 못 쓰게 막으면
     * 검사가 아니라 방해다.
     */
    const kw = [input.mainKeyword, ...(input.subKeywords ?? [])].filter(Boolean).join(' ')
    /*
     * **지역 키워드를 메인으로 잡는 정보글이 있다** (2026-08-21 확인). 회원이 실제로 그렇게
     * 쓰고 계신다 — 「천안 헬스장 다이어트 폭식 왜 반복될까?」·「쌍용동 24시헬스장 생리 중
     * 운동법」. 지역 키워드 1페이지 170편이 **전부** 제목에 그 지역 키워드를 달고 있으니,
     * 그 자리를 노리는 글이라면 제목에 있는 게 맞다.
     *
     * 그래서 **키워드로 지정된 지역명은 잡지 않는다.** 잡는 것은 메인이 정보 키워드인데
     * 지역명이 그 앞에 얹혀 메인을 뒤로 미는 경우다 — 회원이 물린 「쌍용동 헬스장 PT추천,
     * 다이어트 정체기 …」가 그 모양이었다.
     */
    const localIsKeyword = Boolean(input.localKeyword) && countLoose(kw, input.localKeyword!) > 0
    if (input.localKeyword && !localIsKeyword && countLoose(title, input.localKeyword) > 0) {
      hits.push(`지역 키워드「${input.localKeyword}」`)
    }
    if (input.legalName && countLoose(title, input.legalName) > 0) hits.push(`상호명「${input.legalName}」`)
    /*
     * 주어진 키워드에 없는데 제목에 붙는 업체·홍보 낱말들. 「PT추천」이 회원이 물린 그 말이다.
     * 키워드 자체에 들어 있으면 잡지 않는다 — 「PT」가 메인 키워드인 글도 있다.
     */
    const EXTRAS = /PT\s*추천|피티\s*추천|헬스장\s*추천|센터\s*추천|업체\s*추천|문의|상담|예약|이벤트|할인|특가|무료|혜택|마감|선착순/gi
    for (const m of new Set(title.match(EXTRAS) ?? [])) {
      if (!countLoose(kw, m)) hits.push(`「${m.trim()}」`)
    }
    add({
      id: 'info-title-purity',
      group: '내용 균형',
      label: '정보글 제목 (업체 말이 섞였나)',
      level: hits.length ? 'warn' : 'pass',
      value: hits.length ? hits.join(' · ') : '없음 — 정보 키워드로만',
      target: '정보 메인 키워드로 연다 (지역·상호명·홍보 낱말 없이)',
      hint: hits.length
        ? '제목은 이 글이 무슨 글인지 정하는 자리라, 본문을 아무리 깨끗하게 써도 제목에 업체 말이 있으면 업체 글로 읽힙니다. **제목 맨 앞은 정보 메인 키워드 자리**이고 지역은 해시태그가 맡습니다. 나쁜 예) 「쌍용동 헬스장 PT추천, 다이어트 정체기 폭식 질문 4가지 답변」 → 좋은 예) 「다이어트 정체기 폭식, 자주 받는 질문 4가지 답변」. 앞의 군더더기를 걷어내면 정보 키워드가 앞 7자 안으로 돌아옵니다.'
        : undefined,
      // `info-purity`(4)와 같은 무게 — 이 글의 성격을 정하는 자리다
      weight: 4,
    })
  }

  /*
   * ─── 경쟁 센 자리에서는 제목에 상호명 (2026-08-20) ────────────────
   *
   * 회원 질문: "경쟁 높은 키워드용 글쓰기 도구가 있는거야?" 없었다 — 잰 값이 검수에 연결돼
   * 있지 않았다.
   *
   * 지역 헬스·PT 키워드 5개 × 1페이지 10편 = 50편에서 **37편(74%)이 제목에 상호명**을 썼다.
   * 우리 글은 없었고 8일간 59위에 멈춰 있었다.
   *
   * **그러나 `warn` 까지만 한다.** 2026-08-06 실측(161편)에서 상호명 유무로 1페이지 안의
   * 순위 차이는 없었다(있음 5.33위 / 없음 5.38위). 이건 순위를 만드는 규칙이 아니라 **이 판에
   * 있는 글의 형태**이고, 형태를 근거로 점수를 크게 깎으면 없는 인과를 만드는 셈이다.
   *
   * 경쟁이 세지 않으면 이 항목을 아예 만들지 않는다 — 경쟁 적은 자리는 그냥 써도 올라갔다.
   */
  if (input.arena === 'high' && (input.type === 'promo' || input.type === 'review')) {
    const hasBrand = titleHasBrand(title, input.legalName, undefined)
    add({
      id: 'title-brand',
      group: '키워드',
      label: '제목에 상호명 (경쟁 센 자리)',
      level: hasBrand ? 'pass' : 'warn',
      value: hasBrand ? '있음' : '없음',
      target: '경쟁 센 자리에서는 넣는다 (상위 50편 중 37편 · 74%)',
      hint: hasBrand
        ? undefined
        : `이 키워드는 경쟁이 센 자리입니다. 상위 50편 중 **37편(74%)이 제목에 업체 이름**을 썼습니다 — 「천안 쌍용동 헬스장 미녀와야수짐 ! 샤워실 개인 부스에…」처럼요. ${
            input.legalName ? `「${input.legalName}」을 메인 키워드 바로 뒤에 넣으세요. ` : ''
          }**순위를 만든다는 근거는 없습니다**(1페이지 안에서는 차이가 없었습니다). 다만 이 판에 있는 글은 그 모양이고, 우리 글은 그 형태가 아닌 채로 8일간 59위에 멈춰 있었습니다.`,
      /*
       * 가중치 2. 형태이지 순위 근거가 아니라서 가볍게 둔다 — 상호명 본문 항목(legalName,
       * 가중치 2)과 같은 무게다.
       */
      weight: 2,
    })
  }

  /*
   * ─── 요청한 내용이 글에 들어갔는가 ───────────────────────────────
   *
   * 회원이 요청과 결과를 나란히 보여줬다 (2026-08-19): "요청사항이 거의 반영되지 않았어."
   *
   *   요청: 24시 빼기 + 지금 등록해야 하는 이유 · 추천하는 사람들 · 망설이는 점(효과·가격·
   *         트레이너) 해결
   *   결과: 24시는 빠졌지만, 본문은 「다이어트 첫 달 5가지」·「이런 환경에서 진행됩니다」·
   *         「자세와 시설 관리」로 채워졌다. 요청한 세 항목 중 둘이 아예 없었다.
   *
   * 원인은 앱이 요청을 **거르는 말**로만 읽은 것이다. 「빼달라」는 지켰고 「써달라」는 고정
   * 골격에 밀렸다. 지시문에도 적었지만, 지시문만으로는 안 붙는다는 것을 이 앱에서 이미
   * 배웠다 (titlePromo·event-hook 둘 다 그랬다). 그래서 검수가 확인한다.
   *
   * **느슨하게 판정한다.** 항목의 낱말 절반 이상이 글에 있으면 들어간 것으로 본다 — 글자
   * 그대로 베끼라는 뜻이 아니기 때문이다. 그래도 빠진 것이 절반을 넘으면 즉시수정이다.
   */
  const askedTopics = requestedTopics(input.request)
  if (askedTopics.length) {
    const cov = coverageOf(askedTopics, `${title}\n${prose}`)
    const half = cov.missing.length > askedTopics.length / 2
    add({
      id: 'request-coverage',
      group: '분량·구조',
      label: '요청한 내용 반영',
      level: cov.missing.length === 0 ? 'pass' : half ? 'fail' : 'warn',
      value:
        cov.missing.length === 0
          ? `${askedTopics.length}개 항목 모두 들어감`
          : `${cov.covered.length}/${askedTopics.length}개 (${cov.rate}%) — 빠짐: ${cov.missing
              .map((m) => `「${m.text}」`)
              .join(' · ')}`,
      target: '요청한 항목을 모두 다룹니다',
      hint:
        cov.missing.length === 0
          ? undefined
          : `요청하신 ${cov.missing.map((m) => `「${m.text}」`).join(' · ')} 가 글에 없습니다. **이 항목들이 본문 소제목이 되어야 합니다** — 골격의 기본 구간(운동 정보·시설 소개 같은 것)은 요청이 있으면 그 요청으로 바꿉니다. 자리가 부족하면 요청과 무관한 구간을 빼세요.`,
      /*
       * 가중치 5. 요청을 안 지킨 글은 다른 항목이 다 맞아도 회원이 쓸 수 없는 글이다 —
       * 화자(5)와 같은 무게로 둔다. 고쳐 쓰기 목록에서도 앞에 실려야 한다.
       */
      weight: 5,
    })
  }

  const first100 = parsed.intro.replace(/\s+/g, '').slice(0, 100)
  const inFirst100 = main ? first100.includes(main.replace(/\s+/g, '')) : false
  add({
    id: 'first100',
    group: '키워드',
    label: '첫 문단 100자 이내 메인 키워드',
    level: inFirst100 ? 'pass' : 'fail',
    value: inFirst100 ? '포함' : '없음',
    target: '필수 1회',
    hint: inFirst100 ? undefined : '도입부에서 화자를 밝히며("안녕하세요, ○○점입니다") 자연스럽게 넣으세요.',
    weight: 3,
  })

  add({
    id: 'spacing',
    group: '키워드',
    label: '키워드 배치 패턴',
    level: evenSpacing ? 'warn' : 'pass',
    value: evenSpacing ? '등간격 의심' : '자연스러움',
    target: '등간격 금지',
    hint: evenSpacing
      ? 'D.I.A.+는 횟수보다 패턴을 봅니다. 한 구간(공감 단계)은 키워드 없이 비워 규칙성을 깨세요.'
      : undefined,
    weight: 2,
  })

  /*
   * 함께 쓰는 키워드 — **0회를 「수정필요」로 걸지 않는다.**
   *
   * 실측(2026-08-05, 상위 32편)에서 상위 3위권 12편 중 **6편이 「○○동 PT」를 0회**
   * 썼다. 「천안 헬스장」도 대부분 0회였다. 즉 상위권은 함께 쓰는 키워드를 거의 쓰지
   * 않는다 — 그런데 검수는 이걸 수정필요로 걸어 점수 상한까지 내리고 있었다.
   *
   * 넣으면 그 키워드로도 걸릴 가능성이 생기니 권하기는 한다. 다만 **없다고 틀린 건
   * 아니다** — 그래서 최대 「주의」까지만 낸다.
   */
  subKeywordCounts.forEach((s, idx) => {
    add({
      id: `sub${idx}`,
      group: '키워드',
      label: `${input.type === 'info' ? '보조' : '함께 찾는'} 키워드 ${idx + 1} "${s.keyword}"`,
      /*
       * 목표(2회)를 맞히면 통과, 아니면 **최대 「주의」까지만** 낸다.
       * 못 채운 글을 수정필요로 걸면 1위와 똑같이 쓴 글이 감점된다 (Spec.subTarget 주석).
       */
      level: spec.subTarget
        ? s.count === spec.subTarget
          ? 'pass'
          : 'warn'
        : s.count >= 1 && s.count <= 2
          ? 'pass'
          : 'warn',
      value: `${s.count}회`,
      target: spec.subTarget
        ? `${spec.subTarget}회 (못 채워도 수정필요는 아닙니다)`
        : '1~2회 (없어도 됩니다 — 상위 3위권 12편 중 6편이 0회)',
      hint:
        spec.subTarget && s.count < spec.subTarget
          ? s.count === 0
            ? `목표는 ${spec.subTarget}회입니다. 넣으면 이 키워드로도 걸릴 수 있습니다 — 다만 실측에서 상위 3위권 절반은 0회였으니 억지 문장을 만들지는 마세요.`
            : `${spec.subTarget - s.count}회 더 넣을 수 있습니다. 해결 구간이나 이벤트 문단에 자연스럽게 얹으세요.`
          : s.count > (spec.subTarget ?? 2)
            ? '메인 키워드 자리를 잡아먹습니다. 2회까지로 줄이세요.'
            : undefined,
      weight: 2,
    })
  })

  if (spec.legalNameMin > 0) {
    add({
      id: 'legalName',
      group: '키워드',
      label: `정식 상호명 "${input.legalName || '(미설정)'}"`,
      level: level(legalNameCount >= spec.legalNameMin, legalNameCount >= spec.legalNameMin - 1),
      value: `${legalNameCount}회`,
      target: `${spec.legalNameMin}회 이상 — 순위 항목이 아니라 독자가 찾아올 수 있게 하는 항목`,
      hint:
        legalNameCount < spec.legalNameMin
          ? '상호를 모르면 독자가 검색도 방문도 못 합니다. 순위와는 무관한 항목이니 억지로 늘리지는 마세요.'
          : undefined,
      /*
       * **순위 근거가 없다** (2026-08-06 실측, 161편). 가중치를 4 → 2 로 내렸다.
       *
       * 「플레이스 재검색 유입에 좋다」가 원래 근거였는데 유입은 우리가 볼 수 없다.
       * 볼 수 있는 순위로는 이렇게 나왔다.
       *
       *   상호명 있는 글 129편 → 평균순위 5.33 · 1~3위 32.6%
       *   상호명 없는 글  32편 → 평균순위 5.38 · 1~3위 31.3%
       *
       * 차이가 없다. 횟수별로도 단조롭지 않았다 (0회 5.38 · 1~2회 6.75 · 3~4회 4.35 ·
       * 5~7회 5.87 · 8회 이상 5.07) — 신뢰구간이 전부 겹친다.
       *
       * 그래도 **하한 3회는 남긴다.** 상위 1~3위 글이 실제로 쓰는 횟수는 중간값 10회
       * (하위 25%가 6회)라서, 3회는 홍보글이면 자연히 넘는 최소선이다. 제약이 아니라
       * 「상호를 안 밝히고 끝내지 마라」는 뜻이다.
       *
       * 덧붙여 **상호명은 밀도 규칙의 대상이 아니다.** 20회·밀도 7.7% 로 쓴 글이 3위,
       * 20회·5.5% 가 1위였다. 네이버가 상호명 반복을 스터핑으로 보지 않는다.
       */
      weight: 2,
    })

  }

  /*
   * ─── 상호명을 줄여 쓰지 않았는가 ─────────────────────────────
   *
   * 회원 요청 (2026-08-11): "센터를 단순 지역명 + 「점」이 아니라 제대로 상호명이 들어갈
   * 수 있게 해줘." 나온 글이 「두정점입니다」·「두정점에서는」으로 도배돼 있었다.
   *
   * **`legalNameMin` 조건 밖에 둔다** (2026-08-11 두 번째 판). 처음엔 상호명 횟수 검사
   * 안에 넣었는데 후기글은 `legalNameMin: 0` 이라(방문객이 상호를 반복하면 광고 티가
   * 난다는 이유 — 그건 그대로 맞다) **검사가 아예 안 돌았다.** 회원이 지적한 글이 바로
   * 후기글이었다. 「몇 번 쓰라」와 「줄여 쓰지 마라」는 다른 규칙이다.
   *
   * 판정 방법: 정식 상호명의 **마지막 낱말**이 줄여 쓴 꼴이다 (「MTO 피트니스 두정점」 →
   * 「두정점」). 그 낱말이 **혼자** 쓰인 자리를 센다.
   *
   * **브랜드가 남은 축약은 세지 않는다.** 「여성전용 착한헬스 두정점」을 「착한헬스 두정점」
   * 으로 줄이는 것은 스킬(stores.md)이 일부러 허용한 형태다 — 방문객이 정식 명칭을 세 번
   * 다 읊으면 광고 티가 가장 크게 난다. 막아야 하는 것은 **브랜드가 사라진** 「두정점」이다.
   */
  const full = (input.legalName ?? '').trim()
  const nameParts = full.split(/\s+/).filter(Boolean)
  const shortForm = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : ''
  if (shortForm.length >= 2) {
    /*
     * **바로 앞에 붙어 있어야** 브랜드가 남은 형태다.
     *
     * 처음엔 앞쪽 12자 안에 브랜드 낱말이 있으면 통과시켰는데, 그러면 앞 문장의 정식
     * 상호명에 묻혀서 놓친다 — 「…MTO 피트니스 두정점입니다. 두정점에서는…」의 두 번째
     * 「두정점」이 통과됐다. 창을 두지 않고 **바로 앞이 브랜드 낱말인지**만 본다.
     */
    const brandWords = nameParts.slice(0, -1).filter((w) => w.length >= 2)
    const flat = scanText.replace(/\s+/g, '')
    const flatShort = shortForm.replace(/\s+/g, '')
    const flatBrands = brandWords.map((w) => w.replace(/\s+/g, ''))
    let alone = 0
    for (let at = flat.indexOf(flatShort); at !== -1; at = flat.indexOf(flatShort, at + flatShort.length)) {
      const kept = flatBrands.some((b) => at >= b.length && flat.slice(at - b.length, at) === b)
      if (!kept) alone += 1
    }
    const level: CheckLevel = alone === 0 ? 'pass' : alone > legalNameCount ? 'fail' : 'warn'
    add({
      id: 'legalNameShort',
      group: '키워드',
      label: '상호명을 줄여 쓰지 않았는가',
      level,
      value:
        alone === 0
          ? `줄임말 없음 (정식 상호명 ${legalNameCount}회)`
          : `「${shortForm}」만 쓴 자리 ${alone}곳 (정식 상호명 ${legalNameCount}회)`,
      target: `「${full}」 또는 브랜드가 남은 축약 — 「${shortForm}」만으로 줄여 쓰지 않는다`,
      hint:
        level === 'pass'
          ? undefined
          : `「${shortForm}」만 쓰면 독자가 **어느 브랜드인지 모릅니다** — 검색해도 우리 가게가 안 나오고, 그 이름은 이 동네 다른 업종도 씁니다. 「${full}」으로 바꾸거나, 브랜드가 남는 축약(「${brandWords.slice(-1)[0] ?? ''} ${shortForm}」)까지는 괜찮습니다. 문장이 길어지는 게 부담이면 「저희」·「여기」로 받으세요 — 줄인 상호명보다 그게 낫습니다.`,
      /*
       * 가중치 3. 순위 근거는 없다 (`legalName` 주석의 161편 실측). 「독자가 찾아올 수
       * 있게」에 걸린 항목이라 상호명 횟수(2)보다는 무겁게 뒀다.
       */
      weight: 3,
    })
  }

  if (spec.requireLocalKeyword) {
    add({
      id: 'localKeyword',
      group: '키워드',
      label: `지역 키워드 "${input.localKeyword || '(미설정)'}"`,
      level: level(localKeywordCount >= 1 && localKeywordCount <= 2, localKeywordCount <= 3),
      value: `${localKeywordCount}회`,
      target: '본문 1~2회 + 해시태그',
      hint:
        localKeywordCount > 2
          ? '정보글에서 지역 키워드는 조연입니다. 정보 흐름을 끊으면 빼고 해시태그로만 처리하세요.'
          : localKeywordCount === 0
            ? '도입부 화자 소개 1회, 마지막 소프트 브릿지 1회가 자연스러운 자리입니다.'
            : undefined,
      weight: 3,
    })
  }

  if (spec.requireReviewWord) {
    const hasReview = title.includes('후기')
    add({
      id: 'reviewWord',
      group: '키워드',
      label: '제목에 "후기" 명시',
      level: hasReview ? 'pass' : 'warn',
      value: hasReview ? '포함' : '없음',
      target: '포함 권장',
      hint: hasReview ? undefined : '스마트블록 후기 블록 진입에 "후기"라는 단어 자체가 세부 의도로 작동합니다.',
      weight: 2,
    })
  }

  // ─── 이미지·태그 ─────────────────────────────────────────────
  /*
   * ─── 사진에만 있고 글에는 없는 내용 (2026-08-20) ────────────────
   *
   * 네이버 「콘텐츠 셀프 체크」 다섯 번째 항목을 그대로 검사한다 — 「멀티미디어로 전달한
   * 내용을 텍스트로도 함께 제공하였나요」. AI 브리핑 인용에도 같은 조건이 붙는다.
   *
   * `warn` 까지만 한다. 설명은 「무엇을 찍을지」 적는 자리라 본문과 말이 겹치지 않는 것이
   * 정상인 경우가 있다 (「대표 이미지」·「전경」). 순위 근거로 잰 적은 없고, 네이버가 권한 것이다.
   */
  {
    const orphan = imagesOnlyInCaption(parsed.images, prose)
    if (parsed.images.length > 0) {
      add({
        id: 'image-text',
        group: '이미지·태그',
        label: '사진 내용이 본문에도 있나',
        level: orphan.length >= 3 ? 'warn' : 'pass',
        value: orphan.length ? `${orphan.length}장이 본문에 없음 — 「${orphan[0].slice(0, 20)}」` : '전부 본문에도 있음',
        target: '사진으로 전한 내용은 글로도 쓴다',
        hint: orphan.length
          ? '네이버가 낸 콘텐츠 셀프 체크 다섯 번째 항목입니다 — 「멀티미디어로 전달한 내용을 텍스트로도 함께 제공하였나요」. AI 브리핑 인용 조건에도 같은 말이 있습니다. 사진에만 있는 내용은 검색이 읽지 못합니다. 그 사진이 무엇을 보여주는지 본문 문장에 한 번 써주세요.'
          : undefined,
        weight: 1,
      })
    }
  }

  add({
    id: 'images',
    group: '이미지·태그',
    label: '이미지 개수',
    level: level(
      parsed.images.length >= 5 && parsed.images.length <= 10,
      parsed.images.length >= 4 && parsed.images.length <= 12
    ),
    value: `${parsed.images.length}장`,
    target: '5~10장 (직접 촬영 원본 · 개수는 근거 약함)',
    hint: '`[이미지: 설명]` 형식으로 적으면 자동으로 셉니다. 실측에서 이미지 **개수**와 순위의 관계는 0.00 이었습니다 — 장수를 늘리는 것보다 직접 찍은 사진인지가 중요합니다 (재사용 이미지는 중복 판정 위험).',
    /*
     * 가중치를 3 → 1 로 내렸다.
     *
     * 실측 상관이 0.00 이다 — 관찰한 신호 중 가장 확실하게 「무관」으로 나온 항목이다.
     * 사진이 필요 없다는 뜻이 아니라 **개수가 순위를 만들지 않는다**는 뜻이고,
     * 검수는 개수밖에 셀 수 없으므로 그만큼만 점수에 반영한다.
     */
    weight: 1,
  })

  /*
   * 영상 1개.
   *
   * 관찰 6회에서 유리 2 · 거꾸로 0 — 방향은 한 번도 뒤집히지 않았지만 세지도 않다.
   * 그래서 없으면 「주의」까지만 낸다 (수정필요 아님). 촬영은 실제 부담이고, 근거가
   * 이 정도인 항목이 발행을 막으면 안 된다. 관찰이 더 쌓이면 evidence.ts 가 비중을 올린다.
   */
  add({
    id: 'video',
    group: '이미지·태그',
    label: '짧은 영상',
    level: parsed.videos.length >= 1 ? 'pass' : 'warn',
    value: parsed.videos.length ? `${parsed.videos.length}개` : '없음',
    target: '1개 (10~20초)',
    hint: parsed.videos.length
      ? undefined
      : '`[영상: 무엇을 찍을지]` 한 줄로 자리를 표시하세요. 편집 없이 세로로 찍은 10~20초면 됩니다 — 홍보글은 동작 시범, 후기글은 시설을 훑는 시선.',
    weight: 2,
  })

  if (parsed.headings.length) {
    const ratio = parsed.headingsWithImageAbove / parsed.headings.length
    add({
      id: 'imagePlacement',
      group: '이미지·태그',
      label: '소제목 바로 위 이미지 배치',
      level: level(ratio >= 0.99, ratio >= 0.6),
      value: `${parsed.headingsWithImageAbove}/${parsed.headings.length}개`,
      target: '모든 소제목 위 1장',
      hint: ratio < 0.99 ? '`[이미지: 설명]` → 줄바꿈 → `## 소제목` → 본문 순서로 배치하세요.' : undefined,
      weight: 2,
    })
  }

  add({
    id: 'tags',
    group: '이미지·태그',
    label: '해시태그 개수',
    level: level(input.tags.length >= 8 && input.tags.length <= 12, input.tags.length >= 6 && input.tags.length <= 15),
    value: `${input.tags.length}개`,
    target: '8~12개',
    weight: 2,
  })

  const flatTags = input.tags.map((t) => t.replace(/^#/, '').replace(/\s+/g, ''))
  const tagHasMain = main ? flatTags.includes(main.replace(/\s+/g, '')) : false
  const missingSubTags = subs.filter((s) => !flatTags.includes(s.replace(/\s+/g, '')))
  add({
    id: 'tagContents',
    group: '이미지·태그',
    label: '해시태그 필수 구성',
    level: tagHasMain && missingSubTags.length === 0 ? 'pass' : tagHasMain ? 'warn' : 'fail',
    value: tagHasMain
      ? missingSubTags.length
        ? `보조 키워드 누락: ${missingSubTags.join(', ')}`
        : '메인 + 보조 모두 포함'
      : '메인 키워드 누락',
    target: '메인 키워드 + 보조 키워드 2개 필수',
    weight: 2,
  })

  if (input.type === 'info' && input.localKeyword) {
    const has = flatTags.includes(input.localKeyword.replace(/\s+/g, ''))
    add({
      id: 'tagLocal',
      group: '이미지·태그',
      label: '해시태그에 지역 키워드',
      level: has ? 'pass' : 'warn',
      value: has ? '포함' : '없음',
      target: '포함 (정보글의 지역 신호는 여기서 확보)',
      weight: 2,
    })
  }

  if (input.type === 'review') {
    if (input.sponsorship === 'sponsored') {
      const DISCLOSE = /협찬|무료로\s*제공|지원받아|대가를\s*받|제공받아/
      const inTags = flatTags.some((t) => /협찬|광고|체험단|제공받/.test(t))
      const at = prose.search(DISCLOSE)
      const inBody = at >= 0
      /*
       * **위치까지 본다** (2026-08-11). 회원 요청: "협찬 문구는 제일 하단에 표시될 수
       * 있도록 해줘." 전에는 지시문이 「첫 화면에 표기」였고 검사는 위치를 아예 안 봤다.
       *
       * 법적으로도 문제가 없다 — 공정위 「추천·보증 심사지침」은 표시문구를 **게시물의
       * 처음 또는 끝**에 두게 하고, 숨기지만 않으면 끝도 허용한다. 다만 「끝」은 정말 끝이어야
       * 한다: 마지막 구간 안에 있어야 하고, 더보기로 접히거나 댓글로 밀려나면 안 된다.
       */
      /*
       * 「맨 아래」의 폭 — 마지막 25%, 다만 최소 200자는 준다. 비율만 쓰면 짧은 글에서
       * 자리가 몇 글자로 줄어 판정이 흔들린다.
       */
      const tailWindow = Math.max(200, Math.floor(prose.length * 0.25))
      const atTail = inBody && at >= prose.length - tailWindow
      /*
       * 태그에만 있는 것을 통과로 두면 안 된다 — 「본문에도 밝히세요」라고 조언까지 하면서
       * 통과를 주면 회원은 고칠 이유가 없다. 조언하는 상태는 통과가 아니다.
       */
      const level: CheckLevel = !inBody && !inTags ? 'fail' : atTail ? 'pass' : 'warn'
      add({
        id: 'sponsorship',
        group: '이미지·태그',
        label: '대가성(협찬) 표기 — 맨 아래',
        level,
        value: !inBody && !inTags ? '표기 없음' : atTail ? '맨 아래에 표기됨' : inBody ? '표기는 있으나 위쪽에 있음' : '태그에만 표기됨',
        target: '본문 **맨 마지막 구간**에 명시 + 해시태그 #협찬후기',
        hint:
          level === 'pass'
            ? undefined
            : !inBody && !inTags
              ? '대가를 받은 후기에서 표기 누락은 표시광고법 위반입니다. 본문 맨 마지막에 「이 글은 ○○에서 제공받아 작성했습니다」 한 줄을 넣고, 해시태그에도 #협찬후기 를 넣으세요.'
              : !inBody
                ? '해시태그에만 있습니다. 본문 맨 마지막에도 한 줄로 밝히세요 — 태그만으로는 표기로 인정되지 않을 수 있습니다.'
                : '표기가 글 위쪽에 있습니다. 맨 마지막 구간으로 내리세요 — 공정위 지침은 「게시물의 처음 또는 끝」을 허용하므로 끝도 괜찮습니다. 다만 **정말 끝**이어야 합니다: 더보기로 접히는 자리나 댓글에 쓰면 표기로 인정되지 않습니다.',
        weight: 5,
      })
    } else if (input.sponsorship === 'unset') {
      add({
        id: 'sponsorship',
        group: '이미지·태그',
        label: '대가성(협찬) 여부',
        level: 'warn',
        value: '미지정',
        target: '내돈내산 / 협찬 중 선택',
        hint: '협찬이면 표기가 법적 의무입니다. 글 정보에서 먼저 지정하세요.',
        weight: 3,
      })
    }
  }

  /*
   * ─── 내용 균형 ───────────────────────────────────────────────
   *
   * 141편 재측정으로 두 항목의 무게가 뒤바뀌었다 (content.ts 주석).
   *   정보 종류: 3~4종류 1~3위 17% / 5종류 이상 40~43%  ← 이 앱에서 가장 센 신호 중 하나
   *   홍보 종류: 1~2 36% · 3 32% · 4 19% · 5 47% · 6 43% · 7 이상 14%  ← 7 전까지 무의미
   * 그래서 정보는 4→5, 홍보는 3→2 로 가중치를 옮겼다. 항목을 묶지 않는 이유는 그대로다 —
   * 고치는 방향이 반대(더하기 / 합치기)이기 때문이다.
   */
  const balance = contentBalance(scanText, input.type)
  const infoMin = INFO_MIN_BY_TYPE[input.type]
  const promoMax = PROMO_MAX_BY_TYPE[input.type]
  add({
    id: 'info-substance',
    group: '내용 균형',
    label: input.type === 'review' ? '가서 알게 된 것' : '읽는 사람이 가져갈 정보',
    level: level(balance.signals.info >= infoMin, balance.signals.info >= infoMin - 1),
    value: `${balance.signals.info}종류`,
    /*
     * 하한이 유형마다 다르다 (INFO_MIN_BY_TYPE 주석).
     * 후기에 정보를 욱여넣으면 업체가 쓴 글이 되고, 실측에도 그럴 근거가 없다 —
     * 경험 요소는 순위와 무관했고(-0.13) 4위 이하가 오히려 더 많았다.
     */
    target:
      input.type === 'review'
        ? `${infoMin}종류면 충분 (후기는 순위보다 신뢰를 만드는 글)`
        : `${infoMin}종류 이상 (3~4종류 1~3위 17% / 5종류 이상 40~43%)`,
    hint: balance.level === 'thin' || balance.level === 'both' ? balance.infoNote : undefined,
    weight: 5,
  })
  /*
   * ─── 상담 유도 (이 앱에서 찾은 가장 센 신호) ────────────────
   *
   * 「상담·예약·문의」 등장 **횟수**가 순위를 갈랐다 (content.ts 의 CTA_WORDS 주석):
   *   0~1회 1~3위 14% (평균 6.45위) / 6회 이상 60% (3.30위) · 세 표본에서 방향 재현
   *
   * **정확한 선은 표본 오차 안이다** (2026-08-10, 런 3회 중간값으로 다시 재고 → 구간 겹침).
   * 가장 큰 계단은 0회 → 1회다 (17% → 39%). 그래서 6 은 목표이고, 5회가 위험한 게 아니다 —
   * 절반(3회) 미만만 수정필요로 잡는다.
   *
   * 바로 위의 「홍보 표현 절제」와 모순이 아니다 — 그건 **종류 수**(할인·특가·선착순…)이고
   * 이건 **횟수**다. 종류를 늘리는 것은 전단지가 되고, 상담을 여러 번 권하는 것은 「오시라」는
   * 말이다. 회원이 말한 이 글의 목적과도 같은 방향이다.
   */
  const cta = countCta(scanText)
  const ctaMin = CTA_MIN_BY_TYPE[input.type]
  /*
   * **정보글에는 이 항목을 만들지 않는다** (2026-08-21). 하한이 0 이라 늘 통과이기도 하지만,
   * 그보다 이 항목이 정보글에 대고 하는 말이 `info-purity` 와 반대다 — 한쪽은 「상담 안내를
   * 지우세요」, 한쪽은 「2회는 넘기세요」. 정보글의 다음 행동은 상담이 아니라 「오늘 이것부터」다
   * (content.ts 의 CTA_MIN_BY_TYPE 주석).
   */
  if (ctaMin > 0)
  add({
    id: 'cta-invite',
    group: '내용 균형',
    label: '상담 유도 횟수',
    level: level(cta.count >= ctaMin, cta.count >= Math.ceil(ctaMin / 2)),
    value: `${cta.count}회${
      Object.keys(cta.found).length
        ? ` (${Object.entries(cta.found).map(([w, n]) => `${w} ${n}`).join(' · ')})`
        : ''
    }`,
    target:
      input.type === 'promo'
        ? `${ctaMin}회 이상 (6회 이상 1~3위 45~60% / 0~1회 14~17% · 정확한 선은 표본 오차 안)`
        : `${ctaMin}회 이상 (이 유형은 순위보다 글의 목적을 우선합니다)`,
    hint:
      cta.count < ctaMin
        ? input.type === 'promo'
          ? `실측에서 방향이 가장 일관됐던 항목입니다 — 「상담·예약·문의」를 6회 이상 쓴 글이 1~3위 45~60%였고, 0~1회인 글은 14~17%였습니다 (세 표본 모두 같은 방향). 가장 큰 차이는 0회와 1회 사이입니다. 마지막 단락에 몰아넣으라는 뜻이 아닙니다: 이벤트 단락에 「상담 때 조건 안내드릴게요」, 시설 단락에 「예약하고 오시면 대기 없이 보실 수 있어요」처럼 각 단락의 끝에 자연스럽게 한 번씩 얹으세요.`
          : `${ctaMin}회는 넘기세요 — 읽는 사람이 다음에 무엇을 하면 되는지 모릅니다.`
        : undefined,
    /*
     * 가중치 4. 구간이 갈린 신호가 이 앱에 몇 개 없다 (제목 키워드 · 정보 종류 · 이것).
     * 다만 후기글·정보글에서는 하한 자체가 낮아 사실상 통과한다.
     */
    weight: 4,
  })

  add({
    id: 'promo-restraint',
    group: '내용 균형',
    label: '홍보 표현 절제',
    /*
     * 상한을 넘긴 정도로 등급을 나눈다. 다만 이 상한은 **순위 근거가 없다** — 두 번 재는
     * 동안 홍보 종류 수는 순위를 가르지 않았고, 7종류 이상 칸은 14% → 44% 로 뒤집혔다
     * (각각 7편·9편). 그래서 넘겨도 곧바로 실패로 몰지 않는다 (+1 까지 주의).
     */
    level: level(balance.signals.promo <= promoMax, balance.signals.promo <= promoMax + 1),
    value: `${balance.signals.promo}종류`,
    target: `${promoMax}종류 이하 (순위 기준이 아니라 글의 목적 기준)`,
    hint: balance.level === 'pushy' || balance.level === 'both' ? balance.promoNote : undefined,
    /*
     * 가중치 3 → 2. 홍보 종류 수는 순위를 가르지 않았다 (content.ts 재측정 표).
     * 그래도 0 은 아니다 — 상한을 크게 넘긴 글은 전단지로 읽힌다.
     */
    weight: 2,
  })

  // ─── 저품질 위험 ─────────────────────────────────────────────
  add({
    id: 'phone',
    group: '저품질 위험',
    label: '전화번호 노출',
    level: level(phoneCount <= 1, phoneCount <= 2),
    value: `${phoneCount}회`,
    /*
     * **정보글은 0 회다** (2026-08-21). 판정은 원래도 「없어도 통과」였지만 목표 문구가
     * 「0~1회」라서, 회원이 그 줄만 보면 한 번은 넣어도 되는 줄로 읽는다. 그리고 넣으면
     * `info-purity` 가 잡는다 — 화면의 두 줄이 서로 다른 말을 하게 된다.
     */
    target: input.type === 'promo' ? 'CTA에 1회' : input.type === 'info' ? '0회 (정보글에는 넣지 않습니다)' : '0~1회',
    hint: phoneCount > 1 ? '전화번호 도배는 상업성 과다 신호입니다.' : undefined,
    weight: 2,
  })

  add({
    id: 'links',
    group: '저품질 위험',
    label: '외부 링크',
    level: level(linkCount <= 2, linkCount <= 3),
    value: `${linkCount}개`,
    // 위 phone 과 같은 이유 — 「1~2개」는 정보글에 링크를 넣으라는 말로 읽힌다
    target: input.type === 'info' ? '0개 (홍보 링크는 정보글에 넣지 않습니다)' : '1~2개 (예약 링크 포함)',
    hint: linkCount > 2 ? '상업성 외부 링크가 많으면 어뷰징 의심을 받습니다.' : undefined,
    weight: 2,
  })

  const risks: RiskHit[] = [
    ...scanRisks(scanText),
    ...scanCommercialOveruse(scanText),
    ...(input.womenOnly ? scanMaleTargeting(scanText) : []),
  ]

  const failRisks = risks.filter((r) => r.level === 'fail')
  add({
    id: 'risks',
    group: '저품질 위험',
    label: '위험 표현 검수',
    level: failRisks.length ? 'fail' : risks.length ? 'warn' : 'pass',
    value: risks.length ? `${risks.length}건 (즉시 수정 ${failRisks.length}건)` : '통과',
    target: '0건',
    hint: risks.length ? '아래 위험 표현 목록에서 치환 방향을 확인하세요. 철자를 바꿔 숨기면 더 위험합니다.' : undefined,
    weight: 6,
  })

  // ─── AI 티 제거 ─────────────────────────────────────────────
  const total = sentences.length || 1
  /*
   * **「~습니다」만 보던 것을 「가장 많은 어미」로 넓혔다** (2026-08-06 실측 161편).
   *
   * 어미가 한쪽으로 몰린 정도별 순위가 이렇게 갈렸다.
   *
   *   골고루 (한 어미 40% 이하)   9편  평균 4.22위 · 1~3위 44%
   *   보통 (40~55%)            62편       5.19위 ·       35%
   *   한쪽으로 (55~70%)         63편       5.22위 ·       33%
   *   거의 하나 (70% 이상)       27편       6.30위 ·       19%
   *
   * 몰리는 어미가 「~습니다」가 아니어도 같다 — 하위권은 명사형 마침(「~완비」「~운영」)이
   * 많았다 (1~3위 13% / 6위 이하 18%). 그래서 어미 종류를 가리지 않고 최다 어미를 본다.
   */
  const topEnding = Object.entries(sentenceEndings).sort((a, b) => b[1] - a[1])[0]
  const dominantRate = topEnding ? Math.round((topEnding[1] / total) * 100) : 0
  add({
    id: 'endings',
    group: 'AI 티 제거',
    label: '어미 다양성',
    level: level(dominantRate <= 55, dominantRate <= 70),
    value: topEnding ? `"${topEnding[0]}" ${dominantRate}%` : '문장 없음',
    target: '한 어미 55% 이하 (상위권은 골고루 쓸수록 위에 있었습니다)',
    hint:
      dominantRate > 55
        ? '한 어미로 몰려 있습니다. 상위권 문체는 "~습니다" 25~30% · "~요/~죠" 30~40% · "~다" 10~15% · 명사형 15% 이하로 섞여 있었습니다.'
        : undefined,
    weight: 2,
  })

  /*
   * ─── 톤 (딱딱함 ↔ 가벼움) ─────────────────────────────────────
   *
   * **순위 기준이 아니다.** 방문자 화자를 걸러낸 81편에서 톤 지표는 전부 |ρ| ≤ 0.22 이고
   * 95% 구간이 겹쳤다 (느낌표 +0.13 · 이모지 -0.05 · 1인칭 -0.04 · 감정 낱말 -0.09).
   * 그래서 이 항목의 가중치는 2 이고, 목표 문구에도 순위 기준이 아니라고 밝힌다.
   *
   * 그래도 넣는 이유는 회원이 말한 문제가 실재하기 때문이다 — "업체 화자니까 너무 가벼워
   * 보여도 안 되지만, 너무 무거워서 가까워지기 어려운 톤이면 안 된다." 양쪽 극단만 잡는다.
   *   딱딱한 쪽: 센터 1인칭(「제가」·「저는」)이 한 번도 없음 → 회사 공지문이 된다
   *   가벼운 쪽: 느낌표·이모지 남발 (상위권 중간값의 두 배를 넘김)
   */
  const per1k = (n: number) => (charCount ? (n / charCount) * 1000 : 0)
  const bangRate = per1k((prose.match(/!/g) ?? []).length)
  const emojiRate = per1k((prose.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length)
  /*
   * 「저희」는 세지 않는다 — 그게 소속 1인칭이고, 그것만 반복하는 글이 회사 공지문이다.
   * 다만 「저한테」·「저에게」는 사람이 말하는 1인칭이라 센다 (실제 초안에서 「저한테 제일
   * 먼저 물으시는 게」를 놓쳐 통과해야 할 글에 주의를 줬다).
   */
  const firstPerson = (prose.match(/제가|저는|저도|저한테|저에게|저희가 보기/g) ?? []).length
  // 후기글 화자는 방문객이라 「저희 센터」가 없는 게 정상이다 — 센터 1인칭은 홍보·정보만 본다
  const stiff = input.type !== 'review' && firstPerson === 0
  const loud = bangRate > 6 || emojiRate > 8
  add({
    id: 'tone',
    group: 'AI 티 제거',
    label: '톤 (딱딱함 · 가벼움)',
    level: stiff && loud ? 'fail' : stiff || loud ? 'warn' : 'pass',
    value: loud
      ? `느낌표 ${bangRate.toFixed(1)} · 이모지 ${emojiRate.toFixed(1)} (1,000자당)`
      : stiff
        ? '센터 1인칭 0회'
        : '통과',
    target: '순위 기준이 아니라 우리 톤 기준입니다 (실측에서 톤은 순위와 무관했습니다)',
    hint: stiff
      ? '「저희 센터는」만 반복하면 회사 공지문이 됩니다. 「제가」를 넣어 운영하는 사람이 말하고 있다는 걸 드러내세요 — 예) "제가 상담할 때 가장 많이 듣는 말이 이겁니다."'
      : loud
        ? `느낌표·이모지가 많습니다 (상위권 중간값은 1,000자당 느낌표 3.3개 · 이모지 3.9개). 업체 글에서 남발하면 전단지로 읽힙니다 — 느낌표는 문단당 1개 이하, 이모지는 구간마다 1개까지로 줄이세요.`
        : undefined,
    weight: 2,
  })

  /*
   * ─── 첫 문장이 인사 + 정식 상호명인가 ───────────────────────
   *
   * **순위 기준이 아니다** (인사로 시작 27% / 아닌 글 32%, 구간 겹침). 우리 규칙이다.
   *
   * 회원이 실제 결과물을 보고 말했다 — "첫 문장이 「안녕하세요 MTO 피트니스 쌍용점」이
   * 아니라 뭐 이상한 문장이야. 업체명을 제대로 쓴 것도 아니고 「쌍용점」이라고만 나오고."
   * 나온 문장이 「저희는 쌍용점입니다」였다. 정식 상호명 횟수 검사는 이걸 못 잡는다 —
   * 뒤쪽에서 세 번 채우면 통과하기 때문이다. 그래서 **첫 문장만** 따로 본다.
   *
   * 후기글은 건너뛴다 — 화자가 방문객이라 센터 이름으로 인사하면 오히려 틀린다.
   *
   * **정보글도 인사 + 상호명을 본다** (2026-08-21). 회원 요청 두 개가 하루 사이에 왔다:
   *   ① "정보성글 인사말이 없어서 어색해 인사 문구는 넣어주면 좋을거 같아"
   *   ② "인사말에 업체명 한번을 소개되게 해줘"
   *
   * 2026-08-20 에 정보글을 이 검사에서 통째로 뺐었다. 그때 근거는 영상이 든 여섯 가지 금지
   * 항목이었는데, 다시 보니 **그중 상호명만 우리가 실측한 적이 없다** (SPECS.info 의
   * legalNameMin 주석 — 나머지 다섯은 1페이지 정보형 38편에서 실제로 셌고 상호명 칸만 「—」다).
   * 우리가 잰 것은 오히려 반대쪽이었다.
   *
   * 그래서 홍보글과 같은 모양으로 본다. **다른 것은 횟수뿐이다** — 홍보글 3회, 정보글 1회.
   * 「과도한 반복」과 「한 번 밝히는 것」은 다르고, 2회 이상은 `info-purity` 가 계속 잡는다.
   *
   * 제목은 여전히 안 된다 (`info-title-purity`). 제목은 그 글이 무슨 글인지 정하는 자리라
   * 거기 상호명이 오면 앞자리를 잡아먹고, 정보 메인 키워드가 뒤로 밀린다.
   */
  if (input.type !== 'review') {
    const opening = prose.slice(0, 80)
    const greeted = /안녕하세[요셔]|반갑습니다/.test(opening)
    /*
     * 상호명은 countLoose 와 같은 기준으로 본다 — 띄어쓰기 차이로 못 찾으면 거짓 경고가 된다
     * (「MTO 피트니스 쌍용점」 vs 「MTO피트니스 쌍용점」).
     */
    const legal = input.legalName?.trim() ?? ''
    const flat = (t: string) => t.replace(/\s+/g, '')
    const namedInOpening = legal ? flat(opening).includes(flat(legal)) : false
    add({
      id: 'intro-greeting',
      group: '분량·구조',
      label: '첫 문장 인사 + 정식 상호명',
      level: greeted && namedInOpening ? 'pass' : greeted || namedInOpening ? 'warn' : 'fail',
      value: greeted
        ? namedInOpening
          ? '통과'
          : '인사는 있는데 정식 상호명이 없음'
        : namedInOpening
          ? '상호명은 있는데 인사가 없음'
          : '없음',
      target:
        input.type === 'info'
          ? '「안녕하세요, (정식 상호명)입니다」로 시작 — 본문에서는 이 1회까지만'
          : '「안녕하세요, (정식 상호명)입니다」로 시작 (순위 기준이 아니라 우리 규칙)',
      hint:
        greeted && namedInOpening
          ? undefined
          : legal
            ? `글 맨 처음을 「안녕하세요, ${legal}입니다」로 여세요. 「저희는 ○○점입니다」처럼 줄이면 읽는 사람이 상호를 못 알아보고 검색도 못 합니다.${
                input.type === 'info'
                  ? ' **정보글에서는 여기 1회까지입니다** — 뒤에서 또 쓰면 「과도한 상호명 반복」이 되고, 제목에도 넣지 않습니다.'
                  : ''
              }`
            : '지점 정보에 정식 상호명이 없습니다. 지점 설정에서 먼저 채워주세요.',
      /*
       * 가중치 2. 순위 근거가 없는 항목이라 낮게 두지만, 0 은 아니다 —
       * 상호를 못 알아보면 상담 전화가 올 곳을 모른다.
       */
      weight: 2,
    })
  }

  /*
   * ─── 없앤 검사: `info-promo-tail` (2026-08-20) ────────────────
   *
   * 「홍보는 마지막 구간에 모아라」를 보던 항목이었다. 회원 요청에서 나왔다 — "정보성 8 :
   * 홍보성 2 느낌으로 글 마지막에는 홍보가 들어갈 수 있게 해줘"(2026-08-07). 마지막 소제목을
   * 경계로 나눠서 앞 구간 홍보 ≤1종류 · 뒤 구간 ≥2종류면 통과였다.
   *
   * **`info-purity` 와 정반대를 시킨다.** 정보글에서 홍보를 전부 걷어낸 뒤(2026-08-20), 깨끗한
   * 정보글 하나에 두 항목이 같이 떴다 — 한쪽은 "상호명·상담을 지우세요", 다른 쪽은 "마지막
   * 구간이 비었습니다, 상호명 1회 + 상담 안내를 350~450자로 쓰세요". 회원이 어느 쪽을 따라도
   * 다른 쪽에 걸린다.
   *
   * 이 저장소에서 지시와 검수가 반대가 된 것은 이번이 두 번째다 (2026-08-10 인사 검사).
   * 앞 구간이 더러운 것을 잡던 역할은 `info-purity` 가 글 전체에서 대신 본다 — 그쪽이 더
   * 넓게 보고, 「자리를 옮겨라」가 아니라 「지워라」라고 말한다.
   */

  /*
   * ─── 인용에 출처가 붙어 있는가 ─────────────────────────────────
   *
   * 회원 지적 — "정보글인데 내용 자체는 팩트로 써야 하잖아. 그냥 감으로 이렇게 했더니 이렇게
   * 됬다더라 하면 안 되는 거잖아. 정확한 정보를 전달해야지. 실제 연구 결과 등이 있으면
   * **출처도 함께 인용해서** 쓰는 게 좋을 거 같아."
   *
   * **앞 판에서 내가 반대로 만들었다.** 「연구를 인용하지 않는다」로 막았는데, 문제는 인용이
   * 아니라 **출처 없는 인용**이었다. 인용을 막으면 정보글이 「감으로 쓴 글」이 된다 — 회원이
   * 하지 말라고 한 바로 그 상태다.
   *
   * 그래서 판정을 뒤집는다:
   *   인용 + 출처 표기 있음  → 통과 (이게 우리가 원하는 모양이다)
   *   인용 + 출처 표기 없음  → 즉시수정
   *
   * 출처 표기로 인정하는 것: 링크 · 「출처」·「참고」 · 기관/학회/대학/청·부처 이름.
   * 셋 다 없으면 어느 자료인지 아무도 확인할 수 없다.
   *
   * **세 유형 다 본다.** 회원은 정보글로 말했지만, 없는 연구를 홍보글에 쓰면 그건 광고 표시에
   * 걸리는 자리다 — 「없는 리뷰를 만들지 않는다」(`review-honesty`)와 같은 갈래다.
   */
  const CITATION = /연구(에\s*따르면|\s*결과|가\s*(꽤\s*)?있|를\s*보면|에서)|논문|학계|임상|전문가(들)?(은|이|에\s*따르면)|박사(는|가|에\s*따르면)|의학적으로/
  const EFFECT_NUMBER = /\d{1,3}\s*%[^.!?\n]{0,25}(줄|늘|증가|감소|향상|빠지|빠져)/
  /** 출처로 인정하는 표기 — 링크 · 「출처/참고」 · 기관 이름 */
  const SOURCE_MARK =
    /https?:\/\/|출처|참고\s*(자료|문헌)?[::]|학회|대학교|연구소|보건복지부|질병관리청|식품의약품안전처|세계보건기구|WHO|NIH|ACSM|NSCA/
  const citation = CITATION.exec(scanText)?.[0]?.trim()
  const effectNum = EFFECT_NUMBER.exec(scanText)?.[0]?.trim()
  const sourceMark = SOURCE_MARK.exec(input.body)?.[0]?.trim()
  if (citation || effectNum) {
    add({
      id: 'fact-source',
      group: '저품질 위험',
      label: '인용에 출처가 있는가',
      level: sourceMark ? 'pass' : 'fail',
      value: sourceMark
        ? `출처 표기 있음 (「${sourceMark}」)`
        : [citation ? `출처 없는 인용: 「${citation}」` : '', effectNum ? `출처 없는 수치: 「${effectNum}」` : '']
            .filter(Boolean)
            .join(' · '),
      target: '연구·수치를 인용하면 출처를 함께 (기관 이름·자료명·링크)',
      hint: sourceMark
        ? undefined
        : `${
            citation
              ? '인용은 좋습니다. **어느 자료인지 밝히면** 됩니다 — 「연구에 따르면」이 아니라 「○○학회 2024년 자료에 따르면」처럼 기관 이름이나 자료명을 넣으세요. '
              : ''
          }${
            effectNum
              ? '수치에도 출처가 필요합니다. 자료가 있으면 그 이름과 함께 쓰고, 없으면 방향으로 쓰세요 — 「눈에 띄게 줄어드시더라고요」. '
              : ''
          }자료가 있으시면 글쓰기 화면의 **「근거·출처」 칸**에 넣어주세요 — 그 안의 것만 인용하고 출처를 함께 적습니다. 자료가 없다면 우리 현장 근거로 바꾸세요 (「제가 상담하면서 보면」).`,
      /*
       * 가중치 4. 순위 근거는 없지만 광고 표시·신뢰에 걸린 자리라 리뷰 정직성(5) 다음으로
       * 무겁게 둔다.
       */
      weight: 4,
    })
  }

  /*
   * ─── 출처를 문장 앞에 세웠는가 ─────────────────────────────────
   *
   * 회원 지적 (화면 캡처와 함께) — "내가 원하는 건 「대한비만학회 무슨무슨 결과에 따르면
   * 단맛 나는 음식은 혈당을 빠르게 올리고…」를 원한 건데, 그냥 내용을 쓰고 괄호로 출처를
   * 쓰고 있어. 나는 이런 걸 원한 게 아니야."
   *
   * 실제로 나온 문장:
   *   단맛 나는 음식은 혈당을 빠르게 올리고 … 이어지기 쉽다고 합니다 (대한비만학회 홈페이지).
   * 원하는 문장:
   *   대한비만학회가 일반인용 자료에서 밝힌 내용을 보면, 단맛 나는 음식은 … 떨어뜨립니다.
   *
   * **`fact-source` 는 이걸 못 잡았다.** 그 검사는 「출처가 있나」만 본다 — 괄호로 붙어도
   * 통과였다. 위치는 취향 문제가 아니다. 뒤에 괄호로 달면 ①읽는 사람은 누가 한 말인지
   * 모른 채 그 문장을 지나가고 ②「~라고 합니다」가 붙어 소문처럼 읽힌다. 회원이 앞서
   * 「감으로 이렇게 했더니 하면 안 되는 거잖아」라고 한 바로 그 모양이다.
   *
   * 「AI 티 제거」에 넣는다. 내용 끝에 괄호 각주를 매다는 것은 사람이 블로그에 쓰는
   * 모양이 아니라 **기계가 쓴 티가 가장 잘 나는 모양**이다.
   */
  const ORG =
    '학회|의학회|영양학회|대학교|연구소|연구원|보건복지부|질병관리청|식품의약품안전처|국민건강보험공단|공단|세계보건기구|WHO|NIH|ACSM|NSCA|CDC|FDA'
  /** 기관 이름이 먼저 오고 그 뒤에 「따르면·보면·밝혔·발표한·권고」가 오는 모양 */
  const LEAD_SOURCE = new RegExp(`(${ORG})[^.!?\\n]{0,30}(따르면|보면|밝혔|밝힌|발표한|권고(하|한|합))`)
  /** 괄호 안에 기관 이름만 들어 있는 모양 — 이게 회원이 물린 그 모양이다 */
  const TAIL_SOURCE = new RegExp(`[（(][^）)\\n]{0,60}(${ORG})[^）)\\n]{0,40}[）)]`)
  /*
   * 괄호를 지운 본문에서 앞 출처를 찾는다. 안 지우면 괄호 안의 기관 이름이 뒤 문장의
   * 「보면」과 붙어 「앞에 세웠다」로 오판한다.
   */
  const bodyNoParen = input.body.replace(/[（(][^）)\n]{0,80}[）)]/g, ' ')
  const leadSource = LEAD_SOURCE.exec(bodyNoParen)?.[0]?.trim()
  const tailSource = TAIL_SOURCE.exec(input.body)?.[0]?.trim()
  // 출처가 아예 없는 경우는 위 fact-source 가 이미 잡는다 — 여기서 또 말하지 않는다
  if (leadSource || tailSource) {
    add({
      id: 'source-lead',
      group: 'AI 티 제거',
      label: '출처를 문장 앞에 세웠는가',
      level: leadSource ? 'pass' : 'fail',
      value: leadSource
        ? `앞에 세웠음 (「${leadSource.slice(0, 30)}」)`
        : `괄호로 뒤에만 붙었음 (「${tailSource?.slice(0, 40)}」)`,
      target: '「○○학회 자료에 따르면, …」처럼 출처를 먼저 쓰고 내용을 쓴다',
      hint: leadSource
        ? undefined
        : '내용을 쓰고 끝에 괄호로 출처를 매달지 마세요. **출처를 문장 맨 앞으로 옮기면** 됩니다 — 「…이어지기 쉽다고 합니다 (대한비만학회 홈페이지)」가 아니라 「**대한비만학회가 일반인용 자료에서 밝힌 내용을 보면**, 단맛 나는 음식은 혈당을 빠르게 올렸다가 다시 빠르게 떨어뜨립니다」처럼요. 앞에서 밝혔으면 문장은 「~라고 합니다」로 흐리지 말고 단정으로 끝냅니다.',
      /*
       * 가중치 3 — 다른 「AI 티 제거」 항목과 같다. 사실이 틀린 게 아니라 모양이 틀린
       * 것이라 출처 없는 인용(4)보다는 가볍게 둔다.
       */
      weight: 3,
    })
  }

  /*
   * ─── 전언으로 쓴 문장이 있는가 ─────────────────────────────────
   *
   * 회원 요청 (2026-08-21) — "정보글을 조금더 신뢰성있고 사람들에게 도움이 될만한 정보로
   * 작성할 수 있게 해줘."
   *
   * 출처 쪽은 이미 두 항목이 본다 (`fact-source` 는 출처가 있나, `source-lead` 는 앞에
   * 세웠나). **비어 있던 것은 그 사이다** — 출처가 아예 없이 「~라고 하더라구요」로 넘어가는
   * 문장. 회원이 처음 이 얘기를 꺼낼 때 든 예가 정확히 이 모양이었다: "그냥 감으로 이렇게
   * 했더니 이렇게 됬다더라 하면 안 되는 거잖아."
   *
   * 「~라고 합니다」는 **일부러 뺐다.** 출처를 앞에 세운 뒤 붙이는 「~라고 합니다」는
   * `source-lead` 가 이미 말하고 있고, 여기서 또 잡으면 한 문장에 두 항목이 뜬다. 여기서는
   * **출처가 있어도 소문으로 만드는 말투**만 본다 — 들은 사람이 누구인지조차 없는 것들이다.
   *
   * `warn` 까지만 한다. 순위 근거가 아니라 신뢰 문제이고, 후기글에서는 방문객이 실제로 들은
   * 말을 옮기는 자연스러운 말투일 수 있다 (「선생님이 그러시더라구요」). 그래서 **후기글은
   * 대상에서 뺀다** — 거기서는 이게 무기다.
   */
  if (input.type !== 'review') {
    /** 들은 사람이 누구인지 없이 남의 말로 미루는 어미들 */
    // 「~다는 말이 있」·「~라는 말이 있」 둘 다 잡는다 — 어간에 따라 갈린다 (안 된다는 / 좋다라는)
    const HEARSAY = /(하더라구요|하더라고요|하더군요|한다더라|라더라|라던데|다던데|[라다]는 말이 있|카더라|들었는데|듣기로는|그렇다고 하네요|한다고 하네요)/g
    const hits = Array.from(new Set(scanText.match(HEARSAY) ?? []))
    if (hits.length) {
      add({
        id: 'hearsay',
        group: 'AI 티 제거',
        label: '전언으로 쓴 문장',
        // 하나만 있으면 주의, 셋 이상이면 글 전체가 소문투다 — 그래도 막지는 않는다
        level: 'warn',
        value: hits
          .slice(0, 3)
          .map((h) => `「${h}」`)
          .join(' · '),
        target: '들은 말로 미루지 않는다 (출처를 앞에 세우거나 우리가 본 것으로)',
        hint: '남에게 들은 말로 쓰면 출처가 있어도 소문처럼 읽히고, 그 글 전체의 무게가 깎입니다. 두 갈래 중 하나로 바꾸세요 — ①자료가 있으면 **출처를 문장 앞에 세우고** 단정으로 끝내거나(「대한비만학회 자료를 보면, …떨어뜨립니다」) ②우리가 본 것이면 그렇게 밝히세요(「제가 상담하면서 보면」·「회원분들 얘기를 들어보면」).',
        /*
         * 가중치 2 — 다른 「AI 티 제거」 항목(3)보다 가볍다. 사실이 틀린 게 아니라 말투
         * 문제이고, 한 번쯤 섞이는 것은 사람이 쓴 글에서도 흔하다.
         */
        weight: 2,
      })
    }
  }

  /*
   * ─── 네이버가 못 읽는 마크다운이 남았는가 ───────────────────────
   *
   * 회원 지적 (두 번째 캡처) — "아직도 마크다운 같은데 복사 붙여넣기 하면 제대로 반영이
   * 안 돼. 확실하게 검수해서 반영해줘."
   *
   * 붙여넣기 쪽은 고쳤다(export.ts — 구분선은 서식으로, 링크·코드·목록은 글자로 풀고,
   * 줄바꿈으로 갈린 `**` 짝도 찾는다). 그런데 **본문에 남아 있다는 사실 자체를 화면에서
   * 알려주지 않으면** 회원은 붙여넣고 나서야 안다. 그래서 여기서도 잡는다.
   *
   * 살릴 수 있는 것과 못 살리는 것을 갈라야 한다:
   *   살린다 — `## 소제목` · `**굵게**` · `[이미지: …]` · 구분선(`---`)
   *   못 살린다 — 링크·코드·목록·인용 기호·기울임. 이건 글자로 박히거나 모양이 깨진다.
   */
  const MD_LEAKS: { p: RegExp; label: string }[] = [
    { p: /\[[^\]\n]+\]\([^)\n]+\)/, label: '링크 문법 [글자](주소)' },
    { p: /`[^`\n]+`/, label: '코드 표시 `말`' },
    { p: /^\s*[-*+]\s+\S/m, label: '목록 기호 (- 로 시작하는 줄)' },
    { p: /^\s*>\s+\S/m, label: '인용 기호 (> 로 시작하는 줄)' },
    { p: /(^|[\s(])\*[^*\n]+\*(?=[\s).,!?;:]|$)/, label: '기울임 *말*' },
    { p: /^\s*#{4,}\s/m, label: '소제목 기호 4개 이상 (####)' },
    { p: /\|[^\n|]+\|[^\n|]+\|/, label: '표 문법 (| 로 나눈 줄)' },
  ]
  const leaks = MD_LEAKS.filter((m) => m.p.test(input.body)).map((m) => m.label)
  /*
   * 짝이 안 맞는 별표도 잡는다 — 짝이 맞으면 서식으로 살리지만, 홀수면 글자로 박힌다.
   * `**` 개수를 센다 (`***` 같은 구분선 줄은 붙여넣기에서 걸러지니 세지 않는다).
   */
  const marks = input.body
    .split(/\r?\n/)
    .filter((l) => !/^\s*(?:[-*_]\s*){3,}$/.test(l))
    .join('\n')
    .match(/\*\*/g)
  if (marks && marks.length % 2 === 1) leaks.push('짝이 안 맞는 굵게 표시 (**)')

  /*
   * **남아 있을 때만 항목을 만든다.** 「마크다운 없음」 초록 줄은 매 글에 붙어도 회원이 할
   * 일이 없는 정보이고, 공짜 통과 점수가 붙어 위험한 글의 점수까지 올린다 (실제로 [5]번
   * 검사가 그걸 잡아냈다). 출처 검사(`fact-source`)와 같은 처리다.
   */
  if (leaks.length) {
    add({
      id: 'markdown-leak',
      group: 'AI 티 제거',
      label: '네이버가 못 읽는 마크다운이 없는가',
      level: 'warn',
      value: `남아 있음 — ${leaks.join(' · ')}`,
      target: '`## 소제목` · `**굵게**` · 구분선만 — 링크·코드·목록·표는 쓰지 않는다',
      hint: '이 기호들은 네이버에서 **서식이 되지 않고 글자로 박힙니다.** 「서식 포함 복사」는 최대한 글자로 풀어서 넣지만(링크는 「글자 (주소)」, 목록은 「· 」), 애초에 안 쓰는 편이 깔끔합니다. 표로 정리할 내용은 문장으로 풀어 쓰고, 링크는 주소만 한 줄로 적으세요.',
      /*
       * 가중치 3 — 다른 「AI 티 제거」 항목과 같다. 붙여넣기 쪽에서 이미 풀어내므로
       * 즉시수정까지 갈 일은 아니지만, 남아 있으면 회원이 알아야 한다.
       */
      weight: 3,
    })
  }

  /*
   * ─── 평소 쓰는 말로 쓰였는가 ───────────────────────────────────
   *
   * 회원 지적 — "낙폭이란 단어를 별로 쓰지 않아서 네이버에 치니까 주식 용어인 거 같더라고.
   * 글은 평소 우리가 많이 쓰는 단어들로 사람들이 이해하기 쉽게 말이야."
   *
   * **순위 기준이 아니다.** 읽는 사람은 동네 손님이고, 모르는 낱말 하나에서 글을 놓는다.
   * 목록은 짧게 유지한다 (lib/writing/plainwords.ts 주석) — 어려워 보이는 말을 다 막으면
   * 정보가 얕아진다. 막는 것은 **딴 분야 말**과 **굳이 어렵게 쓴 말** 둘뿐이다.
   */
  const hard = findHardWords(`${input.title}\n${scanText}`)
  add({
    id: 'plain-words',
    group: 'AI 티 제거',
    label: '평소 쓰는 말로 쓰기',
    level: hard.length === 0 ? 'pass' : 'fail',
    value:
      hard.length === 0
        ? '통과'
        : hard.map((h) => `${h.found} (${h.why})`).slice(0, 3).join(' · '),
    target: '다른 분야 용어·어렵게 쓴 말 없음',
    hint: hard.length
      ? `${hard
          .slice(0, 3)
          .map((h) => `「${h.found}」→ ${h.easy}`)
          .join(' · ')} 로 바꾸세요. ${
          hard.some((h) => h.why === '단위는 기호로')
            ? '단위는 기호로 씁니다 (kg · g · kcal · cm) — 한글로 풀어 쓰면 숫자에 붙었을 때 눈에 안 들어옵니다. 시간(분·초)은 한글이 맞습니다.'
            : hard.some((h) => h.why === '다른 분야 용어')
              ? '검색하면 다른 분야 얘기가 나오는 낱말입니다 — 읽는 분이 「이게 무슨 말이지」에서 글을 놓습니다.'
              : '뜻이 같은 쉬운 말이 있으면 그걸 씁니다.'
        }`
      : undefined,
    weight: 3,
  })

  /*
   * ─── 한국어로만 쓰였는가 ──────────────────────────────────────
   *
   * 회원 지적 — "글에 영문이 들어가. 모든 글은 한국어로 작성될 수 있게 해줘."
   * 나온 문장: "혈당이 천천히 올라가서 addictive한 느낌이 덜합니다."
   *
   * **순위 기준이 아니다.** 우리 글의 독자는 동네 손님이고, 모르는 영어 낱말 하나가
   * 「번역기 돌린 글」로 읽히게 만든다. 상호명·PT·kg 같은 필요한 로마자는 허용 목록으로
   * 빼고(`LATIN_ALLOWED`), 링크는 아예 세지 않는다. 키워드에 로마자가 들어 있으면
   * 그것도 허용한다 — 「쌍용동PT」를 쓰라고 시켜놓고 걸면 안 된다.
   */
  const latinAllow = [
    input.legalName ?? '',
    input.mainKeyword ?? '',
    ...(input.subKeywords ?? []),
    input.localKeyword ?? '',
  ]
    .join(' ')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
  const latin = findLatinWords(`${input.title}\n${scanText}`, latinAllow)
  add({
    id: 'korean-only',
    group: 'AI 티 제거',
    label: '한국어로만 쓰기',
    level: latin.length === 0 ? 'pass' : 'fail',
    value: latin.length === 0 ? '통과' : `영문 ${latin.length}개: ${latin.slice(0, 5).join(' · ')}`,
    target: '제목·본문 전부 한국어 (상호명·PT·kg·링크는 예외)',
    hint: latin.length
      ? `${latin
          .slice(0, 5)
          .map((w) => `「${w}」`)
          .join(' · ')}을 한글로 바꾸세요 — 예) addictive → 중독성, routine → 루틴. 읽는 분들은 동네 손님이라 영어 낱말 하나가 번역기 돌린 글처럼 읽히게 만듭니다. 정말 필요한 약어(PT·OT·kg)와 링크는 그대로 둬도 됩니다.`
      : undefined,
    /*
     * 가중치 3. 순위 근거는 없지만 한 낱말만 섞여도 글이 어색해지고, 고치는 데 드는 비용은
     * 거의 없다 (낱말 하나 바꾸기). 인사 검사(2)보다 높고 정보 종류(5)보다 낮게 둔다.
     */
    weight: 3,
  })

  /*
   * ─── 정보글에 가격·이벤트가 있는가 ────────────────────────────
   *
   * 원래는 「마지막 홍보가 **적어둔 것**인가」였다. 회원이 홍보 칸에 적은 조건과 본문 금액을
   * 대조해서, 적어두지 않은 금액이 나오면 지어낸 것으로 봤다 (회원 지적, 2026-08-11 —
   * 모델이 「1:1 PT 공동구매 500회, 회당 45,000원」을 스스로 만들어냈다).
   *
   * **2026-08-20 에 대조할 것이 없어졌다.** 정보글에서 홍보 구간을 없애면서 홍보 칸도 정보글
   * 화면에서 뺐다. 그래서 기준이 단순해진다 — **정보글에 금액이나 이벤트가 있으면 그 자체가
   * 잘못이다.** 적어뒀는지 따질 필요가 없다.
   *
   * 지어낸 가격은 거짓 광고이므로 여기만 `fail` 이다 (`info-purity` 는 `warn` 이다 — 상호명은
   * 회원이 알고도 넣을 수 있지만, 확인 안 된 금액은 그렇지 않다). 「24시간」·「4대」 같은
   * 숫자는 「원」이 없어서 안 걸리고, 전화번호도 마찬가지다.
   */
  if (input.type === 'info') {
    /** 「45,000원」·「9.9만원」·「99000원」 — 금액만 본다 */
    const MONEY = /\d[\d,.]*\s*만?\s*원/g
    const money = Array.from(new Set(input.body.match(MONEY) ?? []))
    // 이벤트를 말하는 낱말 — 정보글에는 나올 자리가 없다
    const eventWord = /이벤트|공동구매|특가|프로모션|할인|선착순|마감/.exec(prose)?.[0]
    const bad = money.length > 0 || Boolean(eventWord)
    if (bad) {
      add({
        id: 'info-promo-source',
        group: '저품질 위험',
        label: '정보글에 가격·이벤트',
        level: 'fail',
        value: money.length ? `금액: ${money.slice(0, 3).join(' · ')}` : `「${eventWord}」가 있음`,
        target: '정보글에는 금액·이벤트를 쓰지 않습니다',
        hint: '정보글은 지수를 쌓는 글이고 가격·이벤트는 홍보글이 맡습니다. 이 대목을 지우세요 — 확인 안 된 가격은 거짓 광고가 되고, 홍보 요소가 들어가면 네이버가 이 글을 홍보성 게시물로 분류합니다.',
        weight: 4,
      })
    }
  }

  /*
   * ─── 플레이스 리뷰 (실제 리뷰로 신뢰를 주는가) ─────────────────
   *
   * 회원 요청 — "홍보성 글에 플레이스 관련 헬스 및 피티 리뷰를 분석해서 신뢰성을 줄 수 있게
   * 작성해주면 좋겠어. **실제 리뷰인 거지.** 링크도 첨부해서."
   *
   * 두 항목으로 나눈다. 성격이 다르기 때문이다:
   *
   *   review-proof   — 리뷰를 모아뒀는데 글에서 안 썼다. 아까운 일이지 위험한 일은 아니다.
   *   review-honesty — 없는 리뷰를 지어냈다. **표시광고법 위반**이다 (거짓·과장 광고).
   *
   * 그래서 앞은 리뷰가 있을 때만 재고 가중치 3이며, 뒤는 **리뷰가 없어도** 재고 저품질
   * 위험으로 둔다. 리뷰가 하나도 없는 글에서 「리뷰에 이런 말이 많아요」가 나오는 것이
   * 가장 위험한 경우다 — 대조할 원본이 아예 없다.
   *
   * 순위 기준이 아니다. 리뷰 인용은 오히려 실측에서 반대로 나왔다 (인용 있음 1~3위 25% /
   * 없음 35%, 표본 작음). 이건 순위가 아니라 **상담 전환**과 **법** 쪽 규칙이다.
   */
  const placeReviews = (input.placeReviews ?? []).filter((r) => r.text?.trim())

  if (input.type === 'promo' && placeReviews.length >= 3) {
    const analysis = analyzeReviews(placeReviews)
    const url = placeReviewUrl(input.placeId)
    const quoted = verifyReviewQuotes(input.body, placeReviews)
    const cited = quoted.filter((q) => q.ok).length
    const mentioned = /리뷰|후기/.test(scanText)
    const linked = url ? input.body.includes(url) : false
    add({
      id: 'review-proof',
      group: '내용 균형',
      label: '플레이스 리뷰 인용',
      level: cited >= 1 && (linked || !url) ? 'pass' : cited >= 1 || mentioned ? 'warn' : 'fail',
      value: `인용 ${cited}개${url ? (linked ? ' · 링크 있음' : ' · 링크 없음') : ' · 플레이스 id 없음'}`,
      target: `실제 리뷰 1~2개 인용 + 링크 (모은 리뷰 ${placeReviews.length}편${
        analysis.themes[0] ? ` · 가장 많은 주제 「${analysis.themes[0].label}」 ${analysis.themes[0].count}편` : ''
      })`,
      hint:
        cited < 1
          ? `리뷰 ${placeReviews.length}편을 모아뒀는데 글에서 안 쓰고 있습니다. 신뢰 구간에서 「리뷰 ${placeReviews.length}편 중 ${
              analysis.themes[0]?.count ?? 0
            }편이 ${analysis.themes[0]?.label ?? '같은 말'}을 말했다」로 한 줄 쓰고, 리뷰 문장 하나를 따옴표로 그대로 옮기세요${
              url ? ` — 링크도 함께: ${url}` : ' (지점 설정에 플레이스 id 를 넣으면 링크도 만들어 드립니다)'
            }. 우리가 「깨끗합니다」라고 말하는 것과 손님이 그렇게 말한 것을 링크로 확인시키는 것은 무게가 다릅니다.`
          : !linked && url
            ? `인용은 있는데 확인할 링크가 없습니다. 신뢰 구간에 ${url} 을 한 줄로 넣으세요 — 링크가 없으면 인용도 우리 주장으로 읽힙니다.`
            : undefined,
      weight: 3,
    })
  }

  /*
   * 인용이 실제 리뷰에 있는가 — **리뷰를 모아두지 않았어도 검사한다.**
   *
   * 상담 대화 인용("제 시간에 문 여는 데가 없어요")은 대상이 아니다. 인용 앞뒤 40자에
   * 「리뷰·후기·플레이스·별점·평점」이 있는 것만 본다 (reviews.ts 의 verifyReviewQuotes).
   * 낱말이 아니라 **주장**을 보는 것이다 — 리뷰라고 말한 것만 리뷰로 검사한다.
   */
  const quoteChecks = verifyReviewQuotes(input.body, placeReviews)
  const madeUp = quoteChecks.filter((q) => !q.ok)
  if (quoteChecks.length > 0) {
    add({
      id: 'review-honesty',
      group: '저품질 위험',
      label: '리뷰 인용이 실제인가',
      level: madeUp.length === 0 ? 'pass' : 'fail',
      value:
        madeUp.length === 0
          ? `${quoteChecks.length}개 모두 실제 리뷰`
          : `원본에 없는 인용 ${madeUp.length}개: "${madeUp[0].quote.slice(0, 30)}…"`,
      target: '리뷰라고 쓴 인용은 붙여넣은 리뷰에 있는 문장이어야 합니다',
      hint:
        madeUp.length === 0
          ? undefined
          : placeReviews.length === 0
            ? '지점에 붙여넣은 리뷰가 없는데 본문이 리뷰를 인용하고 있습니다. **없는 리뷰를 옮기면 표시광고법 위반(거짓·과장 광고)입니다.** 플레이스 리뷰를 지점 설정에 붙여넣고 그 문장만 쓰거나, 리뷰 얘기를 지우세요.'
            : '붙여넣은 리뷰에 없는 문장입니다. 리뷰는 **글자 그대로** 옮기세요 — 요약하거나 다듬으면 실제로 아무도 하지 않은 말이 됩니다. 다듬고 싶으면 인용을 풀고 「리뷰 N편이 같은 말을 했다」처럼 숫자로 쓰세요.',
      weight: 5,
    })
  }

  /*
   * ─── 이벤트 훅 (후킹에서 이벤트를 흘렸는가) ──────────────────
   *
   * **순위 기준이 아니다.** 회원 요청이다 — "첫 구조에서 이벤트에 대한 훅이 없는 것 같아.
   * 이벤트 훅도 넣어서 흥미를 돋굴 수 있게 해줘."
   *
   * 지시문에는 이미 「①인사 → ②장면 → ③이벤트 예고」로 적혀 있었는데 나온 글에는 ③이
   * 없었다. **아무도 안 잡고 있었기 때문이다** — 검사가 없으면 모델이 빠뜨려도 화면이
   * 통과로 보이고, 고쳐 쓰기도 그 항목을 고칠 생각을 안 한다. 그래서 항목으로 만든다.
   *
   * 훅의 조건을 둘로 본다. 이 조합이 「궁금하게 만들되 다 밝히지는 않는」 상태다:
   *   ㉮ 무엇이 있는지 — 이벤트·혜택·할인 같은 말이나 금액·이용권
   *   ㉯ 제한이 있다는 것 — 인원·한정·마감·자리·조건·기간
   * ㉮만 있으면 그냥 광고 문구이고, ㉯만 있으면 무엇이 걸렸는지 모른다. 둘 다 있어야
   * 「값이 정해졌는데 자리가 정해져 있다 → 얼마지?」가 된다.
   *
   * **후기글도 본다** (2026-08-11). 회원 요청: "후기글도 도입부에 이벤트 홍보성을 넣어야
   * 하고." 전에는 「후기글의 예고는 방문자 시점의 한 줄이면 된다」며 검사에서 뺐는데, 그
   * 「한 줄」이 실제로는 「혜택이 있었어요」로 끝나 아무 정보가 없었다. 조건은 홍보글과
   * 같게 보고, **말투만 방문객 쪽이어야 한다**는 것은 지시문에서 잡는다 (여기서 말투까지
   * 재려 들면 「내가 받았다」와 「지금 신청하세요」를 낱말로는 못 가른다).
   *
   * 정보글은 대상이 아니다 — 이벤트 글이 아니다. (2026-08-21 주석 정정: 전에는 「홍보는
   * 마지막 구간에만 모인다」고 적어 뒀는데 그 구간이 없어졌다. 지금은 정보글에 이벤트가
   * 아예 안 들어간다 — `info-purity`·`info-promo-source` 가 본다.)
   */
  if (input.type !== 'info' && input.eventText?.trim()) {
    const introText = parsed.intro
    const offer = /이벤트|혜택|할인|특가|프로모션|행사|이용권|\d\s*개월|\d[\d,.]*\s*만?\s*원/.test(introText)
    const limit = /인원|한정|선착|마감|자리|조건|기간|이번\s*달|이달|말까지|까지만/.test(introText)
    add({
      id: 'event-hook',
      group: '내용 균형',
      label: '후킹에 이벤트 훅',
      level: offer && limit ? 'pass' : offer || limit ? 'warn' : 'fail',
      value: offer && limit ? '통과' : offer ? '혜택만 있고 제한이 없음' : limit ? '제한만 있고 혜택이 없음' : '없음',
      target: '첫 구간에 「무엇이 있다 + 제한이 있다」 한 문장 (순위 기준이 아니라 우리 규칙)',
      hint:
        offer && limit
          ? undefined
          : '이벤트를 이벤트 구간까지 숨기면 그 앞을 읽을 이유가 약해집니다. 후킹 끝에 한 문장만 흘리세요 — ' +
            (input.type === 'review'
              ? '**방문객 말투로** 예) "가보니 8월 등록분만 3개월치를 10만 원 아래로 맞춰주고 있었어요. 인원을 정해뒀다고 해서 저는 그날 바로 상담을 받았습니다." 「지금 신청하세요」 같은 센터 말투로 쓰면 업체가 쓴 글로 읽힙니다.'
              : '예) "8월 등록분만 3개월 이용권을 10만 원 아래로 맞췄어요. 다만 인원을 정해둬서 조건은 아래에 정리해뒀습니다."') +
            ' 「이벤트 진행 중입니다」·「혜택이 있었어요」처럼 내용 없는 예고는 훅이 아닙니다. 정확한 인원 수·마감일은 이벤트 구간에 남겨두세요.',
      /*
       * 가중치 3. 순위 근거가 없어 정보 종류(5)·상담 유도(4)보다는 낮게, 인사 검사(2)
       * 보다는 높게. 회원이 말한 이 글의 목적(상담 예약)에 직접 걸린 자리다.
       */
      weight: 3,
    })
  }

  const lengths = sentences.map((s) => s.length)
  const meanLen = lengths.reduce((a, b) => a + b, 0) / total
  const sdLen = Math.sqrt(lengths.reduce((s, l) => s + (l - meanLen) ** 2, 0) / total)
  const variance = meanLen > 0 ? Math.round((sdLen / meanLen) * 100) : 0
  add({
    id: 'rhythm',
    group: 'AI 티 제거',
    label: '문장 길이 리듬',
    level: level(variance >= 40, variance >= 28),
    value: `편차 ${variance}%`,
    target: '40% 이상',
    hint:
      variance < 40
        ? '문장 길이가 고르면 기계가 쓴 글처럼 읽힙니다. 긴 설명 뒤에 짧은 문장 하나를 넣으세요.'
        : undefined,
    weight: 2,
  })

  /*
   * ─── 문단 쪼개기 (2026-08-06 실측 160편) ───────────────────
   *
   * **문단 길이 자체는 순위와 무관했다.** 문단 길이 중간값이 1~3위 142자 · 4~6위 154자 ·
   * 7~10위 131자로 방향이 없다. 그래서 「몇 자로 써라」는 규칙은 두지 않는다.
   *
   * 갈린 것은 **덩어리로 썼는지**였다.
   *
   *   문단 3~5개    5편 → 1~3위  0%   (그 글들의 문단 중간값이 322자였다)
   *   문단 6~9개   21편 → 1~3위 24%
   *   문단 10~14개 39편 → 1~3위 36%
   *   문단 15개 이상 94편 → 1~3위 35%
   *
   *   가장 긴 문단이 본문의 40% 이상   4편 → 1~3위 0%
   *   상위권의 가장 긴 문단 중간값 308자 · 최대 문단 비중 중간값 10%
   *
   * 문단 수는 글 길이에 딸린 값이라 절대 개수로 걸면 짧은 글이 억울해진다. 그래서
   * **평균과 최대 길이**로 본다 — 같은 것을 재면서 길이에 공정하다.
   *
   * 우리 골격은 7단계라 그대로 쓰면 문단이 6~7개다. 특히 「해결 620~720자」를 한 덩어리로
   * 쓰면 그 문단만 본문의 35% 근처가 되는데 그 구간에 1~3위가 없다.
   */
  const paras = prose
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.replace(/\s/g, '').length >= 20)
  const paraLens = paras.map((l) => l.replace(/\s/g, '').length)
  const longestPara = paraLens.length ? Math.max(...paraLens) : 0
  const paraTotal = paraLens.reduce((a, b) => a + b, 0)
  const paraAvg = paraLens.length ? Math.round(paraTotal / paraLens.length) : 0
  // 문단이 3개도 안 되면 길이를 볼 것 없이 한 덩어리다 (짧은 글도 예외가 아니다)
  const chunky = paras.length < 3 || longestPara > 300 || paraAvg > 250
  const veryChunky = paras.length < 2 || longestPara > 400 || paraAvg > 330
  add({
    id: 'paraShape',
    group: '분량·구조',
    label: '문단 쪼개기',
    level: level(!chunky, !veryChunky),
    value: paras.length
      ? `${paras.length}개 · 평균 ${paraAvg}자 · 최대 ${longestPara}자`
      : '문단 없음',
    target: '평균 250자 이하 · 가장 긴 문단 300자 이하',
    hint: chunky
      ? '단계를 한 덩어리로 쓰지 마세요. 문단이 3~5개인 글은 1~3위가 한 편도 없었고, 한 문단이 본문의 40%를 넘는 글도 없었습니다 — 긴 문단을 두세 개로 끊으세요.'
      : undefined,
    weight: 2,
  })

  /*
   * ─── 화자 검사 ───────────────────────────────────────────────
   *
   * **없어서 놓쳤다.** 회원이 홍보글을 요청했는데 제목에 「후기」가 박히고 본문이 방문자
   * 말투로 나왔다. 검수에는 화자를 보는 항목이 아예 없어서 통과했다.
   *
   * 유형별로 화자가 정반대다.
   *   홍보글·정보글 — 센터가 1인칭으로 쓴다. 「후기」·「다녀왔다」·「괜찮더라고요」는 거짓이다.
   *   후기글        — 방문자가 1인칭으로 쓴다. 「저희 센터」 같은 소속 1인칭이 거짓이다.
   *
   * 문체 문제가 아니라 **누가 썼는지를 속이는** 문제이므로 무겁게 본다.
   */
  /*
   * **낱말만 보면 안 된다.** 처음엔 「갔는데」·「가보니」도 넣었는데, 홍보글의 공감 구간은
   * **독자의 경험을 대신 말해주는 자리**다 — 「남들 다 자는 새벽에 운동하러 갔는데 문이
   * 닫혀 있으면」은 센터가 독자 사정을 말하는 문장이고 방문자 후기가 아니다.
   * 실제로 잘 쓴 홍보글이 이것 때문에 걸렸다.
   *
   * 그래서 **화자가 자기 경험이라고 말하는 형태만** 잡는다 — 「다녀왔다」, 「직접 가봤더니」,
   * 「제가 갔는데」처럼 1인칭이 붙은 경우다.
   */
  const VISITOR_TONE = [
    /*
     * **「다녀온」 을 1인칭이 있을 때만 잡는다** (2026-08-13).
     *
     * 회원 지적: "정보글 유형이 맞는데 화자가 어긋났대. 왜 그런 거야?" 정보글이 본문의
     * 「다녀온」 하나로 즉시수정을 맞았다.
     *
     * 「다녀왔」은 대개 말하는 사람이 갔다는 뜻이지만, **「다녀온」은 뒤의 이름씨를 꾸미는
     * 꼴이라 대개 남의 이야기다** — 「병원에 다녀온 뒤에는」·「다녀온 회원님들 보면」. 둘 다
     * 센터가 정보글에서 쓰는 정상 문장이다. 낱말만 보고 잡으면 정상 글을 막는다.
     *
     * 이 검사에서 벌써 네 번째 오탐이다 (「남들 다 자는 새벽에 갔는데」 · 「저한테 물으시는」 ·
     * 「추천드려요」 · 이번). 그래서 앞선 것들과 같은 방식으로 **말하는 사람이 갔다는 표시**를
     * 요구한다. 「제가 다녀온 곳」은 그대로 걸리고, 「다녀온 분들은」은 통과한다.
     */
    {
      p: /(제가|저는|저도|직접)\s*[^.!?\n]{0,12}다녀(왔|온)|다녀왔(어요|습니다|는데|고)|가봤더니|(제가|저는|직접)\s*[^.!?\n]{0,12}(갔|가봤|가보니)/,
      label: '「다녀왔다」류 방문 서술',
    },
    /*
     * **「추천드려요」를 뺐다** (2026-08-07).
     *
     * 회원이 직접 쓴 홍보글이 이 항목에서 수정필요를 맞았다 — 「그다음 리니어 로우로
     * 넘어가는 순서를 추천드려요」. 센터가 운동 순서를 권하는 말이고, 방문자 말투가 아니다.
     *
     * 방문자 티가 나는 것은 **장소를 평가하며** 권하는 말이다 (「여기 추천드려요」).
     * 그래서 대상을 요구하도록 좁혔다. 이 검사에서 벌써 세 번째 오탐이라
     * (「남들 다 자는 새벽에 갔는데」 · 「저한테 물으시는」 · 이번), 낱말만 보면 안 된다.
     */
    { p: /괜찮더라고요|좋더라고요|만족했어요/, label: '방문자 감상 말투' },
    {
      p: /(헬스장|센터|지점|여기|이곳|이 곳)[^.!?\n]{0,12}추천드려요/,
      label: '장소를 평가하며 권하는 말투',
    },
    { p: /내돈내산|제 돈으로|직접 결제/, label: '「내돈내산」류' },
    { p: /등록했어요|등록하게 됐|상담받아보니/, label: '방문자 등록 서술' },
  ]
  const OWNER_TONE = [
    { p: /저희 (센터|지점|짐|헬스장)|우리 센터|우리 지점/, label: '소속 1인칭(「저희 센터」)' },
    { p: /오시면|방문해 주시|등록하시면|안내드립니다/, label: '센터가 손님을 부르는 말투' },
  ]
  /*
   * **걸린 말을 그대로 보여준다** (2026-08-10).
   *
   * 예전에는 「제목의 「후기」나 「다녀왔다」·「괜찮더라고요」는…」처럼 **패턴 목록**을 읊었다.
   * 회원이 유형을 홍보글로 바꿨는데 본문은 예전 후기글이 남아 있는 상태에서 이 배너를 보고
   * 「유형은 홍보글인데 왜 어긋났다고 하나」로 읽었다 — 무엇 때문인지 안 알려줬기 때문이다.
   * 이제 실제로 걸린 구절을 뽑아서 보여준다.
   */
  const matchOf = (re: RegExp, text: string) => text.match(re)?.[0]?.trim().slice(0, 24)
  if (input.type === 'review') {
    const found = OWNER_TONE.map((t) => ({ label: t.label, at: matchOf(t.p, prose) })).filter((x) => x.at)
    add({
      id: 'voice',
      group: '저품질 위험',
      label: '화자 (방문객이어야 합니다)',
      level: found.length ? 'fail' : 'pass',
      value: found.length ? found.map((f) => `「${f.at}」`).join(' · ') : '방문객 1인칭 유지',
      target: '센터 소속 1인칭을 쓰지 않습니다',
      hint: found.length
        ? `본문에 ${found.map((f) => `「${f.at}」(${f.label})`).join(' · ')} 가 있습니다. 후기글의 화자는 방문객이라 센터 말투로 새면 후기가 아니라 홍보글이 됩니다 — 유형을 「홍보글」로 바꾸거나 그 표현을 방문객 시점으로 고치세요.`
        : undefined,
      weight: 5,
    })
  } else {
    const titleAt = matchOf(/후기|내돈내산|체험단?/, title)
    const bodyFound = VISITOR_TONE.map((t) => ({ label: t.label, at: matchOf(t.p, prose) })).filter((x) => x.at)
    const found = [
      ...(titleAt ? [{ label: '제목', at: titleAt }] : []),
      ...bodyFound,
    ]
    add({
      id: 'voice',
      group: '저품질 위험',
      label: '화자 (센터여야 합니다)',
      level: found.length ? 'fail' : 'pass',
      value: found.length ? found.map((f) => `「${f.at}」`).join(' · ') : '센터 1인칭 유지',
      target: '방문자 말투·「후기」 표기를 쓰지 않습니다',
      hint: found.length
        ? `${titleAt ? `제목의 「${titleAt}」` : ''}${titleAt && bodyFound.length ? ' · ' : ''}${bodyFound
            .map((f) => `본문의 「${f.at}」`)
            .join(' · ')} 때문입니다. 이 글은 센터가 쓰는 글이라 겪지 않은 일을 겪은 것처럼 말하는 셈이 됩니다. 방문객 시점으로 쓰려면 유형을 「후기글」로 바꾸세요.`
        : undefined,
      weight: 5,
    })
  }

  const clichePatterns = [
    { p: /첫째[,.]|둘째[,.]|셋째[,.]/, label: '"첫째, 둘째" 나열' },
    { p: /바쁜\s*현대인|현대\s*사회에서|일상\s*속에서/, label: '상투적 도입' },
    { p: /무엇보다도|뿐만\s*아니라\s*또한/, label: '기계적 접속' },
    { p: /여러분[,!]/, label: '"여러분" 호칭' },
  ]
  const cliches = clichePatterns.filter((c) => c.p.test(prose)).map((c) => c.label)
  add({
    id: 'cliche',
    group: 'AI 티 제거',
    label: '금지 패턴',
    level: cliches.length ? 'warn' : 'pass',
    value: cliches.length ? cliches.join(', ') : '없음',
    target: '0건',
    hint: cliches.length ? '세 스킬 공통 금지 패턴입니다. 실제 상황·구체 디테일로 바꾸세요.' : undefined,
    weight: 2,
  })

  /*
   * ─── 관찰 반영 ───────────────────────────────────────────────
   *
   * 점수를 내기 **전에** 가중치를 관찰에 맞춰 고친다. 근거가 갈리거나 거꾸로 나온 항목은
   * 비중이 내려가고, 여러 관찰에서 뚜렷하게 유리했던 항목은 조금 올라간다.
   * 목표 수치는 건드리지 않는다 (evidence.ts 주석).
   */
  const ev = itemEvidence(
    input.evidence,
    Object.fromEntries(items.map((i) => [i.id, i.weight]))
  )
  for (const it of items) {
    const e = ev.get(it.id)
    if (!e) continue
    it.baseWeight = e.baseWeight
    it.weight = e.weight
    it.evidence = e.line
    it.evidenceVerdict = e.verdict
  }
  const evidenceNote = evidenceHeadline(ev, items.length)

  // ─── 점수 ───────────────────────────────────────────────────
  const weightSum = items.reduce((s, i) => s + i.weight, 0)
  const earned = items.reduce(
    (s, i) => s + i.weight * (i.level === 'pass' ? 1 : i.level === 'warn' ? 0.5 : 0),
    0
  )
  const raw = weightSum ? Math.round((earned / weightSum) * 100) : 0

  // "수정필요"가 하나라도 있으면 발행 가능 구간(85점)에 들어가지 못하게 상한을 둔다.
  // 항목 하나가 가중치의 일부일 뿐이어서, 캡이 없으면 하한 미달인 글이 89점처럼 보인다.
  const score = items.some((i) => i.level === 'fail') ? Math.min(raw, PUBLISH_THRESHOLD - 6) : raw

  return { score, items, risks, stats, evidenceNote }
}

/** 요약 뱃지용 */
export function summarize(result: CheckResult) {
  return {
    pass: result.items.filter((i) => i.level === 'pass').length,
    warn: result.items.filter((i) => i.level === 'warn').length,
    fail: result.items.filter((i) => i.level === 'fail').length,
  }
}

export { countOccurrences }
