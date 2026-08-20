/**
 * **상위 블로그와 우리를 블로그 단위로 비교한다.**
 *
 * ── 왜 만들었나 (2026-08-20) ─────────────────────────────────
 * 회원 요청: "경쟁 있는 키워드는 어떻게 쓰는 게 좋을지 글의 구조뿐만 아니라 발행 간격 등
 * 상위 5편의 블로그와 비교해서 블로그 개설일, 이웃수, 글의 유형, 글 발행 간격, 포스팅당
 * 좋아요나 댓글 수 등을 비교분석해서 알려달라."
 *
 * 그래서 상위 5편의 블로그 13곳을 재고 우리와 나란히 놨다. **앱이 그동안 적어둔 조언 하나가
 * 뒤집혔다:**
 *
 *   우리 판(헬스·운동) 글 비중   상위 중간값 10%   우리 87%
 *   이웃                        상위 중간값 481    우리 4,231
 *   누적 방문자                  상위 중간값 36,446 우리 269,750
 *   블로그 나이                  상위 중간값 1.7년  우리 4.8년
 *   **오늘 방문자**              상위 중간값 43     **우리 6**
 *   **주당 발행**                상위 중간값 3.1편  **우리 1.3편**
 *   댓글 평균                    상위 중간값 3.3    우리 9.2
 *   공감 평균                    상위 중간값 12.4   우리 36.6
 *
 * 1페이지를 잡고 있는 것은 **헬스 전문 블로그가 아니라 잡블로그(체험단)** 였다. 최근 30편 중
 * 헬스·운동 글이 3~33%뿐이고 나머지는 맛집·일상·체험이다. 가이드에 「헬스·운동 범위를
 * 벗어난 글을 섞지 않는다」고 적어뒀는데, 이 판 실측은 그 조언을 지지하지 않는다.
 *
 * 개설일도 유리하지 않았다 — 두정동 헬스장 **1위 블로그는 첫 글이 2026-06-01(2.5개월)** 이다.
 * 우리는 4.8년이다.
 *
 * 우리가 확실히 뒤진 것은 둘뿐이다: **오늘 방문자(6 vs 43)** 와 **발행 빈도(주 1.3 vs 3.1)**.
 * 그리고 상위 13곳 중 12곳이 「후기·체험」 글을 쓰는데 우리 최근 30편에는 그 유형이 0편이다.
 *
 * ── 규칙으로 만들지 않은 것 ─────────────────────────────────
 * 발행 빈도가 순위를 만든다고는 적지 않는다 — 1~2위 그룹(중간 4.5편/주)과 3~5위 그룹(3.1편)이
 * 겹쳤고, 쌍용동 1위는 주 0.6편이다. 「주 3편 쓰면 오른다」가 아니라 **「이 판의 절반이
 * 그렇게 쓴다」**가 우리가 아는 전부다. 숫자를 보여주고 판단은 회원이 한다.
 */

/** 글 목록 한 줄 — blogstat 의 PostRow 중 여기서 쓰는 부분만 */
export interface PeerPost {
  title: string
  /** YYYY-MM-DD */
  date: string
  commentCount: number
}

/** 글 유형 — 제목으로 가른다. 완벽하지 않으니 **비율로만** 본다 */
export const POST_TYPES: { label: string; re: RegExp }[] = [
  { label: '후기·체험', re: /(후기|체험|내돈내산|다녀|이용해|받아봤|해봤|리뷰)/ },
  { label: '정보·방법', re: /(방법|이유|어떻게|하는 법|초보|루틴|효과|가이드|알려|무엇|차이|주의|할까)/ },
  { label: '홍보·안내', re: /(오픈|이벤트|할인|등록|가격|혜택|모집|안내|문의|신규)/ },
  { label: '일상·기타', re: /.*/ },
]

/** 우리 판(헬스·운동) 글인가 — 주제 집중도 */
const ON_TOPIC =
  /(헬스|피트니스|휘트니스|PT|피티|운동|다이어트|짐|웨이트|바디|체지방|인바디|스쿼트|필라테스|요가|크로스핏)/i

export function typeOf(title: string): string {
  return (POST_TYPES.find((t) => t.re.test(title ?? '')) ?? POST_TYPES[POST_TYPES.length - 1]).label
}

export interface Pace {
  /** 주당 발행 편수 (표본 기간으로 환산) */
  perWeek: number | null
  /** 글 사이 간격 중간값(일) */
  gapMedian: number | null
  /** 가장 길게 쉰 기간(일) — 꾸준함을 보는 값 */
  gapMax: number | null
}

