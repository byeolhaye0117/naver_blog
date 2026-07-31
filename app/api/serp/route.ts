import { NextResponse } from 'next/server'
import { searchBlog } from '@/lib/naver/search'
import { analyzeSerp } from '@/lib/analysis/serp'
import { keyStatus, NaverApiError } from '@/lib/naver/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keyword?: string; limit?: number }
    const keyword = body.keyword?.trim()
    if (!keyword) {
      return NextResponse.json({ error: '분석할 키워드를 입력하세요.' }, { status: 400 })
    }

    const limit = Math.min(Math.max(body.limit ?? 15, 5), 30)
    const res = await searchBlog(keyword, { display: limit, sort: 'sim' })
    const analysis = analyzeSerp(keyword, res.items, res.total, res.mock, limit)

    return NextResponse.json({ analysis, keyStatus: keyStatus() })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '상위노출 분석 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
