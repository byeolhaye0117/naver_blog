/**
 * 블로그 발행량 자동 조회 — 최근 30일 기준.
 *
 * 검색 API(openapi.naver.com)는 누적 발행량을 주지만 이 계정에서는 발급이 막혀 있다
 * (401 errorCode 024). 대신 블로그 섹션 검색 화면이 쓰는 공개 엔드포인트에서 기간별
 * 발행 건수를 읽는다. **공식 API 가 아니므로 언제든 응답이 바뀌거나 막힐 수 있다** —
 * 실패하면 조용히 null 을 돌려주고, 화면에서는 직접 입력으로 받는다.
 *
 * 왜 누적이 아니라 30일인가:
 *  1. 이 엔드포인트의 totalCount 는 1,000 에서 잘린다. 누적은 웬만하면 1,000 을 넘어
 *     ("헬스장"도 "쌍용동 헬스장"도 똑같이 1000) 값으로 쓸 수 없다.
 *  2. 그리고 30일 발행량이 경쟁률 지표로 더 정직하다. 월 검색량과 기간 단위가 같아서
 *     "검색 1회당 새 글 몇 개" 로 바로 읽히고, 이미 밀려난 10년 전 글을 세지 않는다.
 *     지금 이 키워드에 새 글이 얼마나 쏟아지는지가 실제로 겨룰 상대다.
 */

// 테스트용 주소 갈아끼우기 — 운영에서는 설정하지 않는다 (프록시가 막힌 환경에서 흐름 검증용)
const ENDPOINT =
  process.env.NAVER_SECTION_ENDPOINT?.trim() ||
  'https://section.blog.naver.com/ajax/SearchList.naver'
const REFERER = 'https://section.blog.naver.com/Search/Post.naver'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** totalCount 가 이 값이면 잘린 것 (실제로는 이상) */
export const SECTION_CAP = 1000
const TIMEOUT_MS = 5000
const RETRY_DELAY_MS = 400
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** 값의 성격 — 화면에 그대로 표시한다 */
export type CountNote = 'exact' | 'estimated' | 'atLeast'

export interface RecentCount {
  /** 최근 30일 발행량. null = 조회 실패 */
  count: number | null
  /**
   * exact     = 30일 창을 그대로 읽은 값
   * estimated = 30일이 잘려서 7일 창을 30일로 환산한 값
   * atLeast   = 7일 창도 잘림 — 이 값 "이상" 이라는 하한
   */
  note: CountNote
}

const FAILED: RecentCount = { count: null, note: 'exact' }

// 같은 키워드를 반복 조회하면 네이버 쪽에 부담이고 화면도 느려진다.
// 발행량은 하루 단위로도 충분하니 6시간 캐시한다 (서버 인스턴스 메모리).
const cache = new Map<string, { at: number; value: RecentCount }>()

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function shift(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 86400000)
}

