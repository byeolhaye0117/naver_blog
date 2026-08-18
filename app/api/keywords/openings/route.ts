import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { recentBlogCount, topBlogPosts } from '@/lib/naver/blogsection'
import { ageDaysOf, openingOf, sortOpenings, type OpeningRow } from '@/lib/analysis/openings'

export const dynamic = 'force-dynamic'
/** 키워드마다 목록 1콜 + 발행량 조회라 시간이 걸린다 */
export const maxDuration = 300

/** 1페이지로 볼 범위 */
const TOP = 10
/** 한 번에 잴 키워드 수 — 넘치면 화면에서 다음 묶음을 요청한다 */
const MAX_KEYWORDS = 24

/**
 * **지금 뚫릴 만한 키워드 찾기.**
 *
 * 회원 질문 (2026-08-18): "페이지에 업데이트된 거야?" — 아니었다. 순위표를 스크립트
 * (`npm run keywords:openings`)로만 뽑고 있었으니, 회원은 볼 방법이 없었다. 판단에 쓰는
 * 자료를 제 터미널에만 두는 것은 도구를 만든 게 아니다.
 *
 * 블로그 크기는 재지 않는다. 등급에 쓰지 않기 때문이다(`lib/analysis/openings.ts` 주석) —
 * 그리고 키워드마다 10곳씩 더 부르면 한 요청에 못 끝난다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keywords?: string[] }
    const db = await readDB()

    /** 키워드 → 어느 지점 것인지 */
    const owners = new Map<string, string[]>()
    for (const s of db.stores) {
      for (const raw of s.localKeywords ?? []) {
        const k = raw.trim()
        if (!k) continue
        if (!owners.has(k)) owners.set(k, [])
        owners.get(k)!.push(s.name)
      }
    }
    // 화면에서 고른 것만 재도 되게 한다 (다시 재기·묶음 나누기)
    const picked = (body.keywords ?? []).map((k) => k.trim()).filter(Boolean)
    const list = (picked.length ? picked : [...owners.keys()]).slice(0, MAX_KEYWORDS)

    if (!list.length) {
      return NextResponse.json(
        { error: '지점에 저장된 지역 키워드가 없습니다. 「지점 관리」에서 먼저 넣어주세요.' },
        { status: 400 }
      )
    }

    const now = Date.now()
    const rows: OpeningRow[] = []
    const failed: string[] = []
    for (const keyword of list) {
      try {
        const [page, recent] = await Promise.all([
          topBlogPosts(keyword, TOP),
          recentBlogCount(keyword).catch(() => ({ count: null as number | null })),
        ])
        const ages = page.items
          .map((it) => ageDaysOf(it.date, now))
          .filter((a): a is number => a !== null)
        const base = openingOf({ ages, recent30: recent.count ?? null })
        rows.push({
          ...base,
          keyword,
          stores: owners.get(keyword) ?? [],
          dated: ages.length,
          sampled: page.items.length,
        })
      } catch (e) {
        // 못 잰 키워드는 숨기지 않는다 — 빈 줄로 보이면 「자리가 굳었다」로 오해한다
        failed.push(keyword)
        console.error('[openings] 못 쟀습니다', keyword, e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({
      measuredAt: new Date().toISOString(),
      rows: sortOpenings(rows),
      failed,
      /** 지점에 저장된 키워드가 한 번에 재는 수보다 많으면 알려준다 */
      more: Math.max(0, owners.size - list.length),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '키워드를 재지 못했습니다.' },
      { status: 500 }
    )
  }
}
