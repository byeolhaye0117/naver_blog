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
 * 이 키워드에 붙는 **파워링크**(사이트검색광고) 개수.
 *
 * 검색광고 API `plAvgDepth` 다. PL = **파워링크**(사이트검색광고) — 네이버 안내문 그대로
 * "이 광고는 사이트검색광고(파워링크)로, 검색어와 광고의 연관도, 광고주의 입찰가 등에
 * 의해 광고 노출 여부와 순위가 결정됩니다." **스마트플레이스와는 다른 상품이다.**
 *
 * **처음에 잘못 썼던 것.** 「광고가 많으면 블로그가 아래로 밀린다」고 안내했다. 실제로
 * 모바일 통합검색을 읽어보니 근거가 없었다 (2026-08 실측):
 *   쌍용동 헬스장 · 봉명동 헬스장 → 「파워링크」 문자열 **0건**, 「플레이스」 49건.
 * 우리 키워드는 모바일 비중이 67~98% 인데 그 모바일에 파워링크가 붙지 않았다. 위를
 * 차지한 것은 플레이스였고, 플레이스는 광고가 아니라 지역 검색 결과다. 자세한 것은
 * PLACE_ABOVE_BLOG 주석에 적었다.
 *
 * 그래서 이 값은 **상업성 세기**로만 읽는다 — 이 검색어에 돈을 쓰는 업체가 몇 곳인지.
 * 실측 분포 (검색광고 API 실제 응답):
 *   봉명동헬스장 10 · 쌍용동헬스장 10 · 스쿼트자세 10 · 쌍용동PT 9 · 프로틴추천 8
 *   다이어트정체기 3 · 헬스초보 3
 * 지역+업종은 슬롯이 거의 다 차고 정보 키워드는 3 안쪽이라, 5 를 경계로 두면 갈린다.
 */
export const AD_HEAVY = 5
export const AD_SOME = 2

export type AdPressure = 'heavy' | 'some' | 'light'

export function adPressureOf(adDepth?: number): AdPressure | null {
  // 값이 없으면 판정하지 않는다. 0 으로 대신 쓰면 "광고 없음" 이라는 거짓이 된다.
  if (typeof adDepth !== 'number' || !Number.isFinite(adDepth)) return null
  if (adDepth >= AD_HEAVY) return 'heavy'
  if (adDepth >= AD_SOME) return 'some'
  return 'light'
}

/**
 * 「그래서 이 키워드를 어떻게 쓰라고?」 한 줄.
 *
 * 광고 개수만 말하면 회원이 할 일이 안 나온다. 다만 **광고를 근거로 등급을 내리지는
 * 않는다** — 실측에서 근거가 무너졌다 (위 주석). 사실만 말하고 할 일은
 * keywordVerdict 에서 말한다.
 */
export function adNoteFor(adDepth?: number): string | undefined {
  const pressure = adPressureOf(adDepth)
  if (!pressure) return undefined
  const n = Math.round((adDepth as number) * 10) / 10

  // 여기서는 **사실만** 말한다. 할 일은 keywordVerdict 한 곳에서만 말한다.
  if (pressure === 'heavy') {
    return `파워링크 광고 ${n}개 — 이 검색어에 돈을 쓰는 업체가 많습니다(상업성 높음). PC 검색에서는 위쪽을 차지합니다.`
  }
  if (pressure === 'some') {
    return `파워링크 광고 ${n}개 — 돈을 쓰는 업체가 조금 있습니다.`
  }
  return `파워링크 광고 ${n}개 — 돈을 쓰는 업체가 거의 없는 검색어입니다.`
}

