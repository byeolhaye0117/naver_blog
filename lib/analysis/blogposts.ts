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
import type { Post, PostType, RankTarget, Store } from '../types'
import { TITLE_PROMO_RE } from '../writing/checker'

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

/**
 * ─── 정보성과 홍보성을 몇 대 몇으로 썼나 (2026-09-01 회원 요청) ────────
 *
 * 회원: "우리만의 블로그 홈페이지는 정보성 및 홍보성 몇대 몇으로 섰는지 보이게 해주면
 * 좋겠어."
 *
 * 회원이 세우고 있는 전략이 **정보글 : 홍보글 = 2 : 1** 이다. 그런데 그 비율이 실제로
 * 지켜지고 있는지를 볼 데가 없었다 — 앱에서 쓴 글은 유형이 저장돼 있지만 그건 21편이고,
 * 블로그에는 287편이 있다.
 *
 * ── 무엇으로 가르나 (정직하게) ──────────────────────────────
 * 목록에서 오는 것은 **제목뿐**이다. 본문을 읽으면 정확하지만 글마다 조회가 한 번씩
 * 들어가서 백 편이면 백 번이다. 그래서 이렇게 나눈다:
 *
 *   · **앱에서 쓴 글** — 저장된 유형(`post.type`)을 그대로 쓴다. 이건 추정이 아니다.
 *   · **나머지** — 제목만 보고 **추정한다.** 화면이 「제목으로 추정한 N편」이라고 밝힌다.
 *
 * 추정을 사실처럼 보여주지 않는 것이 이 저장소의 규칙이라, 아는 것과 짐작한 것의 수를
 * 따로 들고 다닌다.
 */
export type PostMix = {
  info: number
  promo: number
  review: number
  /** 유형이 저장돼 있어 확실한 것 */
  known: number
  /** 제목만 보고 추정한 것 */
  guessed: number
  total: number
}

/** 후기글로 보이는 제목 — 겪은 이야기를 가리키는 말 */
const TITLE_REVIEW_RE = /후기|리뷰|다녀왔|다녀온|가봤|가본|등록했|해봤|해본|솔직/

/**
 * **업종 낱말은 상호가 아니다.**
 *
 * 처음에는 `arena.ts` 의 `titleHasBrand` 를 그대로 불렀다. 회원 블로그 90편으로 재보니
 * **74편이 홍보성**으로 나왔는데, 그중에 「근육키우는법, 헬스장 초보는 뭐부터 해야
 * 할까요?」 같은 정보글이 잔뜩 있었다.
 *
 * 이유가 상호명에 있었다 — 지점 하나의 정식 상호가 **「성정동 착한 헬스장」**이라
 * 그 조각인 「헬스장」이 제목에 있으면 브랜드가 드러난 것으로 잡혔다.
 *
 * `titleHasBrand` 가 틀린 것은 아니다. 그건 **우리 글의 제목이 업체를 밝히고 있나**를
 * 보는 함수이고(홍보글은 밝혀야 하고 정보글은 감춰야 한다), 자기 글을 자기 상호로
 * 재는 자리에서는 조각이 넓어도 손해가 없다. 여기서 묻는 것은 **이 제목이 업체 이야기인가**
 * 라서 질문이 다르다 — 그래서 같은 함수를 쓰지 않고, 업종 낱말만 맞은 것은 뺀다.
 */
const GENERIC_BRAND_PIECE = new Set([
  '헬스장', '헬스', '피트니스', '짐', '센터', '클럽', '스튜디오', '점', '여성전용', '24시', '24시간',
  'pt', '피티', '착한', '동', '천안',
])

/** 상호에서 **그 업체만 가리키는 조각**만 남긴다 (「MTO」·「착한헬스」·「쌍용점」) */
function brandPieces(store: Store): string[] {
  const out: string[] = []
  for (const raw of [store.legalName, store.name]) {
    const full = (raw ?? '').replace(/\s+/g, '')
    if (full.length >= 3) out.push(full)
    for (const piece of (raw ?? '').split(/\s+/)) {
      const w = piece.trim()
      if (w.length >= 2 && !GENERIC_BRAND_PIECE.has(w.toLowerCase())) out.push(w)
    }
  }
  return out
}

/**
 * **제목 하나가 어느 유형으로 보이나.**
 *
 * 순서가 뜻을 정한다:
 *   ① 후기 — 「후기」가 든 제목은 값 이야기가 같이 있어도 후기글이다
 *   ② 홍보 — 상호명이 드러나거나 · 우리 지역 키워드가 들어 있거나 · 값·혜택을 말한다
 *   ③ 나머지는 정보
 *
 * 값·혜택 판단은 검수와 **같은 목록**을 쓴다 (`TITLE_PROMO_RE`) — 두 곳에 따로 적으면
 * 한쪽만 늘어난다. 상호명 판단도 `titleHasBrand` 를 그대로 부른다.
 */
