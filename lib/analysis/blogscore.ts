import type { RssItem } from '../naver/blogrss'

/**
 * 블로그 성격 판별 + 대리 지수.
 *
 * **네이버 블로그 지수는 공개되지 않는다.** C-Rank·D.I.A. 점수를 읽는 공식 경로는
 * 없고, 서드파티 서비스들이 내놓는 숫자도 전부 자기 추정치다. 그래서 여기서 내는
 * 값도 **추정 대리 지표**다 — 화면에서도 그렇게 밝힌다. 대신 무엇으로 계산했는지를
 * 항목별로 다 보여줘서, 숫자를 믿는 대신 근거를 보게 한다.
 *
 * 무엇을 대리 지표로 쓰나. C-Rank 가 실제로 보는 축 중 **밖에서 관찰 가능한 것**만 쓴다.
 *  · 꾸준함   — 발행이 끊기지 않는지 (네이버는 방치된 블로그를 밀어낸다)
 *  · 전문성   — 한 주제에 집중돼 있는지 (C-Rank 의 핵심축이다)
 *  · 최신성   — 마지막 글이 얼마나 최근인지
 *  · 노출력   — 실제로 상위에 걸리는지 (표본 조회로 따로 잰다)
 *
 * 이웃 수·방문자 수는 여기 넣지 않는다 — 규모와 검색 노출은 다른 축이라 activity.ts 에서
 * 따로 잰다 (2026-08-11 이후로는 밖에서 읽을 수 있다). 여기서 못 재는 것을
 * 추측해 점수에 섞으면 숫자 전체가 거짓이 된다.
 */

export type BloggerKind =
  /** 업체 본인 블로그 — 카테고리가 자기 상호·시설·이벤트로 짜여 있다 */
  | 'owner'
  /** 리뷰 전문 — 카테고리가 리뷰·체험으로만 되어 있다 */
  | 'reviewer'
  /** 잡식 — 여러 업종 리뷰가 섞여 있다 (체험단·대행 성격) */
  | 'mixed'
  /** 한 주제에 집중된 일반 블로그 */
  | 'topical'
  | 'unknown'

export const KIND_LABEL: Record<BloggerKind, string> = {
  owner: '업체 본인 블로그',
  reviewer: '리뷰 전문 블로그',
  mixed: '잡식 리뷰 블로그',
  topical: '주제 집중 블로그',
  unknown: '판정 불가',
}

/** 카테고리 이름에 들어가면 리뷰·체험 성격으로 보는 말 */
const REVIEW_WORDS = ['리뷰', '체험', '협찬', '광고', '내돈내산', '후기', '먹방', '탐방']

/** 업체 본인 블로그의 카테고리에 흔히 쓰이는 말 */
const OWNER_WORDS = ['이벤트', '공지', '시설', '오시는', '가격', '회원권', '수업', '프로그램', '센터소개', '지점']

/** 헬스·운동 주제로 보는 말 (우리 업종 비중을 재려고) */
const GYM_WORDS = ['헬스', '피트니스', '운동', 'PT', '다이어트', '건강', '바디', '트레이닝', '짐']

/** 서로 다른 업종으로 보는 묶음 — 이게 여러 개면 잡식이다 */
const TRADE_GROUPS: { name: string; words: string[] }[] = [
  { name: '운동·건강', words: GYM_WORDS },
  { name: '맛집·카페', words: ['맛집', '카페', '먹거리', '음식', '디저트', '베이커리', '술집'] },
  { name: '여행', words: ['여행', '호텔', '숙소', '펜션', '캠핑', '관광'] },
  { name: '뷰티', words: ['뷰티', '화장품', '피부', '네일', '헤어', '미용'] },
  { name: '육아·가족', words: ['육아', '아이', '엄마', '출산', '유아'] },
  { name: '생활·가전', words: ['가전', '가구', '인테리어', '생활', '리빙', '가방', '패션', '의류'] },
  { name: '병원·의료', words: ['병원', '의원', '치과', '한의원', '교정', '시술'] },
]

const has = (text: string, words: string[]) => words.some((w) => text.includes(w))

export interface ScorePart {
  label: string
  value: number
  max: number
  note: string
}

