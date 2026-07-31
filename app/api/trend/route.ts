import { NextResponse } from 'next/server'
import { searchTrend } from '@/lib/naver/datalab'
import { keyStatus, NaverApiError } from '@/lib/naver/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keywords?: string[] }
    const keywords = (body.keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 5)
    if (!keywords.length) {
      return NextResponse.json({ error: '키워드를 입력하세요.' }, { status: 400 })
    }
    const series = await searchTrend(keywords)
    return NextResponse.json({ series, keyStatus: keyStatus() })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '트렌드 조회 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
