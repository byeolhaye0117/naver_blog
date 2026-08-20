import { NextResponse } from 'next/server'
import { topBlogPosts } from '@/lib/naver/blogsection'
import { fetchBlogStat, fetchPostPage, fetchSympathyCount } from '@/lib/naver/blogstat'
import { comparePeers, missingTypes, summarizePeer, type PeerPost, type PeerRow } from '@/lib/analysis/peers'

export const dynamic = 'force-dynamic'
/** 블로그마다 첫 화면 1 + 글 목록 1~2 + 공감 6 = 8~9콜. 6곳이면 50콜쯤 */
export const maxDuration = 300

/** 상위 몇 편의 블로그를 볼까 — 회원 요청이 「상위 5편」이다 */
const TOP = 5
/** 발행 간격·유형을 볼 표본 글 수 */
const RECENT = 30
/** 공감은 글마다 1콜이라 이 편수만 */
const LIKES = 6

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const blogIdOf = (url: string) =>
  (url ?? '').replace(/^https?:\/\/(m\.)?blog\.naver\.com\//, '').split('/')[0]

/**
 * 블로그 한 곳을 블로그 단위로 잰다.
 *
 * 첫 글 날짜는 **글 목록의 마지막 페이지**에서 가져온다 — 개설일은 밖에서 볼 수 없고, 첫 글
 * 날짜가 그 하한이다. 「개설일」이라고 적지 않고 「첫 글」이라고 적는 이유다.
 */
async function survey(blogId: string, where: string[], now: number): Promise<PeerRow | null> {
  const stat = await fetchBlogStat(blogId)
  await sleep(120)
  const head = await fetchPostPage(blogId, 1, RECENT)
  if (!stat && !head) return null
  await sleep(120)

  const rows = head?.posts ?? []
  const total = head?.total ?? stat?.postCount ?? null

  let firstPost: string | null = null
  if (total && total > RECENT) {
    const tail = await fetchPostPage(blogId, Math.ceil(total / RECENT), RECENT)
    await sleep(120)
    firstPost = (tail?.posts ?? []).map((p) => p.date).filter(Boolean).sort()[0] ?? null
  } else {
    firstPost = rows.map((p) => p.date).filter(Boolean).sort()[0] ?? null
  }

  const likes: (number | null)[] = []
  for (const p of rows.slice(0, LIKES)) {
    likes.push(await fetchSympathyCount(blogId, p.logNo))
    await sleep(100)
  }

  const posts: PeerPost[] = rows.map((p) => ({ title: p.title, date: p.date, commentCount: p.commentCount }))
  return summarizePeer({
    blogId,
    where,
    dayVisitors: stat?.dayVisitors ?? null,
    totalVisitors: stat?.totalVisitors ?? null,
    buddies: stat?.buddies ?? null,
    postCount: total,
    firstPost,
    posts,
    likes,
    now,
  })
}

/**
 * **상위 5편의 블로그를 우리와 블로그 단위로 비교한다.**
 *
 * 회원 요청 (2026-08-20): "경쟁 있는 키워드는 어떻게 쓰는 게 좋을지 … 상위 5편의 블로그와
 * 비교해서 블로그 개설일, 이웃수, 글의 유형, 글 발행 간격, 포스팅당 좋아요나 댓글 수 등을
 * 비교분석해서 알려주면 좋겠어."
 *
 * 글 한 편이 아니라 **블로그**를 본다. 점수로 합치지 않는다 (lib/analysis/peers.ts 주석).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keyword?: string; myBlogId?: string }
    const keyword = body.keyword?.trim()
    if (!keyword) {
      return NextResponse.json({ error: '키워드를 넣어주세요.' }, { status: 400 })
    }

    const page = await topBlogPosts(keyword, TOP)
    if (!page.items.length) {
      return NextResponse.json({ error: `「${keyword}」 상위 글을 읽지 못했습니다.` }, { status: 502 })
    }

    const myId = body.myBlogId?.trim() || null
    const now = Date.now()
    const seen = new Map<string, string[]>()
    page.items.forEach((it, i) => {
      const id = blogIdOf(it.url)
      if (!id) return
      if (!seen.has(id)) seen.set(id, [])
      seen.get(id)!.push(`${i + 1}위`)
    })

    const peers: PeerRow[] = []
    const failed: string[] = []
    for (const [id, where] of seen) {
      // 우리 블로그가 상위에 있으면 비교 대상이 아니라 우리다
      if (myId && id === myId) continue
      const r = await survey(id, where, now).catch(() => null)
      if (r) peers.push(r)
      else failed.push(id)
    }

    const mine = myId ? await survey(myId, ['우리'], now).catch(() => null) : null

    return NextResponse.json({
      keyword,
      measuredAt: new Date(now).toISOString(),
      peers,
      mine,
      axes: comparePeers(peers, mine),
      missing: missingTypes(peers, mine),
      failed,
      sampleNote: `상위 ${TOP}편의 블로그 ${peers.length}곳 · 블로그마다 최근 ${RECENT}편 (공감은 ${LIKES}편)`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '비교하지 못했습니다.' },
      { status: 500 }
    )
  }
}
