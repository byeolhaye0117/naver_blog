import type { RankSnapshot, RankTarget } from '@/lib/types'

/**
 * 순위 계산 — 순수 로직만. (실제 조회는 rank-check.ts, 서버 전용)
 * 클라이언트 컴포넌트에서도 import 하므로 node 모듈을 끌어오지 않게 분리해 둔다.
 */

/** 순위 조회 범위 — 네이버 검색 API 는 한 번에 최대 100개까지 준다 */
export const RANK_DEPTH = 50

export function normalizeUrl(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/\?.*$/, '')
}

export interface RankView {
  target: RankTarget
  history: RankSnapshot[]
  current: number | null
  previous: number | null
  /** 순위 변동 (양수 = 순위 상승) */
  delta: number | null
  best: number | null
}

export function buildRankViews(targets: RankTarget[], snapshots: RankSnapshot[]): RankView[] {
  return targets.map((target) => {
    const history = snapshots
      .filter((s) => s.targetId === target.id)
      .sort((a, b) => a.date.localeCompare(b.date))

    const ranked = history.filter((h) => h.rank !== null)
    const last = history[history.length - 1]
    const prev = history[history.length - 2]
    const current = last?.rank ?? null
    const previous = prev?.rank ?? null

    return {
      target,
      history,
      current,
      previous,
      delta: current !== null && previous !== null ? previous - current : null,
      best: ranked.length ? Math.min(...ranked.map((h) => h.rank!)) : null,
    }
  })
}

export function rankLabel(rank: number | null): string {
  if (rank === null) return `${RANK_DEPTH}위 밖`
  return `${rank}위`
}

/** 1페이지(보통 상위 10) 진입 여부 */
export function isFirstPage(rank: number | null): boolean {
  return rank !== null && rank <= 10
}
