import type { Post, PostType, Store } from '@/lib/types'

/**
 * 유사성 방지 로테이션.
 *
 * 같은 스킬로 여러 글을 쓰면 구조와 문구가 닮아간다. 네이버 유사문서 판정은
 * 문장 단위 중복을 보므로 지점명만 바꾼 비슷한 글이 쌓이면 블로그 전체가 함께 감점된다.
 * 여기서는 발행 기록을 보고 "이번엔 뭘 다르게 할지"를 계산한다.
 */

export const INTRO_TYPES = [
  '① 상담 문답형 — 상담에서 자주 듣는 질문으로 시작',
  '② 계절·시기형 — 지금 시기의 운동 고민으로 시작',
  '③ 질문형 — 독자에게 질문을 던지며 시작',
  '④ 상황 묘사형 — 타겟의 하루 한 장면으로 시작',
  '⑤ 운영 비하인드형 — "저희가 ○○를 이렇게 바꾼 이유"로 시작',
]

export const REVIEW_INTRO_TYPES = [
  '① 검색 시작형 — 등록처를 찾아보게 된 계기',
  '② 결심 계기형 — 작년 등록비를 날린 기억 등',
  '③ 비교형 — 몇 군데 알아보다가',
  '④ 우연형 — 지나가다 문이 열려 있어서',
  '⑤ 추천형 — 아는 사람 말을 듣고',
]

export const ANGLES = ['시간', '지속', '방법', '초보 진입장벽', '안심(여성전용)']

export const INFO_FORMATS = [
  '① 단계형 — 순서대로 정리 (1→2→3)',
  '② Q&A형 — 자주 받는 질문 3~4개에 답',
  '③ 오해 정정형 — "이거 잘못 알고 계신 분 많아요"',
  '④ 체크리스트형 — "이런 분이라면 ~하세요"',
  '⑤ 하루 루틴형 — 아침~저녁 시간대별',
]

export const TOPIC_GROUPS = [
  'A. 초보 진입 (헬스장 처음·기구 사용법·스트레칭·초보 루틴)',
  'B. 다이어트 (식단·정체기·공복 유산소·근손실·야식·칼로리)',
  'C. 부위별 운동법 (하체·등어깨·복근코어·힙업·자세)',
  'D. 시간·라이프스타일 (교대근무·새벽 vs 저녁·짧은 운동·습관)',
  'E. 건강습관·부상예방 (부상 예방·근육통·수면·워밍업)',
  'F. 계절·시기 (여름 전·새해·환절기·명절 후)',
]

export interface RotationAdvice {
  /** 이번 글에 권하는 조합 */
  introType?: string
  angle?: string
  format?: string
  topicGroup?: string
  mainKeywordCandidates: string[]
  warnings: string[]
  recentSummaries: string[]
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000))
}

/** 최근에 안 쓴 항목을 우선 추천 */
function leastRecentlyUsed(pool: string[], used: (string | undefined)[]): string | undefined {
  const usedSet = used.filter(Boolean) as string[]
  const unused = pool.filter((p) => !usedSet.includes(p))
  if (unused.length) return unused[0]
  // 전부 썼다면 가장 오래 전에 쓴 것 (used 는 최신순 배열)
  for (let i = usedSet.length - 1; i >= 0; i--) {
    if (pool.includes(usedSet[i])) return usedSet[i]
  }
  return pool[0]
}

