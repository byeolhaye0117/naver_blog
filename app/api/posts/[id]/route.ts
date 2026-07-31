import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const db = readDB()
  const post = db.posts.find((p) => p.id === id)
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ post })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const patch = (await req.json()) as Partial<Post>

  const { result } = mutate((db) => {
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
    return next
  })

  if (!result) return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ post: result })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  mutate((db) => {
    db.posts = db.posts.filter((p) => p.id !== id)
    // 이 글에 걸린 순위 추적도 함께 정리
    const orphaned = db.rankTargets.filter((t) => t.postId === id).map((t) => t.id)
    db.rankTargets = db.rankTargets.filter((t) => t.postId !== id)
    db.rankSnapshots = db.rankSnapshots.filter((s) => !orphaned.includes(s.targetId))
  })
  return NextResponse.json({ ok: true })
}
