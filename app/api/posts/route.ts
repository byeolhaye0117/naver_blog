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

  /*
   * **빈 요청으로 글이 생기지 않게 막는다** (2026-08-11 전체 점검에서 찾았다).
   *
   * `POST /api/posts` 에 `{}` 를 보내면 빈 글이 하나 저장됐다. 화면에서는 그럴 일이
   * 없지만(글쓰기 화면은 늘 내용을 채워 보낸다), 요청이 두 번 가거나 잘못된 호출이
   * 오면 목록에 빈 글이 쌓인다. **넉넉하게** 막는다 — 네 칸 중 하나라도 있으면 통과다.
   */
  const filled = [input.storeId, input.title, input.body, input.mainKeyword].some(
    (v) => typeof v === 'string' && v.trim()
  )
  if (!filled) {
    return NextResponse.json(
      { error: '저장할 내용이 없습니다. 지점·제목·본문·메인 키워드 중 하나는 있어야 합니다.' },
      { status: 400 }
    )
  }

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
    promoNote: input.promoNote,
    publishedAt: input.publishedAt,
    publishedUrl: input.publishedUrl,
    revisedAt: input.revisedAt,
    createdAt: now,
    updatedAt: now,
  }

  await mutate((db) => {
    db.posts.unshift(post)
  })

  return NextResponse.json({ post })
})
