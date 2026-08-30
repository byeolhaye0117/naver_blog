import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { newId } from '@/lib/id'
import { doneForToday, perDayOf, planAssignment, todayAutoDraftCount, writesEveryDay } from '@/lib/writing/autodraft'
import { AUTO_DRAFT_RUNS_KEEP, baseUrlFor, seoulToday, shouldRevise } from '@/lib/writing/autodraft'
import { isPrescriptionStale, prescriptionForType, prescriptionKey } from '@/lib/analysis/prescription'
import type { AutoDraftRun, Post } from '@/lib/types'

export const dynamic = 'force-dynamic'
/*
 * 글 한 편은 AI 호출 한 번 + (걸리면) 고쳐 쓰기 한 번이다. 손으로 눌렀을 때 2~4분이
 * 걸리므로 /api/write 와 같은 상한을 준다.
 */
export const maxDuration = 300

/**
 * **글쓰기 라우트가 돌려주는 모양.** 여기를 틀리면 아무 소리 없이 아무것도 안 만들어진다.
 *
 * 2026-08-23 에 정확히 그랬다 — 이 크론이 최상위 `body` 를 읽었는데 실제 응답은
 * `{ draft: { title, body, tags }, ... }` 였다. 파싱은 성공하고 그 값만 undefined 라
 * 「글을 쓰지 못했습니다」로 조용히 끝났다. **주소 문제보다 이게 먼저였다** — 주소를
 * 고쳤어도 한 편도 안 나왔을 것이다.
 *
 * 라우트끼리의 약속은 타입 검사가 못 잡는다 (fetch 는 그냥 any 다). 그래서
 * scripts/checks.mjs [96] 이 두 파일의 글자를 맞대어 본다.
 */
