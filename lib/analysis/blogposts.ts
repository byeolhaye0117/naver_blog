/**
 * **아이디 하나로 그 블로그가 무슨 글을 썼는지 본다** (2026-09-01 회원 요청).
 *
 * 회원: "블로그 url 앞에 있는 아이디를 보고 이 아이디에 어떤 글들을 썼는지 확인할 수
 * 있는 페이지 만들어주면 좋겠어."
 *
 * ── 이미 있는 것과 무엇이 다른가 ────────────────────────────
 * `/blog`(블로그 진단)도 아이디를 받지만 그건 **RSS 최근 몇 편으로 성격을 판정하는**
 * 화면이고, 한 번 돌리는 데 조회가 수십 번 든다. 회원이 말한 것은 그냥 **글 목록**이다 —
 * 무엇을 언제 썼는지 죽 훑어보는 것. 조회 두 번이면 되고, 그래서 따로 둔다.
 *
 * ── 이 파일에는 네트워크가 없다 ─────────────────────────────
 * 목록을 읽어 오는 것은 `lib/naver/blogstat.ts` 가 이미 한다 (`fetchPostPage`).
 * 여기는 **읽어 온 것을 우리 것과 맞춰 보는 규칙**만 둔다 — 라우트는 조회해서 넘겨준다.
 */
import type { Post, RankTarget } from '../types'

/** 네이버 글 주소에서 글 번호(logNo)를 집는다 — 세 가지 꼴을 다 받는다 */
export function logNoFromUrl(raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  // PostView.naver?blogId=…&logNo=…
  const q = /[?&]logNo=(\d+)/i.exec(s)
  if (q) return q[1]
  // blog.naver.com/{id}/{logNo} · m.blog.naver.com/{id}/{logNo}
  const m = /blog\.naver\.com\/[A-Za-z0-9_-]+\/(\d+)/i.exec(s)
  if (m) return m[1]
  // 번호만 적은 경우
  return /^\d{6,}$/.test(s) ? s : ''
}

/** 사람이 눌러 볼 주소 — 모바일·PC 어느 쪽에서 열어도 같은 글이다 */
export function postUrl(blogId: string, logNo: string): string {
  return `https://blog.naver.com/${encodeURIComponent(blogId)}/${logNo}`
}

/**
 * 그 글이 **우리 것인지** 표시한다.
 *
 * 목록만 보면 남의 글도 내 글도 똑같이 제목 한 줄이다. 회원이 자기 블로그를 볼 때
 * 가장 먼저 궁금한 것은 「이건 앱에서 쓴 글인가」와 「순위를 재고 있나」다. 둘 다
 * 우리가 이미 아는 사실이라 여기서 붙여 준다 — **글 번호로만 맞춘다.** 제목으로 맞추면
 * 올리기 직전에 제목을 손본 글이 어긋난다 (회원이 그렇게 고치는 것을 이미 봤다).
 */
export interface PostMark {
  /** 앱에서 쓴 글인가 — 그 글의 id (발행 관리에서 열 수 있다) */
  postId?: string
  /** 순위 추적에 등록돼 있나 — 그 항목의 id */
  targetId?: string
}

export function markKnownPosts(
  logNos: string[],
  db: { posts?: Post[]; rankTargets?: RankTarget[] }
): Record<string, PostMark> {
  const byLog = new Map<string, PostMark>()
  const put = (logNo: string, mark: PostMark) => {
    if (!logNo) return
    byLog.set(logNo, { ...byLog.get(logNo), ...mark })
  }
  for (const p of db.posts ?? []) put(logNoFromUrl(p.publishedUrl ?? ''), { postId: p.id })
  for (const t of db.rankTargets ?? []) put(logNoFromUrl(t.url ?? ''), { targetId: t.id })

  const out: Record<string, PostMark> = {}
  for (const logNo of logNos) {
    const mark = byLog.get(logNo)
    if (mark) out[logNo] = mark
  }
  return out
}

/**
 * 한 화면에 보여줄 글 수.
 *
 * 네이버 목록 API 가 한 번에 주는 만큼 그대로 받는다. 30편이면 한 달치가 대개 들어오고,
 * 더 보려면 다음 쪽으로 넘긴다.
 */
export const BLOG_POSTS_PER_PAGE = 30

/** 몇 쪽까지 있나 — 전체 글 수를 모르면 알 수 없다 (0 을 지어내지 않는다) */
export function pageCountOf(total: number | null, perPage = BLOG_POSTS_PER_PAGE): number | null {
  if (total === null || !Number.isFinite(total) || perPage <= 0) return null
  return Math.max(1, Math.ceil(total / perPage))
}

/**
 * 목록 한 줄 요약 — 화면 맨 위에 그대로 쓴다.
 *
 * **못 읽은 값을 0 으로 바꾸지 않는다.** 「전체 0편」과 「전체 글 수를 못 읽었습니다」는
 * 다른 말이고, 이 저장소는 그 둘을 섞지 않는다.
 */
export function postListNote(args: {
  total: number | null
  shown: number
  page: number
  hidden: number
  closed: number
}): string {
  const parts: string[] = []
  parts.push(
    args.total === null
      ? `전체 글 수는 못 읽었습니다 · 이 쪽에 ${args.shown}편`
      : `전체 ${args.total.toLocaleString()}편 중 ${args.page * BLOG_POSTS_PER_PAGE + 1}~${
          args.page * BLOG_POSTS_PER_PAGE + args.shown
        }번째`
  )
  /*
   * **검색 허용 안 함·비공개를 따로 센다.** 이건 그냥 참고가 아니라 순위와 직결된다 —
   * 검색 허용을 꺼 두면 아무리 잘 써도 검색에 안 나온다. 실제로 그 설정 때문에 「색인
   * 누락」으로 잘못 읽을 뻔한 적이 있어서 `blogstat.ts` 도 그 값을 따로 들고 있다.
   */
  if (args.hidden > 0) parts.push(`검색 허용 안 함 ${args.hidden}편`)
  if (args.closed > 0) parts.push(`전체공개 아님 ${args.closed}편`)
  return parts.join(' · ')
}
