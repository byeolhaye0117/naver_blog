/**
 * 상위 글 본문 실측 — 이 키워드의 실제 커트라인을 알아내려고 읽는다.
 *
 * 왜 필요한가. 검수기는 모든 키워드에 같은 기준(본문 2,000자·이미지 5장)을 쓴다.
 * 그런데 실측해 보면 키워드마다 판이 다르다 — "쌍용동 헬스장" 1위 글은 2,223자에
 * 이미지 17장, 영상 8개였다. 일반 규격을 맞춰도 그 판에서는 한참 모자란다.
 *
 * 읽는 주소는 PostView.naver 다. blog.naver.com/{id}/{logNo} 는 프레임 껍데기라
 * 본문이 들어 있지 않다.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 6000
/** 테스트용 주소 갈아끼우기 (프록시가 막힌 환경에서 흐름 검증용) */
const OVERRIDE = process.env.NAVER_POSTVIEW_ENDPOINT?.trim() || undefined

export interface PostMetrics {
  /** 공백을 뺀 본문 글자수 */
  charCount: number
  imageCount: number
  videoCount: number
  url: string
}

/**
 * 수치 + 본문 평문.
 *
 * 커트라인만 낼 때는 숫자만 있으면 되지만, 유사문서 판독(내 초안이 상위 글과
 * 글자 그대로 겹치는지)은 본문이 있어야 한다. 이미 읽어온 것이므로 버리지 않는다.
 * 다만 화면으로 내려보내지는 않는다 — 서버에서 비교하고 결과만 준다.
 */
export interface PostBody extends PostMetrics {
  text: string
}

/**
 * 네이버에 이미 발행돼 있는 내 글. 앱에서 쓰지 않은 글도 진단할 수 있게 하려고
 * 제목과 본문 텍스트까지 함께 읽는다.
 *
 * 소제목 수는 담지 않는다 — 스마트에디터가 소제목을 별도 표시 없이 굵은 글씨로만
 * 쓰는 경우가 많아 세면 거짓이 된다. 진단에서도 그 항목은 건너뛴다.
 */
export interface PublishedPost extends PostMetrics {
  title: string
  /** 본문 평문 (상위권이 쓰는 말이 글에 있는지 볼 때 쓴다) */
  text: string
}

/**
 * 어떤 형태의 블로그 글 주소든 본문이 실려 오는 주소로 바꾼다 (순수 함수 — 테스트 대상).
 * 못 알아보면 빈 문자열.
 */
export function postViewUrl(raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const base = OVERRIDE ?? 'https://blog.naver.com/PostView.naver'

  // 이미 PostView 형태
  const q = s.match(/[?&]blogId=([^&#]+)/i)
  if (q) {
    const log = s.match(/[?&]logNo=(\d+)/i)
    if (!log) return ''
    return `${base}?blogId=${q[1]}&logNo=${log[1]}`
  }

  // blog.naver.com/{id}/{logNo} · m.blog.naver.com/{id}/{logNo}
  const m = s.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/i)
  if (m) return `${base}?blogId=${m[1]}&logNo=${m[2]}`
  return ''
}

/**
 * 본문 HTML 에서 수치를 뽑는다 (순수 함수 — 테스트 대상).
 *
 * 스마트에디터 ONE 은 본문을 se-main-container 안에 넣고, 구성요소마다
 * `se-component se-image` 같은 표시를 붙인다. 본문이 끝나는 자리는 post_footer 다 —
 * 여기서 자르지 않으면 댓글·이웃추가 같은 화면 글자까지 본문으로 세게 된다.
 *
 * 소제목은 세지 않는다. 스마트에디터가 소제목을 별도 표시 없이 굵은 글씨로만 쓰는
 * 경우가 많아 세면 거짓이 된다 — 잴 수 있는 것만 잰다.
 */
export function parsePostMetrics(
  html: string
): (Omit<PostMetrics, 'url'> & { text: string }) | null {
  const start = html.indexOf('se-main-container')
  if (start < 0) return null
  const from = html.indexOf('>', start)
  const end = html.indexOf('post_footer', start)
  const raw = html.slice(from > 0 ? from + 1 : start, end > 0 ? end : undefined)
  if (!raw) return null

  /*
   * 스크립트·스타일을 **세기 전에** 지운다.
   * 네이버 페이지는 스크립트 안에도 'se-component se-image' 같은 문자열을 담고 있어서,
   * 그대로 세면 이미지 수가 부풀어 커트라인이 거짓이 된다 (실제로 그랬다).
   *
   * 끝이 잘린 태그(post_footer 가 속성 안에 있어서 슬라이스가 태그 중간에서 끝난다)도
   * 지운다 — 닫는 > 가 없으면 태그 제거 정규식에 안 걸려 글자수에 섞인다.
   */
  const body = raw
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*$/, '')

  const imageCount = (body.match(/se-component se-image/g) ?? []).length
  const videoCount = (body.match(/se-component se-video/g) ?? []).length

  const plain = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    // 제로폭 공백을 넣는 편집기가 있어서 글자수가 부풀 수 있다
    .replace(/[\u200b\u00a0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 글자수는 공백을 빼고 센다. 본문 평문은 따로 돌려준다 —
  // "상위권이 쓰는 말이 이 글에 있나" 를 보려면 텍스트가 필요하다.
  return { charCount: plain.replace(/\s/g, '').length, imageCount, videoCount, text: plain }
}

/** 제목은 본문 안이 아니라 og:title 에 들어 있다 (순수 함수 — 테스트 대상) */
export function parsePostTitle(html: string): string {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]{1,200})"/i)
  const raw = og?.[1] ?? html.match(/<title>([^<]{1,200})<\/title>/i)?.[1] ?? ''
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // <title> 에는 " : 네이버 블로그" 가 붙어 온다
    .replace(/\s*:\s*네이버 블로그\s*$/, '')
    .trim()
}

/** 글 하나를 읽어 수치를 잰다. 실패하면 null — 한 글이 막혀도 나머지로 계속 간다 */
export async function fetchPostMetrics(url: string): Promise<PostBody | null> {
  const target = postViewUrl(url)
  if (!target) return null
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, Referer: 'https://blog.naver.com/' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const m = parsePostMetrics(await res.text())
    // 본문이 거의 없으면 못 읽은 것으로 본다 (프레임 껍데기·접근 제한 글)
    if (!m || m.charCount < 200) return null
    return { ...m, url }
  } catch {
    return null
  }
}

/**
 * 네이버에 이미 발행한 내 글을 읽는다 — 앱에서 쓰지 않은 글도 진단할 수 있게.
 */
export async function fetchPublishedPost(url: string): Promise<PublishedPost | null> {
  const target = postViewUrl(url)
  if (!target) return null
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, Referer: 'https://blog.naver.com/' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = parsePostMetrics(html)
    if (!m || m.charCount < 200) return null
    return { ...m, title: parsePostTitle(html), url }
  } catch {
    return null
  }
}

/** 상위 글 여러 개를 동시에 잰다 (동시에 다 던지면 막히므로 묶어서) */
export async function measureTopPosts(urls: string[], limit = 6): Promise<PostBody[]> {
  const list = urls.filter(Boolean).slice(0, limit)
  const out: PostBody[] = []
  const BATCH = 3
  for (let i = 0; i < list.length; i += BATCH) {
    const got = await Promise.all(list.slice(i, i + BATCH).map((u) => fetchPostMetrics(u)))
    for (const g of got) if (g) out.push(g)
  }
  return out
}
