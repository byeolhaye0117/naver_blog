import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { diagnose, diagnosisToPrescription } from '@/lib/analysis/diagnose'
import { recentBlogCount, topBlogPosts } from '@/lib/naver/blogsection'
import { measureTopPosts } from '@/lib/naver/blogpost'
import { buildCutline } from '@/lib/analysis/cutline'
import { prescriptionKey, upsertPrescription } from '@/lib/analysis/prescription'

export const dynamic = 'force-dynamic'
// 상위 목록 + 발행량 + 본문 6개를 읽는다
export const maxDuration = 60

const BODY_SAMPLE = 6

/**
 * 발행 후 실패 진단.
 *
 * 지금 상위권을 다시 분석해 내 글과 대조하고, 고칠 순서를 정해 돌려준다. 그 결과를
 * **처방으로 저장**하므로, 글쓰기 화면을 열면 이미 지시문에 실려 있다 — 진단과
 * 재작성 사이에 사람이 옮겨 적는 단계가 없다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { targetId?: string }
    if (!body.targetId) {
      return NextResponse.json({ error: '어느 항목을 진단할지 골라주세요.' }, { status: 400 })
    }

    const db = await readDB()
    const target = db.rankTargets.find((t) => t.id === body.targetId)
    if (!target) {
      return NextResponse.json({ error: '추적 항목을 찾지 못했습니다.' }, { status: 404 })
    }

    // 진단은 내 글의 본문을 봐야 한다. URL 만 등록하고 글을 앱에 안 쓴 경우가 있다.
    const post =
      db.posts.find((p) => p.id === target.postId) ??
      db.posts.find((p) => p.publishedUrl && target.url.includes(p.publishedUrl))
    if (!post) {
      return NextResponse.json(
        {
          error:
            '이 순위 항목에 연결된 글을 찾지 못했습니다. 발행 관리에서 그 글의 「발행 주소」를 넣어 연결해 주세요 — 본문을 봐야 무엇을 고칠지 말할 수 있습니다.',
        },
        { status: 400 }
      )
    }

    const [top, recent] = await Promise.all([
      topBlogPosts(target.keyword, 15),
      recentBlogCount(target.keyword).catch(() => ({ count: null as number | null })),
    ])
    if (!top.items.length) {
      return NextResponse.json(
        { error: '지금 상위 글 목록을 가져오지 못했습니다. 잠시 후 다시 시도하세요.' },
        { status: 502 }
      )
    }

    const measured = await measureTopPosts(
      top.items.map((i) => i.url),
      BODY_SAMPLE
    ).catch(() => [])
    const serp = analyzePastedSerp(
      target.keyword,
      top.items,
      recent.count ?? 0,
      15,
      'section',
      buildCutline(measured)
    )

    // 최신 순위와 발행 후 경과일
    const snaps = db.rankSnapshots
      .filter((s) => s.targetId === target.id)
      .sort((a, b) => b.date.localeCompare(a.date))
    const rank = snaps[0]?.rank ?? null
    const since = post.publishedAt ?? post.createdAt
    const daysSincePublish = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(since)) / 86400000)
    )

    const result = diagnose({ post, serp, rank, daysSincePublish })

    // 진단 결과를 처방으로 저장 — 글쓰기 화면이 이걸 그대로 AI 지시문에 넣는다
    const items = diagnosisToPrescription(result)
    if (items.length) {
      await mutate((d) => {
        d.prescriptions = upsertPrescription(d.prescriptions, {
          key: prescriptionKey(target.keyword),
          keyword: target.keyword,
          items,
          date: new Date().toISOString().slice(0, 10),
          sampled: top.items.length,
        })
      }).catch(() => undefined)
    }

    return NextResponse.json({
      diagnosis: result,
      rank,
      daysSincePublish,
      postId: post.id,
      cutline: serp.cutline ?? null,
      measured: measured.length,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '진단 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
