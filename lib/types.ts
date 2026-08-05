// 앱 전체에서 쓰는 도메인 타입.

/** 글 유형 — gym-blog-writer(홍보) / gym-info-writer(정보) / gym-review-writer(후기) 스킬과 1:1 대응 */
export type PostType = 'promo' | 'info' | 'review'

export const POST_TYPE_LABEL: Record<PostType, string> = {
  promo: '홍보글',
  info: '정보글',
  review: '후기글',
}

export type PostStatus = 'draft' | 'reviewed' | 'published'

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: '초안',
  reviewed: '검수완료',
  published: '발행완료',
}

/** 후기글 대가성 표기 */
export type Sponsorship = 'own' | 'sponsored' | 'unset'

export const SPONSORSHIP_LABEL: Record<Sponsorship, string> = {
  own: '내돈내산',
  sponsored: '협찬·대가성',
  unset: '미지정',
}

export interface Store {
  id: string
  /** 표시용 짧은 이름 (예: 쌍용점) */
  name: string
  /** 정식 상호명 — 홍보글에서 3회 이상 노출 검사 기준 (예: MTO 피트니스 쌍용점) */
  legalName: string
  /** 여성전용 지점 여부 — 남성 대상 표현 경고에 사용 */
  womenOnly: boolean
  open24: boolean
  /** 지역 키워드 풀. 메인 키워드 로테이션 대상 */
  localKeywords: string[]
  location: string
  features: string[]
  strengths: string[]
  phone: string
  reserveUrl?: string
  blogUrl?: string
  /** 네이버 플레이스 id — 플레이스 노출 순위에서 내 지점을 정확히 찾는 데 쓴다 */
  placeId?: string
  memo?: string
}

export interface Post {
  id: string
  type: PostType
  status: PostStatus
  storeId: string
  title: string
  /** 본문. `[이미지: 설명]` 과 `## 소제목` 마크업을 쓴다 */
  body: string
  mainKeyword: string
  /** 홍보·후기: 함께 찾는 키워드 ①② / 정보: 정보 보조 키워드 */
  subKeywords: string[]
  /** 정보글 전용 — 지역 키워드(조연) */
  localKeyword?: string
  tags: string[]
  /** 유사성 방지 3축 */
  introType?: string
  angle?: string
  format?: string
  topicGroup?: string
  sponsorship?: Sponsorship
  /**
   * 진행 중인 이벤트·혜택 (홍보글·후기글). 골격 생성 때 이벤트 구간에 반영된다.
   * 다시 열어 골격을 새로 뽑을 때도 남아 있어야 하므로 글과 함께 저장한다.
   */
  eventText?: string
  publishedAt?: string
  publishedUrl?: string
  createdAt: string
  updatedAt: string
}

export interface RankTarget {
  id: string
  keyword: string
  /** 내 글 URL (또는 블로그 ID) — 검색 결과에서 이 문자열을 포함하는 항목의 순위를 찾는다 */
  url: string
  postId?: string
  label?: string
  /**
   * YYYY-MM-DD 발행일. 발행 후 경과일에 따라 "순위 밖"의 의미가 달라지므로
   * (색인 구간인지, 진입 실패인지) 순위 해석에 쓴다. 연결된 글이 있으면 그쪽 값을 쓴다.
   */
  publishedAt?: string
  createdAt: string
}

