import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { normalizePlan } from '@/lib/writing/autodraft'
import type { AutoDraftPlan } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * **매일 자동 초안을 무엇으로 쓸지** — 회원이 고른 것을 저장한다 (2026-08-23 요청).
 *
 * "매일 새벽에 정보성 글이 발행되잖아 그거 주제랑 키워드 내가 원하는걸로 선택해서 하고 싶어."
 *
 * 저장 전에 `normalizePlan` 을 한 번 통과시킨다 — 화면에서 오는 값을 그대로 넣으면 빈 줄과
 * 중복이 섞이고, 그게 크론까지 가서 「키워드가 없습니다」로 실패한다. 정리는 **들어오는
 * 자리에서 한 번만** 한다.
 */
export async function GET() {
  const db = await readDB()
  return NextResponse.json({ plan: normalizePlan(db.autoDraftPlan) })
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as AutoDraftPlan
    const plan = { ...normalizePlan(body), updatedAt: new Date().toISOString() }
    await mutate((d) => {
      d.autoDraftPlan = plan
    })
    return NextResponse.json({ plan })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
