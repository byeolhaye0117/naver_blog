import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { buildRankViews, staleTitleTargets } from '@/lib/analysis/rank'
import { fetchPublishedPost } from '@/lib/naver/blogpost'
import { checkRank } from '@/lib/analysis/rank-check'
import { keyStatus, NaverApiError } from '@/lib/naver/client'
import type { RankSnapshot } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 같은 날 재조회하면 기존 기록을 갱신한다 (하루에 한 점만 남기려고) */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { targetId?: string }
    const db = await readDB()
    const targets = body.targetId
      ? db.rankTargets.filter((t) => t.id === body.targetId)
      : db.rankTargets

    if (!targets.length) {
      return NextResponse.json({ error: '추적 중인 항목이 없습니다.' }, { status: 400 })
    }

    const snapshots: RankSnapshot[] = []
    for (const t of targets) {
      // 화면에서 누른 조회다 — 자동 조회(cron)와 구별해 남긴다
      snapshots.push(await checkRank(t, 'user'))
    }

    /*
     * **제목도 함께 다시 읽는다** (2026-08-27 회원 지적: "실제 업로드된 제목과 다르게 나와").
     *
     * 회원은 올리기 직전에 제목을 손본다 — 그러면 목록에 뜨는 앱 초안 제목이 실제로
     * 올라간 제목과 갈린다. 순위는 실제로 올라간 글에 붙으므로 목록도 그것을 보여야 한다.
     *
     * 밤 크론도 같은 일을 하지만(app/api/cron/rank), 화면에서 「지금 확인」을 눌렀는데
     * 제목이 그대로면 회원은 고쳐지지 않았다고 본다. 그래서 여기서도 읽는다 — 다만
     * **지금 조회한 항목 중 오래된 것 몇 개만** 이다. 네이버 조회가 늘면 그만큼 느려진다.
     */
    const titles = new Map<string, string>()
    for (const t of staleTitleTargets(targets, new Date().toISOString(), targets.length === 1 ? 1 : 3)) {
      const read = await fetchPublishedPost(t.url).catch(() => null)
      const title = read?.title?.trim()
      if (title) titles.set(t.id, title)
    }

    const { db: next } = await mutate((d) => {
      for (const [id, title] of titles) {
        const found = d.rankTargets.find((x) => x.id === id)
        if (!found) continue
        found.title = title
        found.titleAt = new Date().toISOString()
      }
      for (const snap of snapshots) {
        const idx = d.rankSnapshots.findIndex(
          (s) => s.targetId === snap.targetId && s.date === snap.date
        )
        if (idx === -1) d.rankSnapshots.push(snap)
        else d.rankSnapshots[idx] = snap
      }
    })

    return NextResponse.json({
      views: buildRankViews(next.rankTargets, next.rankSnapshots, next.posts),
      checked: snapshots.length,
      keyStatus: keyStatus(),
    })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '순위 조회 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
