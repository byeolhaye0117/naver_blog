import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { guard } from '@/lib/api'
import { collectNotices, mergeNotices, noticeKey } from '@/lib/naver/notice'
import { fetchBlogFeed } from '@/lib/naver/blogrss'

export const dynamic = 'force-dynamic'

export const GET = guard('공지를 불러오지 못했습니다.', async () => {
  return NextResponse.json({ items: (await readDB()).noticeItems ?? [] })
})

/**
 * 공지 하나를 **읽었다고 표시**하거나, 거기서 뽑은 **규칙 한 줄**을 저장한다.
 *
 * 회원 요청 (2026-08-20): "네이버 로직과 공지사항을 항상 최신화해서 그에 맞는 글을 쓸 수
 * 있도록 해줘." 받아오는 것은 크론이 하고, **무엇을 규칙으로 삼을지는 사람이 정한다** —
 * 제목만 보고 자동으로 지시문을 고치면 읽지도 않은 문장으로 글쓰기가 바뀐다.
 */
export const PATCH = guard('공지를 저장하지 못했습니다.', async (req: Request) => {
  const body = (await req.json()) as { url?: string; reviewed?: boolean; rule?: string }
  const url = body.url?.trim()
  if (!url) return NextResponse.json({ error: '어느 공지인지 알 수 없습니다.' }, { status: 400 })

  const { result } = await mutate((db) => {
    const list = db.noticeItems ?? []
    const idx = list.findIndex((n) => noticeKey(n.url) === noticeKey(url))
    if (idx === -1) return false
    const rule = body.rule?.trim()
    list[idx] = {
      ...list[idx],
      // 「확인함」은 되돌리지 않는다 — 한 번 읽은 것을 안 읽음으로 만들 이유가 없다
      reviewedAt: body.reviewed ? (list[idx].reviewedAt ?? new Date().toISOString()) : list[idx].reviewedAt,
      // 빈 문자열을 보내면 규칙을 뺀다 (반영을 그만두는 길이 있어야 한다)
      rule: rule ? rule : undefined,
    }
    db.noticeItems = list
    return true
  })

  if (!result) return NextResponse.json({ error: '그 공지를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ items: (await readDB()).noticeItems ?? [] })
})

/** 크론과 같은 상한 — 채널 2곳 × 최근 50건이면 넉넉하다 */
const KEEP = 120

/**
 * **지금 받아오기** — 크론을 기다리지 않고 화면에서 누른다.
 *
 * 크론은 매일 아침 7시에 돌지만, 새 공지가 났다는 얘기를 들었을 때 바로 확인할 수 있어야
 * 한다. 「지금 뚫릴 만한 키워드」와 같은 방식이다 (자동 + 버튼, 재는 함수는 하나).
 *
 * 하나도 못 읽은 경우 저장하지 않는다 — 빈 목록으로 덮으면 「새 공지가 없다」로 보인다.
 */
export const POST = guard('공지를 받아오지 못했습니다.', async () => {
  const { items: fresh, failed } = await collectNotices({ feed: (id) => fetchBlogFeed(id) })
  if (!fresh.length) {
    return NextResponse.json(
      { error: '공지를 하나도 읽지 못했습니다 (네이버 호출 실패). 기존 목록을 그대로 둡니다.', failed },
      { status: 502 }
    )
  }

  const before = (await readDB()).noticeItems ?? []
  const known = new Set(before.map((n) => noticeKey(n.url)))
  const added = fresh.filter((n) => !known.has(noticeKey(n.url)))

  await mutate((cur) => {
    cur.noticeItems = mergeNotices(cur.noticeItems, fresh, KEEP)
  })

  return NextResponse.json({
    items: (await readDB()).noticeItems ?? [],
    added: added.length,
    failed,
  })
})
