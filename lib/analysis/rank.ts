import type { Post, RankSnapshot, RankTarget } from '@/lib/types'

/**
 * 순위 계산 — 순수 로직만. (실제 조회는 rank-check.ts, 서버 전용)
 * 클라이언트 컴포넌트에서도 import 하므로 node 모듈을 끌어오지 않게 분리해 둔다.
 */

/** 순위 조회 범위 — 네이버 검색 API 는 한 번에 최대 100개까지 준다 */
export const RANK_DEPTH = 50

/**
 * 이 앱이 재는 순위가 정확히 무엇인지.
 *
 * 검색 API 의 블로그 검색을 sort=sim(관련도순)으로 호출해 몇 번째인지 센다.
 * 최신순이 아니다 — 최신순은 발행만 하면 위에 있으니 의미가 없다.
 *
 * 다만 이것은 실제 화면의 "상단 노출"과 같지 않다:
 * - 검색 API 는 평면 목록을 준다. 반면 실제 통합검색은 의도별 스마트블록으로
 *   재배치되고, 라이프스타일 키워드 상당수가 그 블록으로 노출된다.
 * - 스마트블록의 자리는 API 로 볼 수 없다. 즉 앱의 순위는 근사치(대리 지표)다.
 * 그래서 화면에 이 사실을 밝히고, 네이버에서 직접 확인하는 링크를 함께 둔다.
 */
export const RANK_BASIS = '검색 API 블로그 검색 · 관련도순(sim) 기준'

/** 그 키워드를 네이버에서 실제로 검색해보는 주소 — 앱 순위와 대조용 */
export function naverSearchUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`
}

export function naverBlogTabUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`
}

export function normalizeUrl(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/\?.*$/, '')
}

/**
 * 발행 후 경과 구간.
 *
 * 같은 "순위 밖"이라도 발행 3일차와 3주차는 뜻이 전혀 다르다. 앞은 아직 색인·초기
 * 반응이 도는 중이고, 뒤는 진입 실패로 봐야 한다. 이 구분이 없으면 성급하게 글을
 * 뜯어고치거나, 반대로 안 되는 키워드를 계속 붙들게 된다.
 *
 * 구간 경계의 근거:
 * - 색인 24~72시간 (서치어드바이저 수동 요청 시 수 시간) — 자료로 확인됨
 * - 초기 반응 수집 발행 직후 24~48시간 — 자료로 확인됨
 * - 그 이후 순위가 자리 잡는 데 걸리는 기간은 공개된 수치가 없다. 실무에서 흔히
 *   말하는 "2주 전후"를 판단 기준으로 삼되, 확정된 사실이 아님을 화면에 밝힌다.
 */
export type RankPhase = 'indexing' | 'earlyResponse' | 'settling' | 'settled'

export interface PhaseInfo {
  phase: RankPhase
  label: string
  note: string
  tone: 'info' | 'good' | 'warn' | 'bad'
}

export function phaseOf(ageDays: number | null, rank: number | null): PhaseInfo | null {
  if (ageDays === null) return null

  if (ageDays <= 3) {
    return {
      phase: 'indexing',
      label: `발행 ${ageDays}일차 · 색인 구간`,
      note:
        rank === null
          ? '아직 순위가 없어도 정상입니다. 색인에 24~72시간이 걸립니다. 서치어드바이저에 색인 요청을 했는지 확인하세요.'
          : '벌써 잡혔습니다. 이 구간의 순위는 아직 요동칩니다.',
      tone: 'info',
    }
  }

  if (ageDays <= 7) {
    return {
      phase: 'earlyResponse',
      label: `발행 ${ageDays}일차 · 초기 반응 구간`,
      note:
        rank === null
          ? '색인은 됐을 시점입니다. 제목을 그대로 검색해 글이 나오는지 확인하세요 — 안 나오면 검색누락입니다.'
          : '초기 반응(조회·체류)이 반영되는 구간입니다. 순위가 오르내리는 게 정상입니다.',
      tone: 'info',
    }
  }

  if (ageDays <= 21) {
    return {
      phase: 'settling',
      label: `발행 ${ageDays}일차 · 자리 잡는 구간`,
      note:
        rank === null
          ? '아직 순위 밖이면 이 키워드는 어려울 수 있습니다. 다만 이 구간에서 올라오는 경우도 있어 조금 더 지켜볼 만합니다.'
          : '순위가 안정되어 가는 구간입니다. 계속 기록해 추세를 보세요.',
      tone: rank === null ? 'warn' : 'good',
    }
  }

  return {
    phase: 'settled',
    label: `발행 ${ageDays}일차`,
    note:
      rank === null
        ? '3주가 지나도 순위 밖입니다. 진입 실패로 보고 세부 의도를 붙여 키워드를 좁히거나, 정보량을 늘려 다시 쓰는 편이 낫습니다.'
        : '자리를 잡은 순위입니다. 최신성이 강한 키워드는 새 글에 밀리니 계속 확인하세요.',
    tone: rank === null ? 'bad' : 'good',
  }
}

export interface RankView {
  target: RankTarget
  history: RankSnapshot[]
  current: number | null
  previous: number | null
  /** 순위 변동 (양수 = 순위 상승) */
  delta: number | null
  best: number | null
  /** YYYY-MM-DD — 추적 항목에 직접 적었거나 연결된 글에서 가져온 값 */
  publishedAt?: string
  /** 발행 후 경과일 */
  ageDays: number | null
  phase: PhaseInfo | null
}

function daysSince(date: string): number | null {
  const t = new Date(`${date.slice(0, 10)}T00:00:00`).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

export function buildRankViews(
  targets: RankTarget[],
  snapshots: RankSnapshot[],
  posts: Post[] = []
): RankView[] {
  return targets.map((target) => {
    const history = snapshots
      .filter((s) => s.targetId === target.id)
      .sort((a, b) => a.date.localeCompare(b.date))

    const ranked = history.filter((h) => h.rank !== null)
    const last = history[history.length - 1]
    const prev = history[history.length - 2]
    const current = last?.rank ?? null
    const previous = prev?.rank ?? null

    // 발행일은 추적 항목에 적힌 값 우선, 없으면 연결된 글에서 가져온다
    const linked = target.postId ? posts.find((p) => p.id === target.postId) : undefined
    const publishedAt = target.publishedAt || linked?.publishedAt
    const ageDays = publishedAt ? daysSince(publishedAt) : null

    return {
      target,
      history,
      current,
      previous,
      delta: current !== null && previous !== null ? previous - current : null,
      best: ranked.length ? Math.min(...ranked.map((h) => h.rank!)) : null,
      publishedAt,
      ageDays,
      phase: phaseOf(ageDays, current),
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
