import type { PlaceReview } from './analysis/reviews'
import type { OpeningRow } from './analysis/openings'
import type { NoticeItem } from './naver/notice'

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
  /**
   * 트레이너 — 이름과 직함.
   *
   * 회원이 플레이스 주소를 주며 말했다 (2026-08-19): "조용석 트레이너 pt 후기 정보야 추가해줘."
   * 그 플레이스(11716617 = MTO피트니스 쌍용점)에는 트레이너별 **상담·무료체험 신청** 항목이
   * 걸려 있었다 — 이대건 PT 총괄 매니저 · 조용석 PT 팀장 · 전지훈 실장 · 표정미 · 정예진.
   *
   * **이 칸이 비어 있어서 답을 못 하던 질문이 있었다.** 회원이 「PT 등록할 때 망설이는 점
   * (효과·가격·트레이너가 안 맞을까봐)을 해결하는 방식으로」 써달라고 했는데, 트레이너 정보가
   * 없으니 모델이 그 항목만 빈손으로 넘겼다 (지어내지 않은 것은 옳은 판단이었다).
   *
   * 채워 두면 「트레이너가 안 맞을까봐」에 **사실로** 답할 수 있다 — 지정해서 무료체험을 먼저
   * 받아볼 수 있다는 것이 그 답이다.
   */
  trainers?: string[]
  reserveUrl?: string
  blogUrl?: string
  /** 네이버 플레이스 id — 플레이스 노출 순위에서 내 지점을 정확히 찾는 데 쓴다 */
  placeId?: string
  /**
   * 플레이스에서 붙여넣은 **실제 리뷰.**
   *
   * 홍보글의 신뢰 구간이 여기 있는 문장만 인용한다. 비어 있으면 글에서 리뷰를 언급하지
   * 않는다 — 없는 리뷰를 만들면 표시광고법 위반이다 (lib/analysis/reviews.ts 주석).
   * 자동 수집은 안 된다 (플레이스가 서버 IP 를 막는다). 붙여넣기로만 채운다.
   */
  placeReviews?: PlaceReview[]
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
  /*
   * ─── 매일 자동 초안 (2026-08-21) ────────────────────────────
   *
   * **유사성 3축과 섞지 않으려고 칸을 따로 뒀다.** 처음엔 `format` 에 'auto' 를 박고
   * `topicGroup` 에 주제를 넣었는데, 그 둘은 이미 로테이션이 쓰는 칸이다
   * (INFO_FORMATS 「① 단계형」·TOPIC_GROUPS 「B. 다이어트」). 거기에 다른 값을 넣으면
   * **「최근에 안 쓴 형식」 계산이 망가져서 매번 같은 형식으로 쓰게 된다** — 자동화가
   * 유사문서를 만드는 바로 그 경로다. 프로덕션 데이터를 보다 발견했다.
   */
  /** 매일 크론이 쓴 초안인가 */
  auto?: boolean
  /** 자동 초안이 고른 이번 글의 주제 (autodraft 의 INFO_TOPICS — TOPIC_GROUPS 와 다른 축이다) */
  autoTopic?: string
  sponsorship?: Sponsorship
  /**
   * 진행 중인 이벤트·혜택 (홍보글·후기글). 골격 생성 때 이벤트 구간에 반영된다.
   * 다시 열어 골격을 새로 뽑을 때도 남아 있어야 하므로 글과 함께 저장한다.
   */
  eventText?: string
  /**
   * 정보글 마지막 홍보 구간에 넣을 내용 (**회원이 직접 적는다**).
   *
   * 회원 지적 — "정보글에 마지막 홍보를 넣어달란 게 알아서 작성해달란 게 아니라, 내가 원하는
   * 홍보글 칸을 넣어서 거기 정보를 주면 그에 맞게 작성해달란 거였어."
   *
   * 맞는 말이고 안전한 쪽이다. 비워두면 AI 가 마지막 구간을 스스로 채우는데, 그러면 없는
   * 가격·이벤트가 만들어진다 (검수의 `info-promo-source` 가 그걸 잡는다).
   */
  promoNote?: string
  /**
   * 정보 구간에서 다룰 **주제 하나**.
   *
   * 회원 요청: "현재 나오는 글이 24시 운영으로 되어 있는데 정보성란을 내가 원하는 주제로
   * 넣을 수 있는지." 비워두면 AI 가 키워드를 보고 고른다.
   */
  infoTopic?: string
  /**
   * 이번 글에만 적용할 요청.
   *
   * 회원 요청: "이런 식으로 해달라고 하는 요청칸이 있으면 좋겠어." 매번 대화로 말하는 것을
   * 화면에 남겨서 다시 쓸 때도 그대로 반영되게 한다.
   */
  request?: string
  publishedAt?: string
  publishedUrl?: string
  /**
   * 본문을 고쳐서 네이버에 다시 올린 날 (YYYY-MM-DD).
   *
   * 최신성이 관찰에서 가장 센 신호였으므로(6회 중 5회 유리, 거꾸로 0회) 옛 글을 고쳐
   * 다시 올리면 어떻게 되는지 재본다. 네이버가 수정일을 순위에 반영하는지는 공개돼
   * 있지 않아서 **실험이다** — lib/analysis/revise.ts 주석 참고.
   */
  revisedAt?: string
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
   * 그 글의 제목 — **앱에서 쓰지 않은 글도 목록에서 알아보게** (2026-08-24 회원 지적:
   * "글 제목이 안보이는 것도 있는데 이거 수정해주고").
   *
   * 앱에서 쓴 글은 postId 로 이어져 제목을 그냥 읽어 온다. 다른 블로그 글이나 손으로
   * 등록한 주소는 그럴 데가 없어서 「글 224382220243」처럼 번호만 떴다. 그런 항목은
   * 네이버에서 제목을 한 번 읽어 여기 적어 둔다 (매번 읽지 않는다 — 제목은 잘 안 바뀐다).
   */
  title?: string
  /**
   * 그 제목을 **언제 읽었나** (ISO). 비어 있으면 아직 안 읽었거나 예전 방식으로 채운 것이다.
   *
   * 2026-08-27 이전에는 「앱에서 쓴 글은 제목이 이어져 오니까」 앱과 연결된 항목은 아예
   * 읽지 않았다. 그런데 회원은 올리기 직전에 제목을 손보므로, 앱 초안 제목과 실제 제목이
   * 갈렸다 (회원 지적: "실제 업로드된 제목과 다르게 나와"). 이제 연결된 글도 읽고,
   * 오래됐으면 다시 읽는다 — 제목은 잘 안 바뀌지만 **안 바뀐다고 볼 근거도 없다.**
   */
  titleAt?: string
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
  /** 직접 입력할 때 남기는 메모 (예: "스마트블록 인기블록 2번째") */
  note?: string
  /**
   * 언제 재봤는지 (ISO).
   *
   * **날짜만으로는 답할 수 없는 질문이 있었다** (2026-08-13). 회원 질문: "오전 09시에
   * 추적하는데 왜 결과가 안 나와." 그날 한 항목의 기록이 빠져 있었는데, 스냅샷에 날짜만
   * 있어서 **자동 조회가 돌았는지 아닌지를 데이터로 알 수 없었다.** 시각과 누가 쟀는지를
   * 남기면 다음부터는 화면이 바로 답한다.
   */
  at?: string
  /** 누가 쟀는지 — 'cron' 자동 조회 · 'user' 화면에서 누른 조회 */
  by?: 'cron' | 'user'
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

