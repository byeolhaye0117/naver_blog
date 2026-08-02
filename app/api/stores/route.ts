import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import { guard } from '@/lib/api'
import type { Store } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const GET = guard('지점 정보를 불러오지 못했습니다.', async () => {
  return NextResponse.json({ stores: (await readDB()).stores })
})

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
    reserveUrl: input.reserveUrl,
    blogUrl: input.blogUrl,
    placeId: input.placeId,
    memo: input.memo,
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
    db.stores[idx] = { ...db.stores[idx], ...input }
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
