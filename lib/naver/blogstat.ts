/**
 * 블로그 활동 지표 — **시중 도구가 보는 축**을 우리도 직접 읽는다.
 *
 * ── 왜 만들었나 (2026-08-11) ────────────────────────────────
 * 회원이 우리 진단(준최 5)과 라블로그(준최 1)를 나란히 놓고 「우리도 저기서만 볼 수
 * 있는 걸 분석하면 되지 않냐」고 물었다. 맞는 말이었다. 그래서 라블로그가 무엇을
 * 긁는지 자기 코드에서 확인하고(이웃 목록·공감 누른 사람·댓글·글 목록), 같은 것을
 * **로그인 없이** 읽을 수 있는지 하나하나 찔러봤다. 결과:
 *
 *   m.blog.naver.com/{id}                     → 오늘 방문자 · 전체 방문자 · 이웃 · 글 수
 *   blog.naver.com/PostTitleListAsync.naver   → 전체 글 목록(날짜·댓글 수·검색 허용)
 *   m.blog.naver.com/api/blogs/{id}/posts/{n}/sympathy-users → 글별 공감 수
 *
 * **전부 로그인 없이 나온다.** 남의 블로그(경쟁 업체)도 된다 — 실측:
 *   hyoni2_  오늘 51 · 전체 90,159 · 이웃 640 · 글 416
 *   pnpgym   오늘  1 · 전체  6,699 · 이웃  74 · 글 146
 *
 * 그래서 이 앱이 그동안 화면에 적어둔 「방문자 수는 밖에서 볼 수 없다」는 **틀린 말이었다.**
 *
 * ── 그래도 못 보는 것 ──────────────────────────────────────
 * 유입경로(검색으로 들어온 비율)·일별 방문자 추이·체류시간·재방문율·성별·연령은
 * 「네이버 블로그 통계」 안에 있고, 그건 **블로그 주인이 로그인해야** 열린다. 라블로그가
 * 데스크톱 앱(Electron)을 쓰는 이유가 이것이다 — 회원 본인 브라우저 세션을 그대로
 * 쓴다. 우리는 웹앱이라 그 길이 없다. 못 보는 것은 못 본다고 적고 점수에 넣지 않는다.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 7000
const MOBILE_BASE = process.env.NAVER_MBLOG_ENDPOINT?.trim() || 'https://m.blog.naver.com'
const PC_BASE = process.env.NAVER_BLOG_ENDPOINT?.trim() || 'https://blog.naver.com'

// ─── 방문자·이웃·글 수 ────────────────────────────────────────

export interface BlogStat {
  /** 오늘 방문자 */
  dayVisitors: number | null
  /** 개설 이후 누적 방문자 */
  totalVisitors: number | null
  /** 이웃 수 (subscriberCount) */
  buddies: number | null
  /** 전체 글 수 */
  postCount: number | null
  /** 모먼트 수 */
  moments: number | null
}

/** 값이 하나도 없으면 「읽지 못했다」로 본다 */
export function statEmpty(s: BlogStat | null): boolean {
  return !s || (s.dayVisitors === null && s.totalVisitors === null && s.buddies === null && s.postCount === null)
}

/**
 * 모바일 블로그 첫 화면에 박혀 있는 상태값을 뽑는다 (순수 함수 — 테스트 대상).
 *
 * 모바일 블로그는 리액트 초기 상태를 HTML 안에 그대로 심어 보낸다. 우리가 필요한
 * 숫자가 거기 다 있다. **정규식으로 필요한 값만 집는다** — 전체를 JSON 으로 파싱하려
 * 들면 네이버가 구조를 조금 바꿀 때마다 통째로 깨진다.
 */
export function parseBlogStat(html: string): BlogStat | null {
  if (!html) return null
  const pick = (key: string): number | null => {
    // 같은 이름이 여러 번 나온다 (알림용 0 값도 있다) — 0 이 아닌 첫 값을 고른다
    const all = [...html.matchAll(new RegExp(`"${key}"\\s*:\\s*(\\d+)`, 'g'))].map((m) => Number(m[1]))
    if (!all.length) return null
    return all.find((n) => n > 0) ?? all[0]
  }
  const stat: BlogStat = {
    dayVisitors: pick('dayVisitorCount'),
    totalVisitors: pick('totalVisitorCount'),
    buddies: pick('subscriberCount'),
    postCount: pick('postCount'),
    moments: pick('momentCount'),
  }
  return statEmpty(stat) ? null : stat
}

