import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { newId } from '@/lib/id'
import { hasTodayAutoDraft, pickAssignment } from '@/lib/writing/autodraft'
import { AUTO_DRAFT_RUNS_KEEP, baseUrlFor } from '@/lib/writing/autodraft'
import type { AutoDraftRun, Post } from '@/lib/types'

export const dynamic = 'force-dynamic'
/*
 * 글 한 편은 AI 호출 한 번 + (걸리면) 고쳐 쓰기 한 번이다. 손으로 눌렀을 때 2~4분이
 * 걸리므로 /api/write 와 같은 상한을 준다.
 */
export const maxDuration = 300

/**
 * **정보글 초안을 매일 한 편 써 둔다** (2026-08-21, 회원 요청).
 *
 * ── 왜 /api/write 를 다시 부르나 ─────────────────────────────
 * 글쓰기 절차는 이미 한 곳에 있다 — 지시문 만들기 · AI 호출 · 검수 · 고쳐 쓰기 · 제목과
 * 본문을 따로 채점해 좋은 쪽 고르기. 그걸 여기 옮겨 적으면 **두 벌이 되고 한쪽만 고치는
 * 날이 온다.** 이 저장소에서 이번 주에만 여섯 번 그랬다.
 *
 * 그래서 크론은 **무엇을 쓸지 정해서 넘기고 결과를 저장하는 일만** 한다. 함수 호출이 한 번
 * 더 생기는 값은 치르더라도, 글쓰기 규칙이 한 곳에만 있는 편이 낫다.
 *
 * ── 자동으로 발행하지 않는다 ────────────────────────────────
 * 네이버 블로그 글쓰기 API 는 없어졌고, 로그인해서 대신 올리는 방식은 자동화 도구로 취급돼
 * 계정이 위험해진다. 이 앱은 회원 계정으로 글을 올리지 않는다 — 초안까지가 자동이다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const t0 = Date.now()
  const today = new Date().toISOString().slice(0, 10)

  /*
   * **성공이든 실패든 남긴다** (2026-08-23). 회원: "안뜨는데? 제대로 하고 있는거 맞아?"
   * 그때 이 크론만 아무 흔적이 없어서 「실패했나 안 돌았나」를 구별할 수 없었다.
   * 조용히 실패하는 자동화는 없는 것보다 나쁘다 — 회원은 글이 준비된 줄 알고 기다린다.
   */
  const record = async (run: Omit<AutoDraftRun, 'date' | 'at' | 'ms'>) => {
    const entry: AutoDraftRun = { ...run, date: today, at: new Date().toISOString(), ms: Date.now() - t0 }
    await mutate((d) => {
      d.autoDraftRuns = [entry, ...(d.autoDraftRuns ?? [])].slice(0, AUTO_DRAFT_RUNS_KEEP)
    })
    return entry
  }

  try {
    return await run(today, record)
  } catch (e) {
    const error = e instanceof Error ? e.message : '알 수 없는 오류'
    console.error('[draft] 실패', error)
    await record({ ok: false, error })
    return NextResponse.json({ error }, { status: 500 })
  }
}

/**
 * **손으로 지금 한 편** — 화면의 「지금 한 편 쓰기」 버튼이 부른다.
 *
 * 크론이 실패한 날 회원이 할 수 있는 일이 있어야 한다. 화면에 「실패했습니다」만 뜨고
 * 다음 날까지 기다리라고 하면 그건 알림이 아니라 통보다.
 *
 * **비밀값을 요구하지 않는다.** 크론용 GET 과 달리 이건 회원이 브라우저에서 누르는 것이고,
 * 이 앱의 다른 글쓰기 경로(/api/write)도 같은 자리에서 열려 있다 — 여기만 잠가도 막히는
 * 것이 없다. 대신 **하루 한 편 제한은 그대로 걸린다** (아래 run 안의 검사).
 */
export async function POST(req: Request) {
  const t0 = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const record = async (r: Omit<AutoDraftRun, 'date' | 'at' | 'ms'>) => {
    const entry: AutoDraftRun = { ...r, date: today, at: new Date().toISOString(), ms: Date.now() - t0, manual: true }
    await mutate((d) => {
      d.autoDraftRuns = [entry, ...(d.autoDraftRuns ?? [])].slice(0, AUTO_DRAFT_RUNS_KEEP)
    })
    return entry
  }
  try {
    /*
     * 회원이 브라우저에서 누른 것이므로 **주소를 이미 알고 있다.** 환경변수가 없는 곳
     * (로컬·미리보기)에서도 손으로는 돌아야 하니 요청이 온 주소를 예비로 넘긴다.
     */
    return await run(today, record, new URL(req.url).origin)
  } catch (e) {
    const error = e instanceof Error ? e.message : '알 수 없는 오류'
    console.error('[draft] 손으로 실행 실패', error)
    await record({ ok: false, error })
    return NextResponse.json({ error }, { status: 500 })
  }
}

