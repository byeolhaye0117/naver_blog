import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { keywordOwners, mergeOpeningRuns, scanOpenings } from '@/lib/analysis/openings-scan'
import { OPENING_RUNS_KEEP, openingChanges } from '@/lib/analysis/openings'
import type { OpeningRun } from '@/lib/types'

export const dynamic = 'force-dynamic'
/** 키워드마다 목록 1콜 + 발행량 1콜이라 시간이 걸린다 */
export const maxDuration = 300

/**
 * **「지금 뚫릴 만한 키워드」를 매일 다시 잰다.**
 *
 * 회원 요청 (2026-08-19): "자동으로 매일 업데이트 되게 해줘."
 *
 * 앞 판은 버튼을 누를 때만 재고 결과를 화면 상태에만 뒀다 — 새로 고치면 사라지고, 누르지
 * 않으면 아무 값도 없었다. 그런데 이 표는 **자리가 열린 날을 잡는 것**이 목적이다. 열린
 * 자리는 며칠 만에 다시 굳으므로, 회원이 생각나서 누른 날에만 재면 대부분 놓친다.
 *
 * 순위 추적(0시 UTC = 09시 KST)보다 먼저 돌게 뒀다 (21시 UTC = 06시 KST) — 아침에 화면을
 * 열면 그날 값이 이미 있다.
 *
 * 실패를 숨기지 않는다: 못 잰 키워드는 `failed` 로 남기고, 하나도 못 재면 저장하지 않는다.
 * 빈 표를 덮어쓰면 어제까지의 값을 잃고 「전부 굳은 자리」로 보인다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const db = await readDB()
  const owners = keywordOwners(db.stores)
  const keywords = [...owners.keys()]
  if (!keywords.length) {
    return NextResponse.json({ error: '지점에 저장된 지역 키워드가 없습니다.' }, { status: 400 })
  }

  const { rows, failed } = await scanOpenings(keywords, owners)
  if (!rows.length) {
    // 어제 값을 지우지 않는다 — 네이버가 막힌 날이 「자리가 굳은 날」로 보이면 안 된다
    return NextResponse.json(
      { error: '한 키워드도 재지 못했습니다 (네이버 호출 실패). 어제 값을 그대로 둡니다.', failed },
      { status: 502 }
    )
  }

  const runs = db.openingRuns ?? []
  const prev = runs.length ? runs[runs.length - 1] : null
  const changed = openingChanges(prev?.rows, rows)
  const opened = [...changed.entries()].filter(([, c]) => c === 'opened').map(([k]) => k)

  const fresh: OpeningRun = {
    at: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    by: 'cron',
    rows,
    failed,
  }
  await mutate((cur) => {
    cur.openingRuns = mergeOpeningRuns(cur.openingRuns, fresh, OPENING_RUNS_KEEP)
  })

  return NextResponse.json({
    date: fresh.date,
    measured: rows.length,
    failed,
    open: rows.filter((r) => r.tier === 'open-quiet' || r.tier === 'open').length,
    /** 어제는 굳어 있었는데 오늘 열린 자리 — 이걸 잡으려고 매일 돈다 */
    newlyOpen: opened,
    stored: (await readDB()).openingRuns?.length ?? 0,
  })
}
