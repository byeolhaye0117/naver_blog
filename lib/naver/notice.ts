/**
 * **네이버 공지·검색 로직 소식을 매일 받아 둔다.**
 *
 * ── 왜 만들었나 (2026-08-20) ─────────────────────────────────
 * 회원 요청: "네이버 로직과 공지사항을 항상 최신화해서 그에 맞는 글을 쓸 수 있도록 해줘."
 *
 * 그동안은 가이드 화면에 기준일(KB_DATE)을 손으로 박아 두고 「3개월 지났습니다」 배너만
 * 띄웠다. 그건 최신화가 아니라 **최신화를 잊지 말라는 알림**이다. 실제로 이번에 받아보니
 * 우리가 못 보고 지나간 공식 문서가 셋 있었다:
 *
 *   2026-07-06  알아두면 도움이 되는 '웹 콘텐츠 스팸 사례' 안내
 *   2026-06-04  AI 시대에 사용자의 선택을 받는 콘텐츠 작성 가이드_실전편
 *   2026-05-26  AI 시대에 사용자의 선택을 받는 콘텐츠 작성 가이드
 *
 * ── 왜 자동으로 규칙을 바꾸지 않나 ──────────────────────────
 * 제목만 보고 지시문을 고치면 **읽지도 않은 문장으로 글쓰기 규칙을 바꾸는 것**이 된다.
 * 이 저장소에서 짐작으로 넣은 규칙이 실측에 두 번 뒤집혔다(「굳은 자리」 등급, 주제 집중도).
 * 그래서 **모아서 알리는 것까지**가 자동이고, 규칙으로 옮기는 것은 사람이 읽고 정한다.
 */

/** 공식 채널 — RSS 로 받는다 (lib/naver/blogrss.ts 의 fetchBlogFeed 를 쓴다) */
export const NOTICE_SOURCES: { id: string; name: string; why: string }[] = [
  {
    id: 'naver_search',
    name: '네이버 검색 공식 블로그',
    why: '검색 로직·스팸 정책·콘텐츠 가이드가 여기서 나온다. 가장 중요한 채널이다.',
  },
  {
    id: 'blogpeople',
    name: '네이버 블로그 공식',
    why: '블로그 서비스·정책 공지. 이벤트 글이 많아 걸러서 본다.',
  },
]

/**
 * 우리에게 중요한 공지인가 — 제목으로 가른다.
 *
 * 놓치는 것보다 **덜 놓치는 쪽**으로 넉넉하게 잡는다. 사람이 목록을 훑는 데 드는 비용보다
 * 정책 변경을 못 보고 지나가는 비용이 크다.
 */
const TOPICS: { tag: string; re: RegExp }[] = [
  { tag: '스팸·저품질', re: /(스팸|어뷰징|저품질|남용|제재|불이익|악용)/ },
  { tag: '검색 로직', re: /(로직|알고리즘|랭킹|순위|C-?Rank|씨랭크|D\.?I\.?A|다이아|에어서치|스마트블록)/i },
  { tag: '콘텐츠 가이드', re: /(가이드|작성|콘텐츠|좋은 (문서|글)|권장|원칙|체크)/ },
  { tag: '정책·약관', re: /(정책|약관|운영원칙|이용약관|개정|변경 안내)/ },
  { tag: 'AI', re: /(AI|인공지능|브리핑|생성형)/i },
  { tag: '블로그', re: /(블로그|포스트|이웃|서로이웃)/ },
  { tag: '플레이스', re: /(플레이스|스마트플레이스|예약|영수증)/ },
  /*
   * 키워드 조사에 직접 영향을 주는 것들. 「새로워집니다」 같은 넓은 말은 일부러 안 넣었다 —
   * 부동산·경제지표 검색 개편까지 걸려서 목록이 쓸모없어진다.
   */
  { tag: '검색어 도구', re: /(연관검색어|자동완성|검색어 추천|키워드 도구|서치어드바이저|웹마스터)/ },
]

/** 읽을 필요가 거의 없는 것 — 이벤트·당첨·모집 */
const NOISE = /(당첨|이벤트 안내|모집합니다|공모|챌린지|주인공은|지원금|스페셜|블로그 있어요)/

export interface NoticeVerdict {
  /** 우리 일과 관련 있나 */
  relevant: boolean
  tags: string[]
}

export function classifyNotice(title: string): NoticeVerdict {
  const t = (title ?? '').trim()
  if (!t) return { relevant: false, tags: [] }
  const tags = TOPICS.filter((x) => x.re.test(t)).map((x) => x.tag)
  /*
   * 「스팸·저품질」과 「검색 로직」은 잡음 규칙보다 세다 — 이벤트 글에 그 낱말이 들어가는
   * 일은 거의 없고, 들어갔다면 읽어야 한다.
   */
  const strong =
    tags.includes('스팸·저품질') ||
    tags.includes('검색 로직') ||
    tags.includes('정책·약관') ||
    tags.includes('검색어 도구')
  if (!strong && NOISE.test(t)) return { relevant: false, tags }
  return { relevant: tags.length > 0, tags }
}

export interface NoticeItem {
  /** 글 주소 — 중복 판정 열쇠 */
  url: string
  source: string
  title: string
  /** YYYY-MM-DD */
  date: string
  tags: string[]
  relevant: boolean
  /** 회원이 읽고 확인한 시각 (ISO) — 없으면 아직 안 본 것 */
  reviewedAt?: string
  /**
   * 이 공지에서 글쓰기로 옮긴 규칙 한 줄.
   *
   * 사람이 읽고 적는다. 적어두면 그 문장이 지시문에 들어간다 — **제목만 보고 자동으로
   * 규칙을 만들지 않는다.**
   */
  rule?: string
}

/** 같은 글을 두 번 담지 않는다 (주소에 붙는 추적 파라미터를 떼고 비교한다) */
export function noticeKey(url: string): string {
  return (url ?? '').split('?')[0].replace(/\/+$/, '')
}

export function mergeNotices(prev: NoticeItem[] | undefined, fresh: NoticeItem[], keep: number): NoticeItem[] {
  const byKey = new Map<string, NoticeItem>()
  for (const n of prev ?? []) byKey.set(noticeKey(n.url), n)
  for (const n of fresh) {
    const k = noticeKey(n.url)
    const old = byKey.get(k)
    // 이미 있던 글이면 **회원이 남긴 것(확인·규칙)을 지키고** 나머지만 새로 쓴다
    byKey.set(k, old ? { ...n, reviewedAt: old.reviewedAt, rule: old.rule } : n)
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, keep)
}

/** 아직 안 본 중요한 공지 */
export function unreviewed(items: NoticeItem[] | undefined): NoticeItem[] {
  return (items ?? []).filter((n) => n.relevant && !n.reviewedAt)
}

/** 글쓰기에 반영하기로 적어둔 규칙들 (지시문에 들어간다) */
export function activeRules(items: NoticeItem[] | undefined): { rule: string; title: string; date: string }[] {
  return (items ?? [])
    .filter((n) => n.rule?.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((n) => ({ rule: n.rule!.trim(), title: n.title, date: n.date }))
}

/**
 * 마지막으로 확인한 날 — 가이드의 「기준일」을 손으로 박지 않고 이 값으로 쓴다.
 *
 * 공지를 하나도 안 봤으면 null 이고, 화면은 「아직 확인한 공지가 없습니다」로 적는다.
 */
export function lastReviewed(items: NoticeItem[] | undefined): string | null {
  const dates = (items ?? []).map((n) => n.reviewedAt).filter((d): d is string => Boolean(d))
  return dates.length ? dates.sort().slice(-1)[0] : null
}