export interface RankSnapshot {
  id: string
  targetId: string
  /** YYYY-MM-DD */
  date: string
  /** null = 순위 범위 안에서 못 찾음 */
  rank: number | null
  /** 해당 키워드 전체 블로그 발행량 (API 조회 시에만) */
  total?: number
  /**
   * 통합검색 스마트블록 위치 — **사람이 실제로 보는 자리**.
   *
   * 블로그탭 순위와 다르다. 실측: "쌍용동 헬스장" 에서 블로그탭 14위인 글이
   * 통합검색 「스포츠 인기글」 블록에서는 4번째였다. 블로그탭만 보면 실제 노출을
   * 절반만 보는 셈이다.
   */
  unifiedBlock?: string
  /** 그 블록 안에서 몇 번째 */
  unifiedRank?: number
  /** 페이지에서 몇 번째 블록인지 (위에 있을수록 먼저 눈에 띈다) */
  unifiedBlockOrder?: number
  /**
   * 통합검색을 실제로 읽어봤는지.
   *
   * unifiedBlock 이 없는 것에는 두 가지 뜻이 있다 — **읽어봤지만 그 글이 없었다**와
   * **아직 안 읽어봤다**. 이 둘을 구분하지 않으면 "블로그탭 4위" 만 보고 잘 되고
   * 있다고 오해한다. 실제로 그런 일이 있었다: 블로그탭 4위인 글이 통합검색 인기글
   * 블록에는 아예 없었다.
   */
  unifiedChecked?: boolean
  mock?: boolean
  /**
   * 어디서 온 값인지.
   * 'manual' = 사용자가 네이버에서 직접 보고 입력한 값. 스마트블록은 로그인 상태·
   * 지역·개인화에 따라 달라질 수 있어, 직접 본 값이 가장 정확하다.
   */
  source?: 'api' | 'manual'
  /** 직접 입력할 때 남기는 메모 (예: "스마트블록 인기글 2번째") */
  note?: string
}

/**
 * 플레이스 노출 순위 관찰 기록.
 *
 * 자동 조회는 통합검색 플레이스 블록의 7곳까지만 읽힌다 (플레이스 도메인은 서버 IP 를
 * 429 로 막는다 — pcmap-api·m.place·map v5 전부 확인). 그 아래는 사람이 눈으로 봐야
 * 알 수 있으므로, 블로그 순위와 같은 방식으로 직접 입력을 받는다.
 */
export interface PlaceRank {
  id: string
  keyword: string
  storeId: string
  /** 눈으로 확인한 순위 */
  rank: number
  /** YYYY-MM-DD */
  date: string
  note?: string
}

export interface DB {
  stores: Store[]
  posts: Post[]
  rankTargets: RankTarget[]
  rankSnapshots: RankSnapshot[]
  placeRanks: PlaceRank[]
  /** 상위노출 분석 처방 — 글 쓸 때 자동으로 꺼내 쓴다 */
  prescriptions: Prescription[]
  /**
   * 랭킹 요인 관찰 기록 — 「네이버가 무엇을 보고 띄워주는가」를 우리 판에서 재서 쌓는다.
   *
   * 한 번의 관찰(키워드 1개 상위 5~10편)로는 우연을 걸러낼 수 없어서 계속 쌓는다.
   * 기준은 조용히 바뀌므로 오래된 관찰도 지우지 않고 날짜와 함께 남긴다.
   */
  factorRuns?: FactorRun[]
}

/** 한 번의 관찰 (lib/analysis/factors.ts 의 FactorObservation 을 그대로 저장한다) */
export interface FactorRun {
  keyword: string
  /** YYYY-MM-DD */
  date: string
  sampled: number
  results: {
    key: string
    label: string
    rho: number | null
    advantage: number | null
    n: number
    strength: string
    note: string
  }[]
}

/**
 * 키워드별 상위노출 처방 보관.
 *
 * 분석 화면에서 본 처방이 글 쓰는 화면까지 오지 않으면, 회원이 그걸 외워서 옮겨
 * 적어야 한다 — 실제로는 아무도 안 한다. 그래서 분석할 때 저장해 두고, 그 키워드로
 * 글을 열면 자동으로 꺼내 AI 지시문에 넣는다.
 *
 * 키워드당 하나만 남긴다 (다시 분석하면 갱신). 오래된 처방은 상위권이 이미 바뀌었을
 * 수 있으므로 화면에서 분석 날짜를 함께 보여준다.
 */
export interface Prescription {
  /** 공백을 없앤 키워드 — 찾을 때 띄어쓰기 차이로 못 찾는 일을 막는다 */
  key: string
  keyword: string
  items: string[]
  /** 분석한 날 (YYYY-MM-DD) */
  date: string
  /** 그때 본 상위 글 수 */
  sampled: number
}

// ─── 키워드 조사 ───────────────────────────────────────────────

