import { NextResponse } from 'next/server'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { recentBlogCount, topBlogPosts } from '@/lib/naver/blogsection'
import { keepPrescription } from '@/lib/analysis/keep-prescription'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * 상위노출 분석 — 자동 경로.
 *
 * 블로그 섹션 검색의 관련도순 목록을 그대로 읽는다. 제목·발행일·블로거명·링크가 다 들어
 * 있으므로 사용자가 검색 결과를 붙여넣을 필요가 없다. 검색 API(openapi)는 이 계정에서
 * 권한이 막혀 있어(401 errorCode 024) 쓰지 않는다.
 *
 * 자동 조회가 막히면 items 가 비어 온다 — 그때만 붙여넣기(/api/serp/paste)로 안내한다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keyword?: string; limit?: number }
    const keyword = body.keyword?.trim()
    if (!keyword) {
      return NextResponse.json({ error: '분석할 키워드를 입력하세요.' }, { status: 400 })
    }

    const limit = Math.min(Math.max(body.limit ?? 15, 5), 30)

    // 목록과 발행량은 서로 다른 조회다 (목록 = 관련도순, 발행량 = 최근 30일 창).
    // 둘을 동시에 던져 화면 대기 시간을 반으로 줄인다.
    const [top, recent] = await Promise.all([
      topBlogPosts(keyword, limit),
      recentBlogCount(keyword).catch(() => ({ count: null as number | null })),
    ])

    if (!top.items.length) {
      return NextResponse.json(
        {
          error:
            '네이버에서 상위 글 목록을 가져오지 못했습니다. 잠시 후 다시 시도하거나, 아래 「붙여넣어 분석」으로 진행하세요.',
        },
        { status: 502 }
      )
    }

    const analysis = analyzePastedSerp(keyword, top.items, recent.count ?? 0, limit, 'section')
    await keepPrescription(analysis)
    return NextResponse.json({ analysis })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '상위노출 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