/**
 * 지역 키워드에서 블로그 위에 오는 것은 광고가 아니라 **플레이스**다.
 *
 * 실측(2026-08, 모바일 통합검색 HTML 직접 조회):
 *   쌍용동 헬스장 · 봉명동 헬스장 → 「파워링크」 문자열 **0건**, 「플레이스」 49건.
 *   화면은 플레이스 블록 다음에 블로그(「스포츠 인기글」)가 왔다.
 *   PC 에는 파워링크 영역 안내가 있지만(1건) 광고 항목은 화면에서 나중에 그려진다.
 *
 * 그래서 이렇게 읽어야 한다.
 *  - 광고를 끊어도 플레이스는 그대로 위에 있다 — 광고비 문제가 아니라 **화면 구조**다.
 *  - 블로그탭 순위는 광고와 **무관하다** (광고가 블로그탭에는 없다).
 *  - 우리 키워드는 모바일 비중이 67~98% 인데(검색광고 실측), 그 모바일에 파워링크가
 *    안 붙었다. 광고 개수는 「블로그가 밀리는 정도」가 아니라 **상업성 세기**로 읽는다.
 */
export const PLACE_ABOVE_BLOG =
  '지역 키워드는 통합검색 위쪽을 플레이스가 차지합니다. 광고를 끊어도 그대로이고(광고비 문제가 아니라 화면 구조입니다), 블로그탭 순위는 광고와 무관합니다. 그래서 지역 키워드는 블로그 글과 플레이스 순위를 함께 챙겨야 합니다.'

/**
 * 광고 클릭률을 사람 말로.
 *
 * **광고 개수와는 다른 것을 말한다.** 개수는 「돈 쓰는 업체가 몇 곳인지」이고,
 * 클릭률은 「검색한 사람이 살 마음을 갖고 있는 정도」다. 값이 0.2~1.5% 라 그 자체로
 * 유입을 크게 깎지는 않는다 — 100명 중 99명은 광고를 누르지 않는다. 그래서
 * 유입 손실이 아니라 **상업성 가늠자**로 읽어야 한다.
 */
export const CTR_HIGH = 1.0
export const CTR_SOME = 0.5

export function ctrNote(ctr?: number): string | undefined {
  if (typeof ctr !== 'number' || !Number.isFinite(ctr)) return undefined
  if (ctr >= CTR_HIGH) {
    return `광고 클릭률 ${ctr}% — 검색 100번에 1번쯤 광고를 누릅니다. 돈을 쓸 마음으로 검색한다는 뜻이라, 걸리면 상담으로 이어지기 쉬운 키워드입니다.`
  }
  if (ctr >= CTR_SOME) {
    return `광고 클릭률 ${ctr}% — 보통입니다. 사는 사람과 알아보는 사람이 섞여 있습니다.`
  }
  return `광고 클릭률 ${ctr}% — 광고를 누르는 사람이 거의 없습니다. 사려는 검색보다 알아보려는 검색에 가깝습니다.`
}

// ─── 한 줄 판정 ─────────────────────────────────────────────────

/**
 * 「이 키워드 써도 되나」 를 한 눈에.
 *
 * 왜 필요한가. 등급·경쟁률·광고 개수·클릭률을 다 보여줘도, 이 분야를 모르는 사람은
 * "그래서 쓰라는 거야 말라는 거야" 를 못 읽는다. 숫자를 읽는 법을 아는 사람만 쓸 수
 * 있는 화면이면 도구가 아니다. 그래서 **할 일을 한 줄로 못 박는다.**
 *
 * 조언은 이 함수 한 곳에서만 한다 (다른 설명문은 사실만 말한다).
 */
export type VerdictLevel = 'go' | 'conditional' | 'attach' | 'avoid' | 'unknown'

export interface KeywordVerdict {
  level: VerdictLevel
  /** 배지에 넣는 짧은 말 */
  label: string
  /** 왜 그런지 + 무엇을 할지 한 줄 */
  line: string
}

