import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { gatherSuggestions } from '@/lib/naver/autocomplete'
import { keywordTool } from '@/lib/naver/searchad'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { hasAdKeys } from '@/lib/naver/client'
import { seoulToday } from '@/lib/writing/autodraft'
import {
  SHOW_MAX,
  TOPIC_SEEDS,
  attachRecent,
  buildCandidates,
  dayIndex,
  dedupeByCore,
  normalizePage,
  pageOf,
  pageRange,
  seedQueries,
} from '@/lib/writing/topic-explore'

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
    const body = (await req.json()) as { seedId?: string; page?: number | null }
    const seed = TOPIC_SEEDS.find((s) => s.id === body.seedId)
    if (!seed) {
      return NextResponse.json({ error: '어떤 갈래를 볼지 골라주세요.' }, { status: 400 })
    }

    const db = await readDB()
    const myLocalKeywords = db.stores.flatMap((s) => s.localKeywords ?? [])
    /*
     * **이미 고른 주제와 이미 쓴 주제를 뺀다** (2026-08-29 회원: "매일 돌릴때마다 같은
     * 주제가 나와").
     *
     * 예전에는 자동 작성 설정에 담아 둔 것(`autoDraftPlan.topics`)만 뺐다. 그런데 회원이
     * 매일 보는 화면에는 **어제 글로 쓴 주제**가 그대로 다시 올라왔다 — 담아 두지 않고
     * 바로 쓴 주제는 아무 데도 기록이 없었기 때문이다. 글에 남아 있는 세 칸을 모두 본다:
     * 메인 키워드 · 자동 초안이 고른 주제 · 정보 구간 주제.
     */
    const written = (db.posts ?? []).flatMap((p) => [p.mainKeyword, p.autoTopic, p.infoTopic])
    const exclude = [...(db.autoDraftPlan?.topics ?? []), ...written].filter(
      (t): t is string => typeof t === 'string' && t.trim().length > 0
    )

    /*
     * **오늘은 다른 말로 묻는다** (2026-08-29). 갈래에 여덟 개를 적어 두고 날마다 창을 한
     * 칸씩 밀어 세 개를 고른다 — 네이버 연관검색어는 같은 질의에 같은 순서로 답하므로,
     * 어제 물어본 말을 오늘 그대로 물으면 어제 본 목록이 그대로 온다.
     */
    const today = seoulToday()
    const queries = seedQueries(seed.queries, today)

    // ① 자동완성 · ② 검색광고 — 둘은 서로 기다릴 이유가 없다
    const [suggest, adRows] = await Promise.all([
      gatherSuggestions(queries).catch(() => ({ words: [] as string[], asked: 0, answered: 0 })),
      keywordTool(queries).catch(() => []),
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
    /*
     * **몇 번째 묶음부터 볼까.**
     *
     * 회원이 「다른 주제 보기」로 넘기면 그 번호가 그대로 온다. 처음 눌렀을 때는 번호가
     * 없는데, 예전에는 그때 **언제나 0 번**이었다 — 그래서 매일 아침 첫 화면이 늘 같은
     * 열두 줄이었다 (검색량이 가장 큰 것들). 이제 그 자리를 **날짜만큼 밀어서** 시작한다.
     */
    const asked = typeof body.page === 'number' && Number.isFinite(body.page)
    const page = asked ? Math.max(0, Math.trunc(body.page as number)) : dayIndex(today)
    /*
     * **뜻이 같은 말을 하나로 묶는다** (2026-08-28 회원 요청: "주제가 비슷한게 너무 많아 …
     * 기초대사량 / 기초대사량 높이기 이런것들 사실은 다 기초대사량에 관한거잖아").
     *
     * 줄 세운 뒤에 묶는다 — 발행량이 적은 쪽이 남는다. 묶인 말은 버리지 않고 그 줄에
     * 적어 돌려준다 (조용히 잘라내지 않는다).
     */
    const infoAll = candidates.filter((c) => c.intent === 'info')
    const info = dedupeByCore(infoAll)
    const merged = infoAll.length - info.length
    const at = normalizePage(page, Math.max(1, Math.ceil(info.length / SHOW_MAX)))
    const pick = pageOf(info, at)
    const range = pageRange(info.length, at)

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
        /** 뜻이 같아 한 줄로 묶은 개수 — 화면이 그 사실을 밝힌다 (2026-08-28) */
        merged,
        /** 지금 몇 번째를 보고 있나 — 「409개 중 13~24번째」 */
        total: info.length,
        from: range.from,
        to: range.to,
        pages: range.pages,
        page: at,
        /** 오늘 네이버에 실제로 물어본 말 — 매일 달라진다 (2026-08-29) */
        queries,
        /** 이미 고르거나 이미 쓴 주제라서 뺀 개수 */
        excluded: exclude.length,
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
