import { NextResponse } from 'next/server'
import { dedupeAdRows, keywordToolMany } from '@/lib/naver/searchad'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { gatherSuggestions, hasRepeatedToken, suggestSeeds } from '@/lib/naver/autocomplete'
import {
  areasFromStore,
  buildMetric,
  cityTokens,
  combineLocalKeywords,
  isRelevantKeyword,
  myRegionTokens,
  suggestionDrop,
  suffixesForStore,
} from '@/lib/analysis/keyword'
import {
  buildShortlist,
  shortlistHeadline,
  type KeywordSource,
  type ShortlistCandidate,
} from '@/lib/analysis/shortlist'
import { keyStatus, NaverApiError } from '@/lib/naver/client'
import { readDB } from '@/lib/store'
import type { KeywordMetric } from '@/lib/types'

export const dynamic = 'force-dynamic'
// 자동완성 7 + 검색량 12콜 + 발행량 12개 — 실측 20초 안쪽이지만 넉넉히 잡는다
export const maxDuration = 120

/** 검색량을 물어볼 후보 최대 개수 (5개당 1콜) */
const MAX_CANDIDATES = 60
/** 추려서 채점할 개수 */
const DEFAULT_LIMIT = 12
/** 발행량 조회 동시 개수 */
const BATCH = 4

