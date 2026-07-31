import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { buildRankViews } from '@/lib/analysis/rank'
import { checkRank } from '@/lib/analysis/rank-check'
import { keyStatus, NaverApiError } from '@/lib/naver/client'
import type { RankSnapshot } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 같은 날 재조회하면 기존 기록을 갱신한다 (하루에 한 점만 남기려고) */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { targetId?: string }
    const db = readDB()
    const targets = body.targetId
      ? db.rankTargets.filter((t) => t.id === body.targetId)
      : db.rankTargets

    if (!targets.length) {
      return NextResponse.json({ error: '추적 중인 항목이 없습니다.' }, { status: 400 })
    }

    const snapshots: RankSnapshot[] = []
    for (const t of targets) {
      snapshots.push(await checkRank(t))
    }

    const { db: next } = mutate((d) => {
      for (const snap of snapshots) {
        const idx = d.rankSnapshots.findIndex(
          (s) => s.targetId === snap.targetId && s.date === snap.date
        )
        if (idx === -1) d.rankSnapshots.push(snap)
        else d.rankSnapshots[idx] = snap
      }
    })

    return NextResponse.json({
      views: buildRankViews(next.rankTargets, next.rankSnapshots),
      checked: snapshots.length,
      keyStatus: keyStatus(),
    })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '순위 조회 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
