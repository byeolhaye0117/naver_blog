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
 * ── 검수까지 마치고 저장한다 (2026-08-26 회원 요청) ────────────
 *
 * "새벽에 자동 글 작성하는거 검수까지 마칠 수 있게 해줘."
 *
 * 여태 고쳐 쓰기를 **딱 한 번**만 돌렸다. 한 번에 다 안 고쳐지면 수정필요가 남은 채로
 * 79점짜리 초안이 저장되고, 아침에 회원이 손으로 「고쳐 쓰기」를 눌러야 했다 — 자동으로
 * 해두는 값이 절반만 나온 셈이다.
 *
 * 이제 **나아지는 동안은 계속 돌린다.** 다만 세 가지 울타리를 친다:
 *   ① 횟수 — AI 호출은 값이 든다. 세 번이면 대개 붙는다 (한 번에 79 → 95 가 나온 실측).
 *   ② 시간 — 함수 실행 한도(maxDuration 300초)를 넘기면 **아무것도 저장되지 않는다.**
 *      79점짜리라도 저장하는 편이 낫다. 그래서 다음 호출이 한도를 넘길 것 같으면 멈춘다.
 *   ③ 나아짐 — 안 나아지는데 또 부르면 값만 나간다. 한 번 제자리면 그만둔다.
 */
export const REVISE_MAX_ROUNDS = 3
/** 이 시간을 넘겨서까지 한 번 더 부르지 않는다 (maxDuration 300초 — 저장할 여유를 남긴다) */
export const REVISE_TIME_BUDGET_MS = 235_000

/**
 * 고쳐 쓰기를 **한 번 더 돌릴까**.
 *
 * 라우트 안에 두면 테스트가 못 읽는다. 「한 번 더 부를까」는 틀리면 매일 도는 자동화가
 * 통째로 죽는(시간 초과) 종류의 판단이라 여기 둔다.
 */
export function shouldRevise(args: {
  /** 이미 돈 고쳐 쓰기 횟수 (첫 판단 때는 0) */
  round: number
  /** 아직 발행선(85) 아래인가 */
  needsRevise: boolean
  /** 분량이 기준 미만인가 */
  short: boolean
  /** 이 실행이 시작한 뒤 흐른 시간 */
  elapsedMs: number
  /** 방금 부른 호출이 걸린 시간 — 다음 호출도 이만큼 걸린다고 본다 */
  lastCallMs: number
  /** 직전 고쳐 쓰기가 실제로 나아졌나 (첫 판단 때는 true) */
  improved: boolean
}): boolean {
  if (!args.needsRevise && !args.short) return false
  if (args.round >= REVISE_MAX_ROUNDS) return false
  // 제자리면 그만둔다 — 같은 것을 또 물어도 같은 답이 온다
  if (args.round > 0 && !args.improved) return false
  /*
   * 다음 호출도 방금만큼 걸린다고 보고, 넉넉히 잡아 한도를 넘길 것 같으면 멈춘다.
   * 여기서 욕심내면 함수가 통째로 죽어서 **글이 하나도 안 남는다.**
   */
  return args.elapsedMs + args.lastCallMs * 1.2 < REVISE_TIME_BUDGET_MS
}

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
 * ── 날짜는 **한국 시간**으로 센다 (2026-08-26 회원 지적) ────────
 *
 * "8/26일이면 채워두신 앞날이 아니라 이미 쓰여진게 정상인거 아니야?"
 *
 * 맞다. 오늘 아침에 글이 나왔는데 목록에는 **08/25 로** 적혀 있었고, 08/26 은 「앞날」에
 * 있었다. 날짜를 UTC 로 셌기 때문이다.
 *
 * 크론은 20:00 UTC 에 돈다 — 한국에서는 **다음 날 새벽 5시**다. 그래서 「8월 26일 새벽에
 * 쓴 글」이 UTC 로는 8월 25일이 된다. 하루씩 밀린 목록을 회원이 매일 보게 되는 셈이다.
 *
 * 이 앱은 천안에서 쓰는 앱이고 회원이 말하는 「오늘」은 한국 시간의 오늘이다. 자동 초안이
 * 쓰는 날짜(실행 기록·채워 둔 날·쉬는 날·오늘 것이 있나)는 전부 이걸로 센다.
 *
 * 한국은 서머타임이 없어 고정 +9 로 맞다.
 */
export const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

