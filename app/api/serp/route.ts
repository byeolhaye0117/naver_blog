import { NextResponse } from 'next/server'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { recentBlogCount, topBlogPosts } from '@/lib/naver/blogsection'
import { keepPrescription } from '@/lib/analysis/keep-prescription'
import { readDB } from '@/lib/store'
import { measureTopPosts } from '@/lib/naver/blogpost'
import { buildCutline } from '@/lib/analysis/cutline'

export const dynamic = 'force-dynamic'
// 상위 글 본문까지 읽으므로(6개) 기본 10초로는 뒤쪽이 잘린다
export const maxDuration = 60

/**
 * 상위노출 분석 — 자동 경로.
 *
 * 블로그 섹션 검색의 관련도순 목록을 그대로 읽는다. 제목·발행일·블로거명·링크가 다 들어
 * 있으므로 사용자가 검색 결과를 붙여넣을 필요가 없다. 검색 API(openapi)는 이 계정에서
 * 권한이 막혀 있어(401 errorCode 024) 쓰지 않는다.
 *
 * 자동 조회가 막히면 items 가 비어 온다 — 그때만 붙여넣기(/api/serp/paste)로 안내한다.
 */
/** 본문까지 읽을 글 수 — 늘리면 정확해지지만 화면이 그만큼 늦어진다 */
const BODY_SAMPLE = 6

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

    /**
     * 상위 글 본문을 실제로 읽어 이 키워드의 커트라인을 잰다.
     *
     * 이게 없으면 검수 기준이 모든 키워드에 같다(본문 2,000자·이미지 5장). 실측하면
     * 판이 다르다 — "쌍용동 헬스장" 1위 글은 2,223자에 이미지 17장이었다.
     * 막히거나 느리면 커트라인만 없이 진행한다 (분석 자체는 그대로 나온다).
     */
    const measured = await measureTopPosts(
      top.items.map((i) => i.url),
      BODY_SAMPLE
    ).catch(() => [])
    const cutline = buildCutline(measured)

    // 우리 지점 이름을 넘겨야 "우리 상호" 와 "남의 상호" 를 가를 수 있다
    const myNames = (await readDB()).stores.flatMap((st) => [st.name, st.legalName])

    const analysis = analyzePastedSerp(
      keyword,
      top.items,
      recent.count ?? 0,
      limit,
      'section',
      cutline,
      myNames
    )
    await keepPrescription(analysis)
    return NextResponse.json({ analysis })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '상위노출 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
