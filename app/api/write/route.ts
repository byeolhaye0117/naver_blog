import { NextResponse } from 'next/server'
import { readDB } from '@/lib/store'
import { poolStoredRuns } from '@/lib/analysis/factors'
import { AiError, aiStatus, askLlm, canSearchWeb, extractJson } from '@/lib/ai/llm'
import { buildFixPrompt, buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompt'
import { PUBLISH_THRESHOLD, SPECS, checkPost, summarize } from '@/lib/writing/checker'
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

/**
 * 고쳐 쓰기에 넘길 항목 목록.
 *
 * **셋을 고쳤다** (2026-08-10). 예전에는 걸린 항목을 전부(수정필요 + 주의) 순서 없이
 * 넘기고 있었다. 회원 화면에서 9개가 넘어갔고, 모델이 아홉 개를 한 번에 손보다가 이미
 * 맞던 것을 깨서 결과가 나아지지 않았다.
 *
 *   ① **수정필요를 먼저** 놓는다. 점수 상한을 푸는 것은 수정필요뿐이다.
 *   ② **힌트를 함께** 넘긴다. 「지금 2회 / 기준 5회」만으로는 어디에 넣을지 모른다 —
 *      실제로 고치는 방법은 힌트에 적혀 있다.
 *   ③ **6개까지만** 넘긴다. 한 번에 다 고치라고 하면 아무것도 못 고친다.
 */
function fixList(r: ReturnType<typeof checkPost>): string[] {
  const rank = (level: string) => (level === 'fail' ? 0 : 1)
  const items = r.items
    .filter((i) => i.level !== 'pass')
    .sort((a, b) => rank(a.level) - rank(b.level) || b.weight - a.weight)
    .slice(0, 6)
    .map((i) => {
      const head = `[${i.level === 'fail' ? '수정필요' : '주의'}] ${i.label}: 지금 ${i.value} / 기준 ${i.target}`
      return i.hint ? `${head}\n  → ${i.hint}` : head
    })
  // 위험 표현은 항목 수와 무관하게 전부 넘긴다 — 하나라도 남으면 발행할 수 없다
  return items.concat(
    r.risks.map((x) => `[위험 표현] "${x.term}" (${x.category}) — ${x.fix}`)
  )
}

const TYPES: PostType[] = ['promo', 'info', 'review']

interface Draft {
  title: string
  body: string
  tags: string[]
}

function asDraft(v: unknown): Draft | null {
  const o = v as { title?: unknown; body?: unknown; tags?: unknown }
  if (!o || typeof o.title !== 'string' || typeof o.body !== 'string') return null
  const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : []
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
    if (!store) {
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

    const request = {
      type,
      store,
      mainKeyword,
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
        subKeywords: request.subKeywords,
        localKeyword: request.localKeyword,
        tags: d.tags,
        legalName: store.legalName,
        womenOnly: store.womenOnly,
        sponsorship: body.sponsorship ?? 'unset',
        eventText: request.eventText,
        promoNote: request.promoNote,
        placeReviews: store.placeReviews,
        placeId: store.placeId,
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
      const fixedFails = fixedResult ? summarize(fixedResult).fail : Number.POSITIVE_INFINITY
      const better = Boolean(
        fixed &&
          fixedResult &&
          (fixedFails < priorFails ||
            (fixedFails === priorFails && fixedResult.score > priorResult.score))
      )
      console.log(
        '[write] 고쳐 쓰기 판정',
        `수정필요 ${priorFails}→${fixedFails} · 점수 ${priorResult.score}→${fixedResult?.score ?? '-'}`,
        better ? '채택' : '버림'
      )
      const out = better ? fixed : prior
      const outResult = better ? fixedResult! : priorResult
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
        provider: ai.label,
        check: {
          score: outResult.score,
          ...summarize(outResult),
          issues: outResult.items
            .filter((i) => i.level !== 'pass')
            .map((i) => ({ level: i.level, label: i.label, value: i.value, target: i.target })),
        },
        fixIssues: fixList(outResult),
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
      fixIssues: fixList(result),
      provider: ai.label,
      // 자료를 찾아 인용했는지 — 화면에서 회원에게 밝힌다 (못 찾는 키도 있다)
      searched: request.canSearch === true,
      check: {
        score: result.score,
        ...summarize(result),
        issues: result.items
          .filter((i) => i.level !== 'pass')
          .map((i) => ({ level: i.level, label: i.label, value: i.value, target: i.target })),
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