/** 그 순간이 한국에서 몇 월 며칠인가 (YYYY-MM-DD). 읽을 수 없으면 빈 문자열 */
export function seoulDay(at: string | number | Date | undefined): string {
  if (at === undefined || at === null || at === '') return ''
  const ms = typeof at === 'number' ? at : Date.parse(String(at instanceof Date ? at.toISOString() : at))
  if (!Number.isFinite(ms)) return ''
  return new Date(ms + SEOUL_OFFSET_MS).toISOString().slice(0, 10)
}

/** 지금 한국에서 몇 월 며칠인가 */
export function seoulToday(now: number = Date.now()): string {
  return seoulDay(now)
}

/**
 * 오늘 몫이 이미 있나 — **크론이 두 번 불려도 하루 한 편**이다.
 *
 * Vercel 크론은 재시도가 있고, 회원이 화면에서 손으로 한 번 더 누를 수도 있다. 그때마다
 * 한 편씩 더 쌓이면 하루에 세 편이 생긴다 — 발행 간격이 무너지고, 같은 날 비슷한 글이
 * 여러 편이면 유사문서로 묶인다.
 */
export function hasTodayAutoDraft(posts: Post[] | undefined, today: string): boolean {
  /*
   * **글이 만들어진 시각을 한국 시간으로 본다** (2026-08-26). `createdAt` 은 UTC 라
   * 새벽 5시(=20:00 UTC 전날)에 쓴 글은 UTC 날짜가 하루 이르다. 그대로 비교하면 「오늘
   * 것이 이미 있나」가 매일 틀리고, 하루에 두 편이 쓰인다.
   */
  return (posts ?? []).some((p) => isAutoDraft(p) && seoulDay(p.createdAt) === day(today))
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
  const skip = [
    ...new Set(
      (Array.isArray(raw?.skip) ? raw.skip : [])
        .map((d) => (typeof d === 'string' ? d.slice(0, 10) : ''))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    ),
  ].sort()

  /*
   * 날짜별 주제 — 날짜 꼴이 아니거나 주제가 빈 줄은 버린다. 같은 날이 둘이면 뒤엣것을
   * 남긴다 (나중에 채운 것). **키워드는 받지 않는다** — 그건 ①에서 고른 범위에서 돈다.
   */
  const byDate = new Map<string, { date: string; topic: string }>()
  for (const d of Array.isArray(raw?.days) ? raw.days : []) {
    const date = (d?.date ?? '').slice(0, 10)
    const topic = (d?.topic ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !topic) continue
    byDate.set(date, { date, topic })
  }

  return {
    off: raw?.off === true,
    keywords: list(raw?.keywords),
    topics: list(raw?.topics),
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    skip,
    updatedAt: raw?.updatedAt,
  }
}

