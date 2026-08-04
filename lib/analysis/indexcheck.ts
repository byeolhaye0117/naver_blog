/**
 * 누락 판별 — 제목을 그대로 검색했을 때 그 글이 어디에 있는지.
 *
 * **왜 두 곳을 따로 재나.** 지금까지는 블로그탭 한 곳만 보고 「나옴 / 안 나옴」으로
 * 갈랐다. 그런데 이 둘은 뜻이 완전히 다르다.
 *
 *   블로그탭 O · 통합검색 O  → 정상. 색인도 됐고 사람이 보는 화면에도 있다.
 *   블로그탭 O · 통합검색 X  → 색인은 됐다. 통합검색 첫 화면을 광고·플레이스·
 *                              스마트블록이 나눠 가져서 자리를 못 얻은 것이다.
 *                              **글을 고칠 문제가 아니라 키워드를 고를 문제다.**
 *   블로그탭 X · 통합검색 O  → 드문 경우. 블로그탭 조회가 흔들렸을 가능성이 크다.
 *   블로그탭 X · 통합검색 X  → 제목 완전일치인데도 두 곳 다 없다. 경쟁이 아니라
 *                              색인 문제다. 업계에서 「저품질」이라 부르는 그것이다.
 *
 * 앞의 둘을 하나로 묶어 버리면, 고칠 게 없는 글을 붙잡고 본문을 고치게 된다.
 *
 * **한쪽이라도 못 읽었으면 판정하지 않는다.** 통합검색을 못 읽은 것과 통합검색에
 * 없는 것은 다르다 — 없다고 단정하면 멀쩡한 글을 누락으로 몰게 된다.
 */

export type IndexVerdict =
  /** 두 곳 다 나온다 */
  | 'normal'
  /** 블로그탭에는 있는데 통합검색 첫 화면에는 없다 */
  | 'unifiedMissing'
  /** 통합검색에는 있는데 블로그탭에서 못 찾았다 */
  | 'blogTabMissing'
  /** 두 곳 다 없다 — 색인 문제 */
  | 'missing'
  /** 한쪽이라도 조회를 못 했다 */
  | 'unknown'

export interface IndexCheck {
  title: string
  /** null = 조회 실패 (없는 것과 다르다) */
  blogTab: boolean | null
  unified: boolean | null
  verdict: IndexVerdict
}

export function indexVerdict(blogTab: boolean | null, unified: boolean | null): IndexVerdict {
  if (blogTab === null || unified === null) return 'unknown'
  if (blogTab && unified) return 'normal'
  if (blogTab && !unified) return 'unifiedMissing'
  if (!blogTab && unified) return 'blogTabMissing'
  return 'missing'
}

export function buildIndexCheck(input: {
  title: string
  blogTab: boolean | null
  unified: boolean | null
}): IndexCheck {
  return { ...input, verdict: indexVerdict(input.blogTab, input.unified) }
}

export const VERDICT_LABEL: Record<IndexVerdict, string> = {
  normal: '정상',
  unifiedMissing: '통합검색에 없음',
  blogTabMissing: '블로그탭에 없음',
  missing: '누락 의심',
  unknown: '못 잼',
}

/** 화면 색 — 「통합검색에 없음」은 글 문제가 아니므로 빨강이 아니다 */
export const VERDICT_TONE: Record<IndexVerdict, 'good' | 'warn' | 'bad' | 'default'> = {
  normal: 'good',
  unifiedMissing: 'warn',
  blogTabMissing: 'warn',
  missing: 'bad',
  unknown: 'default',
}

export function verdictNote(v: IndexVerdict): string {
  switch (v) {
    case 'normal':
      return '제목으로 검색하면 블로그탭과 통합검색 두 곳에 다 나옵니다. 색인은 정상입니다.'
    case 'unifiedMissing':
      return '블로그탭에는 있으니 색인은 됐습니다. 통합검색 첫 화면에만 자리를 못 얻었습니다 — 광고·플레이스·스마트블록이 위를 차지한 것이라, 본문을 고칠 문제가 아니라 노릴 키워드를 바꿀 문제입니다.'
    case 'blogTabMissing':
      return '통합검색에는 있는데 블로그탭에서 못 찾았습니다. 블로그탭 조회가 흔들렸을 가능성이 큽니다 — 다시 재보세요.'
    case 'missing':
      return '제목을 그대로 검색해도 두 곳 다 없습니다. 경쟁에서 밀린 게 아니라 검색에서 빠진 것입니다. 이 상태에서는 어떤 키워드를 노려도 걸리지 않습니다.'
    default:
      return '조회가 실패해서 판정하지 않았습니다. 없다는 뜻이 아닙니다.'
  }
}

export interface IndexSummary {
  /** 블로그탭 색인율 (%). null = 못 잼 */
  blogTabRate: number | null
  /** 통합검색 노출율 (%). null = 못 잼 */
  unifiedRate: number | null
  counts: Record<IndexVerdict, number>
  /** 표본 전체를 한 줄로 */
  headline: string
}

export function summarizeIndex(checks: IndexCheck[]): IndexSummary {
  const counts: Record<IndexVerdict, number> = {
    normal: 0,
    unifiedMissing: 0,
    blogTabMissing: 0,
    missing: 0,
    unknown: 0,
  }
  for (const c of checks) counts[c.verdict]++

  const rate = (picked: (c: IndexCheck) => boolean | null) => {
    const known = checks.map(picked).filter((v): v is boolean => v !== null)
    return known.length ? Math.round((known.filter(Boolean).length / known.length) * 100) : null
  }

  const blogTabRate = rate((c) => c.blogTab)
  const unifiedRate = rate((c) => c.unified)

  let headline: string
  if (!checks.length) {
    headline = '색인 검사를 못 했습니다.'
  } else if (counts.missing > 0) {
    headline = `표본 ${checks.length}편 중 ${counts.missing}편이 제목 검색으로도 안 나옵니다 — 색인 문제를 먼저 해결해야 합니다.`
  } else if (counts.unifiedMissing > 0) {
    headline = `색인은 정상입니다. 다만 ${counts.unifiedMissing}편이 통합검색 첫 화면에는 없습니다 — 광고·플레이스가 위를 차지한 키워드입니다.`
  } else if (counts.normal > 0) {
    headline = `표본 ${counts.normal}편이 블로그탭·통합검색 두 곳에 다 나옵니다. 색인 정상입니다.`
  } else {
    headline = '조회가 흔들려 판정하지 못했습니다.'
  }

  return { blogTabRate, unifiedRate, counts, headline }
}
