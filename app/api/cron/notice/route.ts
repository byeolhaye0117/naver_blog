import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { fetchBlogFeed } from '@/lib/naver/blogrss'
import {
  NOTICE_SOURCES,
  classifyNotice,
  mergeNotices,
  unreviewed,
  type NoticeItem,
} from '@/lib/naver/notice'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 남겨둘 공지 수 — 채널 2곳 × 최근 50건이면 넉넉하다 */
const KEEP = 120

/**
 * **네이버 공지·검색 로직 소식을 매일 받는다.**
 *
 * 회원 요청 (2026-08-20): "네이버 로직과 공지사항을 항상 최신화해서 그에 맞는 글을 쓸 수
 * 있도록 해줘."
 *
 * 받아서 **알리는 것까지**가 자동이다. 규칙으로 옮기는 것은 사람이 읽고 정한다
 * (lib/naver/notice.ts 주석) — 제목만 보고 지시문을 고치면 읽지도 않은 문장으로 글쓰기
 * 규칙을 바꾸는 셈이 된다.
 *
 * 한 채널이라도 읽히면 저장한다. 둘 다 실패한 날은 저장하지 않는다 — 빈 목록으로 덮으면
 * 「새 공지가 없다」로 보인다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const fresh: NoticeItem[] = []
  const failed: string[] = []
  for (const src of NOTICE_SOURCES) {
    const feed = await fetchBlogFeed(src.id)
    if (!feed) {
      failed.push(src.name)
      continue
    }
    for (const item of feed.items) {
      const verdict = classifyNotice(item.title)
      fresh.push({
        url: item.link,
        source: src.name,
        title: item.title,
        date: item.date,
        tags: verdict.tags,
        relevant: verdict.relevant,
      })
    }
  }

  if (!fresh.length) {
    return NextResponse.json(
      { error: '공지를 하나도 읽지 못했습니다. 어제 목록을 그대로 둡니다.', failed },
      { status: 502 }
    )
  }

  const before = (await readDB()).noticeItems ?? []
  const known = new Set(before.map((n) => n.url.split('?')[0]))
  const added = fresh.filter((n) => !known.has(n.url.split('?')[0]))

  await mutate((cur) => {
    cur.noticeItems = mergeNotices(cur.noticeItems, fresh, KEEP)
  })

  const after = (await readDB()).noticeItems ?? []
  return NextResponse.json({
    read: fresh.length,
    added: added.length,
    /** 새로 들어온 것 중 우리가 읽어야 할 것 */
    addedRelevant: added.filter((n) => n.relevant).map((n) => ({ date: n.date, title: n.title, tags: n.tags })),
    pending: unreviewed(after).length,
    stored: after.length,
    failed,
  })
}
