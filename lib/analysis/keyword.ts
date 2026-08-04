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

/**
 * 광고가 블로그 자리를 얼마나 밀어내는지.
 *
 * **왜 보나.** 지금까지 이 앱은 검색량과 발행량만 봤다. 그런데 통합검색 첫 화면은
 * 위에서부터 파워링크 → 플레이스 → 스마트블록 순서다. 광고가 5개 붙는 키워드는
 * 사람이 스크롤을 두 번 내려야 블로그를 만난다. 즉 **같은 1위라도 광고가 많은
 * 키워드는 유입이 적다.** 검색량 3,000 짜리 광고 6개와 검색량 1,500 짜리 광고 0개
 * 중에 뒤쪽이 나은 경우가 실제로 있다.
 *
 * 임계값은 화면 구조에서 나온다 — 파워링크는 기본 5개까지 붙고, 그만큼 붙으면
 * 모바일 첫 화면이 광고로 덮인다.
 */
export const AD_HEAVY = 5
export const AD_SOME = 2

export function adNoteFor(adDepth?: number): string | undefined {
  // 값이 없으면 아무 말도 하지 않는다. 0 으로 대신 쓰면 "광고 없음" 이라는 거짓이 된다.
  if (typeof adDepth !== 'number' || !Number.isFinite(adDepth)) return undefined
  const n = Math.round(adDepth * 10) / 10
  if (adDepth >= AD_HEAVY) {
    return `광고 ${n}개가 붙는 키워드 — 통합검색 첫 화면 위쪽이 파워링크·플레이스로 덮여 블로그가 아래로 밀립니다. 검색량만큼 유입이 오지 않으니, 블로그가 위에 오는 세부 의도(후기·비용·초보)를 함께 노리세요.`
  }
  if (adDepth >= AD_SOME) {
    return `광고 ${n}개 — 위쪽에 광고가 조금 붙습니다. 블로그 자리는 남아 있습니다.`
  }
  return `광고가 거의 붙지 않는 키워드 (${n}개) — 통합검색 위쪽이 비어 있어 블로그가 먼저 보입니다. 1위 값이 그대로 유입으로 옵니다.`
}

export function buildMetric(input: {
  keyword: string
  monthlySearch: number
  monthlyPc: number
  monthlyMobile: number
  blogRecent: number | null
  blogRecentNote?: 'estimated' | 'atLeast'
  compIdx?: string
  adDepth?: number
  ctrPc?: number
  ctrMobile?: number
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
    adDepth: input.adDepth,
    ctrPc: input.ctrPc,
    ctrMobile: input.ctrMobile,
    adNote: adNoteFor(input.adDepth),
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
 * 업종·의도 단어. 지역 판별에서 두 가지로 쓴다.
 *  1) 이 단어가 붙어 있으면 "지역 + 업종" 꼴의 키워드다 (예: 대전헬스장)
 *  2) 내 지역 토큰을 뽑을 때 이 단어들은 지역이 아니므로 떼어낸다
 */
const TRADE_WORDS = [
  '헬스장', '피트니스', '휘트니스', '필라테스', '요가원', '요가', '주짓수', '크로스핏', '복싱',
  '스피닝', '태권도', '헬스', '짐', 'PT',
]

/**
 * 의도·소재 단어. 지역 토큰을 뽑을 때만 제외한다.
 *
 * 업종 판별(TRADE_WORDS)에는 넣지 않는다 — "다이어트 정체기 극복" 처럼 지역과 무관한
 * 정보 키워드까지 걸러지면 정보글 소재를 잃는다. 그런 키워드는 어차피 지역명이 없어서
 * 어느 지역에도 쓸 수 있다.
 */
const INTENT_WORDS = [
  '여성전용', '24시', '24시간', '다이어트', '가격', '추천', '후기', '새벽', '주말', '초보',
  '비용', '위치', '운동',
]

/** 토큰 끝에 붙은 업종·의도 단어를 떼어낸다 ("쌍용동PT" → "쌍용동") */
function stripTrade(token: string): string {
  let t = token
  for (let i = 0; i < 3; i++) {
    const before = t
    for (const w of [...TRADE_WORDS, ...INTENT_WORDS]) {
      const flat = w.replace(/\s+/g, '')
      if (t.length > flat.length && t.toUpperCase().endsWith(flat.toUpperCase())) {
        t = t.slice(0, -flat.length)
        break
      }
    }
    if (t === before) break
  }
  return t
}

/**
 * 내 지역을 가리키는 말 모음 — 지점 주소·지역 키워드에서 뽑는다.
 * 동네(쌍용동)뿐 아니라 시 이름(천안)도 들어온다. 업종·의도 단어는 제외한다.
 */
