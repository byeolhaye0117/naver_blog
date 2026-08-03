import type { KeywordGrade, KeywordMetric } from '@/lib/types'

/**
 * 키워드 등급 판정.
 *
 * 기준 근거 (naver-seo.md §4): 월 검색량 500~5,000 구간이 진입 적정.
 *
 * 경쟁률 = 최근 30일 블로그 발행량 ÷ 월간 검색량.
 *   두 값의 기간 단위가 같아서 "검색 1회당 새 글 몇 개" 로 그대로 읽힌다.
 *   누적 발행량을 쓰던 옛 지표(임계 25/60)와는 스케일이 완전히 다르다.
 *
 *   실측 분포로 잡은 임계값 (천안·아산권 헬스장 키워드 16개, 2026-08 기준):
 *     0.12 0.16 0.20 0.22 0.23 0.27 0.31 0.33 | 0.45 0.74 0.86 0.95 | 1.14 1.31 1.66 2.93
 *     ~0.35    비어 있는 시장 (검색 3회당 새 글 1개 미만)
 *     0.35~1.0 품질로 이길 수 있는 구간
 *     1.0~     포화 — 검색보다 새 글이 더 많이 쏟아진다. 세부 의도로 좁혀야 한다
 */
export const COMPETITION_GOOD = 0.35
export const COMPETITION_HARD = 1.0

/** 경쟁률을 계산할 수 없을 때 쓰는 값 — 화면에서 '—' 로 표시된다 */
export const COMPETITION_UNKNOWN = 999

export function gradeKeyword(
  monthlySearch: number,
  blogRecent: number | null
): { grade: KeywordGrade; reason: string; competition: number } {
  // 못 읽은 값을 0 으로 대신 쓰면 경쟁률이 0 이 되어 "황금 키워드" 로 잘못 판정된다.
  // 모르는 것은 모른다고 말하고, 어디서 채워 넣으면 되는지 알려준다.
  const searchKnown = monthlySearch > 0
  const totalKnown = typeof blogRecent === 'number' && blogRecent > 0
  const competition =
    searchKnown && totalKnown
      ? Math.round((blogRecent / monthlySearch) * 100) / 100
      : COMPETITION_UNKNOWN

  const unknown = (missing: string) => ({
    grade: 'unknown' as KeywordGrade,
    reason: `${missing}을 읽지 못해 경쟁률을 계산할 수 없습니다. 네이버에서 본 숫자를 직접 넣으면 같은 기준으로 등급이 나옵니다.`,
    competition,
  })

  if (!searchKnown) return unknown(totalKnown ? '월 검색량' : '검색량과 발행량')

  // 검색량만으로 결론이 나는 두 등급은 발행량 없이도 판정한다
  if (monthlySearch < 300) {
    return {
      grade: 'toosmall',
      reason: `월 검색량 ${monthlySearch.toLocaleString()}회 — 1위를 해도 유입이 거의 없습니다. 상위 노출 연습용으로는 괜찮습니다.`,
      competition,
    }
  }

  if (monthlySearch > 30000) {
    return {
      grade: 'toobig',
      reason: `월 검색량 ${monthlySearch.toLocaleString()}회 대형 키워드 — 대형 블로그·언론사와 겨루게 됩니다. 세부 의도를 붙여 좁히세요(예: "+ 새벽", "+ 여성전용", "+ 초보").`,
      competition,
    }
  }

  // 여기서부터는 경쟁률이 있어야 판정할 수 있다
  if (!totalKnown) return unknown('30일 발행량')

  // "검색 N회당 새 글 1개" 로 바꿔 말해준다 — 0.31 보다 훨씬 잘 읽힌다
  const perPost = Math.round(1 / competition)

  if (monthlySearch >= 500 && monthlySearch <= 5000 && competition <= COMPETITION_GOOD) {
    return {
      grade: 'gold',
      reason: `적정 검색량(${monthlySearch.toLocaleString()}회) + 최근 30일 새 글 ${blogRecent.toLocaleString()}개 — 검색 ${perPost}회당 새 글 1개꼴로 시장이 비어 있습니다. 지금 바로 노려야 하는 구간입니다.`,
      competition,
    }
  }

  if (competition > COMPETITION_HARD) {
    return {
      grade: 'hard',
      reason: `최근 30일에만 새 글 ${blogRecent.toLocaleString()}개 — 월 검색량 ${monthlySearch.toLocaleString()}회보다 새 글이 더 많이 쏟아지는 포화 상태입니다. 세부 의도를 붙여 좁히거나(예: "+ 새벽", "+ 초보") 다른 키워드를 고르세요.`,
      competition,
    }
  }

  return {
    grade: 'good',
    reason: `검색량 ${monthlySearch.toLocaleString()}회 / 최근 30일 새 글 ${blogRecent.toLocaleString()}개 (검색 ${perPost}회당 1개) — 글 품질이 받쳐주면 진입 가능합니다.`,
    competition,
  }
}

