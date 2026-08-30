import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { poolStoredRuns } from '@/lib/analysis/factors'
import { AiError, aiStatus, askLlm, canSearchWeb, extractJson } from '@/lib/ai/llm'
import { buildFixPrompt, buildSystemPrompt, buildTitlePrompt, buildUserPrompt } from '@/lib/ai/prompt'
import { PUBLISH_THRESHOLD, SPECS, checkPost, summarize } from '@/lib/writing/checker'
import { arenaOf } from '@/lib/writing/arena'
import { activeRules } from '@/lib/naver/notice'
import { adviseRotation } from '@/lib/writing/rotation'
import { fixList } from '@/lib/writing/next-action'
import type { PostType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * 출력 토큰 한도.
 *
 * **16,000 에서 8,192 로 되돌렸다.** 잘림을 줄이려고 올렸는데(#92), 올린 직후부터
 * 「글 생성 응답을 읽지 못했습니다」가 났다. 모델·게이트웨이마다 출력 한도가 다르고
 * 한도를 넘겨 요청하면 200 에 빈 내용으로 돌아오는 경우가 있어, 시점이 겹치는 값을
 * 먼저 원복한다. 잘림 자체는 repairJson·salvageFields 가 이미 건져낸다.
 *
 * 환경변수로 올릴 수 있게 뒀다 — 모델이 더 긴 출력을 지원하는 걸 확인했으면
 * AI_MAX_TOKENS 로 올리면 된다.
 */
const WRITE_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 8192) || 8192

const TYPES: PostType[] = ['promo', 'info', 'review']

interface Draft {
  title: string
  body: string
  tags: string[]
}

function asDraft(v: unknown): Draft | null {
  const o = v as { title?: unknown; body?: unknown; tags?: unknown }
  if (!o || typeof o.title !== 'string' || typeof o.body !== 'string') return null
  /*
   * **`#` 를 떼서 받는다** (2026-08-26 회원 지적: "태그 아직도 이렇게 나와 — 하나씩 인식이
   * 안된단말이야", 화면 캡처는 `#쌍용동헬스장,MTO피트니…`).
   *
   * 모델이 태그를 `#쌍용동헬스장` 꼴로 돌려줄 때가 있다. 그러면 글쓰기 화면의 태그 칸에
   * `#쌍용동헬스장, #MTO피트니스 쌍용점, …` 이 그대로 뜨고, 회원이 **그 줄을 통째로 복사해**
   * 네이버 태그 칸에 붙이면 태그 하나로 뭉친다. 들어오는 자리에서 한 번만 뗀다.
   */
  const tags = Array.isArray(o.tags)
    ? o.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.replace(/^#+/, '').trim())
        .filter(Boolean)
    : []
  return { title: o.title.trim(), body: o.body.trim(), tags }
}

/**
 * 글 본문 생성.
 *
 * 생성만 하고 끝내지 않는다 — 앱의 검수기로 점수를 매겨, 발행 기준(85점) 아래면
 * 걸린 항목을 그대로 알려주고 한 번 더 고치게 한다. 두 번째도 기준에 못 미치면
 * 그대로 내려주되 무엇이 남았는지 함께 보낸다 (사용자가 손으로 마무리할 수 있게).
 */
export async function POST(req: Request) {
  /*
   * **어떤 실패도 JSON 으로 나가야 한다.**
   *
   * 예전에는 키 확인이 try 밖에 있어서 그 단계에서 던지면 플랫폼의 HTML 오류 페이지가
   * 나갔고, 화면에는 「응답을 읽지 못했습니다」만 떴다. 이제 전 구간을 감싼다 —
   * JSON 이 아닌 응답은 「플랫폼이 끊었다」는 뜻으로만 남게 해서 원인 구별이 되게 한다.
   *
   * 단계마다 로그를 남긴다. Vercel Logs 에서 어디까지 갔는지 바로 보인다.
   */
  const t0 = Date.now()
  const ms = () => `${Date.now() - t0}ms`
  try {
    return await handle(req, ms)
  } catch (e) {
    console.error('[write] 처리하지 못한 오류', ms(), e)
    const status = e instanceof AiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '글 생성 중 오류가 발생했습니다.', at: ms() },
      { status }
    )
  }
}

