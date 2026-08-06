import { contentBalance, INFO_MIN_BY_TYPE, PROMO_MAX_BY_TYPE } from '../analysis/content'
import { TITLE_SHAPE_LABEL, titleAdvice, titleShape } from '../analysis/title'
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
  womenOnly?: boolean
  sponsorship?: Sponsorship
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
   * 회원 지시로 2회를 목표로 잡았다. 밀도로는 안전하다 — 메인 5회 + 서브 2개×2회 =
   * 합산 2.1~2.5%(1,915자에서 2.3%)로 스터핑 구간이 아니다.
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
  // gym-info-writer: 정보 메인 3~5회, 지역 키워드 1~2회, 2,000~2,500자
  info: {
    mainMin: 3,
    mainMax: 5,
    densityMax: 1.8,
    charMin: 1900,
    charMax: 2600,
    legalNameMin: 0,
    requireLocalKeyword: true,
    requireReviewWord: false,
  },
  // gym-review-writer: 메인 3~5회, 밀도 1~1.5%, 제목에 "후기" 명시
  review: {
    mainMin: 3,
    mainMax: 5,
    densityMax: 1.5,
    charMin: 1900,
    charMax: 2100,
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
  headings: string[]
  images: string[]
  /** 영상 자리 설명 */
  videos: string[]
  /** 각 소제목 바로 위에 이미지가 있는지 */
  headingsWithImageAbove: number
  /** 소제목 없이 본문만 있는 도입부 */
  intro: string
}

