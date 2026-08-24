/**
 * **정보글 초안을 매일 하나씩 자동으로 써 둔다.**
 *
 * ── 회원 요청 (2026-08-21) ───────────────────────────────────
 * "정보성 블로그가 매일 1편씩 자동으로 작성되게 만들고 싶어."
 *
 * ── 먼저 못 하는 것부터 ─────────────────────────────────────
 * **네이버에 자동으로 발행할 수는 없다.** 네이버 블로그 글쓰기 API 가 없어졌고, 로그인해서
 * 대신 올려주는 방식은 자동화 도구로 취급돼 계정이 위험해진다. 이 앱이 회원 계정으로 글을
 * 올리는 일은 하지 않는다.
 *
 * 그래서 **여기까지가 자동이다**: 매일 밤 정보글 한 편을 써서 검수까지 돌려 초안으로 넣어
 * 둔다. 아침에 화면에서 열어 사진만 넣고 복사해 붙이면 끝난다. 손으로 하던 일 중 글쓰기가
 * 빠지는 것이고, 발행 버튼은 회원이 누른다.
 *
 * ── 왜 이 파일이 lib 에 있나 ────────────────────────────────
 * 라우트 파일은 테스트가 못 읽는다 (scripts/test.mjs 는 lib 만 컴파일한다). 「오늘 것이
 * 이미 있나」·「무엇을 쓸 차례인가」는 틀리면 매일 같은 글을 쓰거나 하루에 여러 편을 쓰는
 * 종류의 실수라, 테스트가 볼 수 있는 자리에 둔다. 라우트는 이 결정을 받아 실행만 한다.
 */
import type { AutoDraftPlan, Post } from '../types'

/**
 * 정보글 주제 풀.
 *
 * 화면(app/write/Editor.tsx)의 「주제 보기」 칩과 **같은 목록이어야 한다** — 두 곳에 따로
 * 적으면 한쪽만 늘어난다. 그래서 여기를 원본으로 두고 화면이 들여다 쓴다.
 *
 * 주제를 고를 때 기준은 하나다: **한 주제 안에서 정보 5종류가 채워지는가.** 실측에서 순위를
 * 가른 것이 정보의 종류 수였고(3~4종류 1~3위 17% / 5종류 이상 40%), 너무 좁은 주제는 그걸
 * 못 채운다.
 */
export const INFO_TOPICS: string[] = [
  '새벽 운동 시작하기',
  '다이어트 첫 달에 할 것',
  '처음 등록했을 때 첫 2주',
  '체중이 안 빠질 때 점검할 것',
  '하체 운동 자세 잡기',
  '퇴근 후 30분 루틴',
  '저녁 폭식이 반복될 때',
  '무릎이 아플 때 대신 할 운동',
  '운동해도 배가 안 빠질 때',
  '주 2회밖에 못 갈 때 짜는 순서',
]

/*
 * **유사성 3축(format·topicGroup)에 값을 넣지 않는다.**
 *
 * 처음엔 `format: 'auto'` 와 `topicGroup: 주제` 로 저장했는데, 그 둘은 이미 로테이션이
 * 쓰는 칸이다 (INFO_FORMATS·TOPIC_GROUPS). 거기에 다른 값을 넣으면 「최근에 안 쓴 형식」
 * 계산이 망가져서 **매번 같은 형식으로 쓰게 된다** — 자동화가 유사문서를 만드는 바로 그
 * 경로다. 그래서 자동 초안은 `auto`·`autoTopic` 이라는 자기 칸을 쓴다 (lib/types.ts).
 */

export interface Assignment {
  /** 정보글 메인 키워드 (지역 키워드를 메인으로 잡는다 — 2026-08-21 회원 결정) */
  mainKeyword: string
  /** 이번 글에서 다룰 주제 */
  topic: string
  /** 왜 이 조합인지 — 화면·로그에 그대로 적는다 */
  why: string
}

/** 실행 기록은 이만큼만 남긴다 — 두 주면 「요즘 도나」를 보는 데 충분하다 */
export const AUTO_DRAFT_RUNS_KEEP = 30

/**
 * 크론이 자기 앱을 부를 주소를 고른다.
 *
 * ── 왜 순서가 중요한가 (2026-08-23) ─────────────────────────
 * 처음엔 `VERCEL_URL` 만 썼다. 그건 **배포별 주소**(naver-blog-abc123-…vercel.app)라,
 * 배포 보호가 켜져 있으면 로그인 페이지가 돌아온다 — 크론은 실패하는데 화면에는 아무 흔적이
 * 없다. 회원이 "안뜨는데? 제대로 하고 있는거 맞아?" 라고 물은 그 상태다.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` 은 **운영 도메인**이라 보호를 받지 않는다. 그걸 먼저 쓴다.
 */
