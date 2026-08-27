import { NextResponse } from 'next/server'
import { blogIdFromInput, fetchBlogFeed } from '@/lib/naver/blogrss'
import {
  buildBlogProfile,
  competitionOf,
  gradeBlog,
  measureExposure,
  meaningForUs,
  queryFromTitle,
  type ExposureMeasure,
} from '@/lib/analysis/blogscore'
import { findBlogRank, isTrivialQuery, totalBlogCount, TRIVIAL_QUERY_MAX } from '@/lib/naver/blogsection'
import { checkUnifiedIndexed } from '@/lib/naver/unified'
import { buildIndexCheck, pickIndexSamples, summarizeIndex, type IndexCheck } from '@/lib/analysis/indexcheck'
import { judgeAgency, scanSponsorship, type SponsorScan } from '@/lib/analysis/agency'
import { fetchPublishedPost } from '@/lib/naver/blogpost'
import { fetchBlogStat, fetchPostPage, fetchSympathyCount, type PostRow } from '@/lib/naver/blogstat'
import { measureActivity } from '@/lib/analysis/activity'

export const dynamic = 'force-dynamic'
// RSS 1회 + 활동 지표(첫 화면 1 · 글 목록 2 · 공감 5) + 색인 3회 × 2곳 + 노출 10회 + 본문 3편
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
/**
 * 공감 수를 읽을 글 수.
 *
 * 글마다 조회가 한 번씩 들어가므로 많이 볼 수 없다. 5편이면 「글당 반응이 어느
 * 자리인지」는 잡힌다 — 소수점까지 맞출 일이 아니다.
 */
const SYMPATHY_SAMPLE = 5

