import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { guard } from '@/lib/api'
import { autoRankTargets } from '@/lib/analysis/rank'
import { newId } from '@/lib/id'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const GET = guard('글을 불러오지 못했습니다.', async (_req: Request, { params }: Ctx) => {
  const { id } = await params
  const db = await readDB()
  const post = db.posts.find((p) => p.id === id)
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ post })
})

export const PATCH = guard('글 저장에 실패했습니다.', async (req: Request, { params }: Ctx) => {
  const { id } = await params
  const patch = (await req.json()) as Partial<Post>

  const { result } = await mutate((db) => {
    const idx = db.posts.findIndex((p) => p.id === id)
    if (idx === -1) return null
    const next: Post = {
      ...db.posts[idx],
      ...patch,
      id,
      createdAt: db.posts[idx].createdAt,
      updatedAt: new Date().toISOString(),
    }
    // 발행완료로 바꿀 때 발행일이 비어 있으면 오늘로 채운다
    if (next.status === 'published' && !next.publishedAt) {
      next.publishedAt = new Date().toISOString().slice(0, 10)
    }
    db.posts[idx] = next

    /*
     * 발행 주소가 들어오면 순위 추적에 바로 등록한다.
     * 예전에는 발행하고 나서 순위 화면에 가서 키워드와 주소를 손으로 다시 넣어야 했다 —
     * 발행 첫날부터 추세를 보려면 그 단계가 없어야 한다.
     */
    const seeds = autoRankTargets(next, db.rankTargets)
    for (const seed of seeds) {
      db.rankTargets.push({ id: newId('rt'), ...seed, createdAt: new Date().toISOString() })
    }
    return { post: next, tracked: seeds.length }
  })

  if (!result) return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({
    post: result.post,
    // 자동 등록됐으면 화면에서 알려준다
    tracked: result.tracked,
  })
})

export const DELETE = guard('글 삭제에 실패했습니다.', async (_req: Request, { params }: Ctx) => {
  const { id } = await params
  await mutate((db) => {
    db.posts = db.posts.filter((p) => p.id !== id)
    // 이 글에 걸린 순위 추적도 함께 정리
    const orphaned = db.rankTargets.filter((t) => t.postId === id).map((t) => t.id)
    db.rankTargets = db.rankTargets.filter((t) => t.postId !== id)
    db.rankSnapshots = db.rankSnapshots.filter((s) => !orphaned.includes(s.targetId))
  })
  return NextResponse.json({ ok: true })
})
