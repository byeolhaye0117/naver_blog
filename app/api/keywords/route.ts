import { NextResponse } from 'next/server'
import { keywordTool } from '@/lib/naver/searchad'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { areasFromStore, buildMetric, isOtherArea } from '@/lib/analysis/keyword'
import { keyStatus, NaverApiError } from '@/lib/naver/client'
import { readDB } from '@/lib/store'
import type { KeywordMetric } from '@/lib/types'

export const dynamic = 'force-dynamic'
// 키워드 24개 × (발행량 조회 1~2콜 + 재시도) 이라 기본 10초로는 뒤쪽이 잘린다
export const maxDuration = 60

const MAX_GRADED = 24
// 동시 요청을 낮추면 속도 제한에 덜 걸린다. 재시도가 있으니 4가 24개를 다 채운다.
const BATCH = 4

/** 발행량 조회는 키워드당 1~2콜이라 배치로 나눠 돌린다 */
async function withBlogTotals(
  rows: { keyword: string; monthlySearch: number; monthlyPc: number; monthlyMobile: number; compIdx?: string; mock: boolean }[]
): Promise<KeywordMetric[]> {
  const out: KeywordMetric[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    // 조회 실패는 count: null 로 남긴다. 0 으로 바꾸면 경쟁률이 0 이 되어
    // "황금 키워드" 로 잘못 판정된다 — 예전에 실제로 그렇게 보였다.
    const counts = await Promise.all(
      slice.map((r) => recentBlogCount(r.keyword).catch(() => ({ count: null, note: 'exact' as const })))
    )
    slice.forEach((r, j) => {
      const c = counts[j]
      out.push(
        buildMetric({
          keyword: r.keyword,
          monthlySearch: r.monthlySearch,
          monthlyPc: r.monthlyPc,
          monthlyMobile: r.monthlyMobile,
          blogRecent: c.count,
          blogRecentNote: c.note === 'exact' ? undefined : c.note,
          compIdx: r.compIdx,
          // 발행량은 키가 필요 없는 경로라 샘플이 아니다. 검색량 쪽만 샘플일 수 있다.
          mock: r.mock,
        })
      )
    })
  }
  return out
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keywords?: string[]; includeRelated?: boolean }
    const keywords = (body.keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 5)
    if (!keywords.length) {
      return NextResponse.json({ error: '키워드를 1개 이상 입력하세요.' }, { status: 400 })
    }

    const adRows = await keywordTool(keywords)

    // 요청한 키워드는 무조건 포함하고, 연관 키워드는 검색량 순으로 채운다
    const requested = new Set(keywords.map((k) => k.replace(/\s+/g, '')))
    const primary = adRows.filter((r) => requested.has(r.keyword.replace(/\s+/g, '')))

    // 검색광고 API 의 연관 키워드에는 전국 동네가 섞여 온다 (천안 지점을 조회했는데
    // 월평동·관저동(대전), 송탄(평택) 같은 게 들어온다). 내 지점이 없는 동네 글은
    // 쓸 수가 없으니, 다른 동네 이름이 든 것은 걸러낸다.
    const myAreas = new Set((await readDB()).stores.flatMap(areasFromStore))

    const related = adRows
      .filter((r) => !requested.has(r.keyword.replace(/\s+/g, '')))
      .filter((r) => !isOtherArea(r.keyword, myAreas))
      .sort((a, b) => b.monthlySearch - a.monthlySearch)

    const missing = keywords
      .filter((k) => !primary.some((p) => p.keyword.replace(/\s+/g, '') === k.replace(/\s+/g, '')))
      .map((k) => ({ keyword: k, monthlyPc: 0, monthlyMobile: 0, monthlySearch: 0, mock: true }))

    // 연관 키워드는 명시적으로 요청할 때만 붙인다 — 넣은 키워드가 묻히면 안 된다
    const target = body.includeRelated
      ? [...primary, ...missing, ...related].slice(0, MAX_GRADED)
      : [...primary, ...missing]

    const metrics = await withBlogTotals(target)

    return NextResponse.json({
      requested: keywords,
      rows: metrics,
      keyStatus: keyStatus(),
    })
  } catch (e) {
    const status = e instanceof NaverApiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '키워드 조사 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
