import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { blogIdFromInput } from '@/lib/naver/blogrss'
import { fetchBlogStat, fetchPostPage } from '@/lib/naver/blogstat'
import { BLOG_POSTS_PER_PAGE, markKnownPosts, pageCountOf, postListNote, postUrl } from '@/lib/analysis/blogposts'

export const dynamic = 'force-dynamic'
// 글 목록 1회 + 첫 화면 1회 — 진단(150초)과 달리 가볍다
export const maxDuration = 30

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

    return NextResponse.json({
      blogId,
      page,
      pages: pageCountOf(list.total),
      posts,
      stat,
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
