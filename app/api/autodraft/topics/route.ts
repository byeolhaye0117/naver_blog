import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { gatherSuggestions } from '@/lib/naver/autocomplete'
import { keywordTool } from '@/lib/naver/searchad'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { hasAdKeys } from '@/lib/naver/client'
import { SHOW_MAX, TOPIC_SEEDS, attachRecent, buildCandidates, pageOf, pageRange } from '@/lib/writing/topic-explore'

export const dynamic = 'force-dynamic'
// 자동완성 3개 + 검색광고 1회 + 발행량 여러 번을 순서대로 부른다
export const maxDuration = 60

/**
 * **정보글 주제 탐색** (2026-08-23 회원 요청).
 *
 * "실제로 다이어트나 체중증량을 원하는 주제들을 리서치해서 그에 맞는 주제를 탐색하는
 * 탐색기를 만들어서 그거중에 내가 선택해서 하고 싶어."
 *
 * ── 무엇을 어디서 가져오나 ──────────────────────────────────
 *   ① 검색창 자동완성 — **사람들이 실제로 치는 말.** 우리가 못 떠올린 말이 여기서 나온다
 *      (지역 키워드에서 「일일권」·「사우나」가 그렇게 나왔다).
 *   ② 검색광고 키워드도구 — 연관 검색어 + **월간 검색량.**
 *   ③ 블로그 섹션 — 그 검색어로 **최근 30일에 몇 편**이 올라왔나 = 경쟁.
 *
 * 씨앗(「다이어트」·「벌크업」)만 우리가 넣고, 주제 자체는 전부 네이버에서 온다.
 *
 * ── 발행량은 상위 몇 개만 잰다 ──────────────────────────────
 * 검색어 하나당 조회 한 번이라, 후보 40개를 다 재면 화면이 40초를 기다린다. 검색량 큰
 * 순서로 잘라 재고, **몇 개를 쟀고 몇 개를 못 쟀는지 화면에 밝힌다** — 조용히 자르지 않는다.
 */
const MEASURE_TOP = SHOW_MAX
/**
 * 발행량 조회 사이 간격.
 *
 * 첫 실행에서 **12개를 연달아 물었더니 12개 전부 실패했다** — 화면에는 「발행량은 못
 * 쟀습니다」만 열두 줄 떴다. 네이버 블로그 섹션은 공식 API 가 아니라 연달아 두드리면 막힌다.
 * 조금 늦더라도 답이 오는 편이 낫다.
 */
const GAP_MS = 400

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { seedId?: string; page?: number }
    const seed = TOPIC_SEEDS.find((s) => s.id === body.seedId)
    if (!seed) {
      return NextResponse.json({ error: '어떤 갈래를 볼지 골라주세요.' }, { status: 400 })
    }

    const db = await readDB()
    const myLocalKeywords = db.stores.flatMap((s) => s.localKeywords ?? [])
    // 이미 고른 주제는 다시 권하지 않는다
    const exclude = db.autoDraftPlan?.topics ?? []

    // ① 자동완성 · ② 검색광고 — 둘은 서로 기다릴 이유가 없다
    const [suggest, adRows] = await Promise.all([
      gatherSuggestions(seed.queries).catch(() => ({ words: [] as string[], asked: 0, answered: 0 })),
      keywordTool(seed.queries).catch(() => []),
    ])

    /*
     * **보여줄 것을 먼저 정하고, 그것만 잰다** (2026-08-24에 순서를 뒤집었다).
     *
     * 처음엔 검색량 상위 10개를 먼저 재고 그다음에 줄 세웠는데, 화면에 뜬 24개가 전부
     * 「발행량은 못 쟀습니다」였다 — 잰 것들은 경쟁이 세서 맨 뒤로 밀렸고 못 잰 것들이 그
     * 앞을 채웠기 때문이다. 조회를 열 번 하고 결과를 한 줄도 못 보여준 셈이다.
     */
    const candidates = buildCandidates({
      seedId: seed.id,
      suggestions: suggest.words,
      adRows: adRows.map((r) => ({ keyword: r.keyword, monthlySearch: r.monthlySearch })),
      recent: {},
      myLocalKeywords,
      exclude,
    })
    /*
     * **넘겨 볼 수 있어야 한다** (2026-08-24 회원 요청: "주제가 매번 같은게 나와").
     * 상위 12개만 보여주고 있었는데 남는 후보가 409개였다 — 397개가 한 번도 안 보였다.
     * 검색광고는 같은 씨앗에 같은 순서로 오므로 다시 눌러도 열두 줄이 그대로다.
     */
    const page = Number.isFinite(body.page) ? Math.max(0, Math.trunc(body.page as number)) : 0
    const info = candidates.filter((c) => c.intent === 'info')
    const pick = pageOf(info, page)
    const range = pageRange(info.length, page)

    /*
     * 잘린 값(note === 'atLeast')을 함께 넘긴다. 블로그 섹션은 1,000건에서 잘려서 그 위는
     * 전부 같은 숫자(4,286)로 온다 — 잰 값처럼 보여주면 회원이 그 둘을 비교해 판단하게 된다.
     */
    const recent: Record<string, { count: number | null; capped: boolean }> = {}
    let measured = 0
    for (const c of pick.slice(0, MEASURE_TOP)) {
      const got = await recentBlogCount(c.topic).catch(() => null)
      recent[c.topic] = { count: got?.count ?? null, capped: got?.note === 'atLeast' }
      if (recent[c.topic].count !== null) measured++
      await new Promise((r) => setTimeout(r, GAP_MS))
    }

    const shown = attachRecent(pick, recent)

    /*
     * 무엇을 왜 걸렀는지 갈래별로 센다. 「후보 18개」만 보여주면 그게 전부인 줄 알게 되고,
     * 특히 **검색량이 큰 말을 우리가 일부러 뺐다**는 사실은 밝혀야 한다 — 안 그러면
     * 「다이어트약이 월 2만 회인데 왜 안 나오지」가 된다.
     */
    const by = (kind: string) => candidates.filter((c) => c.intent === kind).length
    return NextResponse.json({
      seed: { id: seed.id, label: seed.label, queries: seed.queries },
      candidates: shown,
      note: {
        found: candidates.length,
        shown: shown.length,
        /** 지금 몇 번째를 보고 있나 — 「409개 중 13~24번째」 */
        total: info.length,
        from: range.from,
        to: range.to,
        pages: range.pages,
        page,
        offlimit: by('offlimit'),
        local: by('local') + by('buy'),
        thin: by('thin'),
        measured,
        tried: Math.min(pick.length, MEASURE_TOP),
        adKeys: hasAdKeys(),
        autocomplete: { asked: suggest.asked, answered: suggest.answered },
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '주제를 찾는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
