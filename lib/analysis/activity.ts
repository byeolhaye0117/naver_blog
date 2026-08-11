/**
 * 활동 지표 — **시중 도구(라블로그·블덱스류)가 점수를 내는 축**을 우리도 낸다.
 *
 * ── 왜 따로 두는가 ─────────────────────────────────────────
 * 회원 블로그를 우리는 준최 5, 라블로그는 준최 1 로 봤다. 이름 방향은 이미 맞췄으니
 * 남은 차이는 **재는 대상**이다. 저쪽은 방문자·이웃·공감·댓글 같은 규모를, 우리는
 * 검색 노출을 본다. 그래서 둘을 억지로 한 숫자로 합치지 않는다 — **나란히 둔다.**
 *
 *   활동 지수  = 블로그가 얼마나 크고 부지런한가 (저쪽과 비교할 자리)
 *   노출 지수  = 우리 글이 검색에 실제로 걸리는가 (우리 목적에 직접 쓰는 자리)
 *
 * 합치면 안 되는 근거도 우리 판에서 이미 쟀다 (factors.ts): 「쌍용동 헬스장」 상위 5편은
 * **블로그 등급 순서로 줄을 서지 않았다** — 등급이 가장 높은 블로그가 5위였다. 규모가
 * 큰 것과 우리 키워드에서 위에 걸리는 것은 다른 이야기다.
 *
 * ── 구간은 우리가 임의로 나눴다 ─────────────────────────────
 * 네이버도, 시중 도구도 기준을 공개하지 않는다. 그래서 아래 구간은 **우리가 정한
 * 것**이고, 화면에도 그렇게 적는다. 관찰값(방문자 51명)은 사실이고 점수(30점 중
 * 7.5점)는 우리 해석이다 — 둘을 섞어 보여주지 않는다.
 */

import type { BlogStat, PostRow } from '../naver/blogstat'

/** 며칠 사이인가 (YYYY-MM-DD) */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

/**
 * 값이 어느 구간인가 → 0~1.
 * cuts 는 오름차순 경계다. 값이 cuts[0] 미만이면 0, 마지막 경계 이상이면 1.
 */
export function band(value: number, cuts: number[]): number {
  let i = 0
  while (i < cuts.length && value >= cuts[i]) i += 1
  return i / cuts.length
}

export interface ActivityAxis {
  label: string
  /** 관찰한 값을 사람이 읽는 말로 (「오늘 51명」) — 이건 사실이다 */
  observed: string
  value: number
  max: number
  /** 이 구간을 왜 이렇게 봤는지 */
  note: string
}

export interface ActivityResult {
  /** 0~100 — 시중 도구의 점수와 같은 자리에 놓고 볼 값 */
  score: number
  /** 「큰 편 / 보통 / 작은 편」 — 최적·준최과 헷갈리지 않게 다른 말을 쓴다 */
  size: '큰 편' | '보통' | '작은 편' | '아주 작은 편'
  axes: ActivityAxis[]
  /** 관찰한 날것의 숫자들 */
  facts: {
    dayVisitors: number | null
    totalVisitors: number | null
    /** 개설 이후 하루 평균 (누적 ÷ 운영일수) */
    avgVisitors: number | null
    buddies: number | null
    postCount: number | null
    /** 첫 글 날짜로 추정한 운영 기간(일) */
    ageDays: number | null
    firstPost: string | null
    last30: number | null
    avgComments: number | null
    avgSympathy: number | null
    /** 주인이 「검색 허용 안 함」으로 올린 글 수 (표본 안에서) */
    unsearchable: number
  }
  /** 밖에서 볼 수 없어 점수에 넣지 않은 것 */
  blind: string[]
}

/** 배점 — 합이 100 이어야 한다 */
const MAX = { visitors: 30, buddies: 20, posts: 15, cadence: 20, reaction: 15 }