export function parseBody(body: string): ParsedBody {
  const lines = body.split(/\r?\n/)
  const headings: string[] = []
  const images: string[] = []
  const videos: string[] = []
  const proseLines: string[] = []
  let headingsWithImageAbove = 0
  let lastMeaningful: 'image' | 'heading' | 'prose' | null = null
  let sawHeading = false
  const introLines: string[] = []

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
      headings.push(h[1])
      if (lastMeaningful === 'image') headingsWithImageAbove++
      lastMeaningful = 'heading'
      sawHeading = true
      continue
    }

    proseLines.push(trimmed)
    if (!sawHeading) introLines.push(trimmed)
    lastMeaningful = 'prose'
  }

  return {
    prose: proseLines.join('\n'),
    headings,
    images,
    videos,
    headingsWithImageAbove,
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

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

function endingOf(sentence: string): string {
  const s = sentence.replace(/[.!?…\s]+$/, '')
  if (/습니다$|입니다$|됩니다$|립니다$|십니다$/.test(s)) return '~습니다'
  if (/어요$|아요$|에요$|예요$|해요$|세요$|요$/.test(s)) return '~요'
  if (/거든요$/.test(s)) return '~거든요'
  if (/죠$|지요$/.test(s)) return '~죠'
  if (/다$|였다$|었다$/.test(s)) return '~다'
  if (/[가-힣]$/.test(s)) return '명사형'
  return '기타'
}

export function checkPost(input: CheckInput): CheckResult {
  const spec = SPECS[input.type]
  const parsed = parseBody(input.body)
  const title = input.title.trim()
  const main = input.mainKeyword.trim()
  const subs = input.subKeywords.map((s) => s.trim()).filter(Boolean)

  // 검수 대상 텍스트 = 제목 + 본문 산문 (이미지 지시문·해시태그 제외)
  const prose = parsed.prose
  const scanText = `${title}\n${prose}`
  const charCount = prose.replace(/\n/g, '').length

  const mainInTitle = main ? countLoose(title, main) : 0
  const mainInProse = main ? countLoose(prose, main) : 0
  const mainKeywordCount = mainInTitle + mainInProse
  const density =
    charCount > 0 && main
      ? Math.round(((main.replace(/\s+/g, '').length * mainInProse) / charCount) * 1000) / 10
      : 0

  const positions = keywordPositions(prose, main)
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
    target: `${spec.charMin.toLocaleString()}~${spec.charMax.toLocaleString()}자 (근거 약함)`,
    hint:
      charCount < spec.charMin
        ? '너무 짧으면 쓸 내용이 없다는 뜻이라 채우는 게 좋습니다. 다만 실측에서는 분량이 순위와 반대로 갔습니다 (1위 2,197자 · 2위 1,422자 · 4위 2,568자) — 늘리려고 말을 늘리지는 마세요.'
        : charCount > spec.charMax
          ? '길다고 감점되지는 않습니다. 실측에서도 분량은 순위를 가르지 않았습니다 — 늘어지는지만 보세요.'
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
    level: level(
      parsed.headings.length >= 4 && parsed.headings.length <= 5,
      parsed.headings.length >= 3 && parsed.headings.length <= 6
    ),
    value: `${parsed.headings.length}개`,
    target: '4~5개',
    hint: '소제목은 스캔 가능성 = 체류시간입니다. `## 소제목` 형식으로 적으세요.',
    weight: 2,
  })

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
      target: `${spec.legalNameMin}회 이상 (후킹·본문 중반·CTA)`,
      hint:
        legalNameCount < spec.legalNameMin
          ? '상호를 모르면 독자가 검색도 방문도 못 합니다. 메인 키워드 횟수와는 별개로 세는 항목입니다.'
          : undefined,
      weight: 4,
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
      const hasDisclosure =
        flatTags.some((t) => /협찬|광고|체험단|제공받/.test(t)) ||
        /협찬|무료로\s*제공|지원받아|대가를\s*받/.test(prose)
      add({
        id: 'sponsorship',
        group: '이미지·태그',
        label: '대가성(협찬) 표기',
        level: hasDisclosure ? 'pass' : 'fail',
        value: hasDisclosure ? '표기됨' : '표기 없음',
        target: '#협찬후기 또는 #광고 + 본문 명시',
        hint: hasDisclosure
          ? undefined
          : '대가를 받은 후기에서 표기 누락은 표시광고법 위반입니다. 태그와 본문 모두에 밝히세요.',
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
   * 상위 글 11편을 실제로 세보고 넣은 두 항목이다 (content.ts 주석).
   *   1~3위 평균: 정보 5.2종류 · 홍보 2.0종류
   *   4위 이하  : 정보 3.6종류 · 홍보 3.8종류
   * 정보가 모자란 것과 홍보가 과한 것은 고칠 방법이 달라서(더하기 / 덜어내기)
   * 한 항목으로 묶지 않고 따로 낸다.
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
        : `${infoMin}종류 이상 (상위 1~3위 평균 5.2)`,
    hint: balance.level === 'thin' || balance.level === 'both' ? balance.infoNote : undefined,
    weight: 4,
  })
  add({
    id: 'promo-restraint',
    group: '내용 균형',
    label: '홍보 표현 절제',
    level: level(balance.signals.promo <= promoMax, balance.signals.promo <= promoMax + 2),
    value: `${balance.signals.promo}종류`,
    target: `${promoMax}종류 이하 (상위 1~3위 평균 2.0)`,
    hint: balance.level === 'pushy' || balance.level === 'both' ? balance.promoNote : undefined,
    weight: 3,
  })

  // ─── 저품질 위험 ─────────────────────────────────────────────
  add({
    id: 'phone',
    group: '저품질 위험',
    label: '전화번호 노출',
    level: level(phoneCount <= 1, phoneCount <= 2),
    value: `${phoneCount}회`,
    target: input.type === 'promo' ? 'CTA에 1회' : '0~1회',
    hint: phoneCount > 1 ? '전화번호 도배는 상업성 과다 신호입니다.' : undefined,
    weight: 2,
  })

  add({
    id: 'links',
    group: '저품질 위험',
    label: '외부 링크',
    level: level(linkCount <= 2, linkCount <= 3),
    value: `${linkCount}개`,
    target: '1~2개 (예약 링크 포함)',
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
  const formalRate = Math.round(((sentenceEndings['~습니다'] ?? 0) / total) * 100)
  add({
    id: 'endings',
    group: 'AI 티 제거',
    label: '어미 다양성',
    level: level(formalRate <= 65, formalRate <= 80),
    value: `"~습니다" ${formalRate}%`,
    target: '65% 이하',
    hint:
      formalRate > 65
        ? '"~요", "~거든요", 짧은 명사형 마침을 사이사이에 섞으세요. 한 어미만 연속되면 기계 냄새가 납니다.'
        : undefined,
    weight: 2,
  })

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