export interface KeywordMetric {
  keyword: string
  /** 월간 검색량 (PC + 모바일) */
  monthlySearch: number
  monthlyPc: number
  monthlyMobile: number
  /**
   * 최근 30일 블로그 발행량. null = 조회 못 함 (0 으로 대신 쓰면 경쟁률이 거짓이 된다).
   *
   * 누적이 아니라 30일인 이유는 lib/naver/blogsection.ts 주석에 있다 — 월 검색량과
   * 기간 단위가 같아 "검색 1회당 새 글 몇 개" 로 바로 읽히고, 이미 밀려난 옛 글을 세지 않는다.
   */
  blogRecent: number | null
  /** 값의 성격 — 'estimated'(7일 환산) / 'atLeast'(하한) 일 때 화면에 표시한다 */
  blogRecentNote?: 'estimated' | 'atLeast'
  /** 경쟁률 = 최근 30일 발행량 ÷ 월간 검색량. 낮을수록 좋다. 999 = 계산 불가 */
  competition: number
  /** 검색광고 API가 주는 경쟁정도 (낮음/중간/높음) */
  compIdx?: string
  /**
   * 이 키워드에 붙는 **파워링크** 광고 개수 (검색광고 API `plAvgDepth`).
   *
   * 이 검색어에 돈을 쓰는 업체가 몇 곳인지 = 상업성 세기다. 블로그 순위와는 무관하다 —
   * 처음에는 「블로그가 밀리는 정도」로 안내했지만 실측에서 근거가 무너졌다
   * (lib/analysis/keyword.ts 의 PLACE_ABOVE_BLOG 주석).
   */
  adDepth?: number
  /** 광고 클릭률(%) — 검색광고 API 월평균 클릭률 */
  ctrPc?: number
  ctrMobile?: number
  /** 파워링크 광고 개수를 사람 말로 (adDepth 로 만든다) */
  adNote?: string
  grade: KeywordGrade
  gradeReason: string
  /** 모바일 검색 비중 (%) */
  mobileShare: number
  mock: boolean
  /**
   * 어디서 온 값인지.
   * 'manual' = 사용자가 검색광고 키워드도구·블로그 탭에서 직접 보고 넣은 값.
   * API 발급이 막혀 있어도 실측 등급을 낼 수 있는 경로다.
   */
  source?: 'api' | 'manual'
}

export type KeywordGrade = 'gold' | 'good' | 'hard' | 'toosmall' | 'toobig' | 'unknown'

export const GRADE_LABEL: Record<KeywordGrade, string> = {
  gold: '황금 키워드',
  good: '노려볼 만함',
  hard: '경쟁 과열',
  toosmall: '검색량 부족',
  toobig: '대형 키워드',
  unknown: '판정 불가',
}

// ─── 상위노출(SERP) 분석 ───────────────────────────────────────

export interface SerpItem {
  rank: number
  title: string
  link: string
  description: string
  bloggerName: string
  bloggerLink: string
  /** YYYY-MM-DD */
  postdate: string
  /** 발행 후 경과일 */
  ageDays: number
  titleLength: number
  /** 제목에서 메인 키워드가 시작되는 위치 (없으면 -1) */
  keywordPos: number
  isOfficialBlog: boolean
}

