import { NextResponse } from 'next/server'
import { mutate, newId, readDB } from '@/lib/store'
import type { Store } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ stores: readDB().stores })
}

export async function POST(req: Request) {
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
    memo: input.memo,
  }
  mutate((db) => {
    db.stores.push(store)
  })
  return NextResponse.json({ store })
}

export async function PUT(req: Request) {
  const input = (await req.json()) as Store
  const { result } = mutate((db) => {
    const idx = db.stores.findIndex((s) => s.id === input.id)
    if (idx === -1) return null
    db.stores[idx] = { ...db.stores[idx], ...input }
    return db.stores[idx]
  })
  if (!result) return NextResponse.json({ error: '지점을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ store: result })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })
  mutate((db) => {
    db.stores = db.stores.filter((s) => s.id !== id)
  })
  return NextResponse.json({ ok: true })
}
