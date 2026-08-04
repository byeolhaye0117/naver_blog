import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { analyzePastedSerp } from '@/lib/analysis/serp'
import { diagnose, diagnosisToPrescription, fromAppPost, fromPublished } from '@/lib/analysis/diagnose'
import { recentBlogCount, topBlogPosts } from '@/lib/naver/blogsection'
import { fetchPublishedPost, measureTopPosts } from '@/lib/naver/blogpost'
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

    /**
     * 진단은 내 글의 본문을 봐야 한다. 본문은 두 곳에서 온다.
     *  ① 앱에서 쓴 글 — 저장소에 본문이 있다 (소제목까지 셀 수 있다)
     *  ② 네이버에 이미 발행한 글 — 앱에 없으므로 그 주소로 읽어온다
     *
     * ②를 지원하는 이유: 앱을 쓰기 전에 올린 글이 이미 여러 편 있다. 그 글을
     * 진단할 수 없으면 이 기능은 새로 쓰는 글에만 쓸모가 있다.
     */
    const appPost =
      db.posts.find((p) => p.id === target.postId) ??
      db.posts.find((p) => p.publishedUrl && target.url.includes(p.publishedUrl))

    const mine = appPost
      ? fromAppPost(appPost)
      : await (async () => {
          const read = await fetchPublishedPost(target.url)
          return read ? fromPublished(read, target.keyword) : null
        })()

    if (!mine) {
      return NextResponse.json(
        {
          error:
            '이 주소에서 글 본문을 읽지 못했습니다. 비공개·이웃공개 글이거나 주소가 글이 아닐 수 있습니다. 주소를 확인하거나, 앱에서 쓴 글이면 발행 관리에서 「발행 주소」를 넣어 연결해 주세요.',
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
      buildCutline(measured),
      db.stores.flatMap((st) => [st.name, st.legalName])
    )

    // 최신 순위와 발행 후 경과일
    const snaps = db.rankSnapshots
      .filter((s) => s.targetId === target.id)
      .sort((a, b) => b.date.localeCompare(a.date))
    const rank = snaps[0]?.rank ?? null
    // 발행일은 앱에 있으면 그 값, 없으면 순위를 처음 기록한 날로 대신한다
    const since =
      appPost?.publishedAt ?? appPost?.createdAt ?? snaps[snaps.length - 1]?.date ?? null
    const daysSincePublish = since
      ? Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 86400000))
      : 0

    const result = diagnose({ post: mine, serp, rank, daysSincePublish })

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
      postId: appPost?.id ?? null,
      /** 본문을 어디서 읽었나 — 화면에서 밝힌다 */
      postSource: mine.source,
      title: mine.title,
      measuredMine: {
        charCount: mine.charCount,
        imageCount: mine.imageCount,
        videoCount: mine.videoCount,
      },
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