export interface SerpAnalysis {
  keyword: string
  /** 누적 발행량. 0 = 모름 (붙여넣기 분석에서 "○○건"을 안 넣은 경우) */
  total: number
  items: SerpItem[]
  stats: {
    avgTitleLength: number
    keywordInTitleRate: number
    keywordFrontRate: number
    /** 날짜를 아는 항목만의 평균 나이 */
    avgAgeDays: number
    /** 날짜를 아는 항목 중 30일 이내 비율 */
    freshWithin30dRate: number
    /** 날짜를 알아낸 항목 수 — 최신성 판단의 근거 개수 */
    datedCount: number
    /** 블로거명을 알아낸 항목 수 */
    bloggerKnownCount: number
    /** 상위 노출 제목에서 함께 자주 등장하는 토큰 (걸러내지 않은 관찰값) */
    commonTokens: { token: string; count: number }[]
    /**
     * commonTokens 를 쓸 수 있는 것과 못 쓰는 것으로 가른 결과.
     *
     * "미녀와야수짐"(다른 업체 상호)·"필라테스"(안 하는 종목) 를 소제목에 넣으라고
     * 지시하면 남의 가게를 홍보하거나 거짓을 쓰는 글이 된다. 지시에는 usableTokens 만
     * 쓰고, rivalTokens 는 "그 업체가 이 키워드를 먹고 있다" 는 정보로 쓴다.
     */
    usableTokens: { token: string; count: number }[]
    rivalTokens: { token: string; count: number }[]
    otherTradeTokens: { token: string; count: number }[]
    /**
     * 상위 1~3위가 **공통으로** 쓴 말. 15개 중 2번 이상보다 훨씬 강한 신호다 —
     * 위쪽 세 편이 다 쓴 말이면 그 키워드에서 사실상 필수 요소다.
     */
    sharedTop3: { token: string; count: number }[]
    /** 상위 1~5위 공통 */
    sharedTop5: { token: string; count: number }[]
    /**
     * 상위 10위 안에는 없는데 그 아래에서는 쓰이는 말 = **아직 위쪽이 안 쓴 자리**.
     * 여기를 파면 같은 키워드에서 다른 각도로 들어갈 수 있다.
     */
    gapTokens: { token: string; count: number }[]
    /** 같은 블로거가 여러 개 차지하는지 */
    repeatBloggers: { name: string; count: number }[]
  }
  /** 이 키워드로 상위 가려면 뭘 맞춰야 하는지 */
  prescription: string[]
  /**
   * 상위 글 본문을 실제로 읽어 잰 커트라인. 못 읽으면 없다.
   * 있으면 검수 기준이 "일반 규격" 에서 "이 키워드의 실제 기준" 으로 바뀐다.
   */
  cutline?: {
    sampled: number
    charMedian: number
    imageMedian: number
    videoMedian: number
    charTarget: number
    imageTarget: number
    videoExpected: boolean
  }
  mock: boolean
  /**
   * 어디서 온 데이터인지.
   * 'section' = 블로그 섹션 검색 관련도순을 앱이 자동으로 읽어온 것 (기본 경로)
   * 'paste'   = 사용자가 검색 결과를 직접 붙여넣은 것 (자동이 막혔을 때)
   * 'api'     = 검색 API(openapi) 응답 — 이 계정에서는 권한이 없어 쓰지 못한다
   */
  source: 'api' | 'paste' | 'section'
}

// ─── 글 검수 ───────────────────────────────────────────────────

export type CheckLevel = 'pass' | 'warn' | 'fail'

export type CheckGroup =
  | '분량·구조'
  | '키워드'
  /**
   * 내용 균형 — 「읽는 사람이 가져갈 게 있나」 vs 「홍보만 하고 있나」.
   * 상위 글 실측에서 갈린 축이다 (lib/analysis/content.ts 주석).
   */
  | '내용 균형'
  | '이미지·태그'
  | '저품질 위험'
  | 'AI 티 제거'

export interface CheckItem {
  id: string
  group: CheckGroup
  label: string
  level: CheckLevel
  value: string
  target: string
  hint?: string
  weight: number
}

export interface RiskHit {
  category: string
  term: string
  count: number
  /** 본문에서 처음 걸린 자리의 앞뒤 문맥 */
  context: string
  fix: string
  level: CheckLevel
}

export interface CheckStats {
  charCount: number
  titleLength: number
  headings: string[]
  imageCount: number
  tagCount: number
  mainKeywordCount: number
  mainKeywordDensity: number
  subKeywordCounts: { keyword: string; count: number }[]
  legalNameCount: number
  localKeywordCount: number
  phoneCount: number
  linkCount: number
  /** 메인 키워드 등장 위치(본문 비율 0~1) */
  keywordPositions: number[]
  evenSpacing: boolean
  sentenceEndings: Record<string, number>
}

export interface CheckResult {
  score: number
  items: CheckItem[]
  risks: RiskHit[]
  stats: CheckStats
}
