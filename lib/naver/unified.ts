/**
 * 통합검색 스마트블록 — 실제로 사람이 보는 자리.
 *
 * **왜 필요한가.** 이 앱은 그동안 블로그탭 순위만 재면서 화면에 "스마트블록 자리는
 * 어떤 경로로도 볼 수 없습니다" 라고 안내했다. 틀린 안내였다. 모바일 통합검색을 읽으면
 * 블록 이름과 그 안의 순서가 그대로 나온다.
 *
 * 그리고 두 순위는 **실제로 다르다.** "쌍용동 헬스장" 실측:
 *   블로그탭            1위 hyoni2_ · 2위 pnpgym
 *   통합검색 「스포츠 인기글」  1번째 pnpgym · 2번째 hyoni2_
 * 즉 블로그탭만 보면 실제 노출을 절반만 보는 셈이다.
 *
 * 모바일을 읽는 이유: 우리 키워드는 모바일 검색이 70~90%다(검색광고 API 실측).
 */

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const TIMEOUT_MS = 8000
/** 테스트용 주소 갈아끼우기 */
const ENDPOINT =
  process.env.NAVER_UNIFIED_ENDPOINT?.trim() || 'https://m.search.naver.com/search.naver'

export interface UnifiedPost {
  blogId: string
  logNo: string
  url: string
}

export interface UnifiedBlock {
  /** 블록 이름 (「스포츠 인기글」 처럼). 못 읽으면 빈 문자열 */
  name: string
  /** 블록 안 순서대로 */
  posts: UnifiedPost[]
}

/**
 * 통합검색 HTML 에서 블로그 글이 들어 있는 블록을 순서대로 뽑는다 (순수 함수 — 테스트 대상).
 *
 * 네이버는 블록마다 `api_subject_bx` 를 붙인다. 다만 컨테이너가 겹쳐 있어서 같은 글
 * 묶음이 두 번 잡히므로, **글 목록이 같은 블록은 하나로 본다.**
 */
export function parseUnifiedBlocks(html: string): UnifiedBlock[] {
  const marks = [...html.matchAll(/api_subject_bx/g)].map((m) => m.index ?? 0)
  if (!marks.length) return []
  marks.push(html.length)

  const out: UnifiedBlock[] = []
  const seenSig = new Set<string>()

  for (let i = 0; i < marks.length - 1; i++) {
    const seg = html.slice(marks[i], marks[i + 1])

    const posts: UnifiedPost[] = []
    const seen = new Set<string>()
    for (const m of seg.matchAll(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/g)) {
      const key = `${m[1]}/${m[2]}`
      if (seen.has(key)) continue
      seen.add(key)
      posts.push({ blogId: m[1], logNo: m[2], url: `https://blog.naver.com/${key}` })
    }
    // 글이 한 편도 없거나 하나뿐인 묶음은 블록이 아니다 (광고·채널 카드 등)
    if (posts.length < 2) continue

    const sig = posts.map((p) => `${p.blogId}/${p.logNo}`).join(',')
    if (seenSig.has(sig)) continue
    seenSig.add(sig)

    const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(seg)
    const name = h2 ? plain(h2[1]) : ''
    out.push({ name, posts })
  }

  return out
}

function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 주소를 비교할 수 있는 꼴로 (blogId/logNo 만 남긴다) */
function key(url: string): string {
  const q = url.match(/[?&]blogId=([^&#]+)/i)
  if (q) {
    const log = url.match(/[?&]logNo=(\d+)/i)
    return `${q[1].toLowerCase()}/${log?.[1] ?? ''}`
  }
  const m = url.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/i)
  return m ? `${m[1].toLowerCase()}/${m[2]}` : ''
}

export interface UnifiedHit {
  /** 그 글이 있는 블록 이름 */
  block: string
  /** 블록 안에서 몇 번째인지 (1부터) */
  rank: number
  /** 페이지 전체에서 몇 번째 블록인지 (1부터) — 위에 있을수록 눈에 먼저 띈다 */
  blockOrder: number
}

/** 내 글이 통합검색 어느 블록 몇 번째에 있는지 (순수 함수 — 테스트 대상) */
export function findUnifiedRank(blocks: UnifiedBlock[], url: string): UnifiedHit | null {
  const needle = key(url)
  if (!needle) return null
  for (let b = 0; b < blocks.length; b++) {
    const posts = blocks[b].posts
    for (let i = 0; i < posts.length; i++) {
      if (key(posts[i].url) === needle) {
        return { block: blocks[b].name || '이름 없는 블록', rank: i + 1, blockOrder: b + 1 }
      }
    }
  }
  return null
}

/** 이 블로그(아이디)가 통합검색에 몇 편 올라와 있는지 — 선점 정도를 본다 */
export function countByBlogger(blocks: UnifiedBlock[]): { blogId: string; count: number }[] {
  const c = new Map<string, number>()
  for (const b of blocks) {
    for (const p of b.posts) c.set(p.blogId, (c.get(p.blogId) ?? 0) + 1)
  }
  return Array.from(c.entries())
    .map(([blogId, count]) => ({ blogId, count }))
    .sort((a, b) => b.count - a.count)
}

export async function fetchUnifiedBlocks(keyword: string): Promise<UnifiedBlock[] | null> {
  const q = keyword.trim()
  if (!q) return null
  try {
    const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseUnifiedBlocks(await res.text())
  } catch {
    return null
  }
}
