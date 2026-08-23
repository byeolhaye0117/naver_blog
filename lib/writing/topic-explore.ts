/**
 * **정보글 주제 탐색기** — 무엇을 쓸지 지어내지 않고 재서 고른다.
 *
 * ── 회원 요청 (2026-08-23) ───────────────────────────────────
 * "주제도 단순히 새벽운동 어떻게 하나 이런게 아니라 실제로 다이어트나 체중증량을 원하는
 * 주제들을 리서치해서 그에 맞는 주제를 탐색하는 탐색기를 만들어서 그거중에 내가 선택해서
 * 하고 싶어."
 *
 * 맞는 지적이다. 기본 주제 10개(INFO_TOPICS)는 **우리가 앉아서 지어낸 것**이다. 그럴듯해
 * 보이지만 그 주제를 사람들이 실제로 검색하는지는 한 번도 확인한 적이 없다.
 *
 * ── 무엇이 지어낸 것이고 무엇이 잰 것인가 ──────────────────
 * 정직하게 나눠 둔다:
 *   · **씨앗(TOPIC_SEEDS)은 우리가 넣는다.** 「다이어트」·「체중 증량」 같은 큰 갈래다.
 *     회원이 어느 갈래를 볼지 고르는 출발점일 뿐, 이게 주제가 되지는 않는다.
 *   · **후보는 네이버에서 가져온다.** 검색창 자동완성(사람들이 실제로 치는 말)과 검색광고
 *     키워드도구(연관 검색어 + 월간 검색량)다.
 *   · **경쟁은 잰다.** 그 검색어로 최근 30일에 블로그 글이 몇 편 올라왔는지.
 *
 * ── 이 파일에는 네트워크가 없다 ─────────────────────────────
 * 고르고 거르고 줄 세우는 규칙만 둔다 (라우트가 조회해서 넘겨준다). 「무엇을 정보글 주제로
 * 볼 것인가」는 틀리면 매일 엉뚱한 글이 나오는 종류라, 테스트가 볼 수 있는 자리에 있어야 한다.
 */
import { ARENA_HIGH, ARENA_LOW } from './arena'

/**
 * 탐색 씨앗 — **회원이 고르는 큰 갈래**.
 *
 * 여기 적힌 말이 그대로 주제가 되지 않는다. 이 말들을 자동완성·연관검색어에 넣어 **실제로
 * 검색되는 문구**를 받아오고, 그중에서 정보글로 쓸 만한 것만 남긴다.
 *
 * 갈래를 고를 때 기준: **헬스장에 오는 사람이 실제로 가진 목적**이어야 한다. 회원이 콕
 * 집어 말한 두 가지(다이어트·체중 증량)를 맨 앞에 둔다.
 */
export const TOPIC_SEEDS: { id: string; label: string; queries: string[] }[] = [
  { id: 'diet', label: '다이어트 · 체중 감량', queries: ['다이어트', '체지방 감량', '다이어트 정체기'] },
  { id: 'bulk', label: '체중 증량 · 벌크업', queries: ['벌크업', '체중 증량', '마른 사람 근육'] },
  { id: 'beginner', label: '헬스 처음 시작', queries: ['헬스 초보', '헬스장 처음', '운동 순서'] },
  { id: 'form', label: '운동 자세 · 방법', queries: ['스쿼트 자세', '데드리프트 자세', '헬스 루틴'] },
  { id: 'body', label: '부위별 고민', queries: ['뱃살 빼는법', '허벅지 살 빼기', '팔뚝살'] },
  { id: 'time', label: '시간 · 습관 만들기', queries: ['새벽 운동', '퇴근 후 운동', '홈트'] },
  { id: 'pain', label: '통증 · 부상 피하기', queries: ['무릎 통증 운동', '허리 아플때 운동', '어깨 통증'] },
  { id: 'food', label: '식단 · 영양', queries: ['단백질 섭취량', '야식 끊기', '공복 유산소'] },
]

