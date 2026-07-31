import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { buildRankViews } from '@/lib/analysis/rank'
import type { RankTarget } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = readDB()
  return NextResponse.json({ views: buildRankViews(db.rankTargets, db.rankSnapshots) })
}

export async function POST(req: Request) {
  const input = (await req.json()) as Partial<RankTarget>
  const keyword = input.keyword?.trim()
  const url = input.url?.trim()
  if (!keyword || !url) {
    return NextResponse.json({ error: '키워드와 내 글 URL(또는 블로그 ID)이 모두 필요합니다.' }, { status: 400 })
  }

  const target: RankTarget = {
    id: newId('rt'),
    keyword,
    url,
    postId: input.postId,
    label: input.label,
    createdAt: new Date().toISOString(),
  }

  mutate((db) => {
    db.rankTargets.push(target)
  })

  return NextResponse.json({ target })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })
  mutate((db) => {
    db.rankTargets = db.rankTargets.filter((t) => t.id !== id)
    db.rankSnapshots = db.rankSnapshots.filter((s) => s.targetId !== id)
  })
  return NextResponse.json({ ok: true })
}
