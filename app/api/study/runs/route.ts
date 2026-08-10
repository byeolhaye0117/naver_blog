import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * 쌓인 조사 런을 내려준다 (`npm run study:pull` 이 받아 간다).
 *
 * 크론은 배포된 앱에서 돌고 결과는 그쪽 저장소에 쌓인다. 분석은 로컬 스크립트가 하므로
 * 가져오는 길이 하나 필요하다 — 그게 이 엔드포인트다.
 *
 * `?since=YYYY-MM-DD` 로 그 날짜 이후만 받을 수 있다. 런이 쌓이면 응답이 커지므로
 * 이미 받아둔 것은 다시 안 받는 편이 낫다.
 */
export async function GET(req: Request) {
  const db = await readDB()
  const since = new URL(req.url).searchParams.get('since')?.trim()
  const runs = (db.studyRuns ?? []).filter((r) => (since ? r.date > since : true))
  return NextResponse.json({
    runs,
    total: (db.studyRuns ?? []).length,
    // 본문 측정값을 며칠에 걸쳐 갱신하므로, 언제 잰 것인지 함께 알려준다
    measuredRange: measuredRange(db.studyPosts ?? []),
  })
}

function measuredRange(posts: { measuredAt: string }[]): { from: string; to: string } | null {
  if (!posts.length) return null
  const dates = posts.map((p) => p.measuredAt).sort()
  return { from: dates[0], to: dates[dates.length - 1] }
}