export type TopicIntent = 'info' | 'local' | 'buy'

export const INTENT_LABEL: Record<TopicIntent, string> = {
  info: '정보',
  local: '업체 찾기',
  buy: '가격·등록',
}

/**
 * **업체를 찾는 말** — 정보글 주제로 쓰면 안 된다.
 *
 * 「쌍용동 헬스장」으로 정보글을 쓰면 홍보글이 된다. 그건 이미 홍보글이 맡은 자리이고,
 * 정보글은 신뢰도를 쌓으려고 쓰는 것이라 목적이 다르다 (정보 : 홍보 = 2 : 1 전략의 '2').
 */
const BUY_WORDS = [
  '가격',
  '비용',
  '얼마',
  '등록',
  '회원권',
  '이용권',
  '일일권',
  '1일권',
  '할인',
  '이벤트',
  '추천',
  '후기',
  '리뷰',
  '순위',
  '저렴',
  '싼곳',
  '영업시간',
  '몇시',
  '주차',
  '위치',
  '전화번호',
]

/** 지역을 가리키는 꼬리 — 「○○동」·「○○시」·「근처」 */
const LOCAL_RE = /(\s|^)[가-힣]{1,4}(동|읍|면|구|시|군)(\s|$)|근처|주변|가까운/

/**
 * **정보글 주제로 쓸 만한 말인가.**
 *
 * 세 갈래로 나눈다 — 버리지 않고 갈래를 붙여 돌려준다. 버리면 회원이 「왜 이건 안 나오지」를
 * 알 수 없고, 이 저장소는 조용히 잘라내는 것을 하지 않는다.
 */
export function classifyIntent(query: string, myLocalKeywords: string[] = []): TopicIntent {
  const q = query.trim()
  const flat = q.replace(/\s+/g, '')
  // 우리 지역 키워드가 통째로 들어 있으면 업체를 찾는 말이다
  if (myLocalKeywords.some((k) => k.trim() && flat.includes(k.replace(/\s+/g, '')))) return 'local'
  if (LOCAL_RE.test(q)) return 'local'
  if (BUY_WORDS.some((w) => flat.includes(w))) return 'buy'
  return 'info'
}

export interface TopicCandidate {
  /** 자동 초안 주제로 그대로 들어갈 문구 */
  topic: string
  /** 어느 씨앗에서 나왔나 */
  seedId: string
  /** 월간 검색량 (PC+모바일). null = 못 쟀다 */
  monthlySearch: number | null
  /** 최근 30일 블로그 발행량 = 경쟁. null = 못 쟀다 */
  recent30: number | null
  intent: TopicIntent
  /** 어디서 온 후보인가 — 회원이 믿을 근거 */
  from: 'autocomplete' | 'searchad'
  /** 왜 이 순서인지 한 줄 */
  why: string
}

/**
 * **주제로 쓸 문구로 다듬는다.**
 *
 * 검색어는 「다이어트정체기」처럼 붙여 오기도 하고 「다이어트 정체기 극복」처럼 길게 오기도
 * 한다. 그대로 지시문에 넣어도 되지만, 앞뒤 공백과 겹친 공백만 정리한다. **말을 바꾸지는
 * 않는다** — 바꾸면 그건 다시 우리가 지어낸 주제가 된다.
 */