function median(list: number[]): number | null {
  const s = list.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

function mean1(list: number[]): number | null {
  const s = list.filter((v) => Number.isFinite(v))
  return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null
}

/**
 * 발행 속도 — 표본 글들의 날짜 간격으로 잰다.
 *
 * 전체 글 수 ÷ 운영일수로 계산하면 **몇 년 전에 많이 쓰고 지금 안 쓰는 블로그가 부지런해
 * 보인다.** 최근 표본의 간격으로 봐야 지금 상태가 나온다.
 */
export function paceOf(posts: PeerPost[]): Pace {
  const dates = posts
    .map((p) => p.date)
    .filter(Boolean)
    .sort()
    .reverse() // 최신 → 과거
  if (dates.length < 2) return { perWeek: null, gapMedian: null, gapMax: null }
  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const d = (Date.parse(dates[i - 1]) - Date.parse(dates[i])) / 86400000
    if (Number.isFinite(d) && d >= 0) gaps.push(Math.round(d))
  }
  const span = (Date.parse(dates[0]) - Date.parse(dates[dates.length - 1])) / 86400000
  return {
    perWeek: span > 0 ? Math.round(((dates.length - 1) / span) * 7 * 10) / 10 : null,
    gapMedian: median(gaps),
    gapMax: gaps.length ? Math.max(...gaps) : null,
  }
}

export interface TypeShare {
  label: string
  count: number
  /** 0~100 */
  share: number
}

export function typeMixOf(posts: PeerPost[]): TypeShare[] {
  const counts = new Map<string, number>()
  for (const p of posts) counts.set(typeOf(p.title), (counts.get(typeOf(p.title)) ?? 0) + 1)
  return POST_TYPES.map((t) => ({
    label: t.label,
    count: counts.get(t.label) ?? 0,
    share: posts.length ? Math.round(((counts.get(t.label) ?? 0) / posts.length) * 100) : 0,
  })).filter((t) => t.count > 0)
}

/** 헬스·운동 글 비중(%) — 「주제 집중도」로 흔히 말하는 값 */
export function onTopicShare(posts: PeerPost[]): number | null {
  if (!posts.length) return null
  return Math.round((posts.filter((p) => ON_TOPIC.test(p.title ?? '')).length / posts.length) * 100)
}

/** 블로그 한 곳의 비교용 요약 */
export interface PeerRow {
  blogId: string
  /** 어느 키워드 몇 위인지 (「쌍용동 헬스장 3위」) */
  where: string[]
  dayVisitors: number | null
  totalVisitors: number | null
  buddies: number | null
  postCount: number | null
  /** 가장 오래된 글 날짜 — 개설일의 하한 */
  firstPost: string | null
  ageYears: number | null
  pace: Pace
  commentAvg: number | null
  likeAvg: number | null
  types: TypeShare[]
  onTopic: number | null
  /** 표본 글 수 */
  sampled: number
}

export function summarizePeer(input: {
  blogId: string
  where?: string[]
  dayVisitors: number | null
  totalVisitors: number | null
  buddies: number | null
  postCount: number | null
  firstPost: string | null
  posts: PeerPost[]
  likes: (number | null)[]
  now: number
}): PeerRow {
  const { posts } = input
  return {
    blogId: input.blogId,
    where: input.where ?? [],
    dayVisitors: input.dayVisitors,
    totalVisitors: input.totalVisitors,
    buddies: input.buddies,
    postCount: input.postCount,
    firstPost: input.firstPost,
    ageYears: input.firstPost
      ? Math.round(((input.now - Date.parse(input.firstPost)) / 86400000 / 365) * 10) / 10
      : null,
    pace: paceOf(posts),
    commentAvg: mean1(posts.map((p) => p.commentCount)),
    likeAvg: mean1(input.likes.filter((v): v is number => typeof v === 'number')),
    types: typeMixOf(posts),
    onTopic: onTopicShare(posts),
    sampled: posts.length,
  }
}

export type PeerVerdict = 'ahead' | 'behind' | 'same' | 'unknown'

export interface PeerAxis {
  key: string
  label: string
  /** 상위 블로그 중간값 */
  peers: number | null
  mine: number | null
  /** 우리가 앞선 것인가 — **높은 값이 좋은 축인지**는 higherIsBetter 가 정한다 */
  verdict: PeerVerdict
  higherIsBetter: boolean
  /** 이 축이 순위를 만든다고 볼 근거가 있나 (없으면 화면에 그렇게 적는다) */
  provenSignal: false
  note: string
}

