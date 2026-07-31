import { NextResponse } from 'next/server'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { parseEditedList, parseTotalCount } from '@/lib/analysis/paste'

export const dynamic = 'force-dynamic'

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

    // "2,345건" 처럼 붙여넣어도 되고 숫자만 적어도 된다. 없으면 0 = 모름.
    const raw = (body.total ?? '').trim()
    const digits = Number(raw.replace(/[^\d]/g, ''))
    const total = raw ? (parseTotalCount(raw) ?? (Number.isFinite(digits) ? digits : 0)) : 0

    return NextResponse.json({ analysis: analyzePastedSerp(keyword, items, total) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
