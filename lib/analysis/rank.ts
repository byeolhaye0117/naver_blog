import type { Post, RankSnapshot, RankTarget } from '@/lib/types'
import { reviseEffect, type ReviseEffect } from './revise'
import { normalizeBlogUrl } from '../naver/blogsection'

/**
 * 순위 계산 — 순수 로직만. (실제 조회는 rank-check.ts, 서버 전용)
 * 클라이언트 컴포넌트에서도 import 하므로 node 모듈을 끌어오지 않게 분리해 둔다.
 */

/**
 * 순위 조회 범위 — 네이버 검색 API 는 한 번에 최대 100개까지 준다.
 *
 * **50 에서 100 으로 넓혔다** (2026-08-13). 회원 질문 "매일 자동으로 순위측정이 된다는거야?
 * 결과를 알려줘" 에 답하려고 직접 재보니, 「쌍용동헬스장」에서 그 글은 **61위**였다.
 * 그런데 앱 기록은 사흘 내내 「50위 밖」이었다 — 틀린 값은 아니지만 **아무것도 알려주지
 * 않는 값**이다. 61위와 300위가 같은 칸에 들어가면 올라가고 있는지 알 수 없다.
 *
 * 처음 며칠은 50위 밖에서 시작하는 게 정상이다. 그 구간이 안 보이면 순위 그래프의 목적
 * (며칠째에 올라오는지 보는 것)이 사라진다. 그래서 1페이지까지 가는 길을 볼 수 있게
 * 100위까지 본다 — 찾으면 그 자리에서 멈추므로 이미 상위권인 글은 비용이 늘지 않는다.
 */
export const RANK_DEPTH = 100

/**
 * 이 앱이 재는 순위가 정확히 무엇인지.
 *
 * 블로그 검색 결과 화면(section.blog.naver.com)을 관련도순으로 읽어 몇 번째인지 센다.
 * 최신순이 아니다 — 최신순은 발행만 하면 위에 있으니 의미가 없다.
 *
 * 검색 API 대신 이 경로를 쓰는 이유: 이건 실제 블로그 검색 화면 그 자체라서 순서가
 * 눈으로 보는 순위와 같다. 공식 검색 API 의 sort=sim 은 정확도 계산이 달라 화면 순위와
 * 어긋난다 (막혔을 때 예비 경로로만 쓴다).
 *
 * 다만 이것도 통합검색의 "상단 노출"과 같지는 않다:
 * - 실제 통합검색은 의도별 스마트블록으로 재배치되고, 라이프스타일 키워드 상당수가
 *   그 블록으로 노출된다. 스마트블록의 자리는 이 경로로도 볼 수 없다.
 * 그래서 화면에 이 사실을 밝히고, 네이버에서 직접 확인하는 링크를 함께 둔다.
 */
export const RANK_BASIS = '블로그 검색 결과 화면 · 관련도순 기준'

/** 그 키워드를 네이버에서 실제로 검색해보는 주소 — 앱 순위와 대조용 */
export function naverSearchUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`
}

export function naverBlogTabUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`
}

/**
 * 블로그 섹션 검색 — 통합검색 블로그 탭과 달리 **총 건수를 보여준다.**
 * 기간 필터를 걸 수 있어서 "최근 30일 발행량" 을 눈으로 확인할 수 있는 유일한 화면이다.
 * (통합검색 블로그 탭에서는 네이버가 총 건수 표시를 없앴다.)
 */
export function naverBlogSectionUrl(keyword: string): string {
  return `https://section.blog.naver.com/Search/Post.naver?keyword=${encodeURIComponent(keyword)}&orderBy=sim`
}

/**
 * 플레이스 목록을 끝까지 넘겨볼 수 있는 화면.
 * 통합검색 블록은 5~7곳만 보여주고, 그 아래는 이 화면에서 직접 넘겨야 한다.
 */
