import { NextResponse } from 'next/server'
import { blogIdFromInput, fetchBlogFeed } from '@/lib/naver/blogrss'
import { buildBlogProfile, gradeBlog, meaningForUs, queryFromTitle } from '@/lib/analysis/blogscore'
import { findBlogRank } from '@/lib/naver/blogsection'
import { checkUnifiedIndexed } from '@/lib/naver/unified'
import { buildIndexCheck, summarizeIndex, type IndexCheck } from '@/lib/analysis/indexcheck'
import { judgeAgency, scanSponsorship, type SponsorScan } from '@/lib/analysis/agency'
import { fetchPublishedPost } from '@/lib/naver/blogpost'

export const dynamic = 'force-dynamic'
// RSS 1회 + 색인 검사 3회 × 2곳 + 노출력 표본 10회 + 본문 3편
export const maxDuration = 150

/**
 * 노출력을 잴 표본 수.
 *
 * 3개로 했더니 흔들렸다 — hyoni2_ 는 표본 3개가 전부 여행·맛집처럼 경쟁 센 키워드라
 * 0% 가 나왔는데 정작 "쌍용동 헬스장" 에서는 1위였다. 표본을 늘려야 한다.
 */
const SAMPLE = 10
/** 이 순위 안에 있으면 "걸렸다" 로 본다 */
const SAMPLE_DEPTH = 30
/** 색인 검사(제목 완전일치)는 이만큼만 — 이건 표본이 적어도 신호가 분명하다 */
const INDEX_SAMPLE = 3
/**
 * 대가성 표기를 찾을 글 수.
 *
 * 표기는 보통 글 맨 위나 맨 아래에 한 번 나오므로 본문을 읽어야 한다. 3편이면 캠페인
 * 블로그인지 가늠하기에 충분하고(표기하는 블로거는 매 글에 넣는다), 조회도 3번뿐이다.
 */
