import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { guard } from '@/lib/api'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const GET = guard('글 목록을 불러오지 못했습니다.', async () => {
  const db = await readDB()
  return NextResponse.json({ posts: db.posts, stores: db.stores })
})

export const POST = guard('글 저장에 실패했습니다.', async (req: Request) => {
  const input = (await req.json()) as Partial<Post>
  const now = new Date().toISOString()

  const post: Post = {
    id: newId('post'),
    type: input.type ?? 'info',
    status: input.status ?? 'draft',
    storeId: input.storeId ?? '',
    title: input.title ?? '',
    body: input.body ?? '',
    mainKeyword: input.mainKeyword ?? '',
    subKeywords: input.subKeywords ?? [],
    localKeyword: input.localKeyword,
    tags: input.tags ?? [],
    introType: input.introType,
    angle: input.angle,
    format: input.format,
    topicGroup: input.topicGroup,
    sponsorship: input.sponsorship,
    eventText: input.eventText,
    publishedAt: input.publishedAt,
    publishedUrl: input.publishedUrl,
    createdAt: now,
    updatedAt: now,
  }

  await mutate((db) => {
    db.posts.unshift(post)
  })

  return NextResponse.json({ post })
})