export function kindFromTitle(
  title: string,
  opts: { stores?: Store[]; localKeywords?: string[] } = {}
): PostType {
  const t = (title ?? '').trim()
  if (!t) return 'info'
  if (TITLE_REVIEW_RE.test(t)) return 'review'
  const flatTitle = t.replace(/\s+/g, '').toLowerCase()
  for (const st of opts.stores ?? []) {
    if (brandPieces(st).some((b) => flatTitle.includes(b.replace(/\s+/g, '').toLowerCase()))) return 'promo'
  }
  /*
   * **우리 지역 키워드가 제목에 있으면 홍보성이다.** 「쌍용동헬스장 …」으로 여는 제목은
   * 업체를 찾는 검색에 놓인 글이다 — 정보글이 그 자리에 서면 홍보글이 된다는 판단을
   * 이 앱은 이미 여러 곳에서 하고 있다 (topic-explore 의 `local`, 검수의 info-keyword-purity).
   */
  for (const kw of opts.localKeywords ?? []) {
    const k = (kw ?? '').replace(/\s+/g, '')
    if (k && flatTitle.includes(k.toLowerCase())) return 'promo'
  }
  if (TITLE_PROMO_RE.test(t)) return 'promo'
  return 'info'
}

/**
 * 목록을 유형별로 센다 — **아는 것은 알고, 짐작한 것은 짐작했다고** 들고 온다.
 */
export function postMix(
  rows: { logNo: string; title: string }[],
  db: { posts?: Post[]; stores?: Store[]; rankTargets?: RankTarget[] } = {}
): PostMix {
  const byLog = new Map<string, PostType>()
  const byId = new Map((db.posts ?? []).map((p) => [p.id, p.type]))
  for (const p of db.posts ?? []) {
    const logNo = logNoFromUrl(p.publishedUrl ?? '')
    if (logNo) byLog.set(logNo, p.type)
  }
  /*
   * **순위 추적에 적힌 주소로도 이어 붙인다** (2026-09-01, 실제 데이터를 보고 넣었다).
   *
   * 글에 `publishedUrl` 이 채워져 있으리라 보고 짰는데, 회원 저장소를 열어 보니 **전부
   * 비어 있었다** — 올린 뒤 그 칸을 채우는 것은 손이 가는 일이라 아무도 안 한다. 대신
   * 순위 추적 항목에는 주소가 있고 `postId` 로 글과 이어져 있다. 그 길로 유형을 찾는다.
   */
  for (const t of db.rankTargets ?? []) {
    const logNo = logNoFromUrl(t.url ?? '')
    const type = t.postId ? byId.get(t.postId) : undefined
    if (logNo && type && !byLog.has(logNo)) byLog.set(logNo, type)
  }
  const localKeywords = (db.stores ?? []).flatMap((s) => s.localKeywords ?? [])
  const out: PostMix = { info: 0, promo: 0, review: 0, known: 0, guessed: 0, total: 0 }
  for (const r of rows) {
    const saved = byLog.get(r.logNo)
    const kind = saved ?? kindFromTitle(r.title, { stores: db.stores, localKeywords })
    out[kind] += 1
    if (saved) out.known += 1
    else out.guessed += 1
    out.total += 1
  }
  return out
}

/**
 * **회원이 세운 목표** — 정보글 : 홍보글 = 2 : 1.
 *
 * 이 앱이 잰 값이 아니라 **회원이 정한 전략**이다. 그래서 「기준 미달」이라고 하지 않고
 * 「목표는 2:1 입니다」라고만 적는다 — 순위와 이 비율을 재본 적은 없다.
 */
export const INFO_PER_PROMO = 2

/**
 * 「정보 2 : 홍보 1」 꼴로 줄인다 — 사람이 읽는 비율.
 *
 * 홍보글이 하나도 없으면 비율이 성립하지 않는다. 그때는 `null` 이고, 화면이 개수를
 * 그대로 적는다 (0 으로 나눈 값을 지어내지 않는다).
 */
export function mixRatio(mix: PostMix): number | null {
  if (!mix.promo) return null
  return Math.round((mix.info / mix.promo) * 10) / 10
}

/** 화면에 그대로 쓰는 한 줄 */
export function mixNote(mix: PostMix): string {
  if (!mix.total) return '센 글이 없습니다.'
  const ratio = mixRatio(mix)
  const head =
    ratio === null
      ? `정보성 ${mix.info}편 · 홍보성 0편 — 홍보글이 없어 비율이 나오지 않습니다`
      : `정보성 : 홍보성 = ${ratio} : 1 (정보 ${mix.info}편 · 홍보 ${mix.promo}편)`
  const parts = [head]
  if (mix.review) parts.push(`후기 ${mix.review}편`)
  /*
   * **추정한 수를 반드시 밝힌다.** 목록에서 오는 것은 제목뿐이라, 앱에서 쓰지 않은 글은
   * 제목만 보고 가른 것이다. 이걸 감추면 회원이 이 숫자를 사실로 읽는다.
   */
  if (mix.guessed) parts.push(`${mix.total}편 중 ${mix.guessed}편은 제목만 보고 추정했습니다`)
  return parts.join(' · ')
}