export function toTopic(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

/**
 * 후보를 줄 세운다 — **수요는 큰데 경쟁이 적은 것**부터.
 *
 * ── 왜 이 순서인가 ─────────────────────────────────────────
 * 발행량 경계(300편 / 100편)는 이 앱이 이미 실측으로 정한 값을 그대로 쓴다 (arena.ts).
 * 300편 이상은 갓 쓴 글이 바로 안 올라오던 자리였고, 100편 아래는 7일 이내 글이 1페이지에
 * 올라오던 자리였다. **여기서 새 기준을 만들지 않는다** — 같은 사실에 두 기준이 생기면
 * 어느 쪽이 맞는지 아무도 모르게 된다.
 *
 * 검색량을 못 잰 것(검색광고 키 없음)은 **뒤로 밀되 버리지 않는다.** 모르는 것을 0으로
 * 바꿔 쓰면 없는 사실을 만들어내는 셈이다.
 */
export function rankCandidates(list: TopicCandidate[]): TopicCandidate[] {
  const tier = (c: TopicCandidate): number => {
    if (c.recent30 === null) return 1
    if (c.recent30 < ARENA_LOW) return 0
    if (c.recent30 < ARENA_HIGH) return 1
    return 2
  }
  return [...list].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (b.monthlySearch ?? -1) - (a.monthlySearch ?? -1) ||
      (a.recent30 ?? Number.MAX_SAFE_INTEGER) - (b.recent30 ?? Number.MAX_SAFE_INTEGER) ||
      a.topic.localeCompare(b.topic)
  )
}

/** 후보 한 줄 설명 — 화면에 그대로 쓴다 */
export function candidateWhy(monthlySearch: number | null, recent30: number | null): string {
  const demand =
    monthlySearch === null
      ? '검색량은 못 쟀습니다 (검색광고 키가 없습니다)'
      : `월 ${monthlySearch.toLocaleString()}회 검색`
  if (recent30 === null) return `${demand} · 발행량은 못 쟀습니다`
  const level =
    recent30 < ARENA_LOW
      ? '경쟁 적은 자리'
      : recent30 < ARENA_HIGH
        ? '경쟁 보통'
        : '경쟁 센 자리'
  return `${demand} · 최근 30일 ${recent30.toLocaleString()}편 (${level})`
}

/**
 * 조회해 온 것들을 후보 목록으로 합친다.
 *
 * **같은 말이 두 곳에서 오면 한 번만 남긴다** — 자동완성과 연관검색어는 겹친다. 남길 때는
 * 검색량을 아는 쪽(searchad)을 살린다.
 */
export function buildCandidates(args: {
  seedId: string
  /** 자동완성에서 온 말 */
  suggestions: string[]
  /** 검색광고에서 온 말 (검색량 포함) */
  adRows: { keyword: string; monthlySearch: number }[]
  /** 검색어별 최근 30일 발행량 — 잰 것만 */
  recent: Record<string, number | null>
  /** 우리 지역 키워드 — 업체 찾는 말을 가려낸다 */
  myLocalKeywords?: string[]
  /** 이미 고른 주제 — 다시 권하지 않는다 */
  exclude?: string[]
}): TopicCandidate[] {
  const seen = new Map<string, TopicCandidate>()
  const excluded = new Set((args.exclude ?? []).map((t) => toTopic(t).replace(/\s+/g, '')))
  const add = (query: string, from: TopicCandidate['from'], monthlySearch: number | null) => {
    const topic = toTopic(query)
    if (!topic) return
    const key = topic.replace(/\s+/g, '')
    if (excluded.has(key)) return
    const recent30 = args.recent[topic] ?? args.recent[query] ?? null
    const next: TopicCandidate = {
      topic,
      seedId: args.seedId,
      monthlySearch,
      recent30,
      intent: classifyIntent(topic, args.myLocalKeywords),
      from,
      why: candidateWhy(monthlySearch, recent30),
    }
    const prev = seen.get(key)
    // 검색량을 아는 쪽을 살린다 — 겹칠 때 모르는 값으로 덮으면 정보가 줄어든다
    if (!prev || (prev.monthlySearch === null && next.monthlySearch !== null)) seen.set(key, next)
  }
  for (const row of args.adRows) add(row.keyword, 'searchad', row.monthlySearch)
  for (const s of args.suggestions) add(s, 'autocomplete', null)
  return rankCandidates([...seen.values()])
}
