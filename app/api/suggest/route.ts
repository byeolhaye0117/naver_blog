import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import {
  areasFromStore,
  cityTokens,
  myRegionTokens,
  suggestionDrop,
} from '@/lib/analysis/keyword'
import { gatherSuggestions, hasRepeatedToken, suggestSeeds } from '@/lib/naver/autocomplete'

export const dynamic = 'force-dynamic'
// 씨앗 7개까지 순서대로 물어본다
export const maxDuration = 60

/** 화면에 올릴 최대 개수 — 채점은 24개까지라 그보다 넉넉하게만 준다 */
const MAX = 30

/**
 * 사람들이 실제로 치는 검색어를 가져온다 (네이버 검색창 자동완성).
 *
 * 조합 생성기는 우리가 만든 가설이고, 이건 실제로 입력되는 말이다. 실측에서
 * 「일일권」·「1일권」·「사우나」처럼 우리 접미사 목록에 없던 말이 나왔다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { areas?: string[]; storeId?: string }

    const all = (await readDB()).stores
    const store = body.storeId ? all.find((s) => s.id === body.storeId) : undefined

    const areas = (body.areas ?? [])
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 4)
    const areaList = areas.length ? areas : store ? areasFromStore(store) : []
    if (!areaList.length) {
      return NextResponse.json(
        { error: '동네 이름을 먼저 넣어주세요 (지점을 고르면 자동으로 채워집니다).' },
        { status: 400 }
      )
    }

    // 시 이름은 전 지점에서 모은다 — 지점을 좁혀도 「천안」은 우리 도시다
    const cities = cityTokens(all)
    const myTokens = new Set([
      ...myRegionTokens(store ? [store] : all),
      ...cities,
    ])

    const seeds = suggestSeeds(areaList, Array.from(cities)[0])
    const { words, asked, answered } = await gatherSuggestions(seeds)

    if (!answered) {
      return NextResponse.json(
        {
          error:
            '네이버 자동완성을 읽지 못했습니다. 잠시 후 다시 시도하세요 — 아래 「조합 생성」은 네트워크 없이도 굴러갑니다.',
        },
        { status: 502 }
      )
    }

    const keywords: string[] = []
    const dropped: { keyword: string; why: string }[] = []

    for (const w of words) {
      if (hasRepeatedToken(w)) {
        // 자동완성이 원본 질의를 덧붙여 만든 꼴 — 사람이 그렇게 치지는 않는다
        continue
      }
      const why = suggestionDrop(w, myTokens)
      if (why) {
        dropped.push({ keyword: w, why })
        continue
      }
      keywords.push(w)
    }

    return NextResponse.json({
      keywords: keywords.slice(0, MAX),
      dropped: dropped.slice(0, 12),
      droppedCount: dropped.length,
      asked,
      answered,
      seeds,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색어를 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