/**
 * 매일 자동 초안이 **돌았는지, 돌았다면 어떻게 됐는지**.
 *
 * ── 왜 만들었나 (2026-08-23) ─────────────────────────────────
 * 회원: "안뜨는데? 제대로 하고 있는거 맞아?" — 맞는 지적이었다. 크론은 20:00 UTC 에 돌았고
 * 다른 크론(순위·관찰·조사·자리)은 같은 날 전부 기록을 남겼는데 **자동 초안만 아무 흔적이
 * 없었다.** 실패했는지, 아예 안 돌았는지, 성공했는데 저장이 안 됐는지 구별할 방법이 없었다.
 *
 * 조용히 실패하는 자동화는 **없는 것보다 나쁘다** — 회원은 오늘 글이 준비된 줄 알고 기다린다.
 * 그래서 성공이든 실패든 남긴다.
 */
export interface AutoDraftRun {
  /** YYYY-MM-DD (UTC) */
  date: string
  at: string
  ok: boolean
  keyword?: string
  topic?: string
  /** 저장된 글 id (성공했을 때) */
  postId?: string
  score?: number | null
  /** 왜 실패했나 — 회원 화면에 그대로 보여준다 */
  error?: string
  /** 몇 초 걸렸나 — 시간 초과를 가려내려면 필요하다 */
  ms?: number
  /** 회원이 「지금 한 편 쓰기」로 직접 돌린 것인가 — 크론이 도는지 판단할 때 구별해야 한다 */
  manual?: boolean
  /**
   * **검수를 마쳤나** (2026-08-26 회원 요청: "새벽에 자동 글 작성하는거 검수까지 마칠 수
   * 있게 해줘").
   *
   * 점수만 남기면 79점이 두 가지를 뜻한다 — 「수정필요가 남았다」와 「고칠 수 없어 포기했다」.
   * 남은 수정필요 개수와 고쳐 쓰기를 몇 번 돌렸는지를 함께 남겨야 화면이 「아침에 손댈 것이
   * 있나」를 그대로 말해줄 수 있다.
   */
  fails?: number
  /** 고쳐 쓰기를 몇 번 돌렸나 (0 = 처음부터 깨끗했다) */
  rounds?: number
  /**
   * 상위노출 분석을 어떻게 했나 (2026-08-28 회원 지적: "자동작성하는게 관련키워드 상위노출
   * 분석을 안하고 작성하는거 같아").
   *
   * 「상위노출 분석 6개」·「저장된 처방 사용 (2026-08-27)」·「분석을 못 했습니다」처럼
   * 한 줄로 남긴다 — 안 남기면 **분석하고 썼는지 아닌지를 회원이 알 방법이 없다.**
   * 회원이 물은 것도 그것이다.
   */
  rx?: string
}