export function buildMetric(input: {
  keyword: string
  monthlySearch: number
  monthlyPc: number
  monthlyMobile: number
  blogRecent: number | null
  blogRecentNote?: 'estimated' | 'atLeast'
  compIdx?: string
  mock: boolean
  source?: 'api' | 'manual'
}): KeywordMetric {
  const { grade, reason, competition } = gradeKeyword(input.monthlySearch, input.blogRecent)
  return {
    keyword: input.keyword,
    monthlySearch: input.monthlySearch,
    monthlyPc: input.monthlyPc,
    monthlyMobile: input.monthlyMobile,
    blogRecent: input.blogRecent,
    blogRecentNote: input.blogRecentNote,
    competition,
    compIdx: input.compIdx,
    grade,
    gradeReason: reason,
    mobileShare:
      input.monthlySearch > 0
        ? Math.round((input.monthlyMobile / input.monthlySearch) * 100)
        : 0,
    mock: input.mock,
    source: input.source ?? 'api',
  }
}

/**
 * 지역 키워드 조합 생성기.
 * 에어서치·스마트블록은 세부 의도를 가진 키워드에 걸릴 기회가 크다(naver-seo.md §1).
 * 지역명 × 업종/의도 접미사를 곱해 후보를 만든다.
 */
export const INTENT_SUFFIXES = [
  '헬스장',
  'PT',
  '24시 헬스장',
  '여성전용 헬스장',
  '헬스장 가격',
  '헬스장 추천',
  '헬스장 후기',
  '피트니스',
  '헬스장 새벽',
  '헬스장 주말',
  '헬스 초보',
  '다이어트',
]

/**
 * 지점 정보에서 동네 이름을 뽑는다.
 *
 * 스마트플레이스는 사업주 로그인이 필요해서 앱이 읽을 수 없고, 네이버 지도 검색은
 * 서버 IP 에 캡차를 걸어 막는다(실측 확인). 그래서 자동 수집 대신 **이미 지점 정보에
 * 적어둔 주소와 지역 키워드**에서 뽑는다 — 네트워크를 타지 않으니 항상 성공한다.
 *
 * 주소에는 "두정동성당" 처럼 동으로 끝나지 않는 말이 섞이므로, 동/읍/면 뒤에
 * 경계(공백·쉼표·괄호·끝)가 오는 경우만 동네로 본다.
 */
const AREA_RE = /([가-힣]{2,10}?(?:동|읍|면))(?=[\s,·/()[\]]|$)/g

export function areasFromStore(store: {
  location?: string
  localKeywords?: string[]
}): string[] {
  const pool = [store.location ?? '', ...(store.localKeywords ?? [])].join(' ')
  const found = Array.from(pool.matchAll(AREA_RE)).map((m) => m[1])
  return Array.from(new Set(found))
}

/**
 * 이 키워드가 **내 지점이 없는 동네** 것인지.
 *
 * 검색광고 API 의 연관 키워드에는 전국 동네가 섞여 온다 — 천안 지점을 조회했는데
 * 월평동·관저동(대전), 송탄(평택) 같은 게 들어온다. 지점이 없는 동네로는 글을 쓸 수
 * 없으니 걸러낸다. 동네 이름이 없는 키워드(예: "다이어트 정체기")는 지역과 무관하므로
 * 남긴다 — 정보글 소재로 쓸 수 있다.
 */