interface WriteReply {
  draft?: { title?: string; body?: string; tags?: string[] }
  /** `fail` 은 남은 수정필요 개수 — 점수만으로는 「79점」이 두 가지를 뜻해서 구별이 안 된다 */
  check?: { score?: number; fail?: number }
  /** 무엇으로 썼는지 — 유사성 방지 3축. 저장해야 다음 글이 다른 조합을 고른다 */
  rotation?: { introType?: string; angle?: string; format?: string; topicGroup?: string }
  /** 85점 미만 — 부르는 쪽이 초안을 들고 한 번 더 불러야 한다 */
  needsRevise?: boolean
  charCount?: number
  charMin?: number
  /** 고쳐 쓰기에 그대로 넘길 항목 목록 */
  fixIssues?: string[]
  error?: string
}

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
  /*
   * **한국 날짜로 적는다** (2026-08-26). 이 크론은 20:00 UTC 에 도는데 한국에서는 다음 날
   * 새벽 5시다 — UTC 로 적으면 회원 화면의 날짜가 매일 하루씩 밀린다.
   */
  const today = seoulToday()

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
  /*
   * **한국 날짜로 적는다** (2026-08-26). 이 크론은 20:00 UTC 에 도는데 한국에서는 다음 날
   * 새벽 5시다 — UTC 로 적으면 회원 화면의 날짜가 매일 하루씩 밀린다.
   */
  const today = seoulToday()
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

  /*
   * **하루 몇 편까지** (2026-08-28 회원 요청: "하루에 여러편 작성할 수 있게해줘").
   *
   * 크론은 새벽 5·6·7시에 세 번 돌고 **한 번에 한 편**만 쓴다. 한 편에 생성 1회 + 고쳐 쓰기
   * 최대 3회가 들고 함수 실행 한도가 300초라, 한 번에 몰아 쓰면 한도를 넘겨 **아무것도
   * 저장되지 않는다.** 그래서 실행을 나누고, 각 실행이 그 날 이미 쓴 편수를 세어 회원이 정한
   * 편수에 닿았으면 그냥 넘어간다.
   *
   * 크론 재시도·손으로 한 번 더 누르기도 같은 셈으로 막힌다.
   */
  const perDay = perDayOf(db.autoDraftPlan)
  if (doneForToday(db.posts, today, db.autoDraftPlan)) {
    return NextResponse.json({
      skipped: `오늘 몫 ${perDay}편을 이미 썼습니다.`,
      date: today,
      wrote: todayAutoDraftCount(db.posts, today),
      perDay,
    })
  }

  /*
   * 지점은 **키워드 풀을 고를 때만** 쓴다 (2026-08-28). 글에는 안 들어가므로 없어도
   * 쓸 수 있다 — 순위 추적 키워드가 있으면 그것으로 돈다. 아래에서 풀이 비었을 때만 막는다.
   */
  const store = db.stores?.[0]

  /*
   * 키워드는 **순위 추적에 등록한 것**을 쓴다. 회원이 「이걸로 올라가고 싶다」고 직접 적어둔
   * 목록이라, 자동으로 쓰는 글이 그 목록을 벗어나지 않는다. 비어 있으면 지점의 지역
   * 키워드로 넘어간다.
   */
  const keywords = (db.rankTargets ?? []).map((t) => t.keyword).filter(Boolean)
  const pool = keywords.length ? keywords : (store?.localKeywords ?? [])
  if (!pool.length) {
    await record({ ok: false, error: '쓸 키워드가 없습니다. 순위 추적에 키워드를 등록하거나 지점에 지역 키워드를 넣어주세요.' })
    return NextResponse.json({ skipped: '쓸 키워드가 없습니다.' })
  }

  /*
   * **회원이 정해 둔 것이 먼저다** (2026-08-23 요청: "그거 주제랑 키워드 내가 원하는걸로
   * 선택해서 하고 싶어"). 예약해 둔 순서가 있으면 그것부터, 없으면 고른 범위 안에서
   * 로테이션, 아무것도 안 정했으면 여태처럼 순위 추적 키워드 전부를 돈다.
   */
  if (db.autoDraftPlan?.off) {
    return NextResponse.json({ skipped: '자동 초안을 꺼두셨습니다.', date: today })
  }
  /*
   * **건너뛰기로 정해둔 날은 실패가 아니다** (2026-08-24). 회원이 일부러 뺀 날이므로
   * 실패로 기록하면 화면에 빨간 줄이 뜨고, 「자동 초안이 실패했습니다」 알림까지 나간다.
   */
  if (db.autoDraftPlan?.skip?.includes(today)) {
    return NextResponse.json({ skipped: '이 날은 건너뛰기로 정해두셨습니다.', date: today })
  }
  // 그 날에 콕 집어 정해둔 것이 있으면 그것부터 (2026-08-24)
  const assignment = planAssignment({ plan: db.autoDraftPlan, posts: db.posts, date: today })
  if (!assignment) {
    /*
     * **왜 안 썼는지 갈라서 적는다** (2026-08-31 회원 지적: "애초에 그날 하루 주제
     * 설정한건데 멋대로 다음날 까지 간게 이상한거 아니야?").
     *
     * 정한 날에만 쓰기로 한 뒤로는 「그 날 몫이 없어서 안 썼다」가 **정상**이다. 그런데
     * 예전 문구 하나로 다 덮으면 화면에 「쓸 키워드가 없습니다」라는 빨간 실패가 매일
     * 뜬다 — 잘 돌고 있는데 고장난 것처럼 보인다.
     */
    const planned = !writesEveryDay(db.autoDraftPlan)
    const reason = planned
      ? '이 날 몫으로 채워 둔 주제가 없습니다. ③ 날짜별 주제에서 이 날을 채우시거나, 「매일 쓰기」로 바꾸시면 됩니다.'
      : '쓸 키워드가 없습니다. 순위 추적에 키워드를 등록하거나 자동 초안 설정에서 키워드를 골라주세요.'
    // 정한 날이 아닌 것은 실패가 아니다 — 기록을 실패로 남기면 알림이 매일 울린다
    if (!planned) await record({ ok: false, error: reason })
    return NextResponse.json({ skipped: reason, date: today })
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
  /*
   * **시간 재기는 상위노출 분석부터 센다** (2026-08-28). 분석에 30초쯤 걸리는데 그것을
   * 안 세면 고쳐 쓰기 예산(REVISE_TIME_BUDGET_MS)이 그만큼 넘쳐서 함수 실행 한도(300초)를
   * 넘길 수 있다 — 그러면 **아무것도 저장되지 않는다.** 분석에 쓴 시간만큼 고쳐 쓰기가
   * 줄어드는 것이 맞다.
   */
  const askedAt = Date.now()

  /*
   * ─── 상위노출 분석을 하고 쓴다 (2026-08-28 회원 지적) ─────────────────
   *
   * 회원: "자동작성하는게 관련키워드 상위노출 분석을 안하고 작성하는거 같아."
   *
   * 맞다. 손으로 쓰는 화면은 처방을 지시문에 함께 넣는데(app/write/Editor.tsx 의
   * `prescription`), **크론은 그 자리를 비워 보내고 있었다.** 같은 앱인데 새벽에 쓴 글만
   * 그 판의 실측 없이 나갔다 — 제목 길이도, 분량도, 이미지 수도 전부 일반 기준으로.
   *
   * ── 저장된 것이 있으면 그것부터 ──────────────────────────
   * 처방은 키워드당 하나가 저장돼 있고(`db.prescriptions`) 화면도 그것을 쓴다. 아직
   * 싱싱하면 다시 재지 않는다 — 조회를 아끼고, 화면과 크론이 **같은 처방**을 쓰게 된다.
   *
   * 없거나 오래됐으면 그 자리에서 분석한다 (`POST /api/serp` — 그 라우트가 재고 저장까지
   * 한다). 분석이 실패해도 **글은 쓴다** — 처방 없이 쓰는 것이 안 쓰는 것보다 낫다.
   */
  const rxKeyword = assignment.mainKeyword
  const rxKey = prescriptionKey(rxKeyword)
  const storedRx = (db.prescriptions ?? []).find((p) => p.key === rxKey)
  let prescription: string[] | undefined =
    storedRx && !isPrescriptionStale(storedRx.date) ? storedRx.items : undefined
  let rxNote = prescription ? `저장된 처방 사용 (${storedRx?.date})` : ''
  if (!prescription) {
    try {
      const res = await fetch(`${base}/api/serp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
        },
        body: JSON.stringify({ keyword: rxKeyword }),
      })
      const data = (await res.json().catch(() => null)) as
        | { analysis?: { prescription?: string[]; mock?: boolean } }
        | null
      const items = data?.analysis?.prescription
      if (res.ok && items?.length && !data?.analysis?.mock) {
        prescription = items
        rxNote = `상위노출 분석 ${items.length}개`
      } else {
        rxNote = '상위노출 분석을 못 했습니다 (처방 없이 씁니다)'
      }
    } catch {
      rxNote = '상위노출 분석에 실패했습니다 (처방 없이 씁니다)'
    }
  }
  /*
   * **글 유형에 맞게 거른다.** 처방에는 「방문 후기 형태로 맞붙어라」처럼 후기글에게 할
   * 말이 섞여 있다 — 정보글에 그대로 넣으면 검수의 화자 항목과 부딪힌다.
   */
  const rxForInfo = prescription ? prescriptionForType(prescription, 'info') : undefined
  console.log('[cron/draft] 상위노출 분석', rxNote, `${Date.now() - askedAt}ms`)
  const ask = async (extra: Record<string, unknown> = {}) => {
    const started = Date.now()
    const res = await fetch(`${base}/api/write`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
      },
      body: JSON.stringify({
        type: 'info',
        /*
         * **지점을 넘기지 않는다** (2026-08-28 회원 요청: "자동완성되는것도 적용해줘").
         *
         * 손으로 쓰는 화면은 08-27 에 정보글에서 지점 칸을 없앴는데(회원 요청 "정보성글에는
         * 구지 지점정보가 필요하지 않을것 같아") **새벽 크론만 예전처럼 지점을 실어 보내고
         * 있었다.** 그러면 같은 정보글인데 손으로 쓴 것은 지점이 없고 자동으로 쓴 것은
         * 지점이 붙어, 발행 관리·로테이션에서 두 갈래로 갈린다.
         *
         * 지점은 여기서 **키워드 풀을 고를 때만** 쓴다 (아래 pool) — 그건 글에 들어가는
         * 값이 아니라 무엇으로 쓸지 정하는 값이다.
         */
        storeId: '',
        /*
         * **메인은 정보성 키워드, 지역 키워드는 조연** (2026-08-27 회원 결정).
         * 여태 이 자리에 지역 키워드가 들어가서 제목이 「쌍용동헬스장 벌크업식단…」으로
         * 나갔다 — 정보글로 신뢰도를 쌓겠다면서 매출 키워드를 앞세운 셈이었다.
         */
        mainKeyword: assignment.mainKeyword,
        localKeyword: assignment.localKeyword,
        subKeywords: [],
        infoTopic: assignment.topic,
        // 상위노출 분석 처방 — 이게 빠지면 그 판의 실측이 글에 반영되지 않는다 (2026-08-28)
        prescription: rxForInfo?.length ? rxForInfo : undefined,
        ...extra,
      }),
    })
    const raw = await res.text()
    const data = (() => {
      try {
        return JSON.parse(raw) as WriteReply
      } catch {
        return null
      }
    })()
    return { res, raw, data, ms: Date.now() - started }
  }

  const first = await ask()

  if (!first.res.ok || !first.data?.draft?.body) {
    /*
     * JSON 이 아니면 앞부분을 그대로 남긴다 — 배포 보호에 막히면 로그인 HTML 이 오는데,
     * 「글을 쓰지 못했습니다」만 남기면 그게 무엇 때문인지 영영 모른다.
     */
    const error =
      first.data?.error ??
      (first.data
        ? `글을 쓰지 못했습니다 (응답에 draft.body 가 없습니다) — ${first.raw.slice(0, 160)}`
        : `JSON 이 아닌 응답 (상태 ${first.res.status}) — ${first.raw.slice(0, 160)}`)
    await record({ ok: false, keyword: assignment.localKeyword, topic: assignment.topic, error, rx: rxNote })
    return NextResponse.json({ error, assignment, status: first.res.status }, { status: 502 })
  }

  /*
   * **모자라면 한 번 고쳐 쓴다** — 화면이 하는 것과 같다 (app/write/Editor.tsx).
   *
   * /api/write 는 일부러 한 요청에 한 번만 쓴다 (두 번 쓰면 함수 실행 한도를 넘긴다).
   * 그래서 「85점 미만」·「분량 미달」이면 **부르는 쪽이** 초안과 걸린 항목을 들고 한 번 더
   * 부르게 돼 있다. 크론이 그걸 안 하면 손으로 쓴 글보다 늘 한 단계 나쁜 초안이 쌓인다.
   *
   * 두 번째가 실패하면 첫 번째 것을 그대로 쓴다 — 못 쓴 것보다 낫고, 화면에서 「고쳐 쓰기」를
   * 다시 누를 수 있다.
   */
  let best = first.data
  let lastCallMs = first.ms
  let improved = true
  let rounds = 0
  const failsOf = (r: WriteReply) => r.check?.fail ?? (r.needsRevise ? 1 : 0)
  const shortOf = (r: WriteReply) => (r.charCount ?? 0) < (r.charMin ?? 0)

  while (
    shouldRevise({
      round: rounds,
      needsRevise: best.needsRevise === true,
      short: shortOf(best),
      elapsedMs: Date.now() - askedAt,
      lastCallMs,
      improved,
    })
  ) {
    const next = await ask({ draft: best.draft, issues: best.fixIssues ?? [] })
    rounds++
    lastCallMs = next.ms
    if (!next.res.ok || !next.data?.draft?.body) {
      console.warn('[draft] 고쳐 쓰기 실패 — 지금 초안을 그대로 저장한다', next.raw.slice(0, 160))
      break
    }
    /*
     * **나아졌는지는 수정필요 개수로 본다.** 점수는 수정필요가 하나만 있어도 79점에 붙어
     * 있어서, 2개 → 1개로 줄어도 점수만 보면 제자리로 보인다 (/api/write 의 같은 주석).
     */
    const before = failsOf(best)
    const after = failsOf(next.data)
    improved = after < before || (after === before && (next.data.check?.score ?? 0) > (best.check?.score ?? 0))
    // 나빠졌으면 /api/write 가 이미 원래 것을 돌려준다 — 여기서는 받은 것을 그대로 든다
    best = { ...next.data, rotation: first.data.rotation }
    console.log('[draft] 고쳐 쓰기', rounds, `수정필요 ${before} → ${after}`, `${next.data.check?.score ?? '?'}점`)
  }

  const now = new Date().toISOString()
  const post: Post = {
    id: newId('post'),
    type: 'info',
    status: 'draft',
    // 정보글에는 지점이 없다 (2026-08-27~28) — 손으로 쓴 글과 같은 모양으로 저장한다
    storeId: '',
    title: best.draft?.title ?? '',
    body: best.draft?.body ?? '',
    mainKeyword: assignment.mainKeyword,
    localKeyword: assignment.localKeyword,
    subKeywords: [],
    tags: best.draft?.tags ?? [],
    /*
     * **유사성 3축은 /api/write 가 고른 것을 그대로 저장한다.** 안 저장하면 다음 글에서
     * 「최근에 안 쓴 것」을 다시 계산할 때 빈 값만 보이고, 도입·형식·소재가 매번 같아진다
     * (lib/ai/prompt.ts 의 rotation 주석 — 손으로 쓸 때 이미 겪은 일이다).
     */
    introType: best.rotation?.introType,
    angle: best.rotation?.angle,
    format: best.rotation?.format,
    topicGroup: best.rotation?.topicGroup,
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
    keyword: assignment.localKeyword,
    topic: assignment.topic,
    postId: post.id,
    score: best.check?.score ?? null,
    // 아침에 손댈 것이 있는지를 화면이 그대로 말할 수 있게 남긴다 (2026-08-26)
    fails: best.check?.fail,
    rounds,
    // 분석하고 썼는지 화면이 그대로 말할 수 있게 (2026-08-28)
    rx: rxNote,
  })

  return NextResponse.json({
    saved: post.id,
    rx: rxNote,
    date: today,
    keyword: assignment.localKeyword,
    topic: assignment.topic,
    why: assignment.why,
    score: best.check?.score ?? null,
    fails: best.check?.fail,
    rounds,
  })
}