/**
 * **매일 자동 초안을 무엇으로 쓸지 회원이 정해 둔 것** (2026-08-23 요청).
 *
 * "매일 새벽에 정보성 글이 발행되잖아 그거 주제랑 키워드 내가 원하는걸로 선택해서 하고 싶어."
 *
 * **범위만 정한다** — 고른 것 안에서 앱이 돌아가며 쓴다. 아무것도 안 정하면 지금처럼
 * 순위 추적 키워드 × 기본 주제를 쓴다.
 *
 * 처음엔 「다음에 쓸 것을 하나씩 줄 세우는」 예약 칸도 두었는데 회원이 빼달라고 했다
 * (2026-08-24). 맞는 판단이다 — 매일 하나씩 지정하게 하면 결국 손으로 쓰는 것과 같아진다.
 * 한 번 정해두면 그 뒤로 손대지 않아도 되는 것이 이 기능의 값이다.
 */
export interface AutoDraftPlan {
  /** 자동 초안을 아예 멈춘다 — 지우는 것보다 끄는 편이 낫다 (설정이 남는다) */
  off?: boolean
  /**
   * **하루에 몇 편 쓸까** (2026-08-28 회원 요청: "하루에 여러편 작성할 수 있게해줘").
   *
   * 비어 있으면 1편. 상한은 `AUTO_DRAFT_MAX_PER_DAY` 다.
   *
   * ── 왜 한 번에 몰아 쓰지 않나 ────────────────────────────
   * 한 편을 쓰는 데 생성 1회 + 고쳐 쓰기 최대 3회가 들고, 함수 실행 한도가 300초다
   * (REVISE_TIME_BUDGET_MS 가 그 안에서 235초를 쓴다). 두세 편을 한 번에 쓰면 **한도를
   * 넘겨 아무것도 저장되지 않는다** — 이미 겪은 실패다.
   *
   * 그래서 **크론을 새벽 5·6·7시로 세 번 돌리고 한 번에 한 편씩** 쓴다. 각 실행이 그 날
   * 이미 쓴 편수를 세어 이 값에 닿았으면 그냥 넘어간다.
   */
  perDay?: number
  /** 쓸 키워드. 비어 있으면 순위 추적에 등록한 키워드 전부 */
  keywords?: string[]
  /** 쓸 주제. 비어 있으면 기본 주제 목록 전부. 주제 탐색기에서 담은 것이 여기 들어간다 */
  topics?: string[]
  /**
   * **날짜별 주제 — 날짜는 회원이, 주제는 앱이** (2026-08-25).
   *
   * 회원이 두 번 말했다:
   *   · "내가 주제 계속 확정하는거 아니라 했잖아. 근데 왜 또 주제 고르라고 나오는거야."
   *   · "지금 저장된 설정에서 날짜가 있어서 같은 주제로 매일 돌지 않게 해줘야해.
   *      그럴려면 날짜 선택하는게 있어야해."
   *
   * 처음엔 이 둘이 서로 어긋난 요구로 보였다. 아니다 — **누가 주제를 정하느냐**가 다를
   * 뿐이다. 회원은 날짜를 고르고 싶은 것이고, 주제를 적거나 고르고 싶은 것이 아니다.
   *
   * 그래서 여기 들어오는 값은 회원이 타이핑한 것이 아니라 `fillDays` 가 로테이션을 돌려
   * 채워 넣은 것이다. 회원이 하는 일은 ① 언제부터 며칠치인지 고르기 ② 마음에 안 드는 날에
   * 「다른 주제로」 누르기 — 둘 다 주제를 고르는 일이 아니다.
   *
   * 여기 적힌 날은 로테이션보다 우선한다. 안 적은 날은 그날그날 로테이션이 고른다.
   * 키워드는 받지 않는다 — 그건 ①에서 고른 범위 안에서 돈다.
   */
  days?: { date: string; topic: string }[]
  /**
   * **이 날은 쓰지 않는다** (2026-08-24 회원 요청: 날짜별 목록에 "삭제기능 만들어줘").
   *
   * 쉬는 날·이미 다른 글을 올린 날이 있다. 자동 초안을 통째로 끄면 그 다음 날도 안 쓰니,
   * **날짜 하나만 빼는 자리**가 필요하다.
   *
   * 지우는 게 아니라 **적어 둔다** — 지우면 되돌릴 수 없고, 화면에서도 「내가 뺐나 원래
   * 없었나」를 구별할 수 없다.
   */
  skip?: string[]
  /** 마지막으로 고친 때 */
  updatedAt?: string
}

