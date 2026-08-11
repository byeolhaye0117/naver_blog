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

  /*
   * **이름 없는 지점이 생기지 않게 막는다** (2026-08-11 전체 점검에서 찾았다).
   *
   * `{}` 를 보내면 「새 지점」이라는 이름으로 하나 저장됐다. 지점 화면은 이름과 정식
   * 상호명을 둘 다 요구하지만, 그건 화면 쪽 검사라 요청이 직접 오면 통과했다.
   * 이름 하나만 요구한다 — 정식 상호명까지 서버에서 막으면 예전에 만든 지점을 고칠 때
   * 걸릴 수 있다 (화면이 이미 둘 다 요구한다).
   */
  if (!input.name?.trim()) {
    return NextResponse.json({ error: '지점 이름을 넣어주세요.' }, { status: 400 })
  }
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