export function naverPlaceSearchUrl(keyword: string): string {
  return `https://m.place.naver.com/place/list?query=${encodeURIComponent(keyword)}`
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
 * - 색인: **네이버 블로그는 발행하면 자동으로 들어간다.** 2026-08-12 실측 — 같은 날 올라온
 *   글이 이미 통합검색에 실려 있었다(hyoni2_ 2편). 반대로 3일 지나도 안 실린 글도 있었다
 *   (pnpgym 8/9 글) — 그래서 구간 경계는 그대로 3일로 둔다.
 *
 *   **옛 주석의 「서치어드바이저 수동 요청 시 수 시간」은 근거 없이 적혀 있었다.** 그 기능은
 *   소유확인을 한 자체 도메인 사이트(티스토리·워드프레스 등)의 수집 요청이고,
 *   blog.naver.com 글에 그걸 하라고 안내할 근거를 찾지 못했다. 회원에게 안 해도 되는 일을
 *   시키는 안내였으므로 지웠다.
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

/**
 * 발행한 글을 순위 추적에 **자동으로 등록**할 목록.
 *
 * 예전에는 발행하고 나서 순위 화면에 가서 키워드와 주소를 손으로 다시 넣어야 했다.
 * 발행 첫날부터 추세를 보려면 그 단계가 없어야 한다 — 발행 주소를 넣는 순간 등록된다.
 *
 * 메인 키워드만 등록한다. 서브까지 자동으로 넣으면 항목이 세 배가 되어 화면이 흐려지고,
 * 실제로 봐야 하는 것은 메인이다 (서브는 필요하면 손으로 추가한다).
 */
export function autoRankTargets(
  post: {
    id: string
    status: string
    mainKeyword: string
    publishedUrl?: string
    publishedAt?: string
    createdAt?: string
  },
  existing: RankTarget[]
): { keyword: string; url: string; postId: string; publishedAt?: string }[] {
  if (post.status !== 'published') return []
  const url = (post.publishedUrl ?? '').trim()
  const keyword = (post.mainKeyword ?? '').trim()
  if (!url || !keyword) return []

  const flat = (s: string) => s.replace(/\s+/g, '')
  // normalizeUrl 은 m. 을 떼지 않는다 — m.blog 와 blog 를 다른 글로 봐서 중복이 쌓였다.
  // 같은 글 판정은 normalizeBlogUrl 로 한다 (모바일·PostView 주소까지 하나로 맞춘다).
  const already = existing.some(
    (t) => flat(t.keyword) === flat(keyword) && normalizeBlogUrl(t.url) === normalizeBlogUrl(url)
  )
  if (already) return []

  return [
    {
      keyword,
      url,
      postId: post.id,
      publishedAt: (post.publishedAt ?? post.createdAt ?? '').slice(0, 10) || undefined,
    },
  ]
}

export function phaseOf(ageDays: number | null, rank: number | null): PhaseInfo | null {
  if (ageDays === null) return null

  if (ageDays <= 3) {
    return {
      phase: 'indexing',
      label: `발행 ${ageDays}일차 · 색인 구간`,
      note:
        rank === null
          ? '아직 순위가 없어도 정상입니다. 네이버 블로그는 발행하면 자동으로 색인되니 서치어드바이저에 따로 요청할 필요가 없습니다. 제목을 그대로 검색해서 글이 나오는지만 확인하세요 — 나오면 색인은 된 것이고, 남은 건 순위입니다.'
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
  /**
   * 연결된 글의 제목.
   *
   * **같은 키워드로 여러 편을 추적한다** (2026-08-24 회원 지적: "같은 키워드가 많으니까
   * 제목을 붙여서 구분해주던가 하면 좋겠고"). 목록에 키워드만 적혀 있으면 어느 글의
   * 순위인지 구별할 수 없다 — URL 만 보고 가려내야 했다.
   */
  postTitle?: string
  /** YYYY-MM-DD — 추적 항목에 직접 적었거나 연결된 글에서 가져온 값 */
  publishedAt?: string
  /** 발행 후 경과일 */
  ageDays: number | null
  phase: PhaseInfo | null
  /** 고쳐서 다시 올린 날 (연결된 글에 적어둔 값) */
  revisedAt?: string
  /** 수정 앞뒤 순위 비교 — 실험 결과 (lib/analysis/revise.ts) */
  revise: ReviseEffect | null
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
    // 고쳐서 다시 올린 실험 — 그 앞뒤 순위를 비교한다
    const revisedAt = linked?.revisedAt
    const revise = revisedAt ? reviseEffect(history, revisedAt.slice(0, 10)) : null

    return {
      target,
      postTitle: linked?.title?.trim() || undefined,
      history,
      current,
      previous,
      delta: current !== null && previous !== null ? previous - current : null,
      best: ranked.length ? Math.min(...ranked.map((h) => h.rank!)) : null,
      publishedAt,
      ageDays,
      phase: phaseOf(ageDays, current),
      revisedAt,
      revise,
    }
  })
}

/**
 * 목록 한 줄에 **무엇으로 이 항목을 알아보나.**
 *
 * 같은 키워드가 여럿이면 키워드만으로는 구별이 안 된다. 순서대로 찾는다:
 *   ① 연결된 글 제목 — 가장 알아보기 쉽다
 *   ② 회원이 적어둔 이름표(label)
 *   ③ 그것도 없으면 URL 의 마지막 조각 (블로그 글 번호)
 */
export function rankItemName(v: Pick<RankView, 'target' | 'postTitle'>): string {
  const title = v.postTitle?.trim()
  if (title) return title
  const label = v.target.label?.trim()
  if (label) return label
  const tail = v.target.url.replace(/\/+$/, '').split('/').pop()
  return tail ? `글 ${tail}` : '연결된 글 없음'
}

/**
 * 목록 순서 — **같은 키워드끼리 붙여 놓는다.**
 *
 * 회원 지적 (2026-08-24): "같은 키워드가 많으니까…" 실제로 「쌍용동헬스장」·「쌍용동 헬스장」
 * 처럼 비슷한 키워드로 여러 편을 추적하고 있는데, 등록한 순서대로 흩어져 있으면 같은
 * 키워드의 글들을 비교하려고 위아래로 스크롤해야 한다.
 *
 * 같은 키워드 안에서는 **순위가 좋은 것부터** — 그 자리를 지금 누가 잡고 있는지가 먼저다.
 * 순위 밖(null)은 뒤로 민다 (모르는 것을 0위로 치면 맨 앞에 온다).
 */
export function sortRankViews(views: RankView[]): RankView[] {
  return [...views].sort(
    (a, b) =>
      a.target.keyword.localeCompare(b.target.keyword) ||
      (a.current ?? Number.MAX_SAFE_INTEGER) - (b.current ?? Number.MAX_SAFE_INTEGER) ||
      rankItemName(a).localeCompare(rankItemName(b))
  )
}

export function rankLabel(rank: number | null): string {
  if (rank === null) return `${RANK_DEPTH}위 밖`
  return `${rank}위`
}

/** 1페이지(보통 상위 10) 진입 여부 */
export function isFirstPage(rank: number | null): boolean {
  return rank !== null && rank <= 10
}
