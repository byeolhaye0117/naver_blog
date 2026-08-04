import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { checkRank } from '@/lib/analysis/rank-check'
import { shouldDiagnose, diagnose, diagnosisToPrescription, fromAppPost, fromPublished } from '@/lib/analysis/diagnose'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { recentBlogCount, topBlogPosts } from '@/lib/naver/blogsection'
import { fetchPublishedPost, measureTopPosts } from '@/lib/naver/blogpost'
import { buildCutline } from '@/lib/analysis/cutline'
import { prescriptionKey, upsertPrescription } from '@/lib/analysis/prescription'
import type { RankSnapshot } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 한 번에 순위를 잴 항목 수 — 넘치면 다음 실행으로 넘긴다 */
const MAX_CHECK = 20
/** 한 번에 진단까지 돌릴 항목 수 (진단은 본문까지 읽어 무겁다) */
const MAX_DIAGNOSE = 2

/**
 * 매일 자동으로 순위를 기록하고, 필요하면 진단까지 해둔다.
 *
 * 왜 크론인가. 사람이 「조회」를 누를 때만 기록되면 추세선에 구멍이 생긴다. 발행
 * 첫날부터 매일 한 점씩 찍혀야 "며칠째에 올라왔는지" 를 볼 수 있다.
 *
 * **실시간이 아니라 매일이다.** 순위는 하루 안에도 흔들려서 분 단위로 재면 잡음만
 * 늘고 네이버에 부담만 준다. 순위 추적 서비스들이 하루 1~2회를 쓰는 이유다.
 *
 * 진단은 조건이 맞는 항목만, 그리고 하루 한 번만 한다 (본문까지 읽어 무겁다).
 */
export async function GET(req: Request) {
  // Vercel 크론은 CRON_SECRET 이 있으면 Authorization 헤더를 붙여 보낸다.
  // 설정돼 있으면 반드시 검사한다 — 아무나 부를 수 있으면 네이버 호출을 남에게 맡기는 셈이다.
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const db = await readDB()
  if (!db.rankTargets.length) {
    return NextResponse.json({ ok: true, checked: 0, note: '추적 항목이 없습니다.' })
  }

  // 오늘 아직 기록이 없는 항목을 먼저 본다 (하루 한 점이면 충분하다)
  const done = new Set(
    db.rankSnapshots.filter((s) => s.date === today).map((s) => s.targetId)
  )
  const queue = [
    ...db.rankTargets.filter((t) => !done.has(t.id)),
    ...db.rankTargets.filter((t) => done.has(t.id)),
  ].slice(0, MAX_CHECK)

  const snapshots: RankSnapshot[] = []
  for (const t of queue) {
    try {
      snapshots.push(await checkRank(t))
    } catch {
      /* 한 항목이 실패해도 나머지는 계속 잰다 */
    }
  }

  if (snapshots.length) {
    await mutate((d) => {
      for (const snap of snapshots) {
        const idx = d.rankSnapshots.findIndex(
          (s) => s.targetId === snap.targetId && s.date === snap.date
        )
        if (idx === -1) d.rankSnapshots.push(snap)
        else d.rankSnapshots[idx] = snap
      }
    })
  }

  // ── 진단 ────────────────────────────────────────────
  // 발행 2주가 지났는데 1페이지 밖인 항목만. 오늘 이미 처방을 만든 키워드는 건너뛴다.
  const fresh = await readDB()
  const rankOf = (targetId: string) =>
    fresh.rankSnapshots
      .filter((s) => s.targetId === targetId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.rank ?? null

  const candidates = fresh.rankTargets
    .filter((t) => {
      const post = fresh.posts.find((p) => p.id === t.postId)
      const since = t.publishedAt ?? post?.publishedAt ?? post?.createdAt ?? t.createdAt
      const days = since ? Math.floor((Date.now() - Date.parse(since)) / 86400000) : 0
      if (!shouldDiagnose(rankOf(t.id), days)) return false
      const rx = fresh.prescriptions.find((p) => p.key === prescriptionKey(t.keyword))
      return !(rx && rx.date === today)
    })
    .slice(0, MAX_DIAGNOSE)

  const diagnosed: string[] = []
  for (const t of candidates) {
    try {
      const [top, recent] = await Promise.all([
        topBlogPosts(t.keyword, 15),
        recentBlogCount(t.keyword).catch(() => ({ count: null as number | null })),
      ])
      if (!top.items.length) continue

      const measured = await measureTopPosts(top.items.map((i) => i.url), 6).catch(() => [])
      const serp = analyzePastedSerp(
        t.keyword,
        top.items,
        recent.count ?? 0,
        15,
        'section',
        buildCutline(measured),
        fresh.stores.flatMap((st) => [st.name, st.legalName])
      )

      const appPost = fresh.posts.find((p) => p.id === t.postId)
      const mine = appPost
        ? fromAppPost(appPost)
        : await (async () => {
            const read = await fetchPublishedPost(t.url)
            return read ? fromPublished(read, t.keyword) : null
          })()
      if (!mine) continue

      const since = t.publishedAt ?? appPost?.publishedAt ?? appPost?.createdAt ?? t.createdAt
      const days = since ? Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 86400000)) : 0
      const result = diagnose({ post: mine, serp, rank: rankOf(t.id), daysSincePublish: days })
      const items = diagnosisToPrescription(result)
      if (!items.length) continue

      await mutate((d) => {
        d.prescriptions = upsertPrescription(d.prescriptions, {
          key: prescriptionKey(t.keyword),
          keyword: t.keyword,
          items,
          date: today,
          sampled: top.items.length,
        })
      })
      diagnosed.push(t.keyword)
    } catch {
      /* 진단 실패는 순위 기록을 막지 않는다 */
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    checked: snapshots.length,
    found: snapshots.filter((s) => s.rank !== null).length,
    diagnosed,
  })
}
