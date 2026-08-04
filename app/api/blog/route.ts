import { NextResponse } from 'next/server'
import { blogIdFromInput, fetchBlogFeed } from '@/lib/naver/blogrss'
import { buildBlogProfile, meaningForUs, queryFromTitle } from '@/lib/analysis/blogscore'
import { findBlogRank } from '@/lib/naver/blogsection'

export const dynamic = 'force-dynamic'
// RSS 1회 + 노출력 표본 조회 3회
export const maxDuration = 60

/** 노출력을 잴 표본 수 — 늘리면 정확해지지만 그만큼 느려진다 */
const SAMPLE = 3
/** 이 순위 안에 있으면 "걸렸다" 로 본다 */
const SAMPLE_DEPTH = 30

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { blogId?: string; exposure?: boolean }
    const id = blogIdFromInput(body.blogId ?? '')
    if (!id) {
      return NextResponse.json(
        { error: '블로그 아이디나 주소를 넣어주세요 (예: blog.naver.com/아이디 또는 아이디).' },
        { status: 400 }
      )
    }

    const feed = await fetchBlogFeed(id)
    if (!feed) {
      return NextResponse.json(
        {
          error: `"${id}" 블로그의 글 목록을 읽지 못했습니다. 아이디가 맞는지 확인해 주세요 (RSS 를 막아둔 블로그는 읽을 수 없습니다).`,
        },
        { status: 404 }
      )
    }

    /**
     * 노출력 — 최근 글 몇 개가 실제로 상위에 걸리는지.
     *
     * 이게 없으면 지수는 "얼마나 부지런한가" 만 재는 셈이다. 실제로 검색에 걸리는지가
     * 블로그 힘의 핵심이므로 표본으로 확인한다. 시간이 걸려서 요청으로 켠다.
     */
    let exposureRate: number | undefined
    let exposureDetail: { query: string; rank: number | null }[] | undefined
    if (body.exposure !== false) {
      const picks = feed.items.filter((i) => queryFromTitle(i.title).length >= 4).slice(0, SAMPLE)
      const got: { query: string; rank: number | null }[] = []
      for (const it of picks) {
        const q = queryFromTitle(it.title)
        try {
          const r = await findBlogRank(q, it.link, SAMPLE_DEPTH)
          if (r.ok) got.push({ query: q, rank: r.rank })
        } catch {
          /* 한 표본이 실패해도 나머지로 센다 */
        }
      }
      if (got.length) {
        exposureDetail = got
        exposureRate = Math.round((got.filter((g) => g.rank !== null).length / got.length) * 100)
      }
    }

    const profile = buildBlogProfile(feed, undefined, exposureRate)

    return NextResponse.json({
      profile,
      meaning: meaningForUs(profile),
      exposureDetail,
      recent: feed.items.slice(0, 8).map((i) => ({ title: i.title, date: i.date, category: i.category, link: i.link })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블로그 진단 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
