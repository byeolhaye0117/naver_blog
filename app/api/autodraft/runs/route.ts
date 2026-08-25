import { NextResponse } from 'next/server'
import { mutate } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * **지난 실행 기록 지우기** (2026-08-24 회원 요청: 날짜별 목록에 "삭제기능 만들어줘").
 *
 * 앞날은 「건너뛰기」로 빼지만, 이미 지나간 줄은 뺄 방법이 없었다. 실패로 어지러운 날이
 * 며칠 쌓이면 목록이 읽히지 않는다.
 *
 * **글은 지우지 않는다.** 기록만 지운다 — 글은 발행 관리에서 따로 지운다. 여기서 함께
 * 지우면 「기록만 정리하려다 글이 날아갔다」가 된다.
 */
export async function DELETE(req: Request) {
  try {
    const { date } = (await req.json()) as { date?: string }
    const day = (date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return NextResponse.json({ error: '날짜를 알 수 없습니다.' }, { status: 400 })
    }
    let removed = 0
    await mutate((d) => {
      const before = (d.autoDraftRuns ?? []).length
      d.autoDraftRuns = (d.autoDraftRuns ?? []).filter((r) => r.date !== day)
      removed = before - d.autoDraftRuns.length
    })
    return NextResponse.json({ removed, date: day })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '지우지 못했습니다.' },
      { status: 500 }
    )
  }
}