const SPONSOR_SAMPLE = 3

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { blogId?: string; exposure?: boolean }
    const id = blogIdFromInput(body.blogId ?? '')
    if (!id) {
      return NextResponse.json(
        { error: '블로그 아이디나 주소를 넣어주세요 (예: blog.naver.com/아이디 또는 아이디).' },
        { status: 400 }
      )
    }

    const feed = await fetchBlogFeed(id)
    if (!feed) {
      return NextResponse.json(
        {
          error: `"${id}" 블로그의 글 목록을 읽지 못했습니다. 아이디가 맞는지 확인해 주세요 (RSS 를 막아둔 블로그는 읽을 수 없습니다).`,
        },
        { status: 404 }
      )
    }

    /**
     * 노출력 — 최근 글 몇 개가 실제로 상위에 걸리는지.
     *
     * 이게 없으면 지수는 "얼마나 부지런한가" 만 재는 셈이다. 실제로 검색에 걸리는지가
     * 블로그 힘의 핵심이므로 표본으로 확인한다. 시간이 걸려서 요청으로 켠다.
     */
    let exposureRate: number | undefined
    let exposureDetail: { query: string; rank: number | null }[] | undefined
    let firstPageRate: number | undefined
    let indexedRate: number | undefined
    let indexDetail: IndexCheck[] | undefined
    let indexSummary: ReturnType<typeof summarizeIndex> | undefined

    if (body.exposure !== false) {
      /*
       * ① 색인 검사 — 제목을 그대로 검색해 그 글이 나오는지.
       * 업계에서 말하는 "저품질" 의 실체가 이것이다. 노출력이 낮은 것과는 전혀 다른
       * 문제이므로 따로 잰다 (경쟁 센 키워드를 노려 안 걸리는 것은 저품질이 아니다).
       *
       * 블로그탭과 통합검색을 **따로** 본다. 둘을 하나로 묶으면 "색인은 됐는데
       * 통합검색 자리만 못 얻은 글"과 "검색에서 아예 빠진 글"이 같아 보인다 —
       * 앞은 키워드를 바꿀 문제, 뒤는 블로그를 살릴 문제다 (indexcheck.ts 주석).
       */
      const idxPicks = feed.items.filter((i) => i.title.length >= 8).slice(0, INDEX_SAMPLE)
      const idxGot: IndexCheck[] = []
      for (const it of idxPicks) {
        // 두 조회는 서로 무관하므로 같이 던진다 (한 표본에 2초씩 더 쓰지 않게)
        const [tab, uni] = await Promise.all([
          findBlogRank(it.title, it.link, 10)
            .then((r) => (r.ok ? r.rank !== null : null))
            .catch(() => null),
          checkUnifiedIndexed(it.title, it.link).catch(() => null),
        ])
        // 두 곳 다 못 읽은 표본은 아무 뜻이 없으니 세지 않는다
        if (tab === null && uni === null) continue
        idxGot.push(buildIndexCheck({ title: it.title, blogTab: tab, unified: uni }))
      }
      if (idxGot.length) {
        indexDetail = idxGot
        indexSummary = summarizeIndex(idxGot)
        // 등급 판정은 지금까지와 같은 축(블로그탭 색인율)을 쓴다
        indexedRate = indexSummary.blogTabRate ?? undefined
      }

      // ② 노출력 — 제목 앞부분을 검색어로 써서 30위 안에 걸리는지
      const picks = feed.items.filter((i) => queryFromTitle(i.title).length >= 4).slice(0, SAMPLE)
      const got: { query: string; rank: number | null }[] = []
      for (const it of picks) {
        const q = queryFromTitle(it.title)
        try {
          const r = await findBlogRank(q, it.link, SAMPLE_DEPTH)
          if (r.ok) got.push({ query: q, rank: r.rank })
        } catch {
          /* 한 표본이 실패해도 나머지로 센다 */
        }
      }
      if (got.length) {
        exposureDetail = got
        exposureRate = Math.round((got.filter((g) => g.rank !== null).length / got.length) * 100)
        // 1페이지 비율 — 30위 안에 겨우 걸리는 것과 1페이지를 먹는 것을 가른다
        firstPageRate = Math.round(
          (got.filter((g) => g.rank !== null && g.rank <= 10).length / got.length) * 100
        )
      }
    }

    /*
     * 「돈 주고 맡긴 블로그인가」 판단 보조.
     *
     * 최근 글 본문에서 대가성·체험단 표기를 찾는다. 표기는 본인이 밝힌 것이라 가장
     * 확실한 근거다. 표기가 없으면 「없다」고만 말하고 추측하지 않는다 (agency.ts 주석).
     */
    const scans: (SponsorScan & { title: string; url: string })[] = []
    for (const it of feed.items.slice(0, SPONSOR_SAMPLE)) {
      try {
        const post = await fetchPublishedPost(it.link)
        if (!post) continue
        scans.push({ ...scanSponsorship(post.text, post.title || it.title), title: it.title, url: it.link })
      } catch {
        /* 한 편이 막혀도 나머지로 본다 */
      }
    }

    const profile = buildBlogProfile(feed, undefined, exposureRate)
    const agency = judgeAgency({
      scans,
      tradeGroups: profile.tradeGroups.length,
      topTradeShare: profile.topTradeShare,
      gymShare: profile.gymShare,
      last30: profile.last30,
    })
    const grade = gradeBlog({
      indexedRate,
      exposureRate,
      firstPageRate,
      samples: (exposureDetail?.length ?? 0) + (indexDetail?.length ?? 0),
    })

    return NextResponse.json({
      profile,
      grade,
      indexedRate,
      exposureRate,
      firstPageRate,
      indexDetail,
      indexSummary,
      meaning: meaningForUs(profile),
      agency,
      sponsorScans: scans,
      exposureDetail,
      recent: feed.items.slice(0, 8).map((i) => ({ title: i.title, date: i.date, category: i.category, link: i.link })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블로그 진단 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
