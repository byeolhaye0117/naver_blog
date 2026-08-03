import { NextResponse } from 'next/server'
import { keywordTool } from '@/lib/naver/searchad'
import { recentBlogCount } from '@/lib/naver/blogsection'
import { buildMetric, isRelevantKeyword, myRegionTokens } from '@/lib/analysis/keyword'
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

/**
 * 검색광고 키워드도구는 힌트를 5개까지만 받는다. 조합 채점은 24개를 한 번에 보내므로
 * 5개씩 나눠 순서대로 부른다 (동시에 던지면 속도 제한에 걸린다).
 */
async function keywordToolMany(keywords: string[]) {
  const rows = []
  for (let i = 0; i < keywords.length; i += 5) {
    rows.push(...(await keywordTool(keywords.slice(i, i + 5))))
  }
  return rows
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keywords?: string[]; includeRelated?: boolean }
    const keywords = (body.keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, MAX_GRADED)
    if (!keywords.length) {
      return NextResponse.json({ error: '키워드를 1개 이상 입력하세요.' }, { status: 400 })
    }

    // 조합을 한꺼번에 채점하는 경로에서는 연관 키워드를 붙이지 않는다 —
    // 이미 24칸을 채웠으므로 붙일 자리가 없다.
    const many = keywords.length > 5
    const wantRelated = body.includeRelated ?? !many

    const adRows = await keywordToolMany(keywords)

    // 요청한 키워드는 무조건 포함하고, 연관 키워드는 검색량 순으로 채운다
    const requested = new Set(keywords.map((k) => k.replace(/\s+/g, '')))
    const primary = adRows.filter((r) => requested.has(r.keyword.replace(/\s+/g, '')))

    // 검색광고 API 의 연관 키워드에는 전국 지역과 남의 상호가 섞여 온다 (천안 지점을
    // 조회했는데 대전헬스장·창원필라테스·바디앤솔필라테스가 들어온다). 쓸 수 없는 것이
    // 화면을 차지하면 안 되니 걸러낸다 — isRelevantKeyword 주석에 규칙이 있다.
    const myTokens = myRegionTokens((await readDB()).stores)

    const related = adRows
      .filter((r) => !requested.has(r.keyword.replace(/\s+/g, '')))
      .filter((r) => isRelevantKeyword(r.keyword, myTokens))
      .sort((a, b) => b.monthlySearch - a.monthlySearch)

    const missing = keywords
      .filter((k) => !primary.some((p) => p.keyword.replace(/\s+/g, '') === k.replace(/\s+/g, '')))
      .map((k) => ({ keyword: k, monthlyPc: 0, monthlyMobile: 0, monthlySearch: 0, mock: true }))

    // 연관 키워드는 기본으로 붙인다 (안 떠올린 키워드를 발견하는 게 이 화면의 값이다).
    // 넣은 키워드가 묻히지 않게 화면에서 맨 위로 고정하고 배지로 구분한다.
    const target = !wantRelated
      ? [...primary, ...missing].slice(0, MAX_GRADED)
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
