import { NextResponse } from 'next/server'
import { lookupPlaces } from '@/lib/naver/place'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * 상호명으로 네이버 플레이스 정보를 찾는다 (주소·업종·전화·예약링크).
 * 키가 필요 없는 경로다 — 통합검색 결과에 들어 있는 플레이스 JSON 을 읽는다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string }
    const query = body.query?.trim()
    if (!query) {
      return NextResponse.json({ error: '찾을 상호명을 입력하세요.' }, { status: 400 })
    }

    const places = await lookupPlaces(query)
    return NextResponse.json({ places })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '플레이스 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
