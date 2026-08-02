import { NextResponse } from 'next/server'
import { keywordTool } from '@/lib/naver/searchad'
import { blogTotalCount } from '@/lib/naver/search'
import { buildMetric } from '@/lib/analysis/keyword'
import { keyStatus, NaverApiError } from '@/lib/naver/client'
import type { KeywordMetric } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MAX_GRADED = 24
const BATCH = 6

/** 발행량 조회는 키워드당 1콜이라 배치로 나눠 돌린다 */
async function withBlogTotals(
  rows: { keyword: string; monthlySearch: number; monthlyPc: number; monthlyMobile: number; compIdx?: string; mock: boolean }[]
): Promise<KeywordMetric[]> {
  const out: KeywordMetric[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    // 조회 실패는 total: null 로 남긴다. 0 으로 바꾸면 경쟁률이 0 이 되어
    // "황금 키워드" 로 잘못 판정된다 — 검색 권한이 없는 계정에서 늘 그렇게 보였다.
    const totals = await Promise.all(
      slice.map((r) =>
        blogTotalCount(r.keyword).catch(() => ({ total: null as number | null, mock: false }))
      )
    )
    slice.forEach((r, j) => {
      const t = totals[j]
      out.push(
        buildMetric({
          keyword: r.keyword,
          monthlySearch: r.monthlySearch,
          monthlyPc: r.monthlyPc,
          monthlyMobile: r.monthlyMobile,
          blogTotal: t.total,
          compIdx: r.compIdx,
          // 지어낸 값을 보여줄 때만 샘플 표시. 못 읽은 값은 '—' 로 나가므로 샘플이 아니다.
          mock: r.mock || (t.total !== null && t.mock),
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
    const related = adRows
      .filter((r) => !requested.has(r.keyword.replace(/\s+/g, '')))
      .sort((a, b) => b.monthlySearch - a.monthlySearch)

    const missing = keywords
      .filter((k) => !primary.some((p) => p.keyword.replace(/\s+/g, '') === k.replace(/\s+/g, '')))
      .map((k) => ({ keyword: k, monthlyPc: 0, monthlyMobile: 0, monthlySearch: 0, mock: true }))

    const target = body.includeRelated === false
      ? [...primary, ...missing]
      : [...primary, ...missing, ...related].slice(0, MAX_GRADED)

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