export function measureActivity(input: {
  stat: BlogStat | null
  /** 최근 글 (날짜·댓글 수·검색 허용) */
  posts: PostRow[]
  /** 가장 오래된 글 날짜 (YYYY-MM-DD) — 운영 기간 추정용 */
  firstPost?: string | null
  /** 글별 공감 수 (읽은 것만) */
  sympathy?: (number | null)[]
  /** 오늘 (YYYY-MM-DD) */
  today: string
}): ActivityResult | null {
  const { stat, posts, firstPost, sympathy = [], today } = input
  if (!stat) return null

  const ageDays = firstPost ? daysBetween(firstPost, today) : null
  const avgVisitors =
    stat.totalVisitors !== null && ageDays && ageDays > 0 ? Math.round(stat.totalVisitors / ageDays) : null

  const dated = posts.filter((p) => p.date)
  const last30 = dated.length ? dated.filter((p) => daysBetween(p.date, today) <= 30).length : null
  const withComments = posts.filter((p) => Number.isFinite(p.commentCount))
  const avgComments = withComments.length
    ? Math.round((withComments.reduce((s, p) => s + p.commentCount, 0) / withComments.length) * 10) / 10
    : null
  const sym = sympathy.filter((n): n is number => typeof n === 'number')
  const avgSympathy = sym.length ? Math.round((sym.reduce((s, n) => s + n, 0) / sym.length) * 10) / 10 : null
  const unsearchable = posts.filter((p) => !p.searchable).length

  const axes: ActivityAxis[] = []
  const blind: string[] = [
    '유입경로 (검색으로 들어온 비율)',
    '일별 방문자 추이',
    '평균 체류시간 · 재방문율',
    '방문자 성별 · 연령',
  ]

  /*
   * 방문자는 **오늘 하루치**로 점수를 낸다. 누적은 15년 전 글로도 쌓이니 지금 상태를
   * 말해주지 못한다. 대신 하루치는 요일·계절에 흔들리므로 그 사실을 문장에 적고,
   * 누적 평균도 함께 보여준다. (매일 재서 평균을 내면 더 안정될 것이다 — 나중 과제)
   */
  if (stat.dayVisitors !== null) {
    const f = band(stat.dayVisitors, [50, 200, 1000, 5000])
    axes.push({
      label: '방문자',
      observed:
        `오늘 ${stat.dayVisitors.toLocaleString()}명` +
        (stat.totalVisitors !== null ? ` · 누적 ${stat.totalVisitors.toLocaleString()}명` : '') +
        (avgVisitors !== null ? ` (하루 평균 ${avgVisitors.toLocaleString()}명)` : ''),
      value: Math.round(f * MAX.visitors),
      max: MAX.visitors,
      note: '오늘 하루치라 요일·계절에 흔들립니다. 50 / 200 / 1,000 / 5,000명을 경계로 나눴습니다.',
    })
  }
  if (stat.buddies !== null) {
    const f = band(stat.buddies, [100, 500, 2000, 5000])
    axes.push({
      label: '이웃',
      observed: `${stat.buddies.toLocaleString()}명`,
      value: Math.round(f * MAX.buddies),
      max: MAX.buddies,
      note: '100 / 500 / 2,000 / 5,000명을 경계로 나눴습니다. 이웃은 검색 노출보다 재방문에 영향을 줍니다.',
    })
  }
  if (stat.postCount !== null) {
    const f = band(stat.postCount, [50, 200, 1000])
    axes.push({
      label: '쌓인 글',
      observed:
        `${stat.postCount.toLocaleString()}편` +
        (ageDays ? ` · ${Math.round(ageDays / 365)}년째 (${firstPost} 첫 글)` : ''),
      value: Math.round(f * MAX.posts),
      max: MAX.posts,
      note: '50 / 200 / 1,000편을 경계로 나눴습니다.',
    })
  }
  if (last30 !== null) {
    const f = band(last30, [1, 4, 12, 30])
    axes.push({
      label: '발행 꾸준함',
      observed: `최근 30일 ${last30}편`,
      value: Math.round(f * MAX.cadence),
      max: MAX.cadence,
      note: '30일에 12편(2~3일에 한 편) 이상이면 꾸준한 편으로 봤습니다.',
    })
  }
  if (avgComments !== null || avgSympathy !== null) {
    const react = (avgComments ?? 0) + (avgSympathy ?? 0)
    const f = band(react, [1, 3, 10, 30])
    axes.push({
      label: '반응',
      observed:
        [avgComments !== null ? `글당 댓글 ${avgComments}개` : null, avgSympathy !== null ? `공감 ${avgSympathy}개` : null]
          .filter(Boolean)
          .join(' · '),
      value: Math.round(f * MAX.reaction),
      max: MAX.reaction,
      note: '댓글과 공감을 더해 글당 1 / 3 / 10 / 30개를 경계로 나눴습니다.',
    })
  }

  if (!axes.length) return null

  /*
   * **못 읽은 항목은 배점에서 뺀다.** 0점으로 넣으면 「이웃을 못 읽은 블로그」가
   * 「이웃이 없는 블로그」와 같아진다 — 이 앱에서 이미 한 번 겪은 실수다.
   */
  const got = axes.reduce((s, a) => s + a.value, 0)
  const possible = axes.reduce((s, a) => s + a.max, 0)
  const score = Math.round((got / possible) * 100)

  const size: ActivityResult['size'] = score >= 70 ? '큰 편' : score >= 45 ? '보통' : score >= 20 ? '작은 편' : '아주 작은 편'

  return {
    score,
    size,
    axes,
    facts: {
      dayVisitors: stat.dayVisitors,
      totalVisitors: stat.totalVisitors,
      avgVisitors,
      buddies: stat.buddies,
      postCount: stat.postCount,
      ageDays,
      firstPost: firstPost ?? null,
      last30,
      avgComments,
      avgSympathy,
      unsearchable,
    },
    blind,
  }
}
