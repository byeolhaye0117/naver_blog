import { NextResponse } from 'next/server'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { parseEditedList, parseTotalCount } from '@/lib/analysis/paste'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { keepPrescription } from '@/lib/analysis/keep-prescription'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * 네이버 검색 결과를 직접 붙여넣어 상위노출 분석.
 * 검색 API 없이 쓰는 경로이므로 외부 호출이 전혀 없다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keyword?: string; list?: string; total?: string }
    const keyword = body.keyword?.trim()
    if (!keyword) {
      return NextResponse.json({ error: '분석할 키워드를 입력하세요.' }, { status: 400 })
    }

    const items = parseEditedList(body.list ?? '')
    if (items.length < 3) {
      return NextResponse.json(
        { error: `분석할 글이 ${items.length}개뿐입니다. 상위 글을 3개 이상 넣어주세요.` },
        { status: 400 }
      )
    }

    // 발행량은 자동으로 가져온다 (최근 30일 기준 — 키워드 조사와 같은 경로).
    // 통합검색 블로그 탭에는 총 건수 표시가 없어졌으므로 사람에게 물어볼 수 없다.
    const auto = await recentBlogCount(keyword).catch(() => ({ count: null }))
    let total = auto.count ?? 0

    // 자동 조회가 막혔을 때만 넘어온 값을 쓴다
    if (!total) {
      const raw = (body.total ?? '').trim()
      const digits = Number(raw.replace(/[^\d]/g, ''))
      if (raw) total = parseTotalCount(raw) ?? (Number.isFinite(digits) ? digits : 0)
    }

    // 붙여넣어 분석한 것도 처방은 똑같이 남긴다 — 글 쓸 때 자동으로 꺼내 쓴다
    const analysis = analyzePastedSerp(keyword, items, total)
    await keepPrescription(analysis)
    return NextResponse.json({ analysis })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