export function myRegionTokens(
  stores: { location?: string; localKeywords?: string[] }[]
): Set<string> {
  const out = new Set<string>()
  const skip = new Set(
    [...TRADE_WORDS, ...INTENT_WORDS].map((w) => w.replace(/\s+/g, '').toUpperCase())
  )

  for (const s of stores) {
    for (const a of areasFromStore(s)) out.add(a)
    const pool = [s.location ?? '', ...(s.localKeywords ?? [])].join(' ')
    for (const raw of pool.split(/[\s,·/()[\]]+/)) {
      const t = stripTrade(raw.trim())
      if (t.length < 2 || t.length > 10) continue
      if (!/^[가-힣]+$/.test(t)) continue
      if (skip.has(t.toUpperCase())) continue
      out.add(t)
    }
  }
  return out
}

/**
 * 헬스·운동 업종을 가리키는 말. 이 앱은 헬스장 블로그 도구이므로 연관 키워드도
 * 이 범위 안에 있어야 글 소재가 된다.
 */
const GYM_WORDS = [
  '헬스장', '헬스', '피트니스', '휘트니스', '짐', 'PT', '퍼스널트레이닝', '다이어트',
  '체지방', '근력', '웨이트', '유산소', '운동',
]

/** 헬스장이 아닌 업종 — 같은 지역이어도 우리 글 소재가 아니다 */
const OTHER_TRADES = [
  '필라테스', '요가', '주짓수', '복싱', '크로스핏', '태권도', '검도', '유도', '수영', '골프',
  '테니스', '배드민턴', '클라이밍', '스쿼시', '무에타이', '발레', '댄스',
  '피부관리', '에스테틱', '한의원', '병원', '의원', '정형외과', '도수치료', '마사지', '네일',
  '미용실', '카페', '맛집', '치과', '약국', '학원', '독서실',
]

/**
 * 지역 이름 목록 (시·군 + 널리 쓰이는 생활권 이름).
 *
 * 내 지역이 아닌 곳을 걸러내는 데 쓴다. 특히 "대전 봉명동" 처럼 **다른 도시에 같은
 * 동 이름이 있는 경우**가 있어서, 동 이름만으로는 내 지역이라고 볼 수 없다.
 */
const REGION_NAMES = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '수원', '성남', '용인', '고양', '화성', '평택', '안산', '안양', '부천', '남양주', '의정부',
  '파주', '김포', '광명', '군포', '하남', '오산', '이천', '구리', '포천', '여주', '시흥',
  '동탄', '송탄', '춘천', '원주', '강릉', '청주', '충주', '제천', '천안', '아산', '서산',
  '논산', '공주', '보령', '당진', '전주', '군산', '익산', '목포', '여수', '순천', '광양',
  '포항', '경주', '구미', '김천', '안동', '영주', '창원', '진주', '김해', '양산', '거제',
  '통영', '제주', '서귀포', '배방', '탕정', '둔산', '월평', '관저', '유성', '노은',
]

/**
 * 이 연관 키워드를 보여줄 만한지.
 *
 * 검색광고 API 는 "헬스장" 계열로 연관을 뽑으면서 전국과 다른 업종을 섞어 온다 —
 * 천안 지점을 조회했는데 대전헬스장·세종피부관리·천안테니스·창원필라테스가 들어오고
 * 바디앤솔필라테스 같은 남의 상호도 들어온다. 쓸 수 없는 것이 화면을 차지하면
 * 정작 봐야 할 키워드가 묻힌다.
 *
 * 세 조건을 다 만족해야 남긴다:
 *  1. 내 지역 말이 들어 있다 (동네 또는 시 이름)
 *  2. 내 지역이 아닌 지역 이름이 섞여 있지 않다 ("대전 봉명동" 같은 동명이동 방지)
 *  3. 헬스·운동 업종이다 (필라테스·요가·피부관리 등 다른 업종 제외)
 *
 * 회원이 직접 넣은 키워드는 이 검사를 거치지 않는다 — 본인이 판단해 넣은 것이다.
 */
export function isRelevantKeyword(keyword: string, myTokens: Set<string>): boolean {
  const flat = keyword.replace(/\s+/g, '')
  const upper = flat.toUpperCase()

  // 1. 내 지역이어야 한다
  let inMyArea = false
  for (const t of myTokens) {
    if (flat.includes(t)) {
      inMyArea = true
      break
    }
  }
  if (!inMyArea) return false

  // 2. 다른 지역 이름이 섞여 있으면 뺀다 (대전 봉명동 → 내 봉명동이 아니다)
  if (REGION_NAMES.some((r) => !myTokens.has(r) && flat.includes(r))) return false

  // 3. 다른 업종은 뺀다
  if (OTHER_TRADES.some((w) => flat.includes(w))) return false

  // 4. 헬스·운동 업종이어야 한다
  return GYM_WORDS.some((w) => upper.includes(w.toUpperCase()))
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