export function baseUrlFor(env: Record<string, string | undefined>): string | null {
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (prod) return `https://${prod.replace(/^https?:\/\//, '')}`
  const explicit = env.NEXT_PUBLIC_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const dep = env.VERCEL_URL?.trim()
  if (dep) return `https://${dep.replace(/^https?:\/\//, '')}`
  return null
}

/**
 * 마지막 실행이 이만큼 오래됐으면 「멈췄다」고 본다.
 *
 * 하루로 잡으면 안 된다 — 크론은 새벽 5시에 도는데 회원이 새벽 3시에 화면을 열면 어제
 * 기록이 마지막이고, 그건 정상이다. 이틀이 비면 그때는 정말 안 돈 것이다.
 */
export const AUTO_DRAFT_STALE_DAYS = 2

/** YYYY-MM-DD 두 날 사이의 일수 (시간대에 흔들리지 않게 UTC 자정으로만 잰다) */
function daysBetween(from: string, to: string): number {
  const parse = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00.000Z`)
  const a = parse(from)
  const b = parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * 마지막 실행이 회원에게 알릴 만한 상태인가.
 *
 * ── 무엇을 알리고 무엇을 삼키나 ─────────────────────────────
 * **성공은 조용히 지나간다** — 초안이 화면에 뜨니까 그게 곧 알림이다.
 * **오늘 실패로 기록됐으면 알린다** — 회원은 글이 준비된 줄 알고 기다리게 된다.
 * **오늘 기록이 아직 없는 것은 알리지 않는다** — 크론 시각 전일 뿐인 경우가 대부분이고,
 * 그걸 매번 띄우면 하루의 대부분이 「아직 안 돌았습니다」로 덮인다. 처음 켠 날에도 마찬가지다.
 *
 * 대신 **기록이 끊긴 것**은 잡는다 — 마지막 실행이 이틀 넘게 전이면 크론이 멈춘 것이다.
 * (2026-08-23: 처음엔 「한 번도 안 돌았습니다」를 띄웠는데, 그건 방금 켠 것과 고장난 것을
 * 구별하지 못해 새로 만든 지점에서도 경고가 떴다.)
 */
export function autoDraftAlert(
  runs: { date: string; ok: boolean; error?: string }[] | undefined,
  today: string
): { level: 'warn' | 'bad'; text: string } | null {
  const list = runs ?? []
  const todays = list.filter((r) => r.date === today)
  if (todays.some((r) => r.ok)) return null
  const failed = todays.find((r) => !r.ok)
  if (failed) {
    return { level: 'bad', text: `오늘 자동 초안이 실패했습니다 — ${failed.error ?? '이유가 기록되지 않았습니다'}` }
  }
  const last = list
    .map((r) => (r.date ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop()
  if (!last) return null
  const days = daysBetween(last, today)
  if (days >= AUTO_DRAFT_STALE_DAYS) {
    return { level: 'warn', text: `자동 초안이 ${days}일째 돌지 않았습니다 (마지막 실행 ${last}).` }
  }
  return null
}

/**
 * 발행 관리 화면 맨 위에 한 줄로 보여줄 상태.
 *
 * 대시보드의 `autoDraftAlert` 와 **일부러 다르다**. 저기는 「알릴 만한 일이 있을 때만」
 * 끼어드는 자리라 조용해야 하고, 여기는 회원이 자동 초안을 보러 온 자리라 **아무 일도
 * 없어도 지금 상태를 말해줘야 한다** — 그게 없으면 "안뜨는데? 제대로 하고 있는거 맞아?"
 * 로 다시 돌아온다.
 */
export function autoDraftStatus(
  runs: { date: string; ok: boolean; error?: string; at?: string; manual?: boolean }[] | undefined,
  today: string,
  hasTodayDraft: boolean
): { level: 'good' | 'warn' | 'bad'; text: string; canRun: boolean } {
  const list = runs ?? []
  const todays = list.filter((r) => r.date === today)
  if (hasTodayDraft) {
    return { level: 'good', text: '오늘 초안이 준비됐습니다. 아래 목록 맨 위에 있습니다.', canRun: false }
  }
  const failed = todays.find((r) => !r.ok)
  if (failed) {
    return {
      level: 'bad',
      text: `오늘 실패했습니다 — ${failed.error ?? '이유가 기록되지 않았습니다'}`,
      canRun: true,
    }
  }
  const last = [...list].sort((a, b) => (a.at ?? a.date).localeCompare(b.at ?? b.date)).pop()
  if (!last) {
    return { level: 'warn', text: '아직 실행 기록이 없습니다. 매일 새벽 5시에 한 편씩 씁니다.', canRun: true }
  }
  const days = daysBetween(last.date, today)
  const when = days === 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전(${last.date})`
  return {
    level: days >= AUTO_DRAFT_STALE_DAYS ? 'warn' : 'good',
    text: `마지막 실행 ${when} · ${last.ok ? '성공' : '실패'}${last.manual ? ' (직접 실행)' : ''}. 오늘 몫은 새벽 5시에 씁니다.`,
    canRun: true,
  }
}

