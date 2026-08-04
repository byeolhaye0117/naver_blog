import { NextResponse } from 'next/server'
import { dedupeAdRows, keywordToolMany } from '@/lib/naver/searchad'
import { readDB } from '@/lib/store'
import {
  areasFromStore,
  cityTokens,
  isRelevantKeyword,
  myRegionTokens,
} from '@/lib/analysis/keyword'
import { buildShortlist, shortlistHeadline } from '@/lib/analysis/shortlist'
import { keyStatus, NaverApiError } from '@/lib/naver/client'

export const dynamic = 'force-dynamic'
// 후보 60개면 검색량 조회가 12콜이다 (발행량은 여기서 재지 않는다)
export const maxDuration = 60

/** 후보로 받을 최대 개수 */
const MAX_CANDIDATES = 60
/** 추천으로 내보낼 기본 개수 */
const DEFAULT_LIMIT = 12

/**
 * 후보를 추려낸다 — 「키워드가 너무 많다」에 대한 답.
 *
 * **발행량은 여기서 재지 않는다.** 후보 60개를 다 재면 60~120콜이라 화면이 한참 멈춘다.
 * 검색량(1콜/5개)과 궁합(네트워크 없음)만으로 추리고, 경쟁률은 추려낸 것을 채점할 때
 * 확정한다. 그래서 응답에 경쟁률을 담지 않는다 — 짐작한 값을 실측처럼 보이게 두면 안 된다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      keywords?: string[]
      storeId?: string
      limit?: number
    }
    const keywords = (body.keywords ?? [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, MAX_CANDIDATES)
    if (!keywords.length) {
      return NextResponse.json({ error: '후보 키워드가 없습니다.' }, { status: 400 })
    }

    const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 3), 24)

    const all = (await readDB()).stores
    const store = body.storeId ? all.find((s) => s.id === body.storeId) : undefined
    const scopedStores = store ? [store] : all

    const cities = cityTokens(all)
    const myTokens = new Set([...myRegionTokens(scopedStores), ...cities])
    const areaList = Array.from(new Set(scopedStores.flatMap(areasFromStore)))
    const scope = { areas: areaList, cities: Array.from(cities) }

    const rows = dedupeAdRows(await keywordToolMany(keywords))

    /*
     * 연관 키워드도 후보에 넣는다 — 우리가 넣지 않았는데 검색량이 큰 말이 여기서 나온다
     * (실측: 「천안 헬스장 일일권」). 다만 범위 밖(남의 동네·업종·상호)은 걸러낸다.
     */
    const asked = new Set(keywords.map((k) => k.replace(/\s+/g, '')))
    const candidates = rows
      .filter(
        (r) =>
          asked.has(r.keyword.replace(/\s+/g, '')) || isRelevantKeyword(r.keyword, myTokens, scope)
      )
      .map((r) => ({
        keyword: r.keyword,
        monthlySearch: r.monthlySearch,
        adDepth: r.adDepth,
        fromNaver: !asked.has(r.keyword.replace(/\s+/g, '')),
      }))

    const list = buildShortlist(candidates, {
      areas: areaList.length ? areaList : undefined,
      cities: Array.from(cities),
      store: store ? { open24: store.open24, womenOnly: store.womenOnly } : undefined,
      limit,
    })

    return NextResponse.json({
      ...list,
      headline: shortlistHeadline(list),
      mock: rows.some((r) => r.mock),
      keyStatus: keyStatus(),
    })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '키워드를 추리는 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
