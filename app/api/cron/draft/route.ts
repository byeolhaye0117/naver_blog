import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { newId } from '@/lib/id'
import { AUTO_MARK, hasTodayAutoDraft, pickAssignment } from '@/lib/writing/autodraft'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'
/*
 * 글 한 편은 AI 호출 한 번 + (걸리면) 고쳐 쓰기 한 번이다. 손으로 눌렀을 때 2~4분이
 * 걸리므로 /api/write 와 같은 상한을 준다.
 */
export const maxDuration = 300

/**
 * **정보글 초안을 매일 한 편 써 둔다** (2026-08-21, 회원 요청).
 *
 * ── 왜 /api/write 를 다시 부르나 ─────────────────────────────
 * 글쓰기 절차는 이미 한 곳에 있다 — 지시문 만들기 · AI 호출 · 검수 · 고쳐 쓰기 · 제목과
 * 본문을 따로 채점해 좋은 쪽 고르기. 그걸 여기 옮겨 적으면 **두 벌이 되고 한쪽만 고치는
 * 날이 온다.** 이 저장소에서 이번 주에만 여섯 번 그랬다.
 *
 * 그래서 크론은 **무엇을 쓸지 정해서 넘기고 결과를 저장하는 일만** 한다. 함수 호출이 한 번
 * 더 생기는 값은 치르더라도, 글쓰기 규칙이 한 곳에만 있는 편이 낫다.
 *
 * ── 자동으로 발행하지 않는다 ────────────────────────────────
 * 네이버 블로그 글쓰기 API 는 없어졌고, 로그인해서 대신 올리는 방식은 자동화 도구로 취급돼
 * 계정이 위험해진다. 이 앱은 회원 계정으로 글을 올리지 않는다 — 초안까지가 자동이다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const db = await readDB()
  const today = new Date().toISOString().slice(0, 10)

  // 크론 재시도·손으로 한 번 더 누르기 — 어느 쪽이든 하루 한 편이다
  if (hasTodayAutoDraft(db.posts, today)) {
    return NextResponse.json({ skipped: '오늘 자동 초안이 이미 있습니다.', date: today })
  }

  const store = db.stores?.[0]
  if (!store) {
    return NextResponse.json({ skipped: '지점이 없습니다. 지점을 먼저 등록해주세요.' })
  }

  /*
   * 키워드는 **순위 추적에 등록한 것**을 쓴다. 회원이 「이걸로 올라가고 싶다」고 직접 적어둔
   * 목록이라, 자동으로 쓰는 글이 그 목록을 벗어나지 않는다. 비어 있으면 지점의 지역
   * 키워드로 넘어간다.
   */
  const keywords = (db.rankTargets ?? []).map((t) => t.keyword).filter(Boolean)
  const pool = keywords.length ? keywords : (store.localKeywords ?? [])
  const assignment = pickAssignment({ posts: db.posts, keywords: pool })
  if (!assignment) {
    return NextResponse.json({ skipped: '쓸 키워드가 없습니다. 순위 추적에 키워드를 등록해주세요.' })
  }

  /*
   * 자기 자신을 부른다. Vercel 은 VERCEL_URL 로 배포 주소를 준다 — 로컬에서는 없으므로
   * 그때는 못 돈다고 분명히 답한다 (조용히 아무것도 안 하면 「왜 글이 없지」가 된다).
   */
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL?.trim()
  if (!base) {
    return NextResponse.json(
      { error: '배포 주소를 찾지 못했습니다 (VERCEL_URL). 로컬에서는 이 크론이 돌지 않습니다.' },
      { status: 500 }
    )
  }

  const res = await fetch(`${base}/api/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'info',
      storeId: store.id,
      mainKeyword: assignment.mainKeyword,
      subKeywords: [],
      infoTopic: assignment.topic,
    }),
  })

  const data = (await res.json().catch(() => null)) as
    | { title?: string; body?: string; tags?: string[]; check?: { score?: number }; error?: string }
    | null

  if (!res.ok || !data?.body) {
    return NextResponse.json(
      { error: data?.error ?? '글을 쓰지 못했습니다.', assignment, status: res.status },
      { status: 502 }
    )
  }

  const now = new Date().toISOString()
  const post: Post = {
    id: newId('post'),
    type: 'info',
    status: 'draft',
    storeId: store.id,
    title: data.title ?? '',
    body: data.body,
    mainKeyword: assignment.mainKeyword,
    subKeywords: [],
    tags: data.tags ?? [],
    // 무엇으로 골랐는지 남긴다 — 다음 로테이션이 이 값을 읽는다
    topicGroup: assignment.topic,
    format: AUTO_MARK,
    createdAt: now,
    updatedAt: now,
  }
  await mutate((d) => {
    d.posts.unshift(post)
  })

  return NextResponse.json({
    saved: post.id,
    date: today,
    keyword: assignment.mainKeyword,
    topic: assignment.topic,
    why: assignment.why,
    score: data.check?.score ?? null,
  })
}