export function adviseRotation(
  posts: Post[],
  storeId: string,
  type: PostType,
  store?: Store
): RotationAdvice {
  const warnings: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  const storePosts = posts
    .filter((p) => p.storeId === storeId)
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))

  const sameType = storePosts.filter((p) => p.type === type).slice(0, 6)

  // 발행 간격 — 같은 지점 글은 최소 2~3주 간격
  const lastSameStore = storePosts.find((p) => p.status === 'published' && p.publishedAt)
  if (lastSameStore?.publishedAt) {
    const gap = daysBetween(today, lastSameStore.publishedAt)
    if (gap < 14) {
      warnings.push(
        `${store?.name ?? '이 지점'} 글을 ${gap}일 전에 발행했습니다. 같은 지점 글은 최소 2~3주 간격을 두세요 (유사문서·자기잠식 위험).`
      )
    }
  }

  // 메인 키워드 재사용
  const recentKeywords = storePosts.slice(0, 5).map((p) => p.mainKeyword)
  const pool = store?.localKeywords ?? []
  const unusedKeywords = pool.filter((k) => !recentKeywords.includes(k))
  if (pool.length && !unusedKeywords.length) {
    warnings.push(
      '이 지점의 지역 키워드를 최근 글에서 모두 한 번씩 썼습니다. 세부 의도를 붙여 새 키워드를 만드세요 (예: "+ 새벽", "+ 여성전용", "+ 초보").'
    )
  }

  // 소제목 재사용
  const recentHeadings = new Set<string>()
  for (const p of storePosts.slice(0, 5)) {
    for (const m of p.body.matchAll(/^\s*##+\s*(.+)$/gm)) recentHeadings.add(m[1].trim())
  }

  const introPool = type === 'review' ? REVIEW_INTRO_TYPES : INTRO_TYPES
  const advice: RotationAdvice = {
    mainKeywordCandidates: unusedKeywords.length ? unusedKeywords : pool,
    warnings,
    recentSummaries: storePosts.slice(0, 5).map(summarizePost),
  }

  if (type === 'info') {
    advice.format = leastRecentlyUsed(INFO_FORMATS, sameType.map((p) => p.format))
    advice.topicGroup = leastRecentlyUsed(TOPIC_GROUPS, sameType.map((p) => p.topicGroup))
  } else {
    advice.introType = leastRecentlyUsed(introPool, sameType.map((p) => p.introType))
    const anglePool = store?.womenOnly ? ANGLES : ANGLES.filter((a) => !a.startsWith('안심'))
    advice.angle = leastRecentlyUsed(anglePool, sameType.map((p) => p.angle))
  }

  return advice
}

export function summarizePost(p: Post): string {
  const date = (p.publishedAt ?? p.createdAt).slice(0, 10)
  const bits = [date, `[${labelOf(p.type)}]`, p.mainKeyword]
  if (p.introType) bits.push(`도입${p.introType.slice(0, 2)}`)
  if (p.angle) bits.push(`앵글:${p.angle}`)
  if (p.format) bits.push(`형식${p.format.slice(0, 2)}`)
  if (p.topicGroup) bits.push(`소재${p.topicGroup.slice(0, 1)}`)
  return bits.join(' | ')
}

function labelOf(t: PostType): string {
  return t === 'promo' ? '홍보글' : t === 'info' ? '정보글' : '후기글'
}

/**
 * 정보글:홍보글 ≈ 2:1 균형 점검.
 * 홍보글만 연속 발행하면 상업성 과다 신호가 되고, 정보글이 키운 신뢰도를 홍보글이 수확하는 구조가 깨진다.
 */
export interface BalanceReport {
  info: number
  promo: number
  review: number
  ratio: string
  /** 다음에 쓰면 좋은 유형 */
  next: PostType
  message: string
  level: 'good' | 'warn' | 'bad'
}

export function balanceReport(posts: Post[], window = 12): BalanceReport {
  const recent = posts
    .filter((p) => p.status === 'published')
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
    .slice(0, window)

  const info = recent.filter((p) => p.type === 'info').length
  // 후기글도 독자 입장에서는 상업 문서로 읽힌다 — 홍보 쪽에 함께 센다.
  const promo = recent.filter((p) => p.type === 'promo').length
  const review = recent.filter((p) => p.type === 'review').length
  const commercial = promo + review

  if (!recent.length) {
    return {
      info,
      promo,
      review,
      ratio: '0 : 0',
      next: 'info',
      message: '발행 기록이 없습니다. 정보글 2편으로 블로그 주제 신뢰도(C-Rank)를 먼저 쌓는 걸 권합니다.',
      level: 'warn',
    }
  }

  const ratio = commercial > 0 ? info / commercial : info
  const consecutiveCommercial = countLeading(recent, (p) => p.type !== 'info')

  if (consecutiveCommercial >= 2) {
    return {
      info,
      promo,
      review,
      ratio: `${info} : ${commercial}`,
      next: 'info',
      message: `홍보·후기글이 ${consecutiveCommercial}편 연속입니다. 상업성 과다 신호가 쌓이기 전에 다음 글은 정보글로 가세요.`,
      level: 'bad',
    }
  }

  if (ratio < 1.4) {
    return {
      info,
      promo,
      review,
      ratio: `${info} : ${commercial}`,
      next: 'info',
      message: `최근 ${recent.length}편 기준 정보:홍보 = ${info}:${commercial}. 권장 비율 2:1에 못 미칩니다. 정보글을 더 쌓으세요.`,
      level: 'warn',
    }
  }

  if (ratio > 3.5) {
    return {
      info,
      promo,
      review,
      ratio: `${info} : ${commercial}`,
      next: 'promo',
      message: `정보글이 충분히 쌓였습니다(${info}:${commercial}). 이 신뢰도를 수확할 홍보글을 낼 시점입니다.`,
      level: 'good',
    }
  }

  return {
    info,
    promo,
    review,
    ratio: `${info} : ${commercial}`,
    next: 'promo',
    message: `정보:홍보 = ${info}:${commercial} — 권장 비율(2:1) 안입니다. 홍보글을 내도 좋습니다.`,
    level: 'good',
  }
}

function countLeading<T>(arr: T[], pred: (x: T) => boolean): number {
  let n = 0
  for (const x of arr) {
    if (!pred(x)) break
    n++
  }
  return n
}

/** 주 2~3회 발행 주기 점검 */
/**
 * 지점별 마지막 발행 — 최신성이 관찰에서 가장 센 신호였기 때문에 따로 본다.
 *
 * 실측 (관찰소 6회, 상위 글 60편): **최신성 +0.63, 6회 중 5회 유리, 거꾸로 0회.**
 * 다른 어떤 신호보다 강했다 (정보 +0.36 · 영상 +0.26 · 이미지 0.00). 그래서 「무엇을
 * 쓸까」보다 「언제 쓸까」가 먼저인 경우가 많다 — 완벽한 글 한 편보다 꾸준한 발행이 낫다.
 *
 * cadenceReport 와 다른 것을 본다. 그쪽은 회사 전체 페이스이고, 이쪽은 **지점별로
 * 어느 블로그가 식었는지**다. 지점이 넷이면 전체 페이스가 좋아도 한 지점은 3주째
 * 비어 있을 수 있다.
 */
export const STALE_DAYS = 10

export interface StoreFreshness {
  storeId: string
  storeName: string
  /** 마지막 발행일 (YYYY-MM-DD). null = 발행한 글이 없다 */
  lastPublished: string | null
  /** 며칠 지났나. null = 발행한 글이 없다 */
  days: number | null
  stale: boolean
  message: string
}

export function freshnessReport(
  posts: Post[],
  stores: { id: string; name: string }[],
  now = Date.now()
): StoreFreshness[] {
  return stores
    .map((st) => {
      const dates = posts
        .filter((p) => p.storeId === st.id && p.status === 'published' && p.publishedAt)
        .map((p) => p.publishedAt as string)
        .sort()
      const last = dates.length ? dates[dates.length - 1] : null
      const days = last ? Math.floor((now - Date.parse(last)) / 86400000) : null
      const stale = days === null || days >= STALE_DAYS
      const message =
        days === null
          ? `${st.name}은 아직 발행한 글이 없습니다. 최신성이 관찰에서 가장 센 신호였으니(6회 중 5회 유리) 첫 글부터가 곧 순위입니다.`
          : days >= STALE_DAYS
            ? `${st.name} 마지막 발행이 ${days}일 전입니다. 최신성은 관찰 6회에서 거꾸로 나온 적이 한 번도 없는 신호입니다 — 완벽한 글을 기다리기보다 한 편 올리는 편이 낫습니다.`
            : `${st.name} ${days}일 전 발행 — 최신성은 지금 괜찮습니다.`
      return { storeId: st.id, storeName: st.name, lastPublished: last, days, stale, message }
    })
    // 오래 비어 있는 지점부터
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
}

export function cadenceReport(posts: Post[]): { last14: number; message: string; level: 'good' | 'warn' | 'bad' } {
  const now = Date.now()
  const published = posts.filter((p) => p.status === 'published' && p.publishedAt)
  const last14 = published.filter(
    (p) => now - new Date(p.publishedAt!).getTime() <= 14 * 86400000
  ).length

  if (last14 === 0) {
    return { last14, message: '최근 2주간 발행이 없습니다. 주 2~3회 꾸준함이 C-Rank의 기본입니다.', level: 'bad' }
  }
  if (last14 < 4) {
    return { last14, message: `최근 2주 ${last14}편. 주 2~3회(2주 4~6편) 페이스를 맞춰보세요.`, level: 'warn' }
  }
  if (last14 > 8) {
    return { last14, message: `최근 2주 ${last14}편 — 몰아서 대량 발행은 역효과입니다. 간격을 벌리세요.`, level: 'warn' }
  }
  return { last14, message: `최근 2주 ${last14}편 — 권장 페이스(주 2~3회)입니다.`, level: 'good' }
}