/** 계획에서 「무엇을 쓸 차례인가」까지 — 크론이 부르는 한 곳 */
export function planAssignment(args: {
  plan: AutoDraftPlan | undefined
  posts: Post[] | undefined
  /** 계획에 키워드가 없을 때 쓸 것 (순위 추적 → 지점 지역 키워드) */
  fallbackKeywords: string[]
  /** 어느 날 몫인가 — 쉬는 날인지, 그 날 주제가 정해져 있는지를 이걸로 본다 */
  date?: string
}): Assignment | null {
  const plan = normalizePlan(args.plan)
  if (plan.off) return null

  /*
   * **쉬기로 한 날은 아무것도 쓰지 않는다** (회원 요청: 날짜별 목록에 "삭제기능 만들어줘").
   * 정해둔 주제보다 먼저 본다 — 「정했다가 나중에 뺐다」가 자연스러운 순서다.
   */
  const wantDate = args.date?.slice(0, 10)
  if (wantDate && plan.skip?.includes(wantDate)) return null

  const keywords = plan.keywords?.length ? plan.keywords : args.fallbackKeywords
  const topics = plan.topics?.length ? plan.topics : INFO_TOPICS
  const rotated = pickAssignment({ posts: args.posts, keywords, topics })

  /*
   * **그 날 몫으로 채워 둔 주제가 있으면 그것을 쓴다** (2026-08-25 회원 요청).
   *
   * 회원: "지금 저장된 설정에서 날짜가 있어서 같은 주제로 매일 돌지 않게 해줘야해."
   *
   * 다만 그 주제를 **회원이 고른 것이 아니다** — 날짜만 고르면 `fillDays` 가 로테이션을
   * 돌려 날마다 다른 주제를 채워 넣는다. 키워드는 여기서도 로테이션이 고른다.
   */
  const fixed = wantDate ? plan.days?.find((d) => d.date === wantDate) : undefined
  if (fixed) {
    /*
     * **주제를 회원이 정했으면 키워드는 「가장 오래 안 쓴 것」으로 고른다** (2026-08-26).
     *
     * 조합 로테이션(pickAssignment)의 답을 그대로 쓰면 안 된다. 그건 (키워드 × 주제)를
     * 보는데 주제가 이미 정해져 있으면 그 축이 죽어서 **같은 키워드가 계속 나온다** —
     * 사흘을 채워 두고 미리 세어 보니 세 날 다 같은 키워드였다.
     *
     * 여기서는 축이 하나뿐이므로 키워드만 놓고 오래 안 쓴 순서로 고른다. 같으면 목록 순서
     * (같은 입력이면 늘 같은 답이 나오게 — 화면의 예상과 실제가 달라지면 안 된다).
     */
    const infoPosts = (args.posts ?? [])
      .filter((p) => p.type === 'info')
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const age = (kw: string) => {
      const i = infoPosts.findIndex((p) => p.mainKeyword === kw)
      return i < 0 ? Infinity : i
    }
    const pool = keywords.map((k) => k.trim()).filter(Boolean)
    const mainKeyword =
      [...pool].sort((a, b) => age(b) - age(a) || pool.indexOf(a) - pool.indexOf(b))[0] ??
      rotated?.mainKeyword
    if (!mainKeyword) return null
    return {
      mainKeyword,
      topic: fixed.topic,
      why: `${fixed.date} 몫으로 「${fixed.topic}」을 미리 채워 두었습니다.`,
    }
  }

  return rotated
}

/**
 * **날짜만 고르면 주제는 앱이 채운다** (2026-08-25 회원 요청).
 *
 * 회원이 두 번 말했다: "내가 주제 계속 확정하는거 아니라 했잖아" 그리고 "날짜 선택하는게
 * 있어야해." 둘을 같이 지키는 길은 하나다 — **날짜는 회원이, 주제는 앱이.**
 *
 * 로테이션을 앞으로 돌려 날마다 다른 주제를 뽑아 날짜에 붙인다. 이미 채워 둔 날은 **무시하고
 * 새로 계산한다** — 「다시 정하기」가 옛 값을 그대로 베끼면 눌러도 안 바뀐 것처럼 보인다.
 */
export function fillDays(args: {
  plan: AutoDraftPlan | undefined
  posts: Post[] | undefined
  fallbackKeywords: string[]
  /** 이 날짜부터 (YYYY-MM-DD) */
  from: string
  /** 며칠치 — 쉬는 날은 세지 않는다 */
  days: number
}): { date: string; topic: string }[] {
  const plan = { ...normalizePlan(args.plan), days: [] }
  return forecastAutoDrafts({ ...args, plan }).map((f) => ({ date: f.date, topic: f.topic }))
}

/**
 * 그 날 주제를 **다른 것으로 돌린다** — 회원이 고르는 것이 아니라 앱이 다음 것을 준다.
 *
 * 마음에 안 드는 날이 하나 있을 때 주제 목록을 열어 고르게 하면 결국 「주제 고르라고 나온다」로
 * 돌아간다. 그래서 버튼 하나로 **앱이 다음 주제**를 준다. 다른 날에 이미 쓰인 주제는 건너뛴다
 * — 안 그러면 돌릴 때마다 옆날과 겹친다.
 */
