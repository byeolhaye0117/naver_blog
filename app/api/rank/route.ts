import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { buildRankViews } from '@/lib/analysis/rank'
import { guard } from '@/lib/api'
import type { RankTarget } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const GET = guard('순위 목록을 불러오지 못했습니다.', async () => {
  const db = await readDB()
  return NextResponse.json({ views: buildRankViews(db.rankTargets, db.rankSnapshots, db.posts) })
})

export const POST = guard('추적 항목 등록에 실패했습니다.', async (req: Request) => {
  const input = (await req.json()) as Partial<RankTarget>
  const keyword = input.keyword?.trim()
  const url = input.url?.trim()
  if (!keyword || !url) {
    return NextResponse.json(
      { error: '키워드와 내 글 URL(또는 블로그 ID)이 모두 필요합니다.' },
      { status: 400 }
    )
  }

  const target: RankTarget = {
    id: newId('rt'),
    keyword,
    url,
    postId: input.postId,
    label: input.label,
    publishedAt: input.publishedAt?.slice(0, 10) || undefined,
    createdAt: new Date().toISOString(),
  }

  await mutate((db) => {
    db.rankTargets.push(target)
  })

  return NextResponse.json({ target })
})

export const DELETE = guard('추적 항목 삭제에 실패했습니다.', async (req: Request) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })
  await mutate((db) => {
    db.rankTargets = db.rankTargets.filter((t) => t.id !== id)
    db.rankSnapshots = db.rankSnapshots.filter((s) => s.targetId !== id)
  })
  return NextResponse.json({ ok: true })
})