export function isOtherArea(keyword: string, myAreas: Iterable<string>): boolean {
  const mine = new Set(myAreas)
  return Array.from(keyword.matchAll(/([가-힣]{2,10}?(?:동|읍|면))/g)).some((m) => !mine.has(m[1]))
}

/**
 * 그 지점 성격에 맞는 의도 접미사.
 * 24시간 운영이면 새벽·주말, 여성전용이면 여성전용 계열을 앞에 둔다 —
 * 지점이 실제로 가진 강점이 검색 의도와 맞아야 상위 노출 확률이 올라간다.
 */
export function suffixesForStore(store: { open24?: boolean; womenOnly?: boolean }): string[] {
  const out: string[] = []
  if (store.womenOnly) out.push('여성전용 헬스장', '여성전용 PT')
  if (store.open24) out.push('24시 헬스장', '헬스장 새벽', '헬스장 주말')
  out.push('헬스장', 'PT', '헬스장 가격', '헬스장 추천', '헬스장 후기', '피트니스', '다이어트')
  if (!store.womenOnly) out.push('헬스 초보')
  return Array.from(new Set(out)).slice(0, 12)
}

export function combineLocalKeywords(areas: string[], suffixes: string[] = INTENT_SUFFIXES): string[] {
  const out: string[] = []
  for (const a of areas.map((s) => s.trim()).filter(Boolean)) {
    for (const s of suffixes) out.push(`${a} ${s}`)
  }
  return Array.from(new Set(out))
}

// ─── 직접 입력 ─────────────────────────────────────────────────

export interface ManualRow {
  keyword: string
  monthlySearch: number
  /** 최근 30일 발행량 */
  blogRecent: number
}

export interface ManualParseResult {
  rows: ManualRow[]
  /** 형식을 못 알아본 줄 — 화면에 그대로 보여주고 고치게 한다 */
  bad: string[]
}

/**
 * "키워드, 월검색량, 30일 발행량" 한 줄씩 받아 읽는다.
 *
 * 자동 조회가 막혔을 때도 경쟁률 등급을 낼 수 있게 하는 입력 경로다.
 * 숫자에 천단위 콤마가 들어와도(1,200) 구분자 콤마와 헷갈리지 않게, 숫자 뒤에
 * 콤마+공백 또는 탭·파이프가 와야 구분자로 본다. "회"·"건" 같은 단위는 무시한다.
 */
const MANUAL_LINE =
  /^(.+?)\s*(?:[|\t]|,\s*)\s*([\d,]+)\s*[회건]?\s*(?:[|\t]|,\s*)\s*([\d,]+)\s*[회건]?$/

export function parseManualRows(raw: string): ManualParseResult {
  const rows: ManualRow[] = []
  const bad: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const m = MANUAL_LINE.exec(t)
    if (!m) {
      bad.push(t)
      continue
    }
    const keyword = m[1].trim().replace(/[,|\t]+$/, '').trim()
    const monthlySearch = Number(m[2].replace(/,/g, ''))
    const blogRecent = Number(m[3].replace(/,/g, ''))
    if (!keyword || !Number.isFinite(monthlySearch) || !Number.isFinite(blogRecent)) {
      bad.push(t)
      continue
    }
    rows.push({ keyword, monthlySearch, blogRecent })
  }

  // 같은 키워드를 두 번 적으면 나중 값을 쓴다
  const dedup = new Map<string, ManualRow>()
  for (const r of rows) dedup.set(r.keyword, r)
  return { rows: Array.from(dedup.values()), bad }
}

/** 직접 입력한 값으로 지표를 만든다 — 실측값이므로 mock 이 아니다 */
export function buildManualMetrics(rows: ManualRow[]): KeywordMetric[] {
  return rows.map((r) =>
    buildMetric({
      keyword: r.keyword,
      monthlySearch: r.monthlySearch,
      // PC/모바일 분리는 직접 입력에서 받지 않는다. 모바일 비중은 표시하지 않는다.
      monthlyPc: 0,
      monthlyMobile: 0,
      blogRecent: r.blogRecent,
      mock: false,
      source: 'manual',
    })
  )
}

export function gradeColor(grade: KeywordGrade): string {
  switch (grade) {
    case 'gold':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    case 'good':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
    case 'hard':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
    case 'toobig':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
    case 'unknown':
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30 border-dashed'
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30'
  }
}