export function rerollTopic(plan: AutoDraftPlan | undefined, date: string): AutoDraftPlan {
  const p = normalizePlan(plan)
  const pool = p.topics?.length ? p.topics : INFO_TOPICS
  if (!pool.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return p
  const days = p.days ?? []
  const cur = days.find((d) => d.date === date)?.topic
  const used = new Set(days.filter((d) => d.date !== date).map((d) => d.topic))
  const start = cur ? pool.indexOf(cur) : -1
  // 목록을 한 바퀴 돌며 「지금 것도 아니고 다른 날에도 안 쓴」 첫 주제를 고른다
  let next = pool[(start + 1 + pool.length) % pool.length]
  for (let i = 1; i <= pool.length; i++) {
    const cand = pool[(start + i + pool.length) % pool.length]
    if (cand !== cur && !used.has(cand)) {
      next = cand
      break
    }
  }
  return {
    ...p,
    days: [...days.filter((d) => d.date !== date), { date, topic: next }].sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
  }
}

/**
 * 계획을 화면에 한 줄로 — 「지금 무엇으로 쓰이고 있나」.
 *
 * ── 개수만 세지 않는다 (2026-08-24) ─────────────────────────
 * 처음엔 「키워드 1개 지정 · 주제 1개 지정」이라고만 적었다. 회원이 그 줄을 보고 물었다:
 * "저장한 목록이 안나오는데?" **개수는 목록이 아니다** — 무엇을 저장했는지 확인하려면
 * 접힌 칸을 열어야 했다.
 *
 * 그래서 몇 개 안 될 때는 **이름을 그대로 적는다.** 많으면 앞의 둘만 적고 나머지는 개수로
 * 줄인다 (한 줄에 열 개를 늘어놓으면 그것도 못 읽는다).
 */
function few(list: string[] | undefined, whenEmpty: string, label: string): string {
  const items = (list ?? []).filter(Boolean)
  if (!items.length) return whenEmpty
  if (items.length <= 2) return `${label} ${items.join(' · ')}`
  return `${label} ${items.slice(0, 2).join(' · ')} 외 ${items.length - 2}개`
}

export function planSummary(plan: AutoDraftPlan | undefined): string {
  const p = normalizePlan(plan)
  if (p.off) return '자동 초안을 꺼두셨습니다.'
  const parts = [
    few(p.keywords, '키워드는 순위 추적 목록 전부', '키워드'),
    few(p.topics, `주제는 기본 ${INFO_TOPICS.length}개 전부`, '주제'),
  ]
  if (p.days?.length) parts.unshift(`날짜별 ${p.days.length}일 채워둠`)
  if (p.skip?.length) parts.unshift(`건너뛰는 날 ${p.skip.length}일`)
  return parts.join(' · ')
}

/**
 * **날짜별로 무엇을 쓰나** — 지난 것과 앞으로 쓸 것을 한 목록에.
 *
 * ── 회원 요청 (2026-08-24) ───────────────────────────────────
 * "이거는 매일 달라질거야 그래서 날짜별로 목록이 보이게 만들어달란 소리였어."
 *
 * 「지금 저장된 설정」은 **범위**만 말해준다 (키워드 3개 · 주제 5개). 그런데 실제로 쓰이는
 * 조합은 매일 달라진다 — 회원이 알고 싶은 것은 「그래서 내일은 뭘 쓰지」다.
 *
 * ── 앞날을 어떻게 아나 ──────────────────────────────────────
 * 고르는 규칙이 **정해져 있어서** 미리 계산할 수 있다 (같은 입력이면 같은 답이 나온다 —
 * pickAssignment 의 마지막 정렬 기준이 그것 때문에 있다). 하루치를 고른 뒤 그 글이 쓰인
 * 셈 치고 다음 날을 다시 고르면 된다.
 *
 * **예정은 예정일 뿐이다.** 그 사이에 손으로 정보글을 쓰거나 설정을 바꾸면 달라진다 —
 * 화면에 그렇게 적는다.
 */
export function forecastAutoDrafts(args: {
  plan: AutoDraftPlan | undefined
  posts: Post[] | undefined
  fallbackKeywords: string[]
  /** 이 날짜부터 (YYYY-MM-DD) */
  from: string
  days: number
}): { date: string; keyword: string; topic: string }[] {
  const plan = normalizePlan(args.plan)
  if (plan.off) return []
  const out: { date: string; keyword: string; topic: string }[] = []
  // 예정을 계산하는 동안만 쓰는 가짜 글 — 실제 저장소에는 넣지 않는다
  let posts = [...(args.posts ?? [])]
  const start = Date.parse(`${args.from.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(start)) return []

  /*
   * **건너뛴 날은 세지 않는다.** 이레를 보여달라고 했으면 「쓰는 날」 이레여야 한다 —
   * 건너뛴 날을 채워 넣으면 볼 수 있는 앞날이 그만큼 줄어든다. 대신 무한히 돌지 않게
   * 넉넉한 상한을 둔다.
   */
  const want = Math.max(0, Math.trunc(args.days))
  const MAX_LOOK = want + 60
  for (let i = 0; i < MAX_LOOK && out.length < want; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
    if (plan.skip?.includes(date)) continue
    const a = planAssignment({ plan, posts, fallbackKeywords: args.fallbackKeywords, date })
    if (!a) break
    out.push({ date, keyword: a.mainKeyword, topic: a.topic })
    posts = [
      {
        id: `forecast-${i}`,
        type: 'info',
        status: 'draft',
        storeId: '',
        title: '',
        body: '',
        mainKeyword: a.mainKeyword,
        subKeywords: [],
        tags: [],
        auto: true,
        autoTopic: a.topic,
        createdAt: `${date}T05:00:00.000Z`,
        updatedAt: `${date}T05:00:00.000Z`,
      },
      ...posts,
    ]
  }
  return out
}

/**
 * **회원이 채워 둔 날에 어떤 키워드가 나갈지** 미리 계산한다 (2026-08-26 회원 요청:
 * "키워드도 보이게 해줘").
 *
 * 키워드는 그 날 아침 로테이션이 고른다. 그렇다고 화면에 안 적으면 회원이 「무슨 키워드로
 * 나가지」를 알 방법이 없다 — **정해지는 규칙이 있으니 미리 셀 수 있다.** 같은 입력이면 같은
 * 답이 나오게 만들어 뒀다 (pickAssignment 의 마지막 정렬 기준이 그 때문에 있다).
 *
 * `forecastAutoDrafts` 와 다른 점: **앞날을 지어내지 않는다.** 회원이 채워 둔 날만 돌면서
 * 그 날 몫을 계산한다. 여러 날을 채워 뒀으면 앞의 날이 쓰인 셈 치고 다음 날을 계산해야
 * 키워드가 날마다 다르게 나온다 — 그래서 가짜 글을 쌓아가며 센다.
 *
 * **예상이다.** 그 사이에 손으로 정보글을 쓰거나 ① 키워드를 바꾸면 달라진다 — 화면이
 * 그렇게 적는다.
 */
export function plannedAssignments(args: {
  plan: AutoDraftPlan | undefined
  posts: Post[] | undefined
  fallbackKeywords: string[]
  /** 이 날짜부터 (지난 날짜로 채워 둔 것은 세지 않는다) */
  from: string
}): { date: string; topic: string; keyword?: string }[] {
  const plan = normalizePlan(args.plan)
  const days = (plan.days ?? [])
    .filter((d) => d.date >= args.from && !plan.skip?.includes(d.date))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (plan.off) return days
  let posts = [...(args.posts ?? [])]
  return days.map((d, i) => {
    const a = planAssignment({ plan, posts, fallbackKeywords: args.fallbackKeywords, date: d.date })
    if (!a) return d
    posts = [
      {
        id: `planned-${i}`,
        type: 'info',
        status: 'draft',
        storeId: '',
        title: '',
        body: '',
        mainKeyword: a.mainKeyword,
        subKeywords: [],
        tags: [],
        auto: true,
        autoTopic: a.topic,
        createdAt: `${d.date}T05:00:00.000Z`,
        updatedAt: `${d.date}T05:00:00.000Z`,
      },
      ...posts,
    ]
    return { date: d.date, topic: d.topic, keyword: a.mainKeyword }
  })
}

export interface AutoDraftDay {
  date: string
  /**
   * 그 날 쓴(쓸) 키워드.
   *
   * 지난 날은 실제로 쓴 것이고, **채워 둔 앞날은 예상**이다 (2026-08-26 회원 요청: "키워드도
   * 보이게 해줘"). 키워드는 그 날 아침 로테이션이 고르지만 규칙이 정해져 있어 미리 셀 수
   * 있다 — `plannedAssignments` 가 센다. 못 세면 없다.
   *
   * 예전에 앞날 전체를 계산해 그렸다가 「정하지도 않은 일정이 잡힌다」는 지적을 받았는데,
   * 그건 **날짜를 지어낸 것**이 문제였지 키워드를 센 것이 문제가 아니었다. 지금은 회원이
   * 채워 둔 날에만 붙인다.
   */
  keyword?: string
  topic: string
  /** 지난 날 · 오늘 · 앞으로 */
  when: 'past' | 'today' | 'upcoming'
  ok?: boolean
  error?: string
  score?: number | null
  postId?: string
  /** 손으로 눌러 돌린 것인가 */
  manual?: boolean
  /** 남은 수정필요 개수 — 0 이면 검수까지 마친 것이다 (2026-08-26) */
  fails?: number
  /** 고쳐 쓰기를 몇 번 돌렸나 */
  rounds?: number
}

/**
 * 실행 기록 + **회원이 채워 둔 앞날**을 한 목록으로 합친다.
 *
 * 두 목록을 따로 두면 회원이 「어제 건 어디 있지」를 두 번 찾는다. 최신이 위로 오게
 * (앞으로 쓸 것 → 오늘 → 지난 것) 두고, 지난 것에는 성공·실패와 점수를 붙인다.
 *
 * ── 앞날을 미리 계산하지 않는다 (2026-08-25) ────────────────
 * 회원: "내가 말했잖아 나는 하루씩만 설정하고 싶다고. 근데 왜 자꾸 그 후의 일정까지
 * 설정되게 하는거야!"
 *
 * 예전에는 로테이션을 앞으로 돌려 이레치를 그려 줬다. 「참고용 예정」이라고 적어 뒀지만
 * **화면에 줄로 서 있는 것은 정해진 일정으로 읽힌다.** 회원이 정한 적 없는 날이 다섯 줄
 * 잡혀 있으니 「하루만 정했는데 왜 다 정해졌냐」가 된 것이다.
 *
 * 그래서 앞날은 **회원이 채워 둔 날만** 보여준다. 안 채운 날은 화면에 없고, 그 날이 되면
 * 그날그날 앱이 골라 쓴다.
 */
export function autoDraftDays(args: {
  runs: { date: string; at?: string; ok: boolean; keyword?: string; topic?: string; error?: string; score?: number | null; postId?: string; manual?: boolean; fails?: number; rounds?: number }[] | undefined
  /** 회원이 채워 둔 앞날 — 계산한 예정이 아니다. 키워드는 예상값이 있으면 함께 온다 */
  planned: { date: string; topic: string; keyword?: string }[]
  today: string
  /** 지난 기록은 이만큼만 */
  pastKeep?: number
}): AutoDraftDay[] {
  const runs = [...(args.runs ?? [])]
  /*
   * **실행 시각(`at`)으로 한국 날짜를 다시 낸다** (2026-08-26).
   *
   * 회원: "8/26일이면 채워두신 앞날이 아니라 이미 쓰여진게 정상인거 아니야?"
   *
   * 예전 기록의 `date` 는 UTC 로 적혀 있어서, 새벽 5시에 쓴 글이 **하루 이른 날짜**로
   * 남아 있다. 저장된 값을 고치는 대신 `at`(정확한 시각)에서 한국 날짜를 다시 뽑는다 —
   * 데이터를 손대지 않고 지난 기록까지 제자리로 온다. `at` 이 없거나 이상하면 적힌 값을 쓴다.
   */
  const dayOf = (r: (typeof runs)[number]) => seoulDay(r.at) || r.date

  /*
   * 하루에 여러 번 돌 수 있다 (실패하고 손으로 다시 누르는 등). 그 날을 대표하는 것은
   * **성공한 실행**이다 — 실패만 있으면 그중 마지막 것을 쓴다.
   */
  const byDate = new Map<string, (typeof runs)[number]>()
  for (const r of runs) {
    const d = dayOf(r)
    const prev = byDate.get(d)
    if (!prev || (!prev.ok && r.ok)) byDate.set(d, r)
  }

  const past: AutoDraftDay[] = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, args.pastKeep ?? 14)
    .map(([date, r]): AutoDraftDay => ({
      date,
      keyword: r.keyword ?? '—',
      topic: r.topic ?? '—',
      when: date === args.today ? 'today' : 'past',
      ok: r.ok,
      error: r.error,
      score: r.score ?? null,
      postId: r.postId,
      manual: r.manual,
      fails: r.fails,
      rounds: r.rounds,
    }))

  /*
   * 이미 기록이 있는 날은 뺀다 (같은 날이 두 줄이면 어느 쪽이 맞는지 알 수 없다).
   * 지난 날짜로 채워 둔 것도 뺀다 — 이미 지나간 날을 「앞으로 쓸 것」이라고 할 수 없다.
   */
  const done = new Set(past.map((p) => p.date))
  const upcoming: AutoDraftDay[] = args.planned
    .filter((f) => !done.has(f.date) && f.date >= args.today)
    .map((f): AutoDraftDay => ({
      date: f.date,
      topic: f.topic,
      keyword: f.keyword,
      when: f.date === args.today ? 'today' : 'upcoming',
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return [...upcoming, ...past]
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
