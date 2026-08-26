import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { fillDays, seoulToday } from '@/lib/writing/autodraft'
import type { AutoDraftPlan } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 한 번에 채울 수 있는 날 수 — 이보다 길게 미리 박아두면 설정을 바꿔도 안 따라온다 */
const MAX_DAYS = 30

/**
 * **날짜만 고르면 그 날들 주제를 채워서 돌려준다** (2026-08-25 회원 요청).
 *
 * "지금 저장된 설정에서 날짜가 있어서 같은 주제로 매일 돌지 않게 해줘야해. 그럴려면 날짜
 * 선택하는게 있어야해." — 그리고 그 전에 "내가 주제 계속 확정하는거 아니라 했잖아."
 *
 * 그래서 **주제는 여기서 앱이 고른다.** 화면은 언제부터 며칠치인지만 보낸다.
 *
 * ── 왜 저장하지 않고 돌려주기만 하나 ────────────────────────
 * 설정 화면은 고친 것을 모아 「설정 저장」에서 한 번에 보낸다. 여기서 바로 저장하면 회원이
 * 고치던 다른 값(키워드·주제)이 덮이고, 「저장 안 됨」 표시도 거짓말이 된다.
 *
 * ── 왜 서버에서 계산하나 ────────────────────────────────────
 * 로테이션은 **지금까지 쓴 글**을 보고 오래 안 쓴 조합을 고른다. 그 목록은 서버에만 있다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { plan?: AutoDraftPlan; from?: string; count?: number }
    const db = await readDB()
    const fallbackKeywords = [
      ...new Set(
        [...db.rankTargets.map((t) => t.keyword), ...db.stores.flatMap((s) => s.localKeywords ?? [])]
          .map((k) => k.trim())
          .filter(Boolean)
      ),
    ]
    const from = (body.from ?? new Date().toISOString()).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return NextResponse.json({ error: '시작 날짜를 골라주세요.' }, { status: 400 })
    }
    const count = Math.min(MAX_DAYS, Math.max(1, Math.trunc(Number(body.count) || 7)))
    const days = fillDays({ plan: body.plan, posts: db.posts, fallbackKeywords, from, days: count })
    return NextResponse.json({ days })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '주제를 정하지 못했습니다.' },
      { status: 500 }
    )
  }
}