export interface BlogProfile {
  blogId: string
  blogName: string
  /** RSS 로 본 글 수 (최대 50) */
  sampled: number
  /** 최근 30일 발행 수 */
  last30: number
  /** 최근 7일 발행 수 */
  last7: number
  /** 글 사이 평균 간격(일) */
  avgGapDays: number
  /** 마지막 글로부터 지난 날 */
  daysSinceLast: number
  categories: { name: string; count: number }[]
  /** 최상위 카테고리 비율(%) */
  topShare: number
  /**
   * 가장 큰 업종의 비율(%) — 진짜 주제 집중도.
   *
   * 카테고리 이름만 보면 속는다. "각종리뷰" 한 칸에 7개 업종을 몰아넣은 블로그가
   * 집중도 100% 로 잡혀 만점이 나왔다. 글 내용으로 업종을 갈라 다시 센다.
   */
  topTradeShare: number
  /** 우리 업종(헬스·운동) 글 비율(%) */
  gymShare: number
  /** 섞여 있는 업종 묶음 */
  tradeGroups: string[]
  kind: BloggerKind
  kindReason: string
  /** 추정 대리 지수 (네이버 공식 값이 아니다) */
  score: number
  scoreParts: ScorePart[]
}

function daysBetween(a: string, b: string): number {
  const t1 = Date.parse(`${a}T00:00:00Z`)
  const t2 = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0
  return Math.abs(Math.round((t1 - t2) / 86400000))
}

/**
 * 이 블로그가 어떤 블로그인지 (순수 함수 — 테스트 대상).
 *
 * 판정은 **추정**이다. "돈을 받았다" 를 단정할 수 없고, 대가성 표기가 없어도 광고일
 * 수 있다. 그래서 근거(카테고리 구성)를 항상 함께 돌려준다.
 */
export function classifyBlogger(
  categories: { name: string; count: number }[],
  opts: { topShare: number; tradeGroups: string[]; myNames?: string[] } = { topShare: 0, tradeGroups: [] }
): { kind: BloggerKind; reason: string } {
  if (!categories.length) return { kind: 'unknown', reason: '카테고리를 읽지 못했습니다.' }

  const names = categories.map((c) => c.name).join(' ')
  const top = categories[0]

  // 카테고리 이름이 상호처럼 쓰이고 이벤트·시설 같은 말이 함께 있으면 업체 본인 블로그
  const ownerish = has(names, OWNER_WORDS)
  const brandTop = /짐|GYM|피트니스|휘트니스|센터|클럽|스튜디오|점$/i.test(top.name.trim())
  if (ownerish && brandTop) {
    return {
      kind: 'owner',
      reason: `카테고리가 "${top.name.trim()}"·이벤트·시설 같은 구성입니다 — 업체가 직접 운영하는 블로그로 보입니다. 즉 경쟁 업체입니다.`,
    }
  }

  if (opts.tradeGroups.length >= 3) {
    return {
      kind: 'mixed',
      reason: `최근 글이 ${opts.tradeGroups.slice(0, 4).join('·')} 등 ${opts.tradeGroups.length}개 업종에 걸쳐 있습니다 — 업종을 옮겨 다니며 리뷰를 쓰는 블로그(체험단·대행 성격)로 보입니다.`,
    }
  }

  if (has(names, REVIEW_WORDS)) {
    return {
      kind: 'reviewer',
      reason: `카테고리가 "${top.name.trim()}" 처럼 리뷰·체험으로만 짜여 있습니다 — 리뷰를 주로 쓰는 블로그로 보입니다.`,
    }
  }

  if (opts.topShare >= 50) {
    return {
      kind: 'topical',
      reason: `글의 ${opts.topShare}%가 "${top.name.trim()}" 한 주제입니다 — 주제가 집중된 블로그입니다 (C-Rank 에 유리한 형태).`,
    }
  }

  return {
    kind: 'unknown',
    reason: `카테고리가 ${categories.length}종으로 흩어져 있어 성격을 단정하기 어렵습니다.`,
  }
}

/**
 * RSS 글 목록으로 블로그 프로필을 만든다 (순수 함수 — 테스트 대상).
 * today 를 받는 이유는 테스트를 날짜에 묶지 않기 위해서다.
 */
