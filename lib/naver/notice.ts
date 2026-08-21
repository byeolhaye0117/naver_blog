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
 *
 * ── 회원이 정한 기준 (2026-08-21) ───────────────────────────
 * "일단 지금 실행하고 있지 않은 네이버 정책은 반영하지 말고."
 *
 * 계기: 2025-11-24 「신뢰도 중심 통합 랭킹 모델」 공지를 가이드의 랭킹 구조에 넣을지 물었다.
 * 웹·블로그·카페·지식iN·동영상을 한 영역에 섞고 출처의 공신력으로 상단을 정한다는 내용인데,
 * **A/B 테스트 중**이라고 적혀 있었다. 전면 적용이 아니다.
 *
 * 그래서 기준을 이렇게 둔다:
 *   · 예고·시범·A/B 테스트 단계  → 이 목록에 남기고 **글쓰기 규칙으로 옮기지 않는다**
 *   · 이미 적용된 정책·가이드    → 읽고 `rule` 에 적으면 지시문에 들어간다
 *
 * 예고 단계를 규칙으로 옮기면 지금 순위에 아무 일도 안 하는 문장으로 글을 바꾸게 되고,
 * 테스트가 접히면 되돌릴 근거조차 남지 않는다 (`activeRules` 는 왜 넣었는지를 안 적는다).
 * 실제로 순위가 움직이는 것이 보이면 그때 옮긴다.
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
  { tag: '정책·약관', re: /(정책|약관|운영원칙|이용약관|개정|변경 안내|대가성|내돈내산|협찬|인증 대상)/ },
  { tag: 'AI', re: /(AI|인공지능|브리핑|생성형)/i },
  { tag: '블로그', re: /(블로그|포스트|이웃|서로이웃)/ },
  { tag: '플레이스', re: /(플레이스|스마트플레이스|예약|영수증)/ },
  /*
   * 키워드 조사에 직접 영향을 주는 것들. 「새로워집니다」 같은 넓은 말은 일부러 안 넣었다 —
   * 부동산·경제지표 검색 개편까지 걸려서 목록이 쓸모없어진다.
   */
  { tag: '검색어 도구', re: /(연관검색어|자동완성|검색어 추천|키워드 도구|서치어드바이저|웹마스터)/ },
]

/**
 * **이것 중 하나라도 걸려야 「읽어야 함」이다.**
 *
 * 처음엔 꼬리표가 하나라도 붙으면 읽어야 할 것으로 봤다. 프로덕션에서 100건을 받아보니
 * **46건이 「읽어야 함」**으로 나왔다 — 「8월, 이달의 블로그를 소개합니다」까지 「블로그」
 * 꼬리표로 걸렸다. 46건짜리 목록은 아무도 안 읽으므로 그건 알림이 아니라 소음이다.
 *
 * 「블로그」·「플레이스」·「AI」는 공식 채널 글 대부분에 들어간다. 꼬리표로는 남기되
 * **그것만으로는 읽어야 할 것으로 치지 않는다.**
 */
const STRONG = ['스팸·저품질', '검색 로직', '정책·약관', '검색어 도구', '콘텐츠 가이드']

/** 읽을 필요가 거의 없는 것 — 이벤트·당첨·모집 */
const NOISE = /(당첨|이벤트 안내|모집합니다|공모|챌린지|주인공은|지원금|스페셜|블로그 있어요|이달의 블로그)/

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
  const strong = tags.some((x) => STRONG.includes(x))
  const noisy = NOISE.test(t)
  if (!strong && noisy) return { relevant: false, tags }
  // 잡음 규칙보다 세다 — 이벤트 글에 「스팸」·「로직」이 들어갔다면 읽어야 한다
  if (strong) return { relevant: true, tags }
  return { relevant: false, tags }
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

/**
 * 채널을 돌며 공지를 받아 온다 — **크론과 화면 버튼이 같은 함수를 쓴다.**
 *
 * 라우트 파일은 테스트가 못 읽으므로(scripts/test.mjs 는 lib 만 컴파일한다) 여기에 둔다.
 * 두 곳에 같은 루프를 복사하면 한쪽만 고치는 날이 온다 — 이 저장소에서 여러 번 겪었다.
 *
 * RSS 받아오기는 **주입**받는다. 그래야 진짜 호출 없이 「한 채널만 죽었을 때 어떻게 되나」를
 * 테스트가 확인할 수 있다.
 */
export interface CollectDeps {
  feed: (blogId: string) => Promise<{ items: { title: string; link: string; date: string }[] } | null>
}

export interface CollectResult {
  items: NoticeItem[]
  /** 못 읽은 채널 이름 */
  failed: string[]
}

export async function collectNotices(deps: CollectDeps): Promise<CollectResult> {
  const items: NoticeItem[] = []
  const failed: string[] = []
  for (const src of NOTICE_SOURCES) {
    const feed = await deps.feed(src.id).catch(() => null)
    if (!feed) {
      failed.push(src.name)
      continue
    }
    for (const item of feed.items) {
      const verdict = classifyNotice(item.title)
      items.push({
        url: item.link,
        source: src.name,
        title: item.title,
        date: item.date,
        tags: verdict.tags,
        relevant: verdict.relevant,
      })
    }
  }
  return { items, failed }
}