const AXES: { key: string; label: string; higherIsBetter: boolean; pick: (r: PeerRow) => number | null; note: string }[] =
  [
    { key: 'dayVisitors', label: '오늘 방문자', higherIsBetter: true, pick: (r) => r.dayVisitors, note: '지금 이 블로그가 얼마나 읽히는지 — 누적보다 현재 힘에 가깝습니다.' },
    { key: 'buddies', label: '이웃', higherIsBetter: true, pick: (r) => r.buddies, note: '' },
    { key: 'totalVisitors', label: '누적 방문자', higherIsBetter: true, pick: (r) => r.totalVisitors, note: '' },
    { key: 'ageYears', label: '블로그 나이(년)', higherIsBetter: true, pick: (r) => r.ageYears, note: '오래된 것이 유리하지 않았습니다 — 실측에서 1위 블로그의 첫 글이 2.5개월 전입니다.' },
    { key: 'postCount', label: '전체 글 수', higherIsBetter: true, pick: (r) => r.postCount, note: '' },
    { key: 'perWeek', label: '주당 발행', higherIsBetter: true, pick: (r) => r.pace.perWeek, note: '이 판의 절반이 이 속도로 씁니다. 순위를 만든다는 근거는 없습니다(1~2위와 3~5위가 겹쳤습니다).' },
    { key: 'gapMedian', label: '글 사이 간격(일)', higherIsBetter: false, pick: (r) => r.pace.gapMedian, note: '' },
    { key: 'commentAvg', label: '글당 댓글', higherIsBetter: true, pick: (r) => r.commentAvg, note: '' },
    { key: 'likeAvg', label: '글당 공감', higherIsBetter: true, pick: (r) => r.likeAvg, note: '공감은 순위와 무관했습니다(2026-08-05 실측 — 공감 1위 글이 4위였습니다).' },
    { key: 'onTopic', label: '헬스·운동 글 비중(%)', higherIsBetter: true, pick: (r) => r.onTopic, note: '상위 블로그는 대부분 잡블로그였습니다. 집중도가 낮아서 밀린 것이 아닙니다.' },
  ]

/**
 * 축마다 **상위 블로그 중간값과 우리 값**을 나란히 놓는다.
 *
 * 점수로 합치지 않는다. 축마다 방향이 다르고(간격은 작은 게 좋다), 어느 축이 순위를
 * 만드는지는 우리가 모른다 — 합치면 모르는 것을 아는 것처럼 만든다.
 */
export function comparePeers(peers: PeerRow[], mine: PeerRow | null): PeerAxis[] {
  return AXES.map((a) => {
    const p = median(peers.map((r) => a.pick(r)).filter((v): v is number => v !== null))
    const m = mine ? a.pick(mine) : null
    let verdict: PeerVerdict = 'unknown'
    if (p !== null && m !== null) {
      // 10% 안쪽 차이는 같다고 본다 — 표본이 13곳이라 그보다 좁게 가를 근거가 없다
      const ratio = p === 0 ? (m === 0 ? 1 : Infinity) : m / p
      if (ratio > 1.1) verdict = a.higherIsBetter ? 'ahead' : 'behind'
      else if (ratio < 0.9) verdict = a.higherIsBetter ? 'behind' : 'ahead'
      else verdict = 'same'
    }
    return {
      key: a.key,
      label: a.label,
      peers: p,
      mine: m,
      verdict,
      higherIsBetter: a.higherIsBetter,
      provenSignal: false,
      note: a.note,
    }
  })
}

/**
 * 우리에게만 없는 글 유형 — 「상위 N곳 중 M곳이 쓰는데 우리는 0편」.
 *
 * 실측에서 상위 13곳 중 12곳이 「후기·체험」을 쓰는데 우리 최근 30편에는 0편이었다.
 * 이건 순위 근거가 아니라 **빈칸**이고, 빈칸은 채울 수 있다.
 */
export function missingTypes(peers: PeerRow[], mine: PeerRow | null): { label: string; peersWith: number; of: number }[] {
  if (!mine) return []
  const out: { label: string; peersWith: number; of: number }[] = []
  for (const t of POST_TYPES) {
    const mineHas = mine.types.find((x) => x.label === t.label)?.count ?? 0
    if (mineHas > 0) continue
    const peersWith = peers.filter((p) => (p.types.find((x) => x.label === t.label)?.count ?? 0) > 0).length
    if (peersWith >= Math.ceil(peers.length / 2)) out.push({ label: t.label, peersWith, of: peers.length })
  }
  return out
}
