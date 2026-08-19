/**
 * **키워드를 한 바퀴 재는 부분** — 화면 버튼과 매일 도는 크론이 같은 함수를 쓴다.
 *
 * ── 왜 따로 뺐나 (2026-08-19) ────────────────────────────────
 * 회원 요청: "자동으로 매일 업데이트 되게 해줘." 그러려면 재는 곳이 두 곳(버튼·크론)이
 * 되는데, 라우트 파일은 테스트가 못 읽는다(scripts/test.mjs 는 lib 만 컴파일한다).
 * 두 라우트에 같은 루프를 복사해두면 한쪽만 고치는 날이 온다 — 이 저장소에서 이미 여러 번
 * 겪었다(스킬과 앱, 지시문과 검수, 터미널 표와 화면 표).
 *
 * 네이버를 부르는 부분은 **주입**받는다. 그래야 진짜 호출 없이 「못 잰 키워드를 숨기지
 * 않는가」·「순서가 맞는가」를 테스트에서 확인할 수 있다.
 */
import { recentBlogCount, topBlogPosts } from '../naver/blogsection'
import { ageDaysOf, openingOf, sortOpenings, type OpeningRow } from './openings'

/** 1페이지로 볼 범위 */
export const TOP = 10

export interface ScanDeps {
  top: (keyword: string, display: number) => Promise<{ items: { date: string | null }[] }>
  recent: (keyword: string) => Promise<{ count: number | null }>
  now: () => number
}

const REAL: ScanDeps = {
  top: (keyword, display) => topBlogPosts(keyword, display),
  recent: (keyword) => recentBlogCount(keyword),
  now: () => Date.now(),
}

export interface ScanResult {
  rows: OpeningRow[]
  /** 못 잰 키워드 — 숨기지 않는다 */
  failed: string[]
}

/**
 * 키워드마다 1페이지 나이와 최근 30일 발행량을 재서 등급을 매긴다.
 *
 * 발행량 조회는 실패해도 그 키워드를 버리지 않는다 (등급이 「7일 이내 진입」만으로도
 * 나온다 — `openingOf`). 반면 1페이지 목록을 못 읽으면 나이를 하나도 모르므로 그 줄은
 * `failed` 로 보낸다. **빈 줄로 두면 「자리가 굳었다」로 읽힌다.**
 */
export async function scanOpenings(
  keywords: string[],
  owners: Map<string, string[]>,
  deps: Partial<ScanDeps> = {}
): Promise<ScanResult> {
  const d: ScanDeps = { ...REAL, ...deps }
  const now = d.now()
  const rows: OpeningRow[] = []
  const failed: string[] = []

  for (const keyword of keywords) {
    try {
      const [page, recent] = await Promise.all([
        d.top(keyword, TOP),
        d.recent(keyword).catch(() => ({ count: null as number | null })),
      ])
      const ages = page.items
        .map((it) => ageDaysOf(it.date, now))
        .filter((a): a is number => a !== null)
      rows.push({
        ...openingOf({ ages, recent30: recent.count ?? null }),
        keyword,
        stores: owners.get(keyword) ?? [],
        dated: ages.length,
        sampled: page.items.length,
      })
    } catch {
      failed.push(keyword)
    }
  }

  return { rows: sortOpenings(rows), failed }
}

/**
 * 하루에 한 줄만 남기고 상한까지 잘라낸다 — 순수 함수라 테스트가 본다.
 *
 * 같은 날 크론이 돌고 회원이 버튼을 또 누르면 **나중 것이 그날 값**이다. 두 줄로 남기면
 * 「어제와 비교」가 오늘 안에서 끝나버려서 변화가 안 보인다.
 */
export function mergeOpeningRuns<T extends { date: string }>(prev: T[] | undefined, fresh: T, keep: number): T[] {
  const kept = (prev ?? []).filter((r) => r.date !== fresh.date)
  return [...kept, fresh].slice(-keep)
}

/** 지점들이 쓰는 지역 키워드 → 어느 지점 것인지 */
export function keywordOwners(stores: { name: string; localKeywords?: string[] }[]): Map<string, string[]> {
  const owners = new Map<string, string[]>()
  for (const s of stores) {
    for (const raw of s.localKeywords ?? []) {
      const k = raw.trim()
      if (!k) continue
      if (!owners.has(k)) owners.set(k, [])
      owners.get(k)!.push(s.name)
    }
  }
  return owners
}
