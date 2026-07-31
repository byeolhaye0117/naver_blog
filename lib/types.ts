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
  /** null = 상위 검색 범위(기본 30위) 안에서 못 찾음 */
  rank: number | null
  /** 해당 키워드 전체 블로그 발행량 */
  total?: number
  mock?: boolean
}

export interface DB {
  stores: Store[]
  posts: Post[]
  rankTargets: RankTarget[]
  rankSnapshots: RankSnapshot[]
}

// ─── 키워드 조사 ───────────────────────────────────────────────

export interface KeywordMetric {
  keyword: string
  /** 월간 검색량 (PC + 모바일) */
  monthlySearch: number
  monthlyPc: number
  monthlyMobile: number
  /** 네이버 블로그 누적 발행량 */
  blogTotal: number
  /** 경쟁률 = 발행량 / 월검색량. 낮을수록 좋다 */
  competition: number
  /** 검색광고 API가 주는 경쟁정도 (낮음/중간/높음) */
  compIdx?: string
  grade: KeywordGrade
  gradeReason: string
  /** 모바일 검색 비중 (%) */
  mobileShare: number
  mock: boolean
}

export type KeywordGrade = 'gold' | 'good' | 'hard' | 'toosmall' | 'toobig'

export const GRADE_LABEL: Record<KeywordGrade, string> = {
  gold: '황금 키워드',
  good: '노려볼 만함',
  hard: '경쟁 과열',
  toosmall: '검색량 부족',
  toobig: '대형 키워드',
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
  total: number
  items: SerpItem[]
  stats: {
    avgTitleLength: number
    keywordInTitleRate: number
    keywordFrontRate: number
    avgAgeDays: number
    freshWithin30dRate: number
    /** 상위 노출 제목에서 함께 자주 등장하는 토큰 */
    commonTokens: { token: string; count: number }[]
    /** 같은 블로거가 여러 개 차지하는지 */
    repeatBloggers: { name: string; count: number }[]
  }
  /** 이 키워드로 상위 가려면 뭘 맞춰야 하는지 */
  prescription: string[]
  mock: boolean
}

// ─── 글 검수 ───────────────────────────────────────────────────

export type CheckLevel = 'pass' | 'warn' | 'fail'

export type CheckGroup = '분량·구조' | '키워드' | '이미지·태그' | '저품질 위험' | 'AI 티 제거'

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