/** 응답에서 건수만 뽑는다. 앞에 `)]}',` 프리픽스가 붙어 오므로 JSON.parse 하지 않는다 */
export function parseSectionTotal(body: string): number | null {
  const m = /"totalCount"\s*:\s*(\d+)/.exec(body)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** 7일 창 값을 30일로 환산 */
export function monthlyFromWeek(week: number): number {
  return Math.round((week * 30) / 7)
}

/** 7일·30일 조회 결과를 하나의 30일 값으로 합친다 (순수 함수 — 테스트 대상) */
export function resolveRecent(d30: number | null, d7: number | null): RecentCount {
  if (d30 === null) return FAILED
  if (d30 < SECTION_CAP) return { count: d30, note: 'exact' }
  // 30일이 잘렸다 — 7일로 다시 재서 환산한다
  if (d7 === null) return { count: monthlyFromWeek(SECTION_CAP), note: 'atLeast' }
  if (d7 < SECTION_CAP) return { count: monthlyFromWeek(d7), note: 'estimated' }
  // 7일에도 1,000건 이상 — 하한만 말할 수 있다
  return { count: monthlyFromWeek(SECTION_CAP), note: 'atLeast' }
}

async function fetchOnce(keyword: string, start: Date, end: Date): Promise<number | null> {
  const url =
    `${ENDPOINT}?countPerPage=7&currentPage=1&orderBy=sim&type=post` +
    `&keyword=${encodeURIComponent(keyword)}&startDate=${ymd(start)}&endDate=${ymd(end)}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: REFERER, Accept: 'application/json, text/plain, */*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseSectionTotal(await res.text())
  } catch {
    // 타임아웃·차단·응답 형식 변경 — 어느 쪽이든 "모른다" 로 처리한다
    return null
  }
}

/**
 * 한 번 실패하면 잠깐 쉬고 한 번만 더 시도한다.
 * 24개를 한꺼번에 조회하면 뒤쪽 키워드가 속도 제한에 걸려 통째로 "판정 불가" 가 됐다 —
 * 재시도 한 번으로 대부분 살아난다. 두 번 이상은 응답이 느려져 오히려 손해다.
 */
async function countBetween(keyword: string, start: Date, end: Date): Promise<number | null> {
  const first = await fetchOnce(keyword, start, end)
  if (first !== null) return first
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
  return fetchOnce(keyword, start, end)
}

/** 최근 30일 발행량. 실패하면 count: null */
export async function recentBlogCount(keyword: string, now = new Date()): Promise<RecentCount> {
  const key = keyword.trim()
  if (!key) return FAILED

  const hit = cache.get(key)
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.value

  const d30 = await countBetween(key, shift(now, 30), now)
  const d7 = d30 !== null && d30 >= SECTION_CAP ? await countBetween(key, shift(now, 7), now) : null
  const value = resolveRecent(d30, d7)

  if (value.count !== null) cache.set(key, { at: now.getTime(), value })
  return value
}

// ─── 관련도순 상위 글 목록 ──────────────────────────────────────

export interface SectionPost {
  title: string
  /** YYYY-MM-DD */
  date: string | null
  blogger: string | null
  url: string
}

/** <b> 강조 태그·엔티티 제거 */
function plain(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** addDate 는 epoch 밀리초로 온다 */
function fromEpoch(ms: unknown): string | null {
  const n = typeof ms === 'number' ? ms : Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n).toISOString().slice(0, 10)
}

/** 응답 JSON 에서 글 목록을 뽑는다 (순수 함수 — 테스트 대상) */
export function parseSectionPosts(body: string): SectionPost[] {
  const at = body.indexOf('{')
  if (at < 0) return []
  let json: unknown
  try {
    json = JSON.parse(body.slice(at))
  } catch {
    return []
  }
  const list = (json as { result?: { searchList?: unknown[] } })?.result?.searchList
  if (!Array.isArray(list)) return []

  const out: SectionPost[] = []
  for (const raw of list) {
    const r = raw as Record<string, unknown>
    const title = plain(String(r.noTagTitle ?? '')) || plain(String(r.title ?? ''))
    if (!title) continue
    // blogName 은 있어도 빈 문자열인 경우가 있다 (?? 로는 안 걸러진다) — 그때는 별명을 쓴다
    const blogger = plain(String(r.blogName ?? '')) || plain(String(r.nickName ?? ''))
    out.push({
      title,
      date: fromEpoch(r.addDate),
      blogger: blogger || null,
      url: String(r.postUrl ?? ''),
    })
  }
  return out
}

/**
 * 관련도순 상위 글 목록 — 상위노출 분석의 자동 입력 경로.
 *
 * 검색 API(openapi) 가 막힌 계정에서도 되고, 제목·발행일·블로거명·링크가 다 들어 있다.
 * 붙여넣기를 시키지 않아도 되는 이유가 여기 있다. 실패하면 빈 배열을 돌려주고,
 * 화면에서는 붙여넣기로 넘어가게 안내한다.
 */
export async function topBlogPosts(
  keyword: string,
  display = 15
): Promise<{ items: SectionPost[]; total: number | null }> {
  const q = keyword.trim()
  if (!q) return { items: [], total: null }

  const url =
    `${ENDPOINT}?countPerPage=${Math.min(display, 30)}&currentPage=1&orderBy=sim&type=post` +
    `&keyword=${encodeURIComponent(q)}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: REFERER, Accept: 'application/json, text/plain, */*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { items: [], total: null }
    const body = await res.text()
    return { items: parseSectionPosts(body), total: parseSectionTotal(body) }
  } catch {
    return { items: [], total: null }
  }
}

/** 사용자가 같은 숫자를 눈으로 확인할 수 있는 화면 주소 */
export function blogSectionUrl(keyword: string): string {
  return `${REFERER}?keyword=${encodeURIComponent(keyword)}&orderBy=sim`
}