export interface DB {
  stores: Store[]
  posts: Post[]
  /** 매일 자동 초안 실행 기록 — 조용히 실패하지 않게 (2026-08-23) */
  autoDraftRuns?: AutoDraftRun[]
  /**
   * 자동 초안을 무엇으로 쓸지 (2026-08-23 회원 요청).
   *
   * **목록이 아니라 덩어리 하나다.** store.ts 의 DB_OBJECT_KEYS 에 이름이 없으면 저장은
   * 성공하고 다음 읽기에서 조용히 사라진다 — 그 사고가 이 저장소에서 이미 있었다.
   */
  autoDraftPlan?: AutoDraftPlan
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
  /**
   * 참고용으로 계속 관찰할 **전국 키워드**.
   *
   * 회원 요청 — "전국 통틀어 인기 있고 상위노출되는 블로그를 찾아 그 톤에 맞추면 어떨까."
   * 톤을 짐작으로 베끼지 않고 같은 지표로 재서 비교하려고 둔다. 우리 판 집계와는
   * 섞지 않는다 (규칙이 정반대로 나온 실측이 있다).
   */
  benchmarkKeywords?: string[]
  /**
   * 상위노출 조사 런 — 매일 크론이 하나씩 쌓는다 (app/api/cron/study).
   *
   * 회원이 물었다 — "일주일 뒤까지 모으지 않아도 하루씩 모이게 할 수 있지 않아?"
   * 된다. 「유지하고 있는 글」을 가리는 데 필요한 것은 **기간**이고, 하루씩 쌓으면
   * 이 주면 14개 런이 14일을 덮는다. 손으로 주에 한 번 돌리는 것보다 촘촘하다.
   *
   * 오래된 것도 버리지 않는다 — 다만 무한정 쌓으면 저장소가 커지므로 상한을 둔다
   * (STUDY_RUNS_KEEP). 파일 형태의 study/runs/ 와 같은 내용이고, `npm run study:pull`
   * 로 내려받아 분석한다.
   */
  studyRuns?: StudyRunRecord[]
  /**
   * 글별 본문 측정값 캐시.
   *
   * **순위는 매일 바뀌지만 본문은 거의 안 바뀐다.** 그래서 순위(SERP)는 매일 새로 받고,
   * 본문은 오래된 것만 다시 받는다. 이 구분이 없으면 매일 160편을 다시 읽어야 하고,
   * 그건 크론 한 번에 들어가지 않는다.
   */
  studyPosts?: StudyPostCache[]
  /**
   * 「지금 뚫릴 만한 키워드」 측정 기록 — 매일 크론이 하나씩 쌓는다 (app/api/cron/openings).
   *
   * 회원 요청 (2026-08-19): "자동으로 매일 업데이트 되게 해줘." 앞 판은 버튼을 누를 때만
   * 재고 결과를 화면 상태에만 뒀다 — 새로 고치면 사라졌고, 회원이 누르지 않으면 아무 값도
   * 없었다. 저장해 두면 ①화면을 열자마자 어제 값이 보이고 ②어제와 비교해 **자리가 열린
   * 날**을 알 수 있다.
   */
  openingRuns?: OpeningRun[]
  /**
   * 네이버 공지·검색 로직 소식 — 매일 크론이 받아 온다 (app/api/cron/notice).
   *
   * 회원 요청 (2026-08-20): "네이버 로직과 공지사항을 항상 최신화해서 그에 맞는 글을 쓸 수
   * 있도록 해줘." 받아서 알리는 것까지가 자동이고, 글쓰기 규칙으로 옮기는 것은 사람이
   * 읽고 정한다 (lib/naver/notice.ts 주석).
   */
  noticeItems?: NoticeItem[]
}