/** 오늘 날짜 (YYYY-MM-DD, 한국 시간) */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

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

    /*
     * 활동 지표 — **시중 도구가 보는 축**.
     *
     * 회원이 「우리도 저기서만 볼 수 있는 걸 분석하면 되지 않냐」고 해서 찔러봤더니
     * 방문자·이웃·글 수·댓글·공감이 **로그인 없이 다 나왔다** (blogstat.ts 주석).
     * 그동안 화면에 「방문자는 밖에서 볼 수 없다」고 적어둔 것이 틀렸던 것이다.
     *
     * 이건 등급에 넣지 않는다. 규모와 검색 노출은 다른 축이고, 우리 판에서 이미
     * 「등급 순서로 줄을 서지 않는다」를 실측했다 (factors.ts). 나란히 보여준다.
     */
    const today = todayKst()
    const [stat, firstPage] = await Promise.all([fetchBlogStat(id), fetchPostPage(id, 1, 30)])

    /** 주인이 「검색 허용 안 함」으로 올린 글 — 색인 검사에서 빼야 오판하지 않는다 */
    const unsearchable = new Set((firstPage?.posts ?? []).filter((p) => !p.searchable).map((p) => p.logNo))

    /*
     * 첫 글 날짜로 운영 기간을 추정한다. 마지막 쪽만 한 번 더 읽으면 된다 —
     * 416편짜리 블로그도 조회 한 번이다 (실측: 14쪽 마지막 글이 2010년이었다).
     */
    let firstPost: string | null = null
    let deepPosts: PostRow[] = []
    if (firstPage?.total && firstPage.total > 30) {
      const lastPage = Math.ceil(firstPage.total / 30)
      const deep = await fetchPostPage(id, lastPage, 30)
      deepPosts = deep?.posts ?? []
      const dates = deepPosts.map((p) => p.date).filter(Boolean).sort()
      firstPost = dates[0] ?? null
    } else if (firstPage?.posts.length) {
      const dates = firstPage.posts.map((p) => p.date).filter(Boolean).sort()
      firstPost = dates[0] ?? null
    }

    /** 글별 공감 수 — 앞쪽 몇 편만 (글마다 조회 한 번씩 든다) */
    const sympathy = firstPage
      ? await Promise.all(
          firstPage.posts.slice(0, SYMPATHY_SAMPLE).map((p) => fetchSympathyCount(id, p.logNo).catch(() => null))
        )
      : []

    const activity = measureActivity({
      stat,
      posts: firstPage?.posts ?? [],
      firstPost,
      sympathy,
      today,
    })

    /**
     * 노출력 — 최근 글 몇 개가 실제로 상위에 걸리는지.
     *
     * 이게 없으면 지수는 "얼마나 부지런한가" 만 재는 셈이다. 실제로 검색에 걸리는지가
     * 블로그 힘의 핵심이므로 표본으로 확인한다. 시간이 걸려서 요청으로 켠다.
     */
    let exposure: ExposureMeasure | undefined
    let exposureDetail:
      | { query: string; rank: number | null; total: number | null; trivial: boolean; competition: string }[]
      | undefined
    let indexedRate: number | undefined
    let indexNote: string | undefined
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
      /*
       * **주인이 검색을 막아둔 글은 뺀다.** 「검색 허용 안 함」으로 올린 글이 검색에
       * 안 나오는 건 당연한데, 그걸 색인 검사에 넣으면 정상 블로그를 누락으로 오판한다.
       */
      /*
       * **최신 글로 재면 안 된다** (2026-08-27, 회원이 보내준 영상). 네이버 반영이 2~4주
       * 걸리는 때가 있어, 어제 글이 안 나오는 것은 누락이 아니라 아직 반영 전인 것이다.
       * 여기서 최신 글을 넣으면 멀쩡한 블로그가 저품질로 나온다.
       */
      const idxPick = pickIndexSamples(
        feed.items.filter((i) => i.title.length >= 8 && ![...unsearchable].some((no) => i.link.includes(no))),
        today,
        INDEX_SAMPLE
      )
      const idxPicks = idxPick.picks
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
      indexNote = idxPick.note
      if (idxGot.length) {
        indexDetail = idxGot
        indexSummary = summarizeIndex(idxGot)
        // 등급 판정은 지금까지와 같은 축(블로그탭 색인율)을 쓴다
        indexedRate = indexSummary.blogTabRate ?? undefined
      }

      /*
       * ② 노출력 — 제목 앞부분을 검색어로 써서 30위 안에 걸리는지.
       *
       * **검색어의 난이도를 함께 잰다** (2026-08-11). 회원이 우리 진단(「최적 3」)과 시중
       * 도구(「준최·44점」)가 너무 다르다고 해서 우리 쪽을 다시 봤더니, 이 계산에 구멍이
       * 있었다. 표본마다 검색어 경쟁이 완전히 달랐다 — 회원 블로그의 실제 제목으로 재보니:
       *
       *   천안 신방동 맛집                    1,000편 이상   ← 진짜 경쟁 키워드
       *   천안 생선구이 뭔맛집                  410편
       *   천안 성심호수공원마당 백년한방활산채탕      0편        ← 사실상 그 글 하나
       *
       * **0편짜리 검색어에서 1위 하는 것은 블로그 힘의 증거가 아니다.** 그런 표본이 섞이면
       * 노출률이 부풀고 등급이 후해진다. 그래서 경쟁이 없는 표본은 계산에서 빼고, 몇 편을
       * 왜 뺐는지 화면에 밝힌다 (조용히 빼면 「이 숫자가 다 진짜」로 읽힌다).
       */
      const picks = feed.items.filter((i) => queryFromTitle(i.title).length >= 4).slice(0, SAMPLE)
      const got: { query: string; rank: number | null; total: number | null; trivial: boolean; competition: string }[] =
        []
      for (const it of picks) {
        const q = queryFromTitle(it.title)
        try {
          // 순위와 발행량은 서로 무관하므로 같이 던진다
          const [r, total] = await Promise.all([
            findBlogRank(q, it.link, SAMPLE_DEPTH),
            totalBlogCount(q).catch(() => null),
          ])
          if (r.ok) {
            got.push({ query: q, rank: r.rank, total, trivial: isTrivialQuery(total), competition: competitionOf(total) })
          }
        } catch {
          /* 한 표본이 실패해도 나머지로 센다 */
        }
      }
      if (got.length) {
        exposureDetail = got
        // 경쟁 강도까지 함께 셈한다 (measureExposure 주석 — 쉬운 검색어의 1위는 낮게 센다)
        exposure = measureExposure(got)
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

    const profile = buildBlogProfile(feed, undefined, exposure?.exposureRate)
    const agency = judgeAgency({
      scans,
      tradeGroups: profile.tradeGroups.length,
      topTradeShare: profile.topTradeShare,
      gymShare: profile.gymShare,
      last30: profile.last30,
    })
    const grade = gradeBlog({
      indexedRate,
      exposure,
      trivialMax: TRIVIAL_QUERY_MAX,
      samples: (exposureDetail?.length ?? 0) + (indexDetail?.length ?? 0),
    })

    return NextResponse.json({
      profile,
      grade,
      activity,
      indexedRate,
      exposure,
      exposureRate: exposure?.exposureRate,
      firstPageRate: exposure?.firstPageRate,
      trivialSamples: exposure?.trivial ?? 0,
      trivialMax: TRIVIAL_QUERY_MAX,
      indexDetail,
      indexSummary,
      indexNote,
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