export async function fetchBlogStat(blogId: string): Promise<BlogStat | null> {
  const id = (blogId ?? '').trim()
  if (!id) return null
  try {
    const res = await fetch(`${MOBILE_BASE}/${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseBlogStat(await res.text())
  } catch {
    return null
  }
}

// ─── 전체 글 목록 ─────────────────────────────────────────────

export interface PostRow {
  logNo: string
  title: string
  /** YYYY-MM-DD */
  date: string
  categoryNo: string
  commentCount: number
  /**
   * 검색 허용 설정(searchYn).
   *
   * **이게 중요하다.** 주인이 「검색 허용 안 함」으로 올린 글은 당연히 검색에 안 나온다.
   * 그걸 색인 검사에 넣으면 정상 블로그를 「누락」으로 오판한다.
   */
  searchable: boolean
  /** 전체공개(openType 2)인가 */
  open: boolean
}

export interface PostPage {
  /** 블로그 전체 글 수 */
  total: number | null
  posts: PostRow[]
}

/** `2026. 8. 9.` → `2026-08-09` (순수 함수 — 테스트 대상) */
export function postDate(raw: string): string {
  const m = /(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/.exec(raw ?? '')
  if (!m) return ''
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** 제목이 `%EC%B2%9C+%EC%95%88` 처럼 인코딩되어 온다 */
function decodeTitle(raw: string): string {
  try {
    return decodeURIComponent((raw ?? '').replace(/\+/g, ' '))
  } catch {
    return (raw ?? '').replace(/\+/g, ' ')
  }
}

/**
 * PostTitleListAsync 응답을 읽는다 (순수 함수 — 테스트 대상).
 *
 * 응답이 JSON 처럼 생겼지만 **JSON.parse 로는 못 읽는다** — 제목 안에 `\u` 로 시작하는
 * 잘못된 이스케이프가 섞여 나와서 파서가 죽는다(실측). 그래서 글 한 덩어리씩 잘라
 * 필요한 필드만 정규식으로 집는다.
 */
export function parsePostList(text: string): PostPage {
  const out: PostPage = { total: null, posts: [] }
  if (!text) return out
  const t = /"totalCount"\s*:\s*"?(\d+)/.exec(text)
  if (t) out.total = Number(t[1])

  const body = text.split('"postList"')[1]
  if (!body) return out
  for (const chunk of body.split('"logNo"').slice(1)) {
    const logNo = /^\s*:\s*"?(\d+)/.exec(chunk)?.[1]
    if (!logNo) continue
    const field = (k: string) => new RegExp(`"${k}"\\s*:\\s*"?([^",}]*)`).exec(chunk)?.[1] ?? ''
    out.posts.push({
      logNo,
      title: decodeTitle(field('title')),
      date: postDate(field('addDate')),
      categoryNo: field('categoryNo'),
      commentCount: Number(field('commentCount')) || 0,
      // 값이 안 오면 「허용」으로 본다 — 없는 것을 불리하게 쓰지 않는다
      searchable: field('searchYn') !== 'false',
      open: (field('openType') || '2') === '2',
    })
  }
  return out
}

export async function fetchPostPage(blogId: string, page = 1, perPage = 30): Promise<PostPage | null> {
  const id = (blogId ?? '').trim()
  if (!id) return null
  const url =
    `${PC_BASE}/PostTitleListAsync.naver?blogId=${encodeURIComponent(id)}` +
    `&currentPage=${page}&countPerPage=${perPage}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: `${PC_BASE}/${encodeURIComponent(id)}`, Accept: '*/*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parsePostList(await res.text())
  } catch {
    return null
  }
}

// ─── 글별 공감 수 ─────────────────────────────────────────────

/** 공감 응답에서 수만 집는다 (순수 함수 — 테스트 대상) */
export function parseSympathy(json: string): number | null {
  if (!json) return null
  if (!/"isSuccess"\s*:\s*true/.test(json)) return null
  const m = /"totalCount"\s*:\s*(\d+)/.exec(json)
  return m ? Number(m[1]) : null
}

export async function fetchSympathyCount(blogId: string, logNo: string): Promise<number | null> {
  const id = (blogId ?? '').trim()
  if (!id || !logNo) return null
  const url =
    `${MOBILE_BASE}/api/blogs/${encodeURIComponent(id)}/posts/${encodeURIComponent(logNo)}` +
    `/sympathy-users?itemCount=1`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: `${MOBILE_BASE}/${encodeURIComponent(id)}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseSympathy(await res.text())
  } catch {
    return null
  }
}
