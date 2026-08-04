import { NextResponse } from 'next/server'
import { topBlogPosts } from '@/lib/naver/blogsection'
import { measureTopPosts } from '@/lib/naver/blogpost'
import { compareWithTop, MIN_LENGTH, SIMILARITY_CAVEAT } from '@/lib/analysis/similarity'

export const dynamic = 'force-dynamic'
// 상위 글 본문을 읽어야 하므로(6편) 기본 10초로는 모자란다
export const maxDuration = 60

/** 견줄 상위 글 수 — 늘리면 정확해지지만 그만큼 늦어진다 */
const SAMPLE = 6

/**
 * 유사문서 판독 — 내 초안이 이 키워드 상위 글과 글자 그대로 얼마나 겹치는지.
 *
 * 본문은 서버에서만 다룬다 — 상위 글 원문을 화면으로 내려보내지 않고, 겹친 구절만
 * (그것도 **내 글에서 잘라낸 것**으로) 돌려준다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keyword?: string; text?: string }
    const keyword = body.keyword?.trim()
    const text = body.text ?? ''

    if (!keyword) {
      return NextResponse.json({ error: '메인 키워드를 먼저 정해주세요.' }, { status: 400 })
    }
    if (text.replace(/\s/g, '').length < MIN_LENGTH) {
      return NextResponse.json(
        {
          error: `본문이 ${MIN_LENGTH}자(공백 제외)는 넘어야 견줄 수 있습니다. 짧은 글은 겹침 비율이 튀어서 없는 문제를 만들어냅니다.`,
        },
        { status: 400 }
      )
    }

    const top = await topBlogPosts(keyword, 10)
    if (!top.items.length) {
      return NextResponse.json(
        { error: '네이버에서 상위 글 목록을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 502 }
      )
    }

    const measured = await measureTopPosts(
      top.items.map((i) => i.url),
      SAMPLE
    )
    if (!measured.length) {
      return NextResponse.json(
        {
          error:
            '상위 글 본문을 한 편도 읽지 못했습니다 (막혔거나 접근 제한 글). 견주지 못했다는 뜻이며, 겹치지 않는다는 뜻이 아닙니다.',
        },
        { status: 502 }
      )
    }

    const report = compareWithTop(text, measured)
    if (!report) {
      return NextResponse.json({ error: '견줄 수 있는 본문이 없었습니다.' }, { status: 502 })
    }

    // 어느 글과 겹쳤는지 알려주려면 제목이 필요하다 (주소만으로는 못 알아본다)
    const titleOf = new Map(top.items.map((i) => [i.url, i.title]))
    return NextResponse.json({
      ...report,
      hits: report.hits.map((h) => ({ ...h, title: titleOf.get(h.url) ?? '' })),
      caveat: SIMILARITY_CAVEAT,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '유사문서 판독 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
