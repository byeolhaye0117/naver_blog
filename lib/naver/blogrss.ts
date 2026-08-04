/**
 * 블로그 RSS — 그 블로그가 어떤 블로그인지 알아내는 가장 값싼 경로.
 *
 * `https://rss.blog.naver.com/{blogId}.xml` 이 최근 50편의 **제목·발행일·카테고리**를
 * 준다. 카테고리가 결정적이다 — 실측한 세 블로그의 성격이 여기서 그대로 드러났다.
 *
 *   hyoni2_    뷰티/건강/운동 20 · 맛집/카페 12 · 일상/체험 9  → 잡식 리뷰(체험단 성격)
 *   pnpgym     피앤피짐 34 · 이벤트 13 · 시설소개 2            → 업체 본인 블로그
 *   jiyun0361  각종리뷰 50                                    → 리뷰 전문 블로그
 *
 * 글 본문을 열지 않고도 판별이 되므로 조회 한 번으로 끝난다.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 6000
/** 테스트용 주소 갈아끼우기 */
const BASE = process.env.NAVER_RSS_ENDPOINT?.trim() || 'https://rss.blog.naver.com'

export interface RssItem {
  title: string
  link: string
  /** YYYY-MM-DD */
  date: string
  category: string
}

export interface BlogFeed {
  blogId: string
  blogName: string
  items: RssItem[]
}

/**
 * 아무 형태로 넣어도 블로그 아이디를 뽑는다 (순수 함수 — 테스트 대상).
 * 주소를 붙여넣든 아이디만 적든 되게 한다.
 */
export function blogIdFromInput(raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) return ''

  // PostView 형태
  const q = s.match(/[?&]blogId=([A-Za-z0-9_-]+)/i)
  if (q) return q[1]

  // blog.naver.com/{id} · m.blog.naver.com/{id}/{logNo}
  const m = s.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/i)
  if (m && m[1].toLowerCase() !== 'postview.naver') return m[1]

  // 아이디만 적은 경우
  if (/^[A-Za-z0-9_-]{3,40}$/.test(s)) return s
  return ''
}

function cdata(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, 'i')
  const m = re.exec(block)
  return (m?.[1] ?? '').trim()
}

/** RSS 의 pubDate("Tue, 04 Aug 2026 01:04:53 +0900") → YYYY-MM-DD */
export function rssDate(raw: string): string {
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toISOString().slice(0, 10)
}

/** RSS 를 읽어 글 목록으로 (순수 함수 — 테스트 대상) */
export function parseBlogRss(xml: string): BlogFeed | null {
  const channel = xml.indexOf('<channel>')
  if (channel < 0) return null
  const head = xml.slice(channel, xml.indexOf('<item>') > 0 ? xml.indexOf('<item>') : undefined)
  const blogName = cdata(head, 'title')

  const items: RssItem[] = []
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = cdata(block, 'title')
    if (!title) continue
    items.push({
      title,
      // 링크에 ?fromRss=true 가 붙어 온다 — 비교할 때 걸리므로 떼어낸다
      link: cdata(block, 'link').replace(/[?#].*$/, ''),
      date: rssDate(cdata(block, 'pubDate')),
      category: cdata(block, 'category'),
    })
  }
  if (!items.length) return null
  return { blogId: '', blogName, items }
}

export async function fetchBlogFeed(blogId: string): Promise<BlogFeed | null> {
  const id = blogIdFromInput(blogId)
  if (!id) return null
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}.xml`, {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const feed = parseBlogRss(await res.text())
    return feed ? { ...feed, blogId: id } : null
  } catch {
    return null
  }
}
