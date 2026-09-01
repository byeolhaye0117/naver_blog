import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { blogIdFromInput } from '@/lib/naver/blogrss'
import { fetchBlogStat, fetchPostPage } from '@/lib/naver/blogstat'
import {
  BLOG_POSTS_PER_PAGE,
  markKnownPosts,
  mixNote,
  pageCountOf,
  postListNote,
  postMix,
  postUrl,
} from '@/lib/analysis/blogposts'

export const dynamic = 'force-dynamic'
// 목록 1회 + 첫 화면 1회 (+ 첫 쪽에서만 비율용 2회) — 진단(150초)과 달리 가볍다
export const maxDuration = 30

/**
 * **정보성:홍보성 비율은 몇 편으로 재나** (2026-09-01 회원 요청).
 *
 * 한 쪽(30편)만으로 재면 그 달에 홍보를 몰아 쓴 것만으로 비율이 확 튄다. 그렇다고 287편을
 * 다 읽으면 조회가 열 번이다. **최근 90편**이면 회원 블로그 기준 석 달치라 흐름이 잡히고
 * 조회는 세 번이다. 몇 편으로 쟀는지는 화면에 그대로 적는다.
 */
const MIX_PAGES = 3

/**
 * **아이디 하나로 그 블로그 글 목록을 읽는다** (2026-09-01 회원 요청).
 *
 * "블로그 url 앞에 있는 아이디를 보고 이 아이디에 어떤 글들을 썼는지 확인할 수 있는
 * 페이지 만들어주면 좋겠어."
 *
 * 읽는 곳은 `blog.naver.com/PostTitleListAsync.naver` 다 — **로그인 없이** 남의 블로그도
 * 읽힌다 (blogstat.ts 주석의 실측). 제목·날짜·댓글 수·검색 허용 여부까지 나온다.
 *
 * 진단(`/api/blog`)과 따로 두는 이유는 **값이 다르기 때문**이다. 진단은 조회가 수십 번
 * 들어가 150초를 잡아 두는데, 목록만 보는 데 그 값을 치를 이유가 없다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; page?: number }
    const blogId = blogIdFromInput(body.id ?? '')
    if (!blogId) {
      return NextResponse.json({ error: '블로그 아이디나 글 주소를 넣어주세요.' }, { status: 400 })
    }
    const page = Number.isFinite(body.page) ? Math.max(0, Math.trunc(body.page as number)) : 0

    // 목록과 첫 화면은 서로 기다릴 이유가 없다
    const [list, stat] = await Promise.all([
      fetchPostPage(blogId, page + 1, BLOG_POSTS_PER_PAGE),
      fetchBlogStat(blogId).catch(() => null),
    ])
    if (!list) {
      return NextResponse.json(
        { error: `「${blogId}」의 글 목록을 읽지 못했습니다. 아이디가 맞는지 확인해 주세요 (없는 블로그이거나 네이버가 잠시 막았을 수 있습니다).` },
        { status: 502 }
      )
    }

    /*
     * **우리가 아는 글에 표시를 붙인다.** 목록만 보면 남의 글도 내 글도 제목 한 줄이다.
     * 회원이 자기 블로그를 볼 때 먼저 궁금한 것은 「앱에서 쓴 글인가」·「순위를 재고
     * 있나」이고, 둘 다 우리가 이미 아는 사실이다.
     */
    const db = await readDB()
    const marks = markKnownPosts(
      list.posts.map((p) => p.logNo),
      db
    )

    const posts = list.posts.map((p) => ({
      ...p,
      url: postUrl(blogId, p.logNo),
      postId: marks[p.logNo]?.postId,
      targetId: marks[p.logNo]?.targetId,
    }))

    /*
     * **비율은 첫 쪽을 열 때만 잰다.** 넘겨 볼 때마다 세 번씩 더 조회할 이유가 없고,
     * 화면은 처음 받은 값을 그대로 들고 있으면 된다.
     */
    let mix
    let mixNoteText
    if (page === 0) {
      const more = await Promise.all(
        Array.from({ length: MIX_PAGES - 1 }, (_, i) =>
          fetchPostPage(blogId, i + 2, BLOG_POSTS_PER_PAGE).catch(() => null)
        )
      )
      const rows = [...list.posts, ...more.flatMap((m) => m?.posts ?? [])]
      mix = postMix(rows, db)
      mixNoteText = mixNote(mix)
    }

    return NextResponse.json({
      blogId,
      page,
      pages: pageCountOf(list.total),
      posts,
      stat,
      mix,
      mixNote: mixNoteText,
      note: postListNote({
        total: list.total,
        shown: posts.length,
        page,
        hidden: posts.filter((p) => !p.searchable).length,
        closed: posts.filter((p) => !p.open).length,
      }),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '글 목록을 읽는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