/** 키워드 한 바퀴 측정 (lib/analysis/openings.ts 의 OpeningRow 를 그대로 저장한다) */
export interface OpeningRun {
  /** 잰 시각 (ISO) */
  at: string
  /** YYYY-MM-DD — 하루에 한 줄만 남긴다 */
  date: string
  /** 누가 쟀나 — 자동(크론)인지 회원이 누른 것인지 화면에 밝힌다 */
  by: 'cron' | 'user'
  rows: OpeningRow[]
  /** 못 잰 키워드 — 빈 줄로 두면 「자리가 굳었다」로 오해한다 */
  failed: string[]
}

/** 하루치 조사 (lib/analysis/study.ts 의 StudyRun 과 같은 모양) */
export interface StudyRunRecord {
  date: string
  keywords: string[]
  top: number
  posts: unknown[]
}

/** 글 하나의 본문 측정값 — 며칠은 재사용한다 */
export interface StudyPostCache {
  url: string
  /** 측정한 날 (YYYY-MM-DD) */
  measuredAt: string
  /** StudyPost 에서 순위(ranks)를 뺀 나머지 */
  metrics: Record<string, unknown>
}

/** 한 번의 관찰 (lib/analysis/factors.ts 의 FactorObservation 을 그대로 저장한다) */
export interface FactorRun {
  keyword: string
  /** YYYY-MM-DD */
  date: string
  sampled: number
  /**
   * 어느 판의 관찰인지 ('local' = 우리 지역 / 'reference' = 참고용 전국).
   *
   * 없으면 'local' 이다 — 이 항목을 만들기 전 기록은 전부 지역 키워드였다.
   * 판을 섞으면 숫자가 망가진다 (lib/analysis/factors.ts 의 Arena 주석).
   */
  arena?: 'local' | 'reference'
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
    /**
     * **1페이지에 7일 이내 글이 몇 편 있나** — 「새 글이 뚫고 들어오는 판인가」.
     *
     * 회원 제안 (2026-08-18): "7일 이내 7% 정도가 상위노출되는데 왜 노출되는지 분석해서
     * 그에 맞는 글쓰기를 할 수 있게 업데이트해보는 건 어떨까?"
     *
     * 그래서 재봤다 (천안·아산 14개 키워드 · 1페이지 140편). **글의 형태로는 갈리지 않았다** —
     * 7일 이내 진입 글과 31일 이상 글의 글자수(1,649 vs 1,711)·이미지(14 vs 18)·정보 낱말
     * (6 vs 7)·홍보 낱말(3 vs 3)·경험 낱말(3 vs 4)이 사실상 같았다. 즉 「7일에 뜨는 글쓰기
     * 규칙」은 근거가 없다 — 만들면 지어낸 규칙을 더하는 셈이다.
     *
     * 갈린 것은 **블로그 힘**이었다 (누적 방문자 중간값 110,721 vs 36,175, 3배). 다만 예외가
     * 있었다 — 누적 260명·글 10편인 새 블로그가 「쌍용동 PT」 4위에 1일차로 들어왔다.
     * 그래서 **키워드마다 뚫리는 정도가 다르다**고 보는 것이 맞고, 그건 글을 쓰기 전에
     * 고를 수 있는 것이다. 이 수치가 그 판단에 쓰인다.
     */
    freshWithin7d: number
    /** 1페이지에서 가장 어린 글의 나이 (일). 날짜를 아는 항목이 없으면 null */
    youngestAgeDays: number | null
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
  /**
   * 관찰소 근거 (lib/writing/evidence.ts).
   *
   * 이 기준이 어디서 왔는지 항목마다 밝힌다 — 「관찰 4회 · 상위 글 38편: 유리 3회 ·
   * 거꾸로 0회」처럼. 없으면 아직 재는 방법이 없는 항목이고, 그건 화면에서 통설 기준으로
   * 표시한다.
   */
  evidence?: string
  evidenceVerdict?: 'none' | 'supported' | 'weak' | 'mixed' | 'flat' | 'against'
  /** 관찰로 가중치를 고치기 전 값 — 「내렸다」를 보여주려고 남긴다 */
  baseWeight?: number
  /**
   * **어디가 걸렸나** — 지금은 화자(voice) 항목만 쓴다 (2026-08-26).
   *
   * 회원 지적: "이거 자꾸 화자가 어긋났대. 수정 좀 해줘." 걸린 것이 제목 한 줄인데도
   * 화면은 「본문 비우고 새로 쓰기」를 큰 버튼으로 내밀고 있었다 — 고칠 곳이 제목 한 줄일
   * 때 본문을 통째로 다시 쓰게 하면 멀쩡한 글을 버리는 셈이다.
   *
   * 화면이 「제목만 걸렸나」를 알아야 안내를 다르게 할 수 있는데, 그걸 힌트 글자에서
   * 찾아 읽게 하면 문구를 고칠 때마다 화면이 조용히 틀어진다 (이 저장소가 되풀이한 사고다).
   */
  scope?: 'title' | 'body' | 'both'
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
  /** 영상 자리 개수 (`[영상: …]` 표기) */
  videoCount: number
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
  /** 이 점수의 근거가 얼마나 되는지 한 줄로 (몇 개가 관찰로 확인됐나) */
  evidenceNote: string
}
