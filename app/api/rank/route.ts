import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { buildRankViews } from '@/lib/analysis/rank'
import { normalizeBlogUrl } from '@/lib/naver/blogsection'
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

  /**
   * 같은 글 + 같은 검색어를 두 번 등록하지 않게 막는다.
   *
   * 띄어쓰기만 다른 키워드는 **막지 않는다** — 네이버가 "쌍용동헬스장" 과
   * "쌍용동 헬스장" 을 다른 검색어로 취급해서 순위도 실제로 다르게 나온다
   * (실측: 13위 / 14위). 다만 그런 경우엔 알려준다.
   */
  const db0 = await readDB()
  const sameUrl = normalizeBlogUrl(url)
  const flat = (k: string) => k.replace(/\s+/g, '')
  const exact = db0.rankTargets.find(
    (t) => t.keyword.trim() === keyword && normalizeBlogUrl(t.url) === sameUrl
  )
  if (exact) {
    return NextResponse.json(
      { error: '같은 키워드로 이 글이 이미 등록돼 있습니다. 아래 목록에서 확인하세요.' },
      { status: 409 }
    )
  }
  const spacingTwin = db0.rankTargets.find(
    (t) => flat(t.keyword) === flat(keyword) && normalizeBlogUrl(t.url) === sameUrl
  )

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

  return NextResponse.json({
    target,
    // 띄어쓰기만 다른 같은 글이 이미 있으면 알려준다 (막지는 않는다)
    notice: spacingTwin
      ? `이 글은 「${spacingTwin.keyword}」로도 추적 중입니다. 네이버는 띄어쓰기가 다르면 다른 검색어로 취급해서 순위가 다르게 나옵니다 — 한쪽만 남기는 편이 헷갈리지 않습니다.`
      : undefined,
  })
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