/** 그 글이 이 자동 초안 기능으로 쓰인 것인가 */
export function isAutoDraft(p: Pick<Post, 'auto'>): boolean {
  return p.auto === true
}

/** YYYY-MM-DD */
function day(iso?: string): string {
  return (iso ?? '').slice(0, 10)
}

/**
 * 오늘 몫이 이미 있나 — **크론이 두 번 불려도 하루 한 편**이다.
 *
 * Vercel 크론은 재시도가 있고, 회원이 화면에서 손으로 한 번 더 누를 수도 있다. 그때마다
 * 한 편씩 더 쌓이면 하루에 세 편이 생긴다 — 발행 간격이 무너지고, 같은 날 비슷한 글이
 * 여러 편이면 유사문서로 묶인다.
 */
export function hasTodayAutoDraft(posts: Post[] | undefined, today: string): boolean {
  return (posts ?? []).some((p) => isAutoDraft(p) && day(p.createdAt) === day(today))
}

/**
 * 무엇을 쓸 차례인가 — **가장 오래 안 쓴 (키워드 × 주제) 조합**을 고른다.
 *
 * ── 왜 조합으로 도는가 ──────────────────────────────────────
 * 키워드만 돌리면 4개짜리 목록이 나흘에 한 바퀴다. 같은 키워드로 나흘마다 쓰면 글이 서로
 * 닮고, 그건 유사문서로 묶이는 지름길이다. 주제까지 곱하면 키워드 4개 × 주제 10개 = 40일
 * 이라, 같은 조합이 다시 오기 전에 한 달이 지난다.
 *
 * ── 최근에 쓴 주제는 한 번 더 피한다 ────────────────────────
 * 조합이 달라도 **주제가 같으면 본문이 닮는다** (키워드는 제목·인사에만 들어간다). 그래서
 * 최근 글에 쓴 주제는 뒤로 미룬다. 다 걸리면(주제 수보다 최근 글이 많으면) 그때는 가장
 * 오래된 것을 쓴다 — 못 쓰는 것보다 낫다.
 */
export function pickAssignment(args: {
  posts: Post[] | undefined
  keywords: string[]
  topics?: string[]
  /** 이만큼 안에 쓴 주제는 피한다 */
  avoidRecent?: number
}): Assignment | null {
  const keywords = args.keywords.map((k) => k.trim()).filter(Boolean)
  const topics = (args.topics ?? INFO_TOPICS).map((t) => t.trim()).filter(Boolean)
  if (!keywords.length || !topics.length) return null

  /*
   * 정보글만 본다. 홍보글·후기글이 같은 키워드를 써도 본문이 전혀 다르므로 로테이션을
   * 흔들 이유가 없다.
   */
  const infoPosts = (args.posts ?? [])
    .filter((p) => p.type === 'info')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  /** 그 조합을 마지막으로 쓴 순서 (0 = 가장 최근). 안 썼으면 Infinity */
  const lastUsed = (kw: string, topic: string): number => {
    const i = infoPosts.findIndex((p) => p.mainKeyword === kw && p.autoTopic === topic)
    return i < 0 ? Infinity : i
  }
  /** 그 주제를 마지막으로 쓴 순서 — 키워드가 달라도 본문이 닮는다 */
  const topicLastUsed = (topic: string): number => {
    const i = infoPosts.findIndex((p) => p.autoTopic === topic)
    return i < 0 ? Infinity : i
  }

  const avoid = args.avoidRecent ?? Math.min(3, topics.length - 1)
  const pairs: { kw: string; topic: string; pairAge: number; topicAge: number }[] = []
  for (const kw of keywords) {
    for (const topic of topics) {
      pairs.push({ kw, topic, pairAge: lastUsed(kw, topic), topicAge: topicLastUsed(topic) })
    }
  }

  /*
   * 고르는 순서:
   *   ① 최근 `avoid` 편 안에 쓴 주제는 뒤로 (topicAge >= avoid 인 것을 먼저)
   *   ② 조합을 오래 안 쓴 순서 (pairAge 큰 것 먼저 — 안 쓴 것은 Infinity)
   *   ③ 주제를 오래 안 쓴 순서
   *   ④ 그래도 같으면 목록 순서 (같은 입력이면 늘 같은 답이 나오게)
   */
  const fresh = (p: (typeof pairs)[number]) => (p.topicAge >= avoid ? 0 : 1)
  pairs.sort(
    (a, b) =>
      fresh(a) - fresh(b) ||
      b.pairAge - a.pairAge ||
      b.topicAge - a.topicAge ||
      keywords.indexOf(a.kw) - keywords.indexOf(b.kw) ||
      topics.indexOf(a.topic) - topics.indexOf(b.topic)
  )

  const best = pairs[0]
  const never = best.pairAge === Infinity
  return {
    mainKeyword: best.kw,
    topic: best.topic,
    why: never
      ? `아직 안 쓴 조합입니다 (「${best.kw}」 × 「${best.topic}」).`
      : `이 조합을 가장 오래 안 썼습니다 — 정보글 ${best.pairAge + 1}편 전.`,
  }
}

