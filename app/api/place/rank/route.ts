import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { guard } from '@/lib/api'
import { newId } from '@/lib/id'
import type { PlaceRank } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const GET = guard('플레이스 순위 기록을 불러오지 못했습니다.', async () => {
  return NextResponse.json({ placeRanks: (await readDB()).placeRanks })
})

/**
 * 눈으로 확인한 플레이스 순위를 기록한다.
 *
 * 자동 조회는 통합검색 플레이스 블록 7곳까지만 읽히므로, 그 아래 순위는 사람이 봐야
 * 알 수 있다. 블로그 순위 추적과 같은 방식이다 — 같은 날 다시 넣으면 덮어쓴다.
 */
export const PUT = guard('플레이스 순위 저장에 실패했습니다.', async (req: Request) => {
  const body = (await req.json()) as Partial<PlaceRank>
  const keyword = body.keyword?.trim()
  const storeId = body.storeId?.trim()
  const rank = Number(body.rank)

  if (!keyword) return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 })
  if (!storeId) return NextResponse.json({ error: '지점을 골라주세요.' }, { status: 400 })
  if (!Number.isInteger(rank) || rank < 1 || rank > 300) {
    return NextResponse.json({ error: '순위는 1~300 사이 정수로 넣어주세요.' }, { status: 400 })
  }

  const date = body.date?.trim() || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 })
  }

  const { result } = await mutate((db) => {
    if (!db.stores.some((s) => s.id === storeId)) return null
    const idx = db.placeRanks.findIndex(
      (r) => r.keyword === keyword && r.storeId === storeId && r.date === date
    )
    const entry: PlaceRank = {
      id: idx >= 0 ? db.placeRanks[idx].id : newId('prank'),
      keyword,
      storeId,
      rank,
      date,
      note: body.note?.trim() || undefined,
    }
    if (idx >= 0) db.placeRanks[idx] = entry
    else db.placeRanks.unshift(entry)
    return entry
  })

  if (!result) return NextResponse.json({ error: '지점을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ placeRank: result })
})