async function handle(req: Request, ms: () => string) {
  const ai = aiStatus()
  if (!ai.ready) {
    return NextResponse.json(
      {
        error:
          'AI 글쓰기를 쓰려면 AI 키를 환경변수에 넣어야 합니다. Anthropic·OpenAI·Gemini·CLOVA 중 가지고 계신 것 하나면 됩니다 — 「휴대폰에서 쓰기 · 배포」 화면의 안내를 보세요.',
        needKey: true,
      },
      { status: 400 }
    )
  }

  try {
    const body = (await req.json()) as {
      type?: string
      storeId?: string
      mainKeyword?: string
      subKeywords?: string[]
      localKeyword?: string
      eventText?: string
      promoNote?: string
      infoTopic?: string
      request?: string
      sponsorship?: 'own' | 'sponsored' | 'unset'
      prescription?: string[]
      /**
       * 유사성 방지 로테이션 — 화면에서 고른 값.
       *
       * **여태 안 넘어오고 있었다** (2026-08-11). 회원 지적: "후기글 거의 처음이 등록
       * 망설인 이유로 시작하고 있어." 화면에 「도입 유형」 칸이 있고 최근에 안 쓴 것을
       * 권하기까지 했는데, 그 값을 글에 저장만 하고 여기로는 보내지 않았다.
       */
      introType?: string
      angle?: string
      format?: string
      topicGroup?: string
      /**
       * 이미 받은 초안 — 있으면 **고쳐 쓰기만** 한다.
       *
       * 예전에는 한 요청에서 두 번 썼다 (쓰고 → 검수해서 85점 미만이면 다시 쓰기).
       * 2,000자 글 하나에 40~90초가 걸리니 합치면 1~3분인데, Vercel 함수 실행 한도를
       * 넘기면 응답이 아예 안 온다 — 회원 화면에는 2~3분 기다린 뒤 정체불명의 오류만
       * 뜬다. 그래서 **두 번을 두 요청으로 나눴다.** 각 호출이 짧아 한도에 안 걸린다.
       */
      draft?: { title?: unknown; body?: unknown; tags?: unknown }
      issues?: string[]
    }

    const type = TYPES.includes(body.type as PostType) ? (body.type as PostType) : 'promo'
    const mainKeyword = body.mainKeyword?.trim()
    if (!mainKeyword) {
      return NextResponse.json({ error: '메인 키워드를 먼저 넣어주세요.' }, { status: 400 })
    }

    const db = await readDB()
    const evidence = poolStoredRuns(db.factorRuns)
    const store = db.stores.find((s) => s.id === body.storeId)
    /*
     * **정보글은 지점 없이 쓴다** (2026-08-27 회원 요청: "정보성글에는 구지 지점정보가
     * 필요하지 않을것 같아").
     *
     * 08-27 에 화자가 일반 블로거가 되면서 지점에서 오던 값이 지시문에서 전부 빠졌다 —
     * 상호명·표시 이름·위치·24시간·시설·강점·전화번호. 그러니 정보글에는 지점을 요구할
     * 이유가 없다. 여기서 계속 막으면 화면에서 칸을 없애도 **생성 버튼이 400 으로 죽는다**
     * (한쪽만 고친 것 — 이 저장소가 반복해서 겪은 실패다).
     *
     * 홍보글·후기글은 그대로 막는다. 그 글들은 상호명·시설·위치가 본문의 뼈대라 지점 없이
     * 쓰면 빈칸투성이가 된다.
     */
    if (!store && body.type !== 'info') {
      return NextResponse.json({ error: '지점을 먼저 골라주세요.' }, { status: 400 })
    }

    /*
     * 최근 글 — 도입·앵글·키워드가 겹치지 않게 참고 자료로 넘긴다.
     *
     * 예전에는 **같은 지점 것만** 봤다. 그래서 지점만 바꿔 같은 글을 쓰면 AI 도 그 사실을
     * 몰랐다 (실측 90.4% 겹침). 이제 다른 지점 글도 함께 넘긴다 — 우리 블로그에서 이미
     * 쓴 도입·앵글이면 지점이 달라도 다시 쓰면 안 된다.
     */
    const recent = db.posts
      .filter((p) => p.body.trim())
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, 5)
      .map((p) => ({
        type: p.type,
        title: p.title,
        mainKeyword: p.mainKeyword,
        introType: p.introType,
        angle: p.angle,
        storeName: db.stores.find((s) => s.id === p.storeId)?.name,
      }))

    /*
     * **비어 있으면 여기서 정한다.**
     *
     * 화면의 「도입 유형」 칸은 회원이 손대지 않으면 빈 값이다. 그 상태로 넘기면 예전과
     * 똑같아진다 — 지정이 없으니 모델이 매번 같은 도입을 쓴다. 그래서 안 골랐으면
     * **최근에 안 쓴 것을 서버가 고른다** (rotation.ts 가 그 계산을 이미 한다).
     * 회원이 고른 값이 있으면 그게 이긴다.
     */
    // 정보글은 지점이 없다 — rotation 이 그때는 블로그 전체(발행 완료)를 본다 (2026-08-27)
    const rotation = adviseRotation(db.posts, store?.id ?? '', type, store, body.request?.trim())

    /*
     * 경쟁 수준은 **서버가 저장된 측정에서 찾는다** (화면이 보내는 값을 쓰지 않는다).
     *
     * 회원 질문 (2026-08-20): "경쟁 높은 키워드용 글쓰기 도구가 있는거야?" 없었다. 매일 도는
     * 「지금 뚫릴 만한 키워드」가 발행량을 이미 재두고 있었는데 글쓰기가 그 값을 안 봤다.
     * 잰 적 없는 키워드는 값이 없고, 그러면 판 형태 지시가 아예 안 붙는다.
     */
    const lastOpening = (db.openingRuns ?? []).slice(-1)[0] ?? null
    const flat = (v: string) => v.replace(/\s+/g, '')
    const openingRow = (lastOpening?.rows ?? []).find((r) => flat(r.keyword) === flat(mainKeyword))
    const arena = openingRow ? arenaOf({ recent30: openingRow.recent30 }) : undefined

    const request = {
      type,
      store,
      mainKeyword,
      arena,
      // 네이버 공지에서 회원이 읽고 적어둔 규칙 (자동으로 만들지 않는다)
      noticeRules: activeRules(db.noticeItems),
      introType: body.introType?.trim() || rotation.introType,
      angle: body.angle?.trim() || rotation.angle,
      format: body.format?.trim() || rotation.format,
      topicGroup: body.topicGroup?.trim() || rotation.topicGroup,
      subKeywords: (body.subKeywords ?? []).filter(Boolean),
      localKeyword: body.localKeyword?.trim() || undefined,
      eventText: body.eventText?.trim() || undefined,
      promoNote: body.promoNote?.trim() || undefined,
      infoTopic: body.infoTopic?.trim() || undefined,
      request: body.request?.trim() || undefined,
      sponsorship: body.sponsorship,
      recent,
      prescription: body.prescription,
      /*
       * 정보글은 **자료를 직접 찾아** 인용한다 (회원 지적: "내가 자료를 찾으면 안 되고 너가
       * 알아서 자료를 찾아서 작성해줘야지"). 키가 검색을 못 하면 인용하지 않게 지시가 바뀐다.
       */
      canSearch: type === 'info' && canSearchWeb(),
    }

    const system = buildSystemPrompt(type)
    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: buildUserPrompt(request) },
    ]

    const check = (d: Draft) =>
      checkPost({
        type,
        title: d.title,
        body: d.body,
        mainKeyword,
        arena: arena?.level,
        subKeywords: request.subKeywords,
        localKeyword: request.localKeyword,
        tags: d.tags,
        legalName: store?.legalName,
        womenOnly: store?.womenOnly,
        sponsorship: body.sponsorship ?? 'unset',
        eventText: request.eventText,
        promoNote: request.promoNote,
        /*
         * **요청을 검수에도 넘긴다** (2026-08-19). 넘기지 않으면 `request-coverage` 가 아예
         * 돌지 않는다 — 회원이 "요청사항이 거의 반영되지 않았어"라고 한 그 검사다.
         */
        request: request.request,
        placeReviews: store?.placeReviews,
        placeId: store?.placeId,
        // AI 가 스스로 고칠 때도 같은 근거로 채점한다 — 화면 점수와 다르면 안 된다
        evidence,
      })

    /*
     * 고쳐 쓰기 요청이면 여기서 끝난다 — 한 번만 부르고 돌려준다.
     * 나빠졌으면 받은 초안을 그대로 유지한다 (고치라고 불렀다가 더 나빠지면 손해다).
     */
    const prior = asDraft(body.draft)
    if (prior) {
      const priorResult = check(prior)
      messages.push({ role: 'assistant', content: JSON.stringify(prior) })
      messages.push({
        role: 'user',
        content: buildFixPrompt(
          (body.issues ?? []).slice(0, 20),
          priorResult.stats.charCount,
          SPECS[type]
        ),
      })
      console.log('[write] 고쳐 쓰기 시작', ms())
      const fixed = asDraft(extractJson(await askLlm(system, messages, WRITE_MAX_TOKENS)))
      console.log('[write] 고쳐 쓰기 끝', ms(), fixed ? '성공' : '파싱 실패')
      const fixedResult = fixed ? check(fixed) : null
      /*
       * **「나아졌나」를 점수로만 판단하면 안 된다** (2026-08-10).
       *
       * 점수는 「수정필요」가 하나라도 있으면 79점으로 상한이 걸린다 (checkPost 의 캡).
       * 그래서 고쳐 쓰기가 수정필요를 2개 → 1개로 줄여도 점수는 79 → 79 그대로다.
       * 채택 조건이 `새 점수 > 옛 점수` 였으니 **개선된 글이 매번 버려졌다** — 회원 화면에
       * 「고쳐 써도 나아지지 않아 원래 글을 두었습니다」가 계속 뜬 이유가 이것이다.
       *
       * 이제 **수정필요 개수를 먼저 보고**, 같을 때만 점수로 가른다. 수정필요가 0이 되는
       * 순간 캡이 풀려서 점수가 제대로 올라간다.
       */
      const priorFails = summarize(priorResult).fail

      /*
       * **제목과 본문을 따로 채점해서 좋은 쪽을 섞는다** (2026-08-11).
       *
       * 회원 지적: "제목에 홍보 내용이 안 들어갈 때가 있어." 여기에 구멍이 있었다 —
       * 고쳐 쓰기가 **제목은 고쳤는데 본문에서 다른 항목을 깨뜨리면** 수정필요 개수가
       * 그대로여서 새 글이 통째로 버려졌다. 고쳐진 제목까지 같이 버려진 것이다.
       *
       * 제목과 본문은 **다른 칸**이다. 그래서 네 후보를 다 채점하고 가장 좋은 것을 고른다:
       *   옛 제목+옛 본문 · 새 제목+새 본문 · **새 제목+옛 본문** · 옛 제목+새 본문
       * 섞은 것도 그대로 채점하므로(제목+본문을 함께 보는 항목이 있다) 섞어서 나빠지면
       * 안 고른다 — 「좋아 보이는 조합」을 짐작하지 않고 재서 고른다.
       */
      const candidates: { label: string; draft: Draft }[] = [{ label: '원래 글', draft: prior }]
      if (fixed) {
        candidates.push({ label: '고친 글', draft: fixed })
        if (fixed.title !== prior.title) {
          candidates.push({ label: '고친 제목 + 원래 본문', draft: { ...prior, title: fixed.title } })
        }
        if (fixed.body !== prior.body) {
          candidates.push({ label: '원래 제목 + 고친 본문', draft: { ...fixed, title: prior.title } })
        }
      }
      const scored = candidates.map((c) => {
        const r = check(c.draft)
        return { ...c, result: r, fails: summarize(r).fail }
      })
      // 수정필요가 적은 쪽을 먼저, 같으면 점수가 높은 쪽. 동점이면 앞에 온 것(=원래 글)을 둔다
      const best = scored.reduce((a, b) => (b.fails < a.fails || (b.fails === a.fails && b.result.score > a.result.score) ? b : a))
      console.log(
        '[write] 고쳐 쓰기 판정',
        scored.map((c) => `${c.label} 수정필요 ${c.fails}·${c.result.score}점`).join(' / '),
        `→ ${best.label}`
      )
      let picked = best
      /*
       * **제목이 아직 걸려 있으면 제목만 놓고 한 번 더 묻는다** (2026-08-11).
       *
       * 회원 지적: "제목에 홍보 내용이 안 들어갈 때가 있어. 확실히 수정해줘." 본문까지 함께
       * 고치는 요청에서는 모델이 할 일이 많아 제목 한 줄을 흘린다. 한 줄만 물으면 값이
       * 싸고(수백 토큰) 다른 것을 깨뜨릴 위험도 없다.
       *
       * **받은 제목도 채점해서 나아졌을 때만 쓴다** — 홍보를 넣으려고 키워드를 밀어내거나
       * 길이를 넘기면 그건 고친 것이 아니다.
       */
      const titleStuck = (r: ReturnType<typeof check>) =>
        r.items.filter((i) => i.level === 'fail' && i.id.startsWith('title'))
      const stuck = titleStuck(picked.result)
      if (stuck.length) {
        console.log('[write] 제목만 다시 쓰기 시작', ms(), stuck.map((i) => i.label).join('/'))
        const askTitle = await askLlm(
          system,
          [
            { role: 'user', content: buildUserPrompt(request) },
            { role: 'assistant', content: JSON.stringify(picked.draft) },
            {
              role: 'user',
              content: buildTitlePrompt(
                picked.draft.title,
                stuck.map((i) => `${i.label}: 지금 ${i.value} / 기준 ${i.target}`),
                { mainKeyword, eventText: request.eventText, type }
              ),
            },
          ],
          // 제목 한 줄이라 넉넉히 줘도 400 토큰이면 충분하다
          400
        ).catch((e) => {
          console.error('[write] 제목만 다시 쓰기 실패', ms(), e)
          return ''
        })
        const newTitle = ((extractJson(askTitle) as { title?: unknown } | null)?.title ?? '') as string
        if (typeof newTitle === 'string' && newTitle.trim() && newTitle.trim() !== picked.draft.title) {
          const cand = { ...picked.draft, title: newTitle.trim() }
          const r = check(cand)
          const fewer = titleStuck(r).length < stuck.length
          const notWorse = summarize(r).fail <= picked.fails
          console.log(
            '[write] 제목만 다시 쓰기 끝',
            ms(),
            `「${newTitle.trim()}」 제목 수정필요 ${stuck.length}→${titleStuck(r).length} · 전체 ${picked.fails}→${summarize(r).fail}`,
            fewer && notWorse ? '채택' : '버림'
          )
          if (fewer && notWorse) picked = { label: '제목만 다시 쓴 글', draft: cand, result: r, fails: summarize(r).fail }
        }
      }

      const fixedFails = fixedResult ? summarize(fixedResult).fail : Number.POSITIVE_INFINITY
      const better = picked.draft !== prior
      /*
       * **왜 원래 글을 두었는지 밝힌다** (2026-08-30 회원: "그래서 왜 안고치는거야?").
       *
       * 화면은 여태 「고쳐 써도 나아지지 않아 원래 글을 두었습니다」 한 마디만 했다. 그런데
       * 그 한 마디가 서로 다른 세 가지를 덮고 있었다:
       *   ① 모델 응답을 못 읽었다 (JSON 이 깨졌거나 잘렸다) — 나아지고 말고의 문제가 아니다
       *   ② 모델이 같은 글을 그대로 돌려줬다 — 지시문이 안 먹은 것이다
       *   ③ 고친 글이 채점에서 졌다 — 고치다가 다른 것을 깼다는 뜻이다
       * 셋은 회원이 할 일이 다르다. 실제로 프로덕션에서 네 번을 돌려도 안 고쳐졌는데, 그
       * 한 마디로는 셋 중 무엇인지 알 길이 없어 원인을 짚는 데만 다섯 번을 불러야 했다.
       */
      const fixWhy = better
        ? undefined
        : !fixed
          ? '모델 응답을 읽지 못했습니다 (잘렸거나 형식이 깨졌습니다)'
          : fixed.body === prior.body && fixed.title === prior.title
            ? '모델이 같은 글을 그대로 돌려줬습니다'
            : `고친 글이 채점에서 졌습니다 (${scored.map((c) => `${c.label} ${c.fails}·${c.result.score}점`).join(' / ')})`
      const out = picked.draft
      const outResult = picked.result
      return NextResponse.json({
        draft: out,
        revised: Boolean(better),
        improved: better ? outResult.score - priorResult.score : 0,
        /*
         * **수정필요 개수를 함께 돌려준다** (2026-08-10).
         *
         * 점수는 수정필요가 남아 있으면 79점에 붙어 있어서, 2개 → 1개로 줄어도 화면에는
         * 아무 변화가 없어 보인다. 회원이 「반영이 안 된다」고 한 이유가 이것이다.
         * 실제로 무엇이 줄었는지 숫자로 말해준다.
         */
        failsBefore: priorFails,
        failsAfter: Number.isFinite(fixedFails) ? fixedFails : priorFails,
        /** 원래 글을 둔 이유 — 고쳤으면 없다 (2026-08-30) */
        fixWhy,
        /** 모델이 돌려준 본문 길이. 원래보다 크게 짧으면 잘린 것이다 */
        fixChars: fixed ? fixed.body.length : 0,
        provider: ai.label,
        check: {
          score: outResult.score,
          ...summarize(outResult),
          issues: outResult.items
            .filter((i) => i.level !== 'pass')
            .map((i) => ({ id: i.id, level: i.level, label: i.label, value: i.value, target: i.target })),
        },
        fixIssues: fixList(outResult.items, outResult.risks),
      })
    }

    // 문단을 12개 이상으로 쪼개게 한 뒤 본문이 길어졌다 — 기본 8192 로는 잘릴 수 있다
    console.log('[write] 초안 생성 시작', ms())
    const draft = asDraft(extractJson(await askLlm(system, messages, WRITE_MAX_TOKENS, request.canSearch)))
    console.log('[write] 초안 생성 끝', ms(), draft ? `본문 ${draft.body.length}자` : '파싱 실패')
    if (!draft) {
      return NextResponse.json({ error: '글 형식을 읽지 못했습니다. 다시 시도해 주세요.' }, { status: 502 })
    }
    const result = check(draft)

    return NextResponse.json({
      draft,
      revised: false,
      /** 85점 미만이면 앱이 「고쳐 쓰기」 버튼을 띄운다 (두 번째 호출) */
      needsRevise: result.score < PUBLISH_THRESHOLD,
      /*
       * **분량이 기준 미만이면 앱이 곧바로 고쳐 쓰기를 한 번 돌린다.**
       *
       * 회원 지적: "글이 882자만 나와. 최소 1,500자는 나와야 하고." 기준이 1,700자인데
       * 절반쯤 왔다. 이건 다듬을 문제가 아니라 **생성이 실패한 것**이라 버튼을 기다릴 일이
       * 아니다. 그래서 숫자를 함께 내려보내 앱이 스스로 한 번 더 부르게 한다 (한 번만).
       */
      charCount: result.stats.charCount,
      charMin: SPECS[type].charMin,
      /*
       * **무엇으로 썼는지 되돌려준다.**
       *
       * 이게 없으면 로테이션이 한 자리에서 멈춘다 — 서버가 「③ 비교형」을 골라 써도 글에는
       * 도입 유형이 빈 값으로 저장되고, 다음 글에서 「최근에 안 쓴 것」을 다시 계산하면
       * 또 「③ 비교형」이 나온다. 도입이 매번 같아지는 것을 막으려면 **쓴 것을 기록**해야 한다.
       */
      rotation: {
        introType: request.introType,
        angle: request.angle,
        format: request.format,
        topicGroup: request.topicGroup,
      },
      fixIssues: fixList(result.items, result.risks),
      provider: ai.label,
      // 자료를 찾아 인용했는지 — 화면에서 회원에게 밝힌다 (못 찾는 키도 있다)
      searched: request.canSearch === true,
      check: {
        score: result.score,
        ...summarize(result),
        issues: result.items
          .filter((i) => i.level !== 'pass')
          .map((i) => ({ id: i.id, level: i.level, label: i.label, value: i.value, target: i.target })),
      },
    })
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '글 생성 중 오류가 발생했습니다.' },
      { status }
    )
  }
}
