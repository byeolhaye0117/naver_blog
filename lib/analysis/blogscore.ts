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
 * 이웃 수·방문자 수·체류시간은 밖에서 볼 수 없으니 아예 넣지 않는다. 못 재는 것을
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
