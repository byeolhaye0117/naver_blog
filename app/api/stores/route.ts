import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { guard } from '@/lib/api'
import type { Store } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const GET = guard('지점 정보를 불러오지 못했습니다.', async () => {
  return NextResponse.json({ stores: (await readDB()).stores })
})

/** 화면에서 비운 값 = 지우겠다는 뜻. 빈 문자열도 '없음' 으로 본다 */
function optional(v: string | undefined): string | undefined {
  const t = v?.trim()
  return t ? t : undefined
}

export const POST = guard('지점 저장에 실패했습니다.', async (req: Request) => {
  const input = (await req.json()) as Partial<Store>
  const store: Store = {
    id: input.id?.trim() || newId('store'),
    name: input.name ?? '새 지점',
    legalName: input.legalName ?? '',
    womenOnly: Boolean(input.womenOnly),
    open24: input.open24 ?? true,
    localKeywords: input.localKeywords ?? [],
    location: input.location ?? '',
    features: input.features ?? [],
    strengths: input.strengths ?? [],
    phone: input.phone ?? '',
    reserveUrl: optional(input.reserveUrl),
    blogUrl: optional(input.blogUrl),
    placeId: optional(input.placeId),
    // 붙여넣은 실제 리뷰 — 홍보글 신뢰 구간이 이 문장만 인용한다
    placeReviews: input.placeReviews?.length ? input.placeReviews : undefined,
    memo: optional(input.memo),
  }
  await mutate((db) => {
    db.stores.push(store)
  })
  return NextResponse.json({ store })
})

export const PUT = guard('지점 저장에 실패했습니다.', async (req: Request) => {
  const input = (await req.json()) as Store
  const { result } = await mutate((db) => {
    const idx = db.stores.findIndex((s) => s.id === input.id)
    if (idx === -1) return null
    // 선택 항목은 명시적으로 덮어써야 한다. 그냥 spread 하면 JSON 에서 빠진 키가
    // 옛 값을 남겨서, 예약 링크·메모를 화면에서 지워도 저장되지 않았다.
    db.stores[idx] = {
      ...db.stores[idx],
      ...input,
      id: db.stores[idx].id,
      reserveUrl: optional(input.reserveUrl),
      blogUrl: optional(input.blogUrl),
      placeId: optional(input.placeId),
      placeReviews: input.placeReviews?.length ? input.placeReviews : undefined,
      memo: optional(input.memo),
    }
    return db.stores[idx]
  })
  if (!result) return NextResponse.json({ error: '지점을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ store: result })
})

export const DELETE = guard('지점 삭제에 실패했습니다.', async (req: Request) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })
  await mutate((db) => {
    db.stores = db.stores.filter((s) => s.id !== id)
  })
  return NextResponse.json({ ok: true })
})