async function run(
  today: string,
  record: (run: Omit<AutoDraftRun, 'date' | 'at' | 'ms'>) => Promise<AutoDraftRun>,
  fallbackBase?: string
) {
  const db = await readDB()

  // 크론 재시도·손으로 한 번 더 누르기 — 어느 쪽이든 하루 한 편이다
  if (hasTodayAutoDraft(db.posts, today)) {
    return NextResponse.json({ skipped: '오늘 자동 초안이 이미 있습니다.', date: today })
  }

  const store = db.stores?.[0]
  if (!store) {
    await record({ ok: false, error: '지점이 없습니다. 지점을 먼저 등록해주세요.' })
    return NextResponse.json({ skipped: '지점이 없습니다.' })
  }

  /*
   * 키워드는 **순위 추적에 등록한 것**을 쓴다. 회원이 「이걸로 올라가고 싶다」고 직접 적어둔
   * 목록이라, 자동으로 쓰는 글이 그 목록을 벗어나지 않는다. 비어 있으면 지점의 지역
   * 키워드로 넘어간다.
   */
  const keywords = (db.rankTargets ?? []).map((t) => t.keyword).filter(Boolean)
  const pool = keywords.length ? keywords : (store.localKeywords ?? [])
  const assignment = pickAssignment({ posts: db.posts, keywords: pool })
  if (!assignment) {
    await record({ ok: false, error: '쓸 키워드가 없습니다. 순위 추적에 키워드를 등록해주세요.' })
    return NextResponse.json({ skipped: '쓸 키워드가 없습니다.' })
  }

  const base = baseUrlFor(process.env) ?? fallbackBase
  if (!base) {
    await record({ ok: false, error: '배포 주소를 찾지 못했습니다 (VERCEL_PROJECT_PRODUCTION_URL·VERCEL_URL).' })
    return NextResponse.json({ error: '배포 주소를 찾지 못했습니다.' }, { status: 500 })
  }

  /*
   * **배포 보호(Deployment Protection)에 막히면 여기서 죽는다.** 그때 Vercel 은 로그인
   * 페이지를 돌려주므로 JSON 파싱이 실패하고, 예전에는 그게 조용한 실패가 됐다.
   * 우회 비밀값이 있으면 함께 보내고, 없으면 아래에서 「무엇이 돌아왔는지」를 기록에 남긴다.
   */
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  const res = await fetch(`${base}/api/write`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
    body: JSON.stringify({
      type: 'info',
      storeId: store.id,
      mainKeyword: assignment.mainKeyword,
      subKeywords: [],
      infoTopic: assignment.topic,
    }),
  })

  const raw = await res.text()
  const data = (() => {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })() as
    | {
        title?: string
        body?: string
        tags?: string[]
        check?: { score?: number }
        /** 무엇으로 썼는지 — 유사성 방지 3축. 저장해야 다음 글이 다른 조합을 고른다 */
        rotation?: { introType?: string; angle?: string; format?: string; topicGroup?: string }
        error?: string
      }
    | null

  if (!res.ok || !data?.body) {
    /*
     * JSON 이 아니면 앞부분을 그대로 남긴다 — 배포 보호에 막히면 로그인 HTML 이 오는데,
     * 「글을 쓰지 못했습니다」만 남기면 그게 무엇 때문인지 영영 모른다.
     */
    const error =
      data?.error ??
      (data ? '글을 쓰지 못했습니다.' : `JSON 이 아닌 응답 (상태 ${res.status}) — ${raw.slice(0, 160)}`)
    await record({ ok: false, keyword: assignment.mainKeyword, topic: assignment.topic, error })
    return NextResponse.json({ error, assignment, status: res.status }, { status: 502 })
  }

  const now = new Date().toISOString()
  const post: Post = {
    id: newId('post'),
    type: 'info',
    status: 'draft',
    storeId: store.id,
    title: data.title ?? '',
    body: data.body,
    mainKeyword: assignment.mainKeyword,
    subKeywords: [],
    tags: data.tags ?? [],
    /*
     * **유사성 3축은 /api/write 가 고른 것을 그대로 저장한다.** 안 저장하면 다음 글에서
     * 「최근에 안 쓴 것」을 다시 계산할 때 빈 값만 보이고, 도입·형식·소재가 매번 같아진다
     * (lib/ai/prompt.ts 의 rotation 주석 — 손으로 쓸 때 이미 겪은 일이다).
     */
    introType: data.rotation?.introType,
    angle: data.rotation?.angle,
    format: data.rotation?.format,
    topicGroup: data.rotation?.topicGroup,
    // 자동 초안은 자기 칸에 남긴다 — 위 3축을 건드리지 않는다
    auto: true,
    autoTopic: assignment.topic,
    createdAt: now,
    updatedAt: now,
  }
  await mutate((d) => {
    d.posts.unshift(post)
  })

  await record({
    ok: true,
    keyword: assignment.mainKeyword,
    topic: assignment.topic,
    postId: post.id,
    score: data.check?.score ?? null,
  })

  return NextResponse.json({
    saved: post.id,
    date: today,
    keyword: assignment.mainKeyword,
    topic: assignment.topic,
    why: assignment.why,
    score: data.check?.score ?? null,
  })
}
