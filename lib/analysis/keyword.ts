import type { KeywordGrade, KeywordMetric } from '@/lib/types'

/**
 * 키워드 등급 판정.
 *
 * 기준 근거 (naver-seo.md §4): 월 검색량 500~5,000 구간이 진입 적정.
 *
 * 경쟁률 = 네이버 블로그 누적 발행량 ÷ 월간 검색량.
 *   검색 API 의 total 은 "이 키워드가 들어간 글의 누적 개수"이므로 월 검색량보다 훨씬 크다.
 *   따라서 임계값도 그 스케일에 맞춰 잡아야 한다 (10 이하가 아니라 25 이하가 '좋음'):
 *     ~25   비어 있는 시장
 *     25~60 품질로 이길 수 있는 구간
 *     60~   이미 포화 — 세부 의도로 좁혀야 한다
 */
export const COMPETITION_GOOD = 25
export const COMPETITION_HARD = 60

export function gradeKeyword(
  monthlySearch: number,
  blogTotal: number
): { grade: KeywordGrade; reason: string; competition: number } {
  const competition = monthlySearch > 0 ? Math.round((blogTotal / monthlySearch) * 10) / 10 : 999

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

  if (monthlySearch >= 500 && monthlySearch <= 5000 && competition <= COMPETITION_GOOD) {
    return {
      grade: 'gold',
      reason: `적정 검색량(500~5,000) + 경쟁률 ${competition} — 지금 바로 노려야 하는 구간입니다.`,
      competition,
    }
  }

  if (competition > COMPETITION_HARD) {
    return {
      grade: 'hard',
      reason: `경쟁률 ${competition} — 검색 1회당 기존 글이 ${competition}개꼴로 이미 포화입니다. 세부 의도를 붙여 좁히거나(예: "+ 새벽", "+ 초보") 다른 키워드를 고르세요.`,
      competition,
    }
  }

  return {
    grade: 'good',
    reason: `검색량 ${monthlySearch.toLocaleString()}회 / 경쟁률 ${competition} — 글 품질이 받쳐주면 진입 가능합니다.`,
    competition,
  }
}

export function buildMetric(input: {
  keyword: string
  monthlySearch: number
  monthlyPc: number
  monthlyMobile: number
  blogTotal: number
  compIdx?: string
  mock: boolean
  source?: 'api' | 'manual'
}): KeywordMetric {
  const { grade, reason, competition } = gradeKeyword(input.monthlySearch, input.blogTotal)
  return {
    keyword: input.keyword,
    monthlySearch: input.monthlySearch,
    monthlyPc: input.monthlyPc,
    monthlyMobile: input.monthlyMobile,
    blogTotal: input.blogTotal,
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
  blogTotal: number
}

export interface ManualParseResult {
  rows: ManualRow[]
  /** 형식을 못 알아본 줄 — 화면에 그대로 보여주고 고치게 한다 */
  bad: string[]
}

/**
 * "키워드, 월검색량, 발행량" 한 줄씩 받아 읽는다.
 *
 * 검색광고 API·검색 API 없이도 경쟁률 등급을 낼 수 있게 하는 입력 경로다.
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
    const blogTotal = Number(m[3].replace(/,/g, ''))
    if (!keyword || !Number.isFinite(monthlySearch) || !Number.isFinite(blogTotal)) {
      bad.push(t)
      continue
    }
    rows.push({ keyword, monthlySearch, blogTotal })
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
      blogTotal: r.blogTotal,
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
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30'
  }
}
