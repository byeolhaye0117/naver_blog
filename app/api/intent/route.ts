import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { fetchUnifiedBlocks } from '@/lib/naver/unified'
import { suggestPostType } from '@/lib/analysis/intent'
import type { FactorObservation } from '@/lib/analysis/factors'

export const dynamic = 'force-dynamic'
// 통합검색 1회만 읽는다
export const maxDuration = 30

/**
 * 「이 키워드는 어떤 글이 유리한가」 — 근거를 펼쳐 보이고 제안만 한다.
 *
 * 쌓아둔 관찰(factorRuns)에서 그 키워드의 경험·정보 신호를 꺼내고, 통합검색 블록
 * 이름을 한 번 읽는다. 결정은 회원이 한다 (lib/analysis/intent.ts 주석).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keyword?: string }
    const keyword = body.keyword?.trim()
    if (!keyword) {
      return NextResponse.json({ error: '키워드를 넣어주세요.' }, { status: 400 })
    }

    const db = await readDB()
    const runs = (db.factorRuns ?? []) as unknown as FactorObservation[]

    // 블록 이름은 있으면 좋고 없으면 없이 간다 (관찰 기록만으로도 제안이 나온다)
    const blocks = await fetchUnifiedBlocks(keyword).catch(() => null)

    const suggestion = suggestPostType({
      keyword,
      blocks: blocks?.map((b) => b.name).filter(Boolean),
      runs,
    })

    return NextResponse.json({
      keyword,
      ...suggestion,
      observedRuns: runs.filter((r) => r.keyword === keyword).length,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '제안을 만드는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
