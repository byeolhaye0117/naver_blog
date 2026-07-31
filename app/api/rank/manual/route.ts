import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { buildRankViews } from '@/lib/analysis/rank'
import { guard } from '@/lib/api'
import type { RankSnapshot } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * 네이버에서 직접 본 순위를 기록한다.
 *
 * 검색 API 를 못 쓰는 경우(신규 발급 제한 등)에도 순위 추적을 그대로 쓸 수 있게 하는 경로다.
 * API 가 되는 경우에도 유용하다 — API 는 평면 목록만 주고 스마트블록 자리를 못 보므로,
 * 사용자가 실제로 본 순위가 더 정확하다.
 *
 * 같은 날 같은 항목을 다시 입력하면 덮어쓴다 (하루에 한 점).
 */
export const PUT = guard('순위 입력에 실패했습니다.', async (req: Request) => {
  const body = (await req.json()) as {
    targetId?: string
    date?: string
    /** null 또는 미입력 = 순위 밖 */
    rank?: number | null
    note?: string
  }

  const targetId = body.targetId?.trim()
  if (!targetId) {
    return NextResponse.json({ error: '추적 항목을 지정하세요.' }, { status: 400 })
  }

  const db = await readDB()
  if (!db.rankTargets.some((t) => t.id === targetId)) {
    return NextResponse.json({ error: '추적 항목을 찾을 수 없습니다.' }, { status: 404 })
  }

  const rank =
    body.rank === null || body.rank === undefined || Number.isNaN(body.rank)
      ? null
      : Math.round(body.rank)
  if (rank !== null && (rank < 1 || rank > 300)) {
    return NextResponse.json({ error: '순위는 1~300 사이로 입력하세요.' }, { status: 400 })
  }

  const date = (body.date || new Date().toISOString().slice(0, 10)).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const snap: RankSnapshot = {
    id: newId('snap'),
    targetId,
    date,
    rank,
    source: 'manual',
    note: body.note?.trim() || undefined,
  }

  const { db: next } = await mutate((d) => {
    const idx = d.rankSnapshots.findIndex((s) => s.targetId === targetId && s.date === date)
    if (idx === -1) d.rankSnapshots.push(snap)
    else d.rankSnapshots[idx] = { ...snap, id: d.rankSnapshots[idx].id }
  })

  return NextResponse.json({
    views: buildRankViews(next.rankTargets, next.rankSnapshots, next.posts),
  })
})
