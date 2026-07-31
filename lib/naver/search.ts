import { getKeys, hasSearchKeys, seededRandom, NaverApiError } from './client'

export interface RawBlogItem {
  title: string
  link: string
  description: string
  bloggername: string
  bloggerlink: string
  /** YYYYMMDD */
  postdate: string
}

export interface BlogSearchResult {
  total: number
  items: RawBlogItem[]
  mock: boolean
}

const ENDPOINT = 'https://openapi.naver.com/v1/search/blog.json'

/** 네이버 태그(<b>) 와 HTML 엔티티를 제거해 평문으로 */
export function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/**
 * 블로그 검색. sort='sim' 이 관련도순(= 사실상 상위노출 순서)이다.
 * 키가 없으면 목업 결과를 돌려주고 mock: true 를 표시한다.
 */
export async function searchBlog(
  query: string,
  opts: { display?: number; start?: number; sort?: 'sim' | 'date' } = {}
): Promise<BlogSearchResult> {
  const display = Math.min(opts.display ?? 30, 100)
  const start = opts.start ?? 1
  const sort = opts.sort ?? 'sim'

  if (!hasSearchKeys()) return mockBlogSearch(query, display)

  const { clientId, clientSecret } = getKeys()
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId!,
      'X-Naver-Client-Secret': clientSecret!,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new NaverApiError(
      `네이버 검색 API 오류 (${res.status}). ${body.slice(0, 200)}`,
      res.status
    )
  }

  const json = (await res.json()) as { total: number; items: RawBlogItem[] }
  return { total: json.total ?? 0, items: json.items ?? [], mock: false }
}

// ─── 목업 ──────────────────────────────────────────────────────

const MOCK_BLOGGERS = [
  '천안 운동일기',
  '헬스 3년차 기록',
  '하루한장 다이어트',
  '주말엔 프리웨이트',
  '직장인 운동루틴',
  '오늘도 운동합니다',
  '새벽러너의 하루',
  '몸만들기 프로젝트',
  '천안맘 일상기록',
  '운동하는 회사원',
]

const MOCK_TITLE_PATTERNS = [
  (k: string) => `${k} 3개월 다녀본 솔직 후기`,
  (k: string) => `${k} 고민이라면 여기 참고하세요`,
  (k: string) => `${k} 등록 전에 꼭 확인할 것들`,
  (k: string) => `${k} 새벽에도 문 여는 곳 찾았어요`,
  (k: string) => `${k} 가격보다 중요한 3가지`,
  (k: string) => `초보도 편했던 ${k} 시설 정리`,
  (k: string) => `${k} 어디로 갈까 비교해봤습니다`,
  (k: string) => `${k} 24시간 운영하는 곳 다녀왔어요`,
  (k: string) => `${k} PT 받아본 후기 (개인차 있음)`,
  (k: string) => `${k} 다녀오고 생각이 바뀐 이유`,
  (k: string) => `${k} 회원권 끊기 전 체크리스트`,
  (k: string) => `요즘 ${k} 이렇게 고르시면 됩니다`,
]

export function mockBlogSearch(query: string, display: number): BlogSearchResult {
  const rnd = seededRandom(`blog:${query}`)
  const now = Date.now()
  const items: RawBlogItem[] = []

  for (let i = 0; i < display; i++) {
    const pattern = MOCK_TITLE_PATTERNS[Math.floor(rnd() * MOCK_TITLE_PATTERNS.length)]
    const blogger = MOCK_BLOGGERS[Math.floor(rnd() * MOCK_BLOGGERS.length)]
    // 상위권은 최근 글이 많고, 아래로 갈수록 오래된 글 비중이 커진다.
    const maxAge = 20 + i * 22
    const ageDays = Math.floor(rnd() * maxAge) + 1
    const d = new Date(now - ageDays * 86400000)
    const postdate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`
    const blogId = `blog${Math.floor(rnd() * 90000) + 10000}`

    items.push({
      title: pattern(query),
      link: `https://blog.naver.com/${blogId}/${223000000000 + Math.floor(rnd() * 999999999)}`,
      description: `${query} 관련해서 직접 다녀오고 정리한 내용입니다. 시설과 운영시간, 실제로 느낀 점을 순서대로 적어봤어요...`,
      bloggername: blogger,
      bloggerlink: `https://blog.naver.com/${blogId}`,
      postdate,
    })
  }

  return { total: mockBlogTotal(query), items, mock: true }
}

/**
 * 목업 발행량.
 *
 * 검색 API 의 total 은 "이 키워드가 들어간 글의 누적 개수"라서 월 검색량보다 훨씬 크다.
 * 어절이 늘어날수록(롱테일) 누적 발행량이 급격히 줄어드는 실제 경향을 그대로 반영해
 * 어절 수별 현실적인 범위에서 로그균등으로 뽑는다. 이렇게 하면 경쟁률(발행량÷검색량)이
 * 키워드마다 넓게 퍼져서 등급이 전부 한쪽으로 몰리지 않는다.
 */
export function mockBlogTotal(query: string): number {
  const words = query.trim().split(/\s+/).filter(Boolean).length
  const [lo, hi] =
    words <= 1
      ? [400_000, 2_500_000]
      : words === 2
        ? [30_000, 600_000]
        : words === 3
          ? [8_000, 150_000]
          : [2_000, 40_000]

  // 로그균등 — 자연스럽게 작은 값이 더 자주 나온다
  const t = seededRandom(`total:${query}`)()
  return Math.round(Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo))))
}

/** 발행량만 필요할 때 (경쟁률 계산용) — display=1 로 total 만 읽는다 */
export async function blogTotalCount(query: string): Promise<{ total: number; mock: boolean }> {
  const r = await searchBlog(query, { display: 1 })
  return { total: r.total, mock: r.mock }
}
