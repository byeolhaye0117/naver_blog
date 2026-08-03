import { HUB_BASE, searchChannel, seededRandom, NaverApiError } from './client'

/** 네이버 데이터랩 검색어 트렌드 — 계절성·상승세 파악용 */

export interface TrendPoint {
  period: string
  ratio: number
}

export interface TrendSeries {
  keyword: string
  data: TrendPoint[]
  /**
   * 최근 3개월 평균 대비 그 이전 3개월 평균 변화율(%).
   * **진행 중인 이번 달은 계산에서 뺀다** — 아래 partialLast 주석 참고.
   */
  momentum: number
  /**
   * 마지막 구간이 아직 안 끝난 달인지.
   *
   * 실측에서 잡힌 문제다. 8월 3일에 조회하니 2026-08 이 5.7 로 찍혀(3일치) 모멘텀이
   * -23% 로 나왔다. 하락이 아니라 달이 안 끝난 것인데, 그대로 두면 "검색량 급감"
   * 으로 잘못 읽고 멀쩡한 키워드를 버린다.
   */
  partialLast: boolean
  mock: boolean
}

const DEV_ENDPOINT = 'https://openapi.naver.com/v1/datalab/search'
/** API 허브의 검색어 트렌드 — 요청 바디·응답 모양이 데이터랩과 같다 */
const HUB_ENDPOINT = `${HUB_BASE}/search-trend/v1/search`
const OVERRIDE = process.env.NAVER_TREND_API_ENDPOINT?.trim() || undefined

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** 이 구간이 아직 진행 중인 달인가 (순수 함수 — 테스트 대상) */
export function isPartialMonth(period: string, now: Date = new Date()): boolean {
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return period.slice(0, 7) === cur
}

/**
 * 끝난 달만 남긴다 — 모멘텀은 이 값으로 계산해야 한다 (순수 함수 — 테스트 대상).
 */
export function completedMonths(data: TrendPoint[], now: Date = new Date()): TrendPoint[] {
  if (!data.length) return data
  return isPartialMonth(data[data.length - 1].period, now) ? data.slice(0, -1) : data
}

export function momentumOf(raw: TrendPoint[], now: Date = new Date()): number {
  const data = completedMonths(raw, now)
  if (data.length < 6) return 0
  const recent = data.slice(-3)
  const prev = data.slice(-6, -3)
  const avg = (xs: TrendPoint[]) => xs.reduce((s, x) => s + x.ratio, 0) / xs.length
  const p = avg(prev)
  if (p === 0) return 0
  return Math.round(((avg(recent) - p) / p) * 100)
}

/** 최근 13개월 월별 트렌드 */
export async function searchTrend(keywords: string[]): Promise<TrendSeries[]> {
  const list = keywords.filter(Boolean).slice(0, 5)
  if (!list.length) return []

  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth() - 12, 1)

  const ch = searchChannel()
  if (!ch) return mockTrend(list, start, end)

  const url = OVERRIDE ?? (ch.channel === 'hub' ? HUB_ENDPOINT : DEV_ENDPOINT)
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...ch.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: ymd(start),
      endDate: ymd(end),
      timeUnit: 'month',
      keywordGroups: list.map((k) => ({ groupName: k, keywords: [k] })),
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new NaverApiError(
      `검색어 트렌드 API 오류 (${res.status}, ${ch.channel === 'hub' ? 'API 허브' : '개발자센터'}). ${body.slice(0, 200)}`,
      res.status
    )
  }

  const json = (await res.json()) as {
    results?: Array<{ title: string; data: TrendPoint[] }>
  }

  return (json.results ?? []).map((r) => ({
    keyword: r.title,
    data: r.data ?? [],
    momentum: momentumOf(r.data ?? []),
    partialLast: Boolean(r.data?.length) && isPartialMonth(r.data[r.data.length - 1].period),
    mock: false,
  }))
}

// ─── 목업 ──────────────────────────────────────────────────────

export function mockTrend(keywords: string[], start: Date, end: Date): TrendSeries[] {
  return keywords.map((k) => {
    const rnd = seededRandom(`trend:${k}`)
    const drift = rnd() * 0.6 - 0.2
    const data: TrendPoint[] = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)

    let i = 0
    while (cursor <= end) {
      const month = cursor.getMonth() + 1
      // 다이어트·헬스 키워드의 계절성: 1월과 5~6월이 성수기, 9~11월이 비수기
      const seasonal =
        month === 1 ? 1.45 : month >= 5 && month <= 6 ? 1.3 : month >= 9 && month <= 11 ? 0.75 : 1
      const noise = 0.85 + rnd() * 0.3
      const trend = 1 + (drift * i) / 12
      data.push({
        period: `${cursor.getFullYear()}-${String(month).padStart(2, '0')}-01`,
        ratio: Math.round(Math.min(100, 45 * seasonal * noise * trend) * 10) / 10,
      })
      cursor.setMonth(cursor.getMonth() + 1)
      i++
    }

    return {
      keyword: k,
      data,
      momentum: momentumOf(data),
      partialLast: data.length > 0 && isPartialMonth(data[data.length - 1].period),
      mock: true,
    }
  })
}