/**
 * 회원이 정해 둔 계획을 **믿을 수 있는 모양으로** 맞춘다.
 *
 * 화면에서 온 값을 그대로 저장하면 빈 문자열·중복·공백만 있는 줄이 섞인다. 그게 그대로
 * 크론까지 가면 「키워드가 없습니다」로 실패하거나, 같은 키워드가 두 번 들어가 로테이션이
 * 한쪽으로 쏠린다. **들어오는 자리에서 한 번만** 정리한다.
 */
export function normalizePlan(raw: AutoDraftPlan | undefined): AutoDraftPlan {
  const list = (v: unknown): string[] => {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of v) {
      const t = typeof x === 'string' ? x.trim() : ''
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
    return out
  }
  return {
    off: raw?.off === true,
    keywords: list(raw?.keywords),
    topics: list(raw?.topics),
    updatedAt: raw?.updatedAt,
  }
}

/** 계획에서 「무엇을 쓸 차례인가」까지 — 크론이 부르는 한 곳 */
export function planAssignment(args: {
  plan: AutoDraftPlan | undefined
  posts: Post[] | undefined
  /** 계획에 키워드가 없을 때 쓸 것 (순위 추적 → 지점 지역 키워드) */
  fallbackKeywords: string[]
}): Assignment | null {
  const plan = normalizePlan(args.plan)
  if (plan.off) return null

  const keywords = plan.keywords?.length ? plan.keywords : args.fallbackKeywords
  const topics = plan.topics?.length ? plan.topics : INFO_TOPICS
  return pickAssignment({ posts: args.posts, keywords, topics })
}

/**
 * 계획을 화면에 한 줄로 — 「지금 무엇으로 쓰이고 있나」.
 *
 * 설정 화면을 열어 체크박스를 세어 보지 않아도 알 수 있어야 한다.
 */
export function planSummary(plan: AutoDraftPlan | undefined): string {
  const p = normalizePlan(plan)
  if (p.off) return '자동 초안을 꺼두셨습니다.'
  const parts: string[] = []
  parts.push(p.keywords?.length ? `키워드 ${p.keywords.length}개 지정` : '키워드는 순위 추적 목록 전부')
  parts.push(p.topics?.length ? `주제 ${p.topics.length}개 지정` : `주제는 기본 ${INFO_TOPICS.length}개 전부`)
  return parts.join(' · ')
}

/**
 * 초안이 쓸 만한가 — **점수로 거르지 않는다.**
 *
 * 발행선(85)에 못 미쳐도 지우지 않고 남긴다. 이유는 둘이다:
 *   ① 지워 버리면 회원이 **무엇이 왜 모자랐는지** 볼 기회가 없다. 검수 항목이 그걸 알려주는
 *      화면이 이미 있고, 고쳐 쓰기 버튼도 거기 있다.
 *   ② 자동으로 지우면 「오늘은 왜 글이 없지」가 된다. 조용히 아무 일도 안 한 것처럼 보인다.
 *
 * 대신 **화면에서 눈에 띄게** 한다 — 아래 `draftNote` 가 그 한 줄을 만든다.
 */
export function draftNote(score: number, threshold: number): { level: 'good' | 'warn'; text: string } {
  return score >= threshold
    ? { level: 'good', text: `${score}점 — 발행선(${threshold}) 넘었습니다. 사진 넣고 올리시면 됩니다.` }
    : {
        level: 'warn',
        text: `${score}점 — 발행선(${threshold})에 못 미칩니다. 검수 항목을 보고 「고쳐 쓰기」를 한 번 눌러 보세요.`,
      }
}