export function buildBlogProfile(
  input: { blogId: string; blogName: string; items: RssItem[] },
  today: string = new Date().toISOString().slice(0, 10),
  /** 표본 조회로 잰 상위노출 성공률(%) — 안 재면 undefined */
  exposureRate?: number
): BlogProfile {
  const items = input.items.filter((i) => i.date)
  const dates = items.map((i) => i.date).sort((a, b) => b.localeCompare(a))

  const last30 = dates.filter((d) => daysBetween(today, d) <= 30).length
  const last7 = dates.filter((d) => daysBetween(today, d) <= 7).length
  const daysSinceLast = dates.length ? daysBetween(today, dates[0]) : 999

  const span = dates.length >= 2 ? daysBetween(dates[0], dates[dates.length - 1]) : 0
  const avgGapDays = dates.length >= 2 ? Math.round((span / (dates.length - 1)) * 10) / 10 : 0

  const counts = new Map<string, number>()
  for (const i of input.items) {
    const name = i.category.trim() || '(분류 없음)'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const categories = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const total = input.items.length || 1
  const topShare = Math.round(((categories[0]?.count ?? 0) / total) * 100)

  // 업종 판정은 카테고리 이름과 제목을 함께 본다 (카테고리를 안 쓰는 블로그가 있다)
  const blob = input.items.map((i) => `${i.category} ${i.title}`).join(' ')
  const tradeGroups = TRADE_GROUPS.filter((g) => has(blob, g.words)).map((g) => g.name)
  const gymCount = input.items.filter((i) => has(`${i.category} ${i.title}`, GYM_WORDS)).length
  const gymShare = Math.round((gymCount / total) * 100)

  // 글마다 업종을 하나 붙여 가장 큰 업종의 비율을 낸다 (카테고리 이름에 속지 않게)
  const tradeCount = new Map<string, number>()
  for (const i of input.items) {
    const text = `${i.category} ${i.title}`
    const g = TRADE_GROUPS.find((x) => has(text, x.words))
    const key = g?.name ?? '(기타)'
    tradeCount.set(key, (tradeCount.get(key) ?? 0) + 1)
  }
  const topTrade = Array.from(tradeCount.values()).sort((a, b) => b - a)[0] ?? 0
  const topTradeShare = Math.round((topTrade / total) * 100)

  const { kind, reason } = classifyBlogger(categories, { topShare, tradeGroups })

  // ── 대리 지수 ────────────────────────────────────────
  const parts: ScorePart[] = [
    {
      label: '꾸준함',
      value: Math.min(30, Math.round((last30 / 12) * 30)),
      max: 30,
      note: `최근 30일 ${last30}편 (12편이면 만점)`,
    },
    {
      label: '주제 집중도',
      // 카테고리 비율이 아니라 **업종 비율**로 잰다 (아래 topTradeShare 주석 참고)
      value: Math.min(30, Math.round((topTradeShare / 70) * 30)),
      max: 30,
      note: `가장 큰 업종이 ${topTradeShare}% (70%면 만점) — C-Rank 의 핵심축${
        topShare > topTradeShare + 15
          ? `. 카테고리로는 ${topShare}% 로 보이지만 글 내용은 ${tradeGroups.length}개 업종에 걸쳐 있습니다`
          : ''
      }`,
    },
    {
      label: '최신성',
      value: daysSinceLast <= 2 ? 20 : daysSinceLast <= 7 ? 14 : daysSinceLast <= 30 ? 7 : 0,
      max: 20,
      note: daysSinceLast >= 999 ? '발행일을 읽지 못했습니다' : `마지막 글 ${daysSinceLast}일 전`,
    },
  ]
  if (typeof exposureRate === 'number') {
    parts.push({
      label: '노출력',
      value: Math.round((exposureRate / 100) * 20),
      max: 20,
      note: `표본 글이 상위 30위 안에 걸린 비율 ${exposureRate}%`,
    })
  }

  const got = parts.reduce((s, p) => s + p.value, 0)
  const max = parts.reduce((s, p) => s + p.max, 0)
  const score = Math.round((got / (max || 1)) * 100)

  return {
    blogId: input.blogId,
    blogName: input.blogName,
    sampled: input.items.length,
    last30,
    last7,
    avgGapDays,
    daysSinceLast,
    categories: categories.slice(0, 8),
    topShare,
    topTradeShare,
    gymShare,
    tradeGroups,
    kind,
    kindReason: reason,
    score,
    scoreParts: parts,
  }
}

/**
 * 제목에서 검색어를 만든다 (순수 함수 — 테스트 대상).
 *
 * 블로그 제목은 보통 "천안 쌍용동 헬스장 미녀와야수짐 …" 처럼 노리는 키워드를 앞에
 * 둔다. 그래서 앞쪽 낱말 세 개를 검색어로 쓰면 그 글이 노린 키워드에 가깝다.
 */
export function queryFromTitle(title: string): string {
  const words = (title ?? '')
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
  return words.slice(0, 3).join(' ')
}

/**
 * 업계에서 말하는 「최적 / 준최 / 저품질」 — 흉내낸 추정 등급.
 *
 * **네이버가 만든 등급이 아니다.** 이 말들은 블로그 마케팅 업계의 은어이고, 네이버는
 * 그런 등급을 발표한 적이 없다. 시중 도구들이 붙이는 등급도 결국 자기 추정치다.
 * 그래서 우리도 같은 이름을 쓰되, **무엇으로 그렇게 판정했는지 표본을 다 보여준다.**
 *
 * ── 이름과 방향을 업계 표기에 맞췄다 (2026-08-11) ─────────────────
 * 회원이 우리 진단(「최적 3」)과 시중 도구(「준최 · 44/100」)를 나란히 놓고 물었다.
 * 우리 쪽 이름이 **업계와 반대 방향**이었다. 업계 표기는
 *
 *     저품질 < 일반 < 준최 1 … 준최 7 < 최적 1 < 최적 2 < 최적 3
 *
 * 로 **숫자가 커질수록 강하다.** 우리는 「최적 1 이 최상단」으로 썼으니, 같은 말이
 * 정반대를 뜻했다. 회원이 두 화면을 비교할 수 없는 상태였다 — 그래서 뒤집었다.
 *
 * ── 칸 폭은 공개된 실제 분포에 맞췄다 ────────────────────────────
 * 시중 통계에 따르면 등급 분포가 크게 치우쳐 있다: 최적 6.1%, 준최 2 가 혼자 61.3%,
 * 저품질 2.0%. 즉 **보통 블로그는 준최 2 다.** 우리 옛 기준은 30위 안 70%면 최적을
 * 줬는데, 그러면 6%짜리 칸에 회원 블로그가 들어간다. 그래서 준최 2 칸을 가장 넓게
 * 두고(점수 25~44), 최적은 「경쟁 있는 검색어에서 대부분 1페이지」일 때만 준다.
 *
 * ── 세 축 ────────────────────────────────────────────────────
 *  1) **색인** — 제목 완전일치로 검색했을 때 그 글이 나오는지. 안 나오면 검색에서
 *     빠진 것이다(업계에서 말하는 "저품질" 의 실체). 순위가 낮은 것과는 다른 문제다.
 *  2) **30위 안 진입** — 제목 앞부분을 검색어로 써서 30위 안에 걸리는지.
 *  3) **1페이지 진입** — 그중 10위 안에 걸리는지. 30위에 겨우 걸리는 블로그와
 *     1페이지를 먹는 블로그를 갈라야 최적과 준최이 갈린다.
 *
 * 2·3 은 **검색어 경쟁 강도로 가중한다** (competitionOf 주석 참고). 쉬운 검색어에서
 * 1위 하는 것으로는 최적을 증명할 수 없다.
 */
export type BlogGrade =
  | 'optimal3'
  | 'optimal2'
  | 'optimal1'
  | 'semi7'
  | 'semi6'
  | 'semi5'
  | 'semi4'
  | 'semi3'
  | 'semi2'
  | 'semi1'
  | 'normal'
  | 'dropped'
  | 'unknown'

export const GRADE_LABEL: Record<BlogGrade, string> = {
  optimal3: '최적 3',
  optimal2: '최적 2',
  optimal1: '최적 1',
  semi7: '준최 7',
  semi6: '준최 6',
  semi5: '준최 5',
  semi4: '준최 4',
  semi3: '준최 3',
  semi2: '준최 2',
  semi1: '준최 1',
  normal: '일반',
  dropped: '저품질 의심',
  unknown: '판정 불가',
}

/**
 * 강한 것부터 약한 것 순서 — 화면에서 사다리로 보여준다.
 * 업계 표기대로 **숫자가 클수록 강하다** (최적 3 > 최적 2 > 최적 1 > 준최 7 > …).
 */
export const GRADE_LADDER: BlogGrade[] = [
  'optimal3',
  'optimal2',
  'optimal1',
  'semi7',
  'semi6',
  'semi5',
  'semi4',
  'semi3',
  'semi2',
  'semi1',
  'normal',
  'dropped',
]

/** 시중에 공개된 등급 분포(참고용) — 화면에서 「내 칸이 어디쯤인지」 보여줄 때 쓴다 */
export const GRADE_SHARE: Partial<Record<BlogGrade, number>> = {
  optimal3: 6.1,
  optimal2: 6.1,
  optimal1: 6.1,
  semi7: 3.8,
  semi6: 5.6,
  semi5: 7.8,
  semi4: 7.8,
  semi3: 5.2,
  semi2: 61.3,
  dropped: 2.0,
}

// ─── 검색어 경쟁 강도 ─────────────────────────────────────────

/**
 * 이 검색어가 얼마나 센 자리인가.
 *
 * **이게 없으면 등급이 부풀었다.** 회원 블로그의 실제 제목으로 재보니 표본마다
 * 경쟁이 완전히 달랐다:
 *
 *   천안 신방동 맛집                     1,000편 이상   ← 진짜 경쟁 키워드
 *   천안 생선구이 뭔맛집                    410편
 *   천안 성심호수공원마당 백년한방활산채탕       0편        ← 사실상 그 글 하나
 *
 * 0편짜리는 아예 뺐지만(isTrivialQuery), 30~300편짜리도 1,000편짜리와 같은 값으로
 * 세면 안 된다. 그래서 **성공 크레딧에만 가중치를 준다** — 쉬운 검색어에서만 걸리는
 * 블로그는 가중 점수가 절반 아래로 묶여 최적 칸에 못 들어간다.
 */
export type Competition = 'high' | 'mid' | 'low' | 'none' | 'unknown'

export const COMPETITION_LABEL: Record<Competition, string> = {
  high: '경쟁 강함',
  mid: '경쟁 보통',
  low: '경쟁 약함',
  none: '경쟁 없음',
  unknown: '못 잼',
}

/** 성공 한 건이 몇 점어치인가 (경쟁 없음은 표본에서 아예 뺀다) */
export const COMPETITION_WEIGHT: Record<Competition, number> = {
  high: 1,
  mid: 0.75,
  low: 0.45,
  none: 0,
  /** 발행량을 못 읽은 표본은 「보통」으로 놓는다 — 못 읽은 것을 유리하게도 불리하게도 안 쓴다 */
  unknown: 0.75,
}

/** 「경쟁 없음」의 경계 — blogsection.ts 의 TRIVIAL_QUERY_MAX 와 같은 값을 쓴다 */
export const COMPETITION_LOW = 30
export const COMPETITION_MID = 300
export const COMPETITION_HIGH = 1000

export function competitionOf(total: number | null | undefined): Competition {
  if (typeof total !== 'number') return 'unknown'
  if (total < COMPETITION_LOW) return 'none'
  if (total < COMPETITION_MID) return 'low'
  if (total < COMPETITION_HIGH) return 'mid'
  return 'high'
}

export interface ExposureMeasure {
  /** 경쟁이 있어서 계산에 쓴 표본 수 */
  real: number
  /** 경쟁이 없어서 뺀 표본 수 */
  trivial: number
  /** 30위 안에 걸린 비율(%) — 있는 그대로 (화면에 함께 보여준다) */
  exposureRate?: number
  /** 1페이지(10위) 안에 걸린 비율(%) — 있는 그대로 */
  firstPageRate?: number
  /** 경쟁 강도로 가중한 30위 점수(0~100) — 등급에 쓰는 값 */
  weightedExposure?: number
  /** 경쟁 강도로 가중한 1페이지 점수(0~100) — 등급에 쓰는 값 */
  weightedFirstPage?: number
  /** 표본이 어느 경쟁 구간에 있었나 */
  tiers: Record<Competition, number>
}

/**
 * 표본 목록 하나로 노출 지표를 다 낸다 (순수 함수 — 테스트 대상).
 *
 * 가중 방식: **분자에만 가중치를 준다.** 분모는 표본 수 그대로다. 그래서 약한
 * 검색어에서만 걸리는 블로그는 최대 45점까지만 오른다 — 「쉬운 자리에서만 1위」를
 * 최적으로 오해하지 않게 하는 장치다.
 */
export function measureExposure(
  samples: { rank: number | null; total?: number | null }[]
): ExposureMeasure {
  const tiers: Record<Competition, number> = { high: 0, mid: 0, low: 0, none: 0, unknown: 0 }
  const real: { rank: number | null; weight: number }[] = []
  for (const s of samples) {
    const tier = competitionOf(s.total)
    tiers[tier] += 1
    if (tier === 'none') continue
    real.push({ rank: s.rank, weight: COMPETITION_WEIGHT[tier] })
  }
  const out: ExposureMeasure = { real: real.length, trivial: tiers.none, tiers }
  if (!real.length) return out

  const hit = real.filter((r) => r.rank !== null)
  const first = real.filter((r) => r.rank !== null && r.rank <= 10)
  out.exposureRate = Math.round((hit.length / real.length) * 100)
  out.firstPageRate = Math.round((first.length / real.length) * 100)
  out.weightedExposure = Math.round(
    (hit.reduce((s, r) => s + r.weight, 0) / real.length) * 100
  )
  out.weightedFirstPage = Math.round(
    (first.reduce((s, r) => s + r.weight, 0) / real.length) * 100
  )
  return out
}

// ─── 등급 판정 ────────────────────────────────────────────────

export interface GradeAxis {
  label: string
  value: number
  max: number
  note: string
}

export interface BlogGradeResult {
  grade: BlogGrade
  /** 추정 지수 0~100 — 시중 도구가 내는 「44/100」과 같은 자리에 놓고 보게 만든 값 */
  score?: number
  reason: string
  axes: GradeAxis[]
  /** 표본이 적거나 색인이 새서 이 칸 위로는 안 올린 경우, 그 상한 */
  cappedAt?: BlogGrade
}

/** 점수 → 칸. 준최 2 칸이 가장 넓다 (실제 분포에서 61%가 여기다) */
const SCORE_BANDS: { min: number; grade: BlogGrade }[] = [
  { min: 93, grade: 'optimal3' },
  { min: 87, grade: 'optimal2' },
  { min: 80, grade: 'optimal1' },
  { min: 73, grade: 'semi7' },
  { min: 66, grade: 'semi6' },
  { min: 59, grade: 'semi5' },
  { min: 52, grade: 'semi4' },
  { min: 45, grade: 'semi3' },
  { min: 25, grade: 'semi2' },
  { min: 1, grade: 'semi1' },
  { min: 0, grade: 'normal' },
]

/** 아래쪽(약한 쪽)을 고른다 — 사다리에서 인덱스가 큰 쪽 */
function weaker(a: BlogGrade, b: BlogGrade): BlogGrade {
  return GRADE_LADDER.indexOf(a) >= GRADE_LADDER.indexOf(b) ? a : b
}

/**
 * 표본 수로 정하는 상한.
 *
 * 표본 9편에서 6편이 걸린 것으로 「최적」을 말하면 안 된다 — 표본 하나가 바뀌면 한 칸이
 * 움직이는 폭이다. 그래서 **표본이 쌓이기 전에는 위 칸을 잠근다.** 이건 겸손이 아니라
 * 산수다: 9편이면 오차가 ±15%p 대다.
 */
export function sampleCap(real: number): { cap: BlogGrade; note: string } | null {
  if (real >= 20) return null
  if (real >= 10) return { cap: 'optimal1', note: `표본 ${real}편으로는 최적 1 위쪽까지만 말할 수 있습니다` }
  if (real >= 5) return { cap: 'semi6', note: `표본 ${real}편으로는 준최 6 위쪽까지만 말할 수 있습니다` }
  if (real >= 3) return { cap: 'semi4', note: `표본 ${real}편으로는 준최 4 위쪽까지만 말할 수 있습니다` }
  return { cap: 'semi3', note: `표본 ${real}편은 너무 적어 준최 3 위쪽으로는 올리지 않았습니다` }
}

export function gradeBlog(input: {
  /** 제목 완전일치 검색에서 그 글이 나온 비율(%) — 색인 검사 */
  indexedRate?: number
  /** 노출 표본 계산 결과 */
  exposure?: ExposureMeasure
  /** 「경쟁 없음」의 기준 (화면 문구에 그대로 쓴다) */
  trivialMax?: number
  /** 읽은 표본 수 전체 (색인 + 노출) */
  samples: number
}): BlogGradeResult {
  const { indexedRate, exposure, trivialMax = COMPETITION_LOW, samples } = input

  if (samples === 0 || typeof indexedRate !== 'number') {
    return { grade: 'unknown', reason: '표본을 읽지 못해 등급을 낼 수 없습니다.', axes: [] }
  }

  // 색인부터 본다. 제목을 그대로 넣어도 안 나오면 다른 지표는 의미가 없다.
  if (indexedRate === 0) {
    return {
      grade: 'dropped',
      score: 0,
      axes: [{ label: '색인', value: 0, max: 30, note: '제목을 그대로 검색해도 그 글이 안 나옵니다' }],
      reason:
        '글 제목을 그대로 검색해도 그 글이 나오지 않습니다. 검색에서 빠진 상태(업계에서 말하는 "저품질")로 의심됩니다 — 다만 방금 올린 글이면 색인 전일 수 있으니 며칠 뒤 다시 확인하세요.',
    }
  }

  /*
   * 뺀 표본이 있으면 **판정 문장에 적는다.** 조용히 빼면 「이 숫자가 다 진짜」로 읽힌다.
   * 회원이 우리 등급과 시중 도구가 다르다고 물었을 때, 차이의 절반이 이거였다.
   */
  const trivial = exposure?.trivial ?? 0
  const trivialNote = trivial
    ? ` (검색어에 경쟁이 거의 없던 표본 ${trivial}편은 뺐습니다 — 최근 글 ${trivialMax}편 미만인 검색어에서 위에 걸리는 것은 블로그 힘과 무관합니다)`
    : ''

  /*
   * 점수 배분: 색인 20 · 30위 40 · 1페이지 40.
   *
   * 색인을 20점으로 낮게 둔 이유가 있다. 색인은 **자격 요건**이지 실력이 아니다 —
   * 정상 블로그는 다 100%다. 색인 배점이 크면 「색인만 정상이고 아무 데도 안 걸리는
   * 블로그」가 중간 점수를 받아 준최 중반으로 올라간다. 지금 배분이면 그 블로그는
   * 20점(준최 1)에서 시작해 걸리는 만큼만 올라간다.
   */
  const indexAxis: GradeAxis = {
    label: '색인',
    value: Math.round((indexedRate / 100) * 20),
    max: 20,
    note:
      indexedRate >= 100
        ? '제목으로 검색하면 다 나옵니다 — 검색에서 빠진 글이 없습니다'
        : `제목으로 검색해서 나오는 글이 ${indexedRate}% 뿐입니다 — 일부가 검색에서 빠져 있습니다`,
  }

  // 경쟁 있는 표본이 하나도 없으면 노출을 잴 수 없다 (없는 값을 0점으로 넣지 않는다)
  if (!exposure || typeof exposure.weightedExposure !== 'number') {
    return {
      grade: 'normal',
      axes: [indexAxis],
      reason: trivial
        ? `색인은 정상입니다. 다만 표본 ${trivial}편이 **경쟁이 거의 없는 검색어**여서(최근 글 ${trivialMax}편 미만) 노출력을 잴 수 없었습니다 — 상호명·가게 이름이 제목 앞에 오면 그 검색어는 사실상 그 글 하나입니다. 경쟁 키워드를 제목 앞에 둔 글이 쌓이면 다시 재보세요.`
        : '색인은 정상입니다. 노출력을 재지 못해 그 이상은 판정하지 않았습니다.',
    }
  }

  const { weightedExposure, weightedFirstPage = 0, exposureRate = 0, firstPageRate = 0, real, tiers } = exposure

  const axes: GradeAxis[] = [
    indexAxis,
    {
      label: '30위 안 진입',
      value: Math.round((weightedExposure / 100) * 40),
      max: 40,
      note: `표본의 ${exposureRate}%가 30위 안 (경쟁 강도로 가중하면 ${weightedExposure}점)`,
    },
    {
      label: '1페이지 진입',
      value: Math.round((weightedFirstPage / 100) * 40),
      max: 40,
      note: `표본의 ${firstPageRate}%가 1페이지(10위 안) (가중 ${weightedFirstPage}점)`,
    },
  ]
  const score = Math.min(100, axes.reduce((s, a) => s + a.value, 0))

  let grade = SCORE_BANDS.find((b) => score >= b.min)?.grade ?? 'normal'

  // ── 상한들 ─────────────────────────────────────────────
  const caps: { cap: BlogGrade; note: string }[] = []
  const bySample = sampleCap(real)
  if (bySample) caps.push(bySample)
  if (indexedRate < 60) {
    caps.push({ cap: 'normal', note: `색인율이 ${indexedRate}% 뿐이라 등급을 올리지 않았습니다` })
  } else if (indexedRate < 100) {
    caps.push({ cap: 'semi4', note: `검색에서 빠진 글이 있어(색인 ${indexedRate}%) 준최 4 위쪽으로는 올리지 않았습니다` })
  }

  let cappedAt: BlogGrade | undefined
  const capNotes: string[] = []
  for (const c of caps) {
    const limited = weaker(grade, c.cap)
    // 상한이 실제로 걸렸을 때만 문장에 적는다 (안 걸린 상한을 말하면 겁만 준다)
    if (limited !== grade) {
      grade = limited
      cappedAt = c.cap
      capNotes.push(c.note)
    }
  }

  const tierMix = (['high', 'mid', 'low'] as const)
    .filter((t) => tiers[t] > 0)
    .map((t) => `${COMPETITION_LABEL[t]} ${tiers[t]}편`)
    .join(' · ')

  const reason =
    `추정 지수 ${score}점 — ${GRADE_LABEL[grade]}. 표본의 ${exposureRate}%가 30위 안, ${firstPageRate}%가 1페이지(10위 안)에 있습니다${trivialNote}.` +
    (tierMix ? ` 표본의 검색어 경쟁은 ${tierMix} 였고, 쉬운 검색어에서 걸린 것은 그만큼 낮게 셈했습니다.` : '') +
    (capNotes.length ? ` ${capNotes.join('. ')}.` : '') +
    /*
     * **노출 0% 를 저품질로 읽지 않게 못을 박는다.** 실측으로 확인한 함정이다 —
     * hyoni2_ 는 표본 노출률이 0% 로 나온 적이 있는데 정작 「쌍용동 헬스장」에서는
     * 1위였다. 표본이 경쟁 센 키워드였을 뿐이다.
     */
    (exposureRate === 0
      ? ' 색인은 정상이니 **저품질이 아닙니다** — 표본 글이 경쟁이 센 키워드를 노렸으면 이렇게 나옵니다. 아래 표본 목록의 검색어를 보고 판단하세요.'
      : '')

  return { grade, score, reason, axes, cappedAt }
}

/** 이 블로그를 상위에서 만났을 때 무엇을 뜻하는지 — 전략 한 줄 */
export function meaningForUs(p: BlogProfile): string {
  switch (p.kind) {
    case 'owner':
      return '경쟁 업체가 직접 쓴 글입니다. 업체 글끼리는 후기글이 이기는 경우가 많으니, 방문 후기 형태로 맞붙는 편이 유리합니다.'
    case 'mixed':
      return `여러 업종을 돌며 리뷰를 쓰는 블로그입니다 (우리 업종 글은 ${p.gymShare}%). 체험단·대행으로 올라온 글일 가능성이 큽니다 — 편수로 밀어붙이는 판이라는 뜻이니, 후기 편수를 늘리는 쪽이 실효가 있습니다.`
    case 'reviewer':
      return '리뷰를 주로 쓰는 블로그입니다. 협찬·체험단 글이 섞여 있을 수 있습니다. 같은 형태(방문 후기)로 맞붙으면 됩니다.'
    case 'topical':
      return `한 주제에 집중된 블로그(${p.topShare}%)라 그 주제에서 힘이 셉니다. 정면으로 겨루기보다 세부 의도를 붙여 우회하는 편이 빠릅니다.`
    default:
      return '성격을 단정하기 어렵습니다. 제목과 카테고리를 직접 보고 판단하세요.'
  }
}
