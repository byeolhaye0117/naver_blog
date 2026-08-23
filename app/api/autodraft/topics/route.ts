import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { gatherSuggestions } from '@/lib/naver/autocomplete'
import { keywordTool } from '@/lib/naver/searchad'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { hasAdKeys } from '@/lib/naver/client'
import { TOPIC_SEEDS, buildCandidates, classifyIntent, toTopic } from '@/lib/writing/topic-explore'

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
const MEASURE_TOP = 12

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { seedId?: string }
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
     * 검색량 순으로 줄 세운 뒤 **정보성인 것만** 발행량을 잰다. 업체 찾는 말(「쌍용동
     * 헬스장」)은 어차피 정보글 주제로 못 쓰므로, 거기에 조회를 쓰면 회원 시간만 버린다.
     */
    const ranked = [...adRows]
      .filter((r) => classifyIntent(toTopic(r.keyword), myLocalKeywords) === 'info')
      .sort((a, b) => b.monthlySearch - a.monthlySearch)
    const toMeasure = ranked.slice(0, MEASURE_TOP).map((r) => toTopic(r.keyword))

    const recent: Record<string, number | null> = {}
    for (const q of toMeasure) {
      const got = await recentBlogCount(q).catch(() => null)
      recent[q] = got?.count ?? null
    }

    const candidates = buildCandidates({
      seedId: seed.id,
      suggestions: suggest.words,
      adRows: adRows.map((r) => ({ keyword: r.keyword, monthlySearch: r.monthlySearch })),
      recent,
      myLocalKeywords,
      exclude,
    })

    const info = candidates.filter((c) => c.intent === 'info')
    return NextResponse.json({
      seed: { id: seed.id, label: seed.label, queries: seed.queries },
      candidates: info,
      /*
       * **무엇을 걸렀고 무엇을 못 쟀는지 밝힌다.** 「후보 18개」만 보여주면 그게 전부인 줄
       * 알게 된다. 이 앱은 조용히 잘라내지 않는다.
       */
      note: {
        dropped: candidates.length - info.length,
        measured: toMeasure.length,
        unmeasured: Math.max(0, info.length - toMeasure.length),
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
