import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = readDB()
  return NextResponse.json({ posts: db.posts, stores: db.stores })
}

export async function POST(req: Request) {
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
    publishedAt: input.publishedAt,
    publishedUrl: input.publishedUrl,
    createdAt: now,
    updatedAt: now,
  }

  mutate((db) => {
    db.posts.unshift(post)
  })

  return NextResponse.json({ post })
}