/**
 * 키워드 진단 — 지점 하나를 고르면 여기서 전부 돈다.
 *
 * 예전에는 「키워드 조회」와 「지역 키워드 조합」이 따로였다. 회원이 그대로 말했다 —
 * "이거 두 개 따로 있는 이유가 없는 것 같아." 맞는 말이다. 조합을 만드는 것과 그걸
 * 조회하는 것은 한 동작이다.
 *
 * 한 번 부르면 이 순서로 간다.
 *  1. 지점 → 동네 (주소·지역 키워드에서 뽑는다. 네트워크 없음)
 *  2. **실제 검색어** — 네이버 검색창 자동완성 (사람들이 치는 말)
 *  3. **우리 조합** — 동네 × 지점 성격에 맞는 의도
 *  4. 검색량 조회 → 여기서 **함께 찾는 말**(검색광고 연관 키워드)까지 딸려 온다
 *  5. 범위 밖 걸러내기 (남의 동네·업종·상호·부정어)
 *  6. **추리기** — 필수 키워드 + 검색량 × 궁합으로 12개
 *  7. 그 12개만 **발행량까지 재서** 경쟁률·등급 확정
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      storeId?: string
      /** 지점 대신 동네를 직접 넣는 경우 */
      areas?: string[]
      /** 회원이 직접 보태는 키워드 */
      extra?: string[]
      limit?: number
    }

    const all = (await readDB()).stores
    const store = body.storeId ? all.find((s) => s.id === body.storeId) : undefined
    const scopedStores = store ? [store] : all

    const areaList = (
      body.areas?.map((a) => a.trim()).filter(Boolean) ??
      Array.from(new Set(scopedStores.flatMap(areasFromStore)))
    ).slice(0, 4)

    if (!areaList.length) {
      return NextResponse.json(
        {
          error:
            '동네를 찾지 못했습니다. 지점 정보에 주소나 지역 키워드를 넣어주세요 (예: 「쌍용동 헬스장」).',
        },
        { status: 400 }
      )
    }

    const cities = cityTokens(all)
    const myTokens = new Set([...myRegionTokens(scopedStores), ...cities])
    const scope = { areas: areaList, cities: Array.from(cities) }
    const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 3), 24)

    // ② 실제 검색어 — 막히면 없이 간다 (조합만으로도 진단은 나온다)
    const seeds = suggestSeeds(areaList, Array.from(cities)[0])
    const auto = await gatherSuggestions(seeds).catch(() => ({ words: [], asked: 0, answered: 0 }))
    const autoDropped: { keyword: string; why: string }[] = []
    const autoWords: string[] = []
    for (const w of auto.words) {
      if (hasRepeatedToken(w)) continue
      const why = suggestionDrop(w, myTokens, scope)
      if (why) {
        autoDropped.push({ keyword: w, why })
        continue
      }
      autoWords.push(w)
    }

    // ③ 우리 조합 — 지점 성격에 맞는 의도만 곱한다 (24시간이 아니면 24시 키워드를 안 만든다)
    const suffixes = store ? suffixesForStore(store) : undefined
    const combos = combineLocalKeywords(areaList, suffixes)

    const extra = (body.extra ?? []).map((k) => k.trim()).filter(Boolean)

    // 어디서 온 말인지 기억해 둔다 (화면에서 출처를 보여준다)
    const sourceOf = new Map<string, KeywordSource>()
    const flat = (s: string) => s.replace(/\s+/g, '')
    for (const w of combos) sourceOf.set(flat(w), 'combo')
    for (const w of autoWords) sourceOf.set(flat(w), 'auto')
    for (const w of extra) sourceOf.set(flat(w), 'auto')

    // ④ 검색량 조회 — 실제 검색어를 앞에 둔다 (5개당 1콜이라 순서가 곧 우선순위다)
    const ask = Array.from(new Set([...extra, ...autoWords, ...combos])).slice(0, MAX_CANDIDATES)
    const rows = dedupeAdRows(await keywordToolMany(ask))

    // ⑤ 연관 키워드(= 네이버가 함께 찾는다고 보는 말)도 후보에 넣고, 범위 밖은 걸러낸다
    const asked = new Set(ask.map(flat))
    const candidates: ShortlistCandidate[] = rows
      .filter((r) => asked.has(flat(r.keyword)) || isRelevantKeyword(r.keyword, myTokens, scope))
      .map((r) => ({
        keyword: r.keyword,
        monthlySearch: r.monthlySearch,
        adDepth: r.adDepth,
        source: sourceOf.get(flat(r.keyword)) ?? 'related',
      }))

    // ⑥ 추리기
    const list = buildShortlist(candidates, {
      areas: areaList,
      cities: Array.from(cities),
      store: store ? { open24: store.open24, womenOnly: store.womenOnly } : undefined,
      limit,
    })

    // ⑦ 추려낸 것만 발행량까지 재서 등급 확정
    const byFlat = new Map(rows.map((r) => [flat(r.keyword), r]))
    const metrics: KeywordMetric[] = []
    for (let i = 0; i < list.picked.length; i += BATCH) {
      const slice = list.picked.slice(i, i + BATCH)
      const counts = await Promise.all(
        slice.map((p) =>
          recentBlogCount(p.keyword).catch(() => ({ count: null, note: 'exact' as const }))
        )
      )
      slice.forEach((p, j) => {
        const ad = byFlat.get(flat(p.keyword))
        const c = counts[j]
        metrics.push(
          buildMetric({
            keyword: p.keyword,
            monthlySearch: p.monthlySearch,
            monthlyPc: ad?.monthlyPc ?? 0,
            monthlyMobile: ad?.monthlyMobile ?? 0,
            blogRecent: c.count,
            blogRecentNote: c.note === 'exact' ? undefined : c.note,
            compIdx: ad?.compIdx,
            adDepth: p.adDepth,
            ctrPc: ad?.ctrPc,
            ctrMobile: ad?.ctrMobile,
            mock: ad?.mock ?? true,
          })
        )
      })
    }

    return NextResponse.json({
      areas: areaList,
      storeId: store?.id,
      picked: list.picked,
      skipped: list.skipped,
      considered: list.considered,
      headline: shortlistHeadline(list),
      rows: metrics,
      requested: list.picked.map((p) => p.keyword),
      sources: {
        auto: autoWords.length,
        combo: combos.length,
        related: candidates.filter((c) => c.source === 'related').length,
        autoAsked: auto.asked,
        autoAnswered: auto.answered,
      },
      autoDropped: autoDropped.slice(0, 12),
      autoDroppedCount: autoDropped.length,
      keyStatus: keyStatus(),
    })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '키워드 진단 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