export function keywordVerdict(m: {
  grade: KeywordGrade
  monthlySearch: number
  adDepth?: number
}): KeywordVerdict {
  const heavyAd = adPressureOf(m.adDepth) === 'heavy'
  const n = typeof m.adDepth === 'number' ? Math.round(m.adDepth * 10) / 10 : 0

  switch (m.grade) {
    case 'unknown':
      return {
        level: 'unknown',
        label: '판정 못 함',
        line: '발행량을 못 읽어 판정하지 않았습니다 — 「30일 건수」를 넣으면 바로 나옵니다.',
      }
    case 'toosmall':
      return {
        level: 'attach',
        label: '얹기만',
        line: `월 ${m.monthlySearch.toLocaleString()}회라 한 편을 따로 쓸 값이 없습니다 — 더 큰 키워드 글에 한 단락으로 얹으세요.`,
      }
    case 'hard':
      return {
        level: 'avoid',
        label: '지금은 피하세요',
        line: '검색보다 새 글이 더 많이 쏟아지는 자리입니다 — 세부 의도를 붙여 좁히거나 다른 키워드를 고르세요.',
      }
    case 'toobig':
      return {
        level: 'conditional',
        label: '좁혀서',
        line: '대형 키워드라 그대로는 대형 블로그·언론사와 겨루게 됩니다 — 지역이나 세부 의도를 붙여 좁히면 쓸 수 있습니다.',
      }
    default: {
      /*
       * gold · good — **광고가 많다고 등급을 내리지 않는다.**
       *
       * 예전에는 광고 5개 이상이면 「조건 지켜서」로 내렸다. 실측해 보니 근거가 약했다 —
       * 광고는 블로그탭 순위와 무관하고, 우리 키워드의 모바일 통합검색에는 파워링크가
       * 아예 안 붙었다. 게다가 지역+업종 키워드는 거의 다 광고 8~10개라(실측) 그것으로
       * 등급을 가르면 모든 지역 키워드가 조건부가 된다 — 아무것도 못 가르는 판정이다.
       */
      const tail = heavyAd
        ? ` 광고 ${n}개가 붙는 건 그만큼 돈이 되는 검색어라는 뜻입니다. 다만 통합검색 위쪽은 플레이스가 차지하니 플레이스 순위도 함께 챙기세요.`
        : ''
      return {
        level: 'go',
        label: '바로 쓰세요',
        line:
          (m.grade === 'gold'
            ? '경쟁이 비어 있습니다 — 이 키워드로 글 한 편 쓰세요. 가장 먼저 잡을 판입니다.'
            : '글 품질이 받쳐주면 진입할 수 있습니다 — 써도 됩니다.') + tail,
      }
    }
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
  /*
   * 아래는 자동완성 실측으로 알게 된 말이다 (2026-08). 우리가 짐작한 목록에는 없었다 —
   * 「일일권」·「1일권」은 봉명동·천안 헬스장 자동완성에 나란히 떴고, 「사우나」도 나왔다.
   * 사람들이 실제로 치는 말을 우리 어휘에 되먹인다.
   */
  '일일권', '1일권', '하루', '당일', '사우나', '샤워', '회원권', '월회비', '단기', '학생',
  '야간', '주차', '기구', '트레이너', '등록', '체험',
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
 * 시·군 이름은 지점을 좁혀도 남긴다.
 *
 * 지점 하나로 좁히면 그 지점 주소·지역 키워드에서만 토큰을 뽑는다. 그런데 쌍용점
 * 주소에는 「천안」이 없어서, 좁히는 순간 **우리 도시 이름이 남의 지역으로 판정됐다** —
 * 「천안쌍용동헬스장」(월 260) · 「천안24시헬스장」(월 170) 이 통째로 사라졌다.
 * 시 이름은 지점이 아니라 회사 전체가 공유하는 말이므로 전 지점에서 모아 둔다.
 */
export function cityTokens(stores: { location?: string; localKeywords?: string[] }[]): Set<string> {
  const out = new Set<string>()
  const pool = stores
    .map((s) => [s.location ?? '', ...(s.localKeywords ?? [])].join(' '))
    .join(' ')
    .replace(/\s+/g, '')
  for (const r of REGION_NAMES) if (pool.includes(r)) out.add(r)
  return out
}

/**
 * 우리 글감으로 쓸 수 없는 말.
 *
 * 자동완성에는 사람들이 실제로 치는 말이 그대로 온다 — 「천안 헬스장 먹튀」처럼
 * 검색량이 있어도 우리가 노리면 안 되는 말이 섞인다. 헬스장이 「먹튀」로 상위에
 * 걸리는 것은 유입이 아니라 사고다.
 */
export const NEGATIVE_WORDS = [
  '먹튀', '사기', '환불', '폐업', '고소', '소송', '민원', '논란', '피해', '탈퇴', '해지', '위생',
  '벌레', '진상', '갑질',
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
/**
 * 내 동네가 아닌 **다른 동네**가 든 키워드인지 (순수 함수 — 테스트 대상).
 *
 * 시 이름을 살려두자 「천안두정동헬스장」·「천안불당동헬스장」처럼 **천안이 붙은 남의
 * 동네**가 전부 통과해 24칸을 먹었다 (실측: 24줄 중 8줄이 다른 동네였다). 시는 우리
 * 것이지만 동네는 아니다.
 *
 * 판정법: 내 시·동네 이름을 지우고 남은 말에 아직 동/읍/면 이름이 있으면 남의 동네다.
 *   천안쌍용동헬스장 → (천안·쌍용동 지움) → 헬스장        → 남의 동네 없음 ✓
 *   천안두정동헬스장 → (천안 지움)        → 두정동헬스장  → 두정동 ✗
 *
 * 「운동」에 걸리지 않게 동 앞에 **두 글자 이상**을 요구한다 (운+동은 한 글자).
 */
const FOREIGN_AREA = /[가-힣]{2,4}(?:동|읍|면)/

export function hasForeignArea(keyword: string, myAreas: string[], myCities: string[]): boolean {
  let rest = keyword.replace(/\s+/g, '')
  // 긴 것부터 지운다 ("천안쌍용동" 이 "쌍용동" 보다 먼저 지워지면 안 된다)
  for (const w of [...myCities, ...myAreas].sort((a, b) => b.length - a.length)) {
    if (w) rest = rest.split(w).join('')
  }
  return FOREIGN_AREA.test(rest)
}

/**
 * 내 동네가 없는 **광역 키워드**가 깨끗한지 (순수 함수 — 테스트 대상).
 *
 * 동/읍/면 규칙으로는 「천안목천헬스장」·「천안불당헬스장」을 못 잡는다 — 목천(읍)·
 * 불당(동)을 사람들이 접미사 없이 쓰기 때문이다. 실측에서 이 셋이 끝까지 남았다.
 *
 * 그래서 반대로 본다. 광역 키워드는 **시 + 업종·의도 말**로만 이뤄져야 한다. 시와
 * 업종·의도 말을 다 지웠는데 한글이 남으면, 그건 동네 이름이거나 업체 이름이다.
 *   천안헬스장일일권 → (천안·헬스장·일일권 지움) → ''     → 깨끗함
 *   천안목천헬스장   → (천안·헬스장 지움)        → 목천   → 동네·업체 이름
 *   천안헬스보이짐   → (천안·헬스·짐 지움)       → 보이   → 남의 상호
 *
 * 내 동네가 든 키워드에는 적용하지 않는다 — 그쪽은 이미 우리 것이 분명하고,
 * 우리가 모르는 새 의도(「일일권」처럼)를 발견하는 통로를 막아서는 안 된다.
 */
export function isCleanWideKeyword(keyword: string, cities: string[]): boolean {
  let rest = keyword.replace(/\s+/g, '').toUpperCase()
  const words = [...cities, ...TRADE_WORDS, ...GYM_WORDS, ...INTENT_WORDS]
    .map((w) => w.replace(/\s+/g, '').toUpperCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  for (const w of words) rest = rest.split(w).join('')
  return rest.replace(/[0-9A-Z\s·\-_]+/g, '').length === 0
}

export function isRelevantKeyword(
  keyword: string,
  myTokens: Set<string>,
  /** 넘기면 「내 시 + 남의 동네」 꼴까지 걸러낸다 */
  scope?: { areas: string[]; cities: string[] }
): boolean {
  if (scope) {
    if (hasForeignArea(keyword, scope.areas, scope.cities)) return false
    const flat = keyword.replace(/\s+/g, '')
    const hasMine = scope.areas.some((a) => a && flat.includes(a))
    if (!hasMine && !isCleanWideKeyword(keyword, scope.cities)) return false
  }
  return isRelevantKeywordBase(keyword, myTokens)
}

function isRelevantKeywordBase(keyword: string, myTokens: Set<string>): boolean {
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
 * 업종만 본다 — 지역은 보지 않는다.
 *
 * 추리기(shortlist)는 이미 지역별로 묶어 돌리므로 지역 판정이 필요 없다. 그런데 업종
 * 판정을 빼먹었다가 테스트에서 **「쌍용동필라테스」가 추천 목록에 뽑혔다** — 검색량
 * 500회에 궁합 판정이 「한 글에 함께 넣을 수 있음」으로 나와서 24시 키워드를 밀어냈다.
 * 우리 업종이 아닌 말은 검색량이 얼마든 우리 글감이 아니다.
 */
export function tradeDrop(keyword: string): string | null {
  const flat = keyword.replace(/\s+/g, '')
  const other = OTHER_TRADES.find((w) => flat.includes(w))
  if (other) return `${other} — 우리 업종이 아닙니다.`
  const bad = NEGATIVE_WORDS.find((w) => flat.includes(w))
  if (bad) return `「${bad}」가 든 말 — 우리 글이 이 말로 걸리면 유입이 아니라 사고입니다.`
  if (!GYM_WORDS.some((w) => flat.toUpperCase().includes(w.toUpperCase()))) {
    return '헬스·운동 업종 말이 없습니다.'
  }
  return null
}

/**
 * 자동완성으로 가져온 말을 쓸 수 있는지 — 못 쓰면 **왜 못 쓰는지**를 돌려준다.
 *
 * 그냥 걸러내면 회원은 네이버가 준 말이 몇 개였는지도 모른다. 무엇을 왜 뺐는지
 * 보여줘야 걸러내기가 지나친지 판단할 수 있다.
 */
export function suggestionDrop(
  keyword: string,
  myTokens: Set<string>,
  scope?: { areas: string[]; cities: string[] }
): string | null {
  const flat = keyword.replace(/\s+/g, '')

  if (scope) {
    if (hasForeignArea(keyword, scope.areas, scope.cities)) {
      return '지금 조사하는 동네가 아닙니다 — 그 동네 지점 글로 따로 쓰세요.'
    }
    const hasMine = scope.areas.some((a) => a && flat.includes(a))
    if (!hasMine && !isCleanWideKeyword(keyword, scope.cities)) {
      return '동네 이름이나 업체 이름으로 보이는 말이 섞여 있습니다 — 우리 지역·우리 상호가 아닙니다.'
    }
  }

  const bad = NEGATIVE_WORDS.find((w) => flat.includes(w))
  if (bad) return `「${bad}」가 든 검색어 — 우리 글이 이 말로 걸리면 유입이 아니라 사고입니다.`

  const other = OTHER_TRADES.find((w) => flat.includes(w))
  if (other) return `${other} — 우리 업종이 아닙니다.`

  const region = REGION_NAMES.find((r) => !myTokens.has(r) && flat.includes(r))
  if (region) return `${region} — 우리 지역이 아닙니다 (같은 동 이름이 다른 도시에도 있습니다).`

  let inMyArea = false
  for (const t of myTokens) {
    if (flat.includes(t)) {
      inMyArea = true
      break
    }
  }
  if (!inMyArea) return '우리 지역 말이 없습니다.'

  if (!GYM_WORDS.some((w) => flat.toUpperCase().includes(w.toUpperCase()))) {
    return '헬스·운동 업종 말이 없습니다.'
  }
  return null
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
