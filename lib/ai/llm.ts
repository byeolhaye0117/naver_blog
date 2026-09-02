/**
 * 본문 생성용 언어모델 호출 — 어느 회사 키를 넣어도 되게.
 *
 * 사용자가 이미 가진 키가 무엇인지에 따라 부르는 방식이 다르다. 그래서 환경변수에
 * 들어 있는 키를 보고 스스로 판단한다. SDK 는 쓰지 않는다 (런타임 의존성은 next/react 뿐).
 *
 * 모델 이름은 회사마다 자주 바뀌므로 하드코딩하지 않는다 — 목록 API 로 물어보고
 * 선호 순서대로 고른다. AI_MODEL 환경변수를 넣으면 그 값을 그대로 쓴다.
 */

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'clova'

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI 호환',
  gemini: 'Google (Gemini)',
  clova: '네이버 CLOVA Studio',
}

interface Conf {
  provider: Provider
  key: string
  base: string
}

const TIMEOUT_MS = 180_000

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

/**
 * 어떤 키가 들어 있는지 보고 고른다. 여러 개가 있으면 이 순서로 쓴다.
 * OPENAI_BASE_URL 을 함께 넣으면 OpenAI 호환 서비스(Groq·Together 등)도 그대로 붙는다.
 */
export function detectProvider(): Conf | null {
  const forced = env('AI_PROVIDER')?.toLowerCase()
  const table: { provider: Provider; key?: string; base: string }[] = [
    {
      provider: 'anthropic',
      key: env('ANTHROPIC_API_KEY'),
      base: env('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com',
    },
    {
      provider: 'openai',
      key: env('OPENAI_API_KEY'),
      base: env('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
    },
    {
      provider: 'gemini',
      key: env('GEMINI_API_KEY') ?? env('GOOGLE_API_KEY'),
      base: env('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta',
    },
    {
      provider: 'clova',
      key: env('CLOVA_API_KEY'),
      base: env('CLOVA_BASE_URL') ?? 'https://clovastudio.stream.ntruss.com',
    },
  ]
  const found = table.filter((t): t is Conf => Boolean(t.key))
  if (!found.length) return null
  if (forced) {
    const pick = found.find((f) => f.provider === forced)
    if (pick) return pick
  }
  return found[0]
}

/**
 * 자료를 **직접 찾게 하는** 도구 (순수 함수 — 테스트 대상).
 *
 * 회원 지적 — "내가 자료를 찾으면 안 되고 너가 알아서 자료를 찾아서 작성해줘야지."
 * 맞는 말이다. 앞 판에서는 사람이 출처를 붙여넣게 만들었는데, 그건 일을 회원에게 넘긴 것이다.
 *
 * 회사마다 방식이 다르다:
 *   anthropic — 서버 도구 `web_search`. 응답에 검색 결과 블록이 섞이지만 `extractText` 가
 *               `type === 'text'` 만 골라내므로 본문 추출은 그대로 된다.
 *   gemini    — `google_search` 도구.
 *   openai·clova — chat/completions 에는 표준 검색 도구가 없다 (OpenAI 는 Responses API 나
 *               검색 전용 모델이 필요하다). 그래서 **검색 없이** 돌고, 지시문이 「자료를 못
 *               찾으면 인용하지 말라」로 바뀐다. 못 하는 것을 되는 척하지 않는다.
 *
 * 도구를 붙였다가 400 이 나면 그 필드만 빼고 다시 부른다 (`thinking` 과 같은 방식) —
 * 계정·모델에 따라 검색이 안 열려 있을 수 있고, 그때 글쓰기 자체가 막히면 안 된다.
 */
export function searchTools(provider: Provider): unknown[] | null {
  if (provider === 'anthropic') return [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }]
  if (provider === 'gemini') return [{ google_search: {} }]
  return null
}

/** 지금 키로 자료를 찾아올 수 있는가 (화면에서 「찾아서 인용합니다」를 말할 때 쓴다) */
export function canSearchWeb(): boolean {
  const c = detectProvider()
  return Boolean(c && searchTools(c.provider))
}

export function aiStatus(): { ready: boolean; provider: Provider | null; label: string | null } {
  const c = detectProvider()
  return {
    ready: Boolean(c),
    provider: c?.provider ?? null,
    label: c ? PROVIDER_LABEL[c.provider] : null,
  }
}

/**
 * 키가 **실제로 되는지** 확인한 결과.
 *
 * `aiStatus()` 는 환경변수가 들어 있는지만 본다. 그것만으로는 「키를 넣었는데 되는지」를
 * 답할 수 없다 — 오타·만료·잔액 없음·권한 없음은 전부 키가 들어 있는 상태다. 그래서 이
 * 검사는 **모델을 실제로 한 번 부른다.**
 */
export interface KeyCheck {
  ok: boolean
  provider: Provider | null
  label: string | null
  /** 이 키로 실제로 쓰게 될 모델 */
  model: string | null
  /** 목록 API 가 돌려준 모델 수 (0 = 목록을 못 받았다) */
  models: number
  /** 자료 검색까지 되는 키인지 */
  canSearch: boolean
  /** 모델이 실제로 돌려준 말 (성공했을 때만) */
  said: string | null
  /** 사람이 읽는 결과 */
  detail: string
}

/** 이 키로 쓰게 될 모델 이름 */
export async function currentModel(): Promise<string | null> {
  const c = detectProvider()
  if (!c) return null
  try {
    return await resolveModel(c)
  } catch {
    return null
  }
}

/**
 * 키 확인 — **모델을 한 번 불러서** 판정한다.
 *
 * 모델 목록만 받아 보고 판정하면 안 된다. 목록은 잔액이 0 이어도 나오는 회사가 있어서
 * 「된다」고 말한 뒤 정작 글을 쓸 때 실패한다. 짧은 답 한 번이 가장 싸고 확실한 증거다.
 */
export async function checkKey(): Promise<KeyCheck> {
  const c = detectProvider()
  if (!c) {
    return {
      ok: false,
      provider: null,
      label: null,
      model: null,
      models: 0,
      canSearch: false,
      said: null,
      detail:
        'AI 키가 없습니다. 환경변수에 ANTHROPIC_API_KEY · OPENAI_API_KEY · GEMINI_API_KEY · CLOVA_API_KEY 중 하나를 넣고 다시 배포하세요.',
    }
  }
  const label = PROVIDER_LABEL[c.provider]
  let models: string[] = []
  try {
    models = await listModels(c)
  } catch {
    models = []
  }
  const model = await resolveModel(c)
  try {
    const text = await askLlm(
      '한국어로 아주 짧게 답한다.',
      [{ role: 'user', content: '연결 확인입니다. 「예」라고만 답해 주세요.' }],
      64
    )
    const said = text.trim().replace(/\s+/g, ' ').slice(0, 60)
    return {
      ok: true,
      provider: c.provider,
      label,
      model,
      models: models.length,
      canSearch: canSearchWeb(),
      said,
      detail: `키가 살아 있습니다. ${label} · 모델 ${model} 이 응답했습니다.`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      provider: c.provider,
      label,
      model,
      models: models.length,
      canSearch: false,
      said: null,
      detail: `${label} 키가 들어 있지만 호출이 실패했습니다 — ${msg}`,
    }
  }
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 500
  ) {
    super(message)
  }
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 모델 이름 선호 순서 — 목록에서 이 조각을 포함하는 첫 모델을 고른다 */
const PREFER: Record<Provider, string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'sonnet-4', 'claude-3-7-sonnet', 'sonnet'],
  openai: ['gpt-5', 'gpt-4.1', 'gpt-4o', 'o4', 'gpt-4'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  clova: ['HCX-005', 'HCX-DASH', 'HCX-003'],
}

/** 이름 목록에서 선호 순서대로 하나 고른다 (순수 함수 — 테스트 대상) */
export function pickModel(provider: Provider, available: string[]): string | null {
  for (const want of PREFER[provider]) {
    const hit = available.find((m) => m.includes(want))
    if (hit) return hit
  }
  // 채팅에 못 쓰는 모델(임베딩·음성 등)을 피한다
  const usable = available.filter((m) => !/embed|whisper|tts|image|vision-only|moderation/i.test(m))
  return usable[0] ?? available[0] ?? null
}

const modelCache = new Map<Provider, string>()

async function resolveModel(c: Conf): Promise<string> {
  const forced = env('AI_MODEL') ?? env('ANTHROPIC_MODEL')
  if (forced) return forced
  const cached = modelCache.get(c.provider)
  if (cached) return cached

  // CLOVA 는 모델 목록 API 가 공개돼 있지 않아 기본값을 쓴다
  const fallback: Record<Provider, string> = {
    anthropic: 'claude-sonnet-5',
    openai: 'gpt-4o',
    gemini: 'gemini-2.5-flash',
    clova: 'HCX-005',
  }

  try {
    const names = await listModels(c)
    const pick = names.length ? pickModel(c.provider, names) : null
    const model = pick ?? fallback[c.provider]
    modelCache.set(c.provider, model)
    return model
  } catch {
    return fallback[c.provider]
  }
}

async function listModels(c: Conf): Promise<string[]> {
  if (c.provider === 'clova') return []
  const url =
    c.provider === 'gemini' ? `${c.base}/models?key=${c.key}` : `${c.base}/models`
  const headers: Record<string, string> =
    c.provider === 'anthropic'
      ? { 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }
      : c.provider === 'openai'
        ? { authorization: `Bearer ${c.key}` }
        : {}
  const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return []
  const json = (await res.json()) as {
    data?: { id?: string }[]
    models?: { name?: string }[]
  }
  if (json.data) return json.data.map((m) => m.id ?? '').filter(Boolean)
  // Gemini 는 "models/gemini-..." 형태로 준다
  if (json.models) return json.models.map((m) => (m.name ?? '').replace(/^models\//, '')).filter(Boolean)
  return []
}

/** 응답에서 실패 사유를 사람이 읽을 수 있게 뽑는다 */
function errorText(raw: string): string {
  try {
    const j = JSON.parse(raw) as {
      error?: { message?: string } | string
      message?: string
      status?: { message?: string }
    }
    if (typeof j.error === 'string') return j.error
    if (j.error?.message) return j.error.message
    if (j.message) return j.message
    if (j.status?.message) return j.status.message
  } catch {
    /* 원문 그대로 */
  }
  return raw.slice(0, 300)
}

/** 회사별로 잔액을 채우는 자리 — 「어디로 가야 하나」까지 적어야 알림이 된다 */
const BILLING_AT: Record<Provider, string> = {
  anthropic: 'console.anthropic.com → Plans & Billing',
  openai: 'platform.openai.com → Billing',
  gemini: 'Google AI Studio·Cloud 콘솔의 결제',
  clova: '네이버 클라우드 플랫폼 콘솔의 결제',
}

/** 키를 다시 넣는 자리 — 이 앱에서는 배포 환경변수다 */
const KEY_AT = '「휴대폰에서 쓰기 · 배포」 화면의 환경변수 (Vercel → Settings → Environment Variables)'

/**
 * **AI 회사가 보낸 오류를 「그래서 무엇을 하면 되나」로 바꾼다** (2026-08-26).
 *
 * 회원이 이 줄을 보고 물었다 — "이거 왜 이래?":
 *   글 생성 실패 (400, Anthropic (Claude) · claude-sonnet-5). Your credit balance is too
 *   low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
 *
 * 앱이 고장난 것이 아니라 **키의 잔액이 0**이 된 것이다. 그런데 화면에는 영어 원문만 있고
 * 어디서 충전하는지는 아무 데도 없었다. 매일 새벽 크론도 같은 줄을 실패 기록에 남기므로,
 * 회원이 아침마다 못 읽는 영어를 보게 된다.
 *
 * **원문은 지우지 않고 뒤에 남긴다.** 우리가 못 알아본 오류를 삼키면 원인을 영영 못 찾는다
 * (이 저장소에서 조용한 실패로 이미 며칠을 잃었다).
 */
export function explainProviderError(provider: Provider, status: number, message: string): string {
  const m = message.toLowerCase()
  if (/credit balance is too low|insufficient_quota|exceeded your current quota|billing hard limit|quota exceeded/.test(m)) {
    return `**AI 키의 잔액이 없습니다.** ${BILLING_AT[provider]} 에서 충전하면 바로 다시 씁니다. 충전 전까지는 글쓰기와 새벽 자동 초안이 멈춥니다 (앱 문제가 아닙니다).`
  }
  if (/invalid x-api-key|incorrect api key|api key not valid|invalid api key|unauthorized|authentication_error|permission_denied/.test(m)) {
    return `**AI 키가 잘못됐거나 지워졌습니다.** ${KEY_AT} 에서 키를 다시 넣고 재배포해 주세요.`
  }
  if (status === 429 || /rate.?limit/.test(m)) {
    return '**짧은 사이에 너무 많이 불렀습니다.** 1~2분 뒤에 다시 눌러 주세요 — 키나 글에는 문제가 없습니다.'
  }
  if (status === 529 || /overloaded/.test(m)) {
    return '**AI 서버가 몰려 있습니다.** 잠시 뒤 다시 시도하면 됩니다 — 키나 글에는 문제가 없습니다.'
  }
  return ''
}

/**
 * 한 번 호출하고 텍스트만 돌려준다.
 * 회사별로 요청 모양이 달라서 여기서만 갈라진다.
 */
/**
 * 글 생성 한 번. **빈 응답이면 한 번만 다시 부른다.**
 *
 * 200 인데 내용이 없는 경우는 일시적일 때가 많다 (모델이 생각만 하다 끊기는 등).
 * 회원은 1분을 기다린 뒤 오류를 보므로, 여기서 한 번 더 시도하는 값이 크다.
 * 두 번째도 비면 그때는 증거를 담아 던진다 — describeEmpty 참고.
 */
export async function askLlm(
  system: string,
  messages: AiMessage[],
  maxTokens = 8192,
  /** 자료를 직접 찾아 인용하게 할지 (정보글) */
  search = false
): Promise<string> {
  try {
    return await askOnce(system, messages, maxTokens, false, search)
  } catch (e) {
    /*
     * 검색 도구를 못 받는 계정·모델이 있다. 그때 글쓰기 자체가 막히면 안 되므로 도구만 빼고
     * 다시 부른다 — 지시문은 「자료를 못 찾으면 인용하지 않는다」를 이미 담고 있다.
     */
    if (search && e instanceof AiError && e.status === 400 && /tool|web_search|google_search/i.test(e.message)) {
      console.warn('[ai] 이 계정·모델은 검색 도구를 못 쓴다 — 검색 없이 다시 부른다')
      return await askOnce(system, messages, maxTokens, false, false)
    }
    /*
     * **캐싱 표시를 안 받는 곳이면 그것만 빼고 다시 부른다** (2026-09-02).
     *
     * 지시문을 캐시에 올려 값을 아끼는데, 회사 API 는 받아도 중간에 낀 게이트웨이가 안 받을
     * 수 있다. 아끼자고 넣은 것 때문에 글이 아예 안 나오면 안 된다 — 값보다 글이 먼저다.
     * `thinking` 보다 먼저 본다: 더 나중에 넣은 것이라 의심 순서가 앞이다.
     */
    if (e instanceof AiError && isCacheComplaint(e.status, e.message)) {
      console.warn('[ai] 이 곳은 지시문 캐싱을 못 받는다 — 캐싱 없이 다시 부른다:', e.message.slice(0, 120))
      return await askOnce(system, messages, maxTokens, false, search, true)
    }
    /*
     * 모델이 「생각하기 끄기」를 거부하면(회사·모델마다 규칙이 다르다) 그 필드만 빼고
     * 한 번 다시 부른다 — 이름으로 걸러낸 목록이 최신이 아닐 수 있으므로 실패로 배운다.
     *
     * **캐싱은 그대로 둔 채 부른다** — 이 400 은 캐싱 얘기가 아니다. 여기서 같이 빼면
     * 아끼는 자리를 이유 없이 잃는다. 이 호출이 또 캐싱으로 400 이 나면 위 갈래가 받는다.
     */
    if (e instanceof AiError && e.status === 400 && /thinking/i.test(e.message)) {
      console.warn('[ai] 이 모델은 생각하기를 끌 수 없다 — 그 설정을 빼고 다시 부른다')
      return await askOnce(system, messages, maxTokens, true, search)
    }
    const empty = e instanceof AiError && e.status === 502
    if (!empty) throw e
    /*
     * **똑같이 실패할 게 뻔한 경우에는 다시 부르지 않는다.**
     *
     * 한도(max_tokens)에 먼저 걸려 빈 응답이 온 것은 일시적인 일이 아니라 설정 문제다.
     * 그런데도 재시도하면 입력·출력 토큰을 그대로 한 번 더 태운다 — 회원이 「계속 안 되는데
     * 돈은 나가는 거 아니냐」고 물었고, 실제로 이 재시도가 실패 비용을 두 배로 만들고 있었다.
     */
    if (/max_tokens/.test(e.message)) {
      console.warn('[ai] 한도에 걸린 빈 응답 — 재시도해도 같으므로 하지 않는다')
      throw e
    }
    console.warn('[ai] 빈 응답 — 한 번 다시 부른다:', e instanceof Error ? e.message : e)
    return await askOnce(system, messages, maxTokens, false, search)
  }
}

async function askOnce(
  system: string,
  messages: AiMessage[],
  maxTokens: number,
  /** 400 이 「thinking」을 문제 삼으면 이 필드만 빼고 한 번 더 부른다 */
  omitThinking = false,
  /** 자료를 직접 찾게 할지 — 회사별 도구는 searchTools 가 만든다 */
  search = false,
  /** 400 이 캐싱을 문제 삼으면 그 표시만 빼고 한 번 더 부른다 */
  omitCache = false
): Promise<string> {
  const c = detectProvider()
  if (!c) throw new AiError('AI 키가 설정되지 않았습니다.', 400)
  const model = await resolveModel(c)

  let url: string
  let headers: Record<string, string> = { 'content-type': 'application/json' }
  let body: unknown

  if (c.provider === 'anthropic') {
    url = `${c.base}/v1/messages`
    headers = { ...headers, 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }
    /*
     * **생각하기를 끈다. 이게 회원이 막혀 있던 원인이었다.**
     *
     * claude-sonnet-5 는 `thinking` 을 안 보내면 생각하기가 **켜진 상태로** 돈다
     * (claude-sonnet-4-6 은 꺼진 상태였다 — 기본값이 뒤집혔다). 그리고 max_tokens 는
     * 생각 + 본문을 **합쳐서** 세는 한도다. 그래서 실제로 이렇게 실패했다.
     *
     *   중단 이유: max_tokens · 받은 블록: thinking · 토큰 입력 5142 · 출력 8192
     *
     * 8,192 토큰을 전부 생각에 쓰고 글은 한 글자도 못 쓴 것이다. 우리 지시문은 길고
     * (형식 규칙·문체·문단·위험 표현) 요구도 많아서 생각이 길어진다.
     *
     * 이 작업에는 생각하기가 필요 없다 — 우리는 정해진 골격에 맞춰 JSON 하나를 받는다.
     * 끄면 8,192 전부가 본문 몫이 되고, 응답도 빨라지고, 출력 토큰 값도 절반 이하로 준다.
     *
     * **예외를 둔다.** `thinking: {type:'disabled'}` 는 fable·mythos 계열에서 400 이고
     * opus-5 는 effort 가 xhigh/max 일 때만 400 이다(우리는 effort 를 안 보내므로 기본 high
     * → 허용). 이름으로 걸러내고, 그래도 400 이 나면 이 필드만 빼고 한 번 다시 부른다.
     */
    body = anthropicBody({ model, system, messages, maxTokens, omitThinking, omitCache, search })
  } else if (c.provider === 'gemini') {
    url = `${c.base}/models/${model}:generateContent?key=${c.key}`
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: maxTokens },
      ...(search && searchTools('gemini') ? { tools: searchTools('gemini') } : {}),
    }
  } else {
    // OpenAI 호환 (OpenAI·Groq·Together…) 와 CLOVA 는 같은 chat/completions 모양을 쓴다
    url =
      c.provider === 'clova'
        ? `${c.base}/v3/chat-completions/${model}`
        : `${c.base}/chat/completions`
    headers = { ...headers, authorization: `Bearer ${c.key}` }
    body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new AiError('글 생성 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.', 503)
  }

  const raw = await res.text()
  if (!res.ok) {
    /*
     * **무엇을 하면 되는지를 앞에 세운다** (2026-08-26). 회사가 보낸 영어 원문만 있으면
     * 회원이 「이거 왜 이래?」로 돌아온다 — 원문은 괄호에 넣어 뒤에 남긴다.
     */
    const said = errorText(raw)
    const todo = explainProviderError(c.provider, res.status, said)
    throw new AiError(
      todo
        ? `${todo} (${PROVIDER_LABEL[c.provider]} · ${model} · ${res.status} — ${said})`
        : `글 생성 실패 (${res.status}, ${PROVIDER_LABEL[c.provider]} · ${model}). ${said}`,
      res.status
    )
  }

  /*
   * **캐시가 실제로 걸렸는지 남긴다** (2026-09-02). 「켰다」와 「먹는다」는 다르다 —
   * 앞부분이 한 글자만 달라져도 조용히 안 걸리고, 그때는 값만 1.25배로 나간다.
   * 읽은 토큰이 0 으로만 찍히면 앞부분이 매번 달라지고 있다는 뜻이다.
   */
  if (c.provider === 'anthropic') {
    const u = cacheUsage(raw)
    if (u) console.log('[ai] 토큰', `새로 ${u.fresh}`, `· 캐시 씀 ${u.written}`, `· 캐시 읽음 ${u.read}`, `· 출력 ${u.output}`)
  }

  const out = extractText(raw)
  if (!out) {
    /*
     * **왜 증거를 담나.** 예전에는 「글 생성 응답을 읽지 못했습니다」만 던졌다. 회원 화면에
     * 그 문구만 뜨니 원인을 알 수 없어 세 번을 추측으로 고쳤다.
     *
     * 200 인데 글이 없는 경우는 실제로 몇 가지다 — 모델이 생각 블록만 내고 끊겼거나
     * (stop_reason: max_tokens), 응답 모양이 우리가 아는 회사 형식이 아니거나, 거부(refusal)
     * 했을 때다. 셋은 대응이 다르므로 **무엇이었는지 그대로 적어 보낸다.**
     */
    throw new AiError(`글 생성 응답을 읽지 못했습니다. ${describeEmpty(raw, c.provider, model)}`, 502)
  }
  return out
}

/*
 * ─── 같은 지시문을 두 번 보내는 값을 아낀다 (2026-09-02 회원 요청) ────────────
 *
 * 회원: "이상하게 요즘따라 클로드 API 키가 빨리 닳는거 같아 왜그런거야?"
 *
 * 세어 보니 하루 1편 → 3편으로 늘어난 것이 컸는데(08-28 배포), 재보니 **같은 지시문을
 * 매번 새로 값 내고 있었다.** 글 한 편에 호출이 두 번 들어가고(생성 1회 + 고쳐 쓰기 1회,
 * 실행 기록의 `rounds: 1`), 두 호출의 **앞부분이 글자 하나까지 같다** — 정보글 지시문이
 * 10,465 토큰이다.
 *
 * 캐싱은 앞부분이 같으면 값을 깎아 준다: 쓸 때 1.25배, 읽을 때 0.1배. 두 번만 불러도
 * 본전이다(1.25 + 0.1 = 1.35 < 2). 재보니 한 편 입력이 26,349 → 19,547 토큰(26% 감소),
 * 값으로는 11% 였다 — 이 앱은 값의 절반 넘게가 출력 토큰이라 그만큼이다.
 *
 * ── 표시를 어디에 다나 ────────────────────────────────────────────────
 * **지시문에만 단다.** 캐싱은 앞부분이 정확히 같은 데까지만 먹는다. 지시문은 글 종류만
 * 정해지면 늘 같은 글자지만(날짜·시각이 안 들어간다 — 확인했다) 그 뒤 요청 묶음은 키워드·
 * 지점·이벤트가 매번 다르다. 요청까지 묶어 표시하면 **매번 새로 쓰기만 하고 한 번도 못
 * 읽는다.**
 *
 * ── 짧으면 안 단다 ──────────────────────────────────────────────────
 * 캐시가 걸리는 최소 길이가 모델마다 다르다(512~4,096 토큰). 그보다 짧으면 조용히 안 걸리는데
 * **쓰기 값 1.25배는 나간다.** 그래서 넉넉히 잡아 그 위일 때만 단다. 우리 지시문은
 * 8,800~11,000 자라 늘 걸린다.
 */
export const CACHE_MIN_CHARS = 5000

/**
 * Anthropic 요청 본문 (순수 함수 — 테스트 대상).
 *
 * `askOnce` 안에 있던 것을 그대로 뺐다. 네트워크가 없으면 확인할 수 없던 자리라
 * 캐싱을 넣으면서 검사할 수 있게 만들었다.
 */
export function anthropicBody(args: {
  model: string
  system: string
  messages: AiMessage[]
  maxTokens: number
  omitThinking?: boolean
  omitCache?: boolean
  search?: boolean
}): Record<string, unknown> {
  const { model, system, messages, maxTokens } = args
  const tools = args.search ? searchTools('anthropic') : null
  const cache = !args.omitCache && system.length >= CACHE_MIN_CHARS
  return {
    model,
    max_tokens: maxTokens,
    /*
     * 글자는 그대로 두고 담는 그릇만 바꾼다 — 앞부분이 한 글자라도 달라지면 캐시가 깨진다.
     * 캐시를 안 쓸 때는 예전처럼 문자열 그대로 보낸다 (모양이 바뀌면 탈이 날 자리를 줄인다).
     */
    system: cache ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system,
    messages,
    ...(!args.omitThinking && supportsDisabledThinking(model) ? { thinking: { type: 'disabled' } } : {}),
    ...(tools ? { tools } : {}),
  }
}

/**
 * 캐싱 표시를 문제 삼는 400 인가 (순수 함수 — 테스트 대상).
 *
 * **모르는 곳에 대고 새 필드를 보내는 것이므로 물러설 길을 만들어 둔다.** 회사 API 는
 * 받지만 중간에 낀 게이트웨이(ANTHROPIC_BASE_URL)가 안 받을 수 있다. 400 이 캐싱이나
 * 지시문 모양을 문제 삼으면 그 표시만 빼고 한 번 더 부른다 — `thinking` 과 같은 방식이다.
 */
export function isCacheComplaint(status: number, message: string): boolean {
  return status === 400 && /cache|system/i.test(message)
}

/**
 * 응답에서 토큰 쓰임새를 읽는다 (순수 함수 — 테스트 대상).
 *
 * `read` 가 늘 0 이면 캐싱이 안 걸리고 있는 것이다 — 켠 것과 먹는 것은 다르다.
 */
export function cacheUsage(
  raw: string
): { fresh: number; written: number; read: number; output: number } | null {
  let j: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  try {
    j = JSON.parse(raw)
  } catch {
    return null
  }
  if (!j.usage) return null
  return {
    fresh: j.usage.input_tokens ?? 0,
    written: j.usage.cache_creation_input_tokens ?? 0,
    read: j.usage.cache_read_input_tokens ?? 0,
    output: j.usage.output_tokens ?? 0,
  }
}

/**
 * 이 모델에 `thinking: {type:'disabled'}` 를 보내도 되는지 (순수 함수 — 테스트 대상).
 *
 * fable·mythos 계열은 생각하기가 항상 켜져 있어 끄려고 하면 400 이다.
 * 그 외 Anthropic 모델은 끌 수 있다 (opus-5 는 effort 를 xhigh/max 로 올렸을 때만 400 인데
 * 우리는 effort 를 보내지 않으므로 해당 없다).
 */
export function supportsDisabledThinking(model: string): boolean {
  return !/fable|mythos/i.test(model)
}

/** 200 인데 글이 없을 때, 응답에서 확인 가능한 사실만 뽑아 적는다 (순수 함수 — 테스트 대상) */
export function describeEmpty(raw: string, provider: Provider, model: string): string {
  const head = `(${PROVIDER_LABEL[provider]} · ${model})`
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120)
    return `${head} 응답이 JSON 이 아니었습니다: "${snippet || '(비어 있음)'}"`
  }
  const j = json as {
    stop_reason?: string
    stop_sequence?: string
    content?: { type?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
    error?: { message?: string; type?: string }
  }
  const bits: string[] = [head]
  if (j.error?.message) bits.push(`오류: ${j.error.message}`)
  if (j.stop_reason) bits.push(`중단 이유: ${j.stop_reason}`)
  if (Array.isArray(j.content)) {
    const types = j.content.map((c) => c.type ?? '?')
    bits.push(types.length ? `받은 블록: ${types.join(', ')}` : '내용 블록이 비어 있었습니다')
  } else {
    bits.push(`아는 응답 모양이 아닙니다 (키: ${Object.keys(j as object).slice(0, 6).join(', ')})`)
  }
  if (j.usage) bits.push(`토큰 입력 ${j.usage.input_tokens ?? '?'} · 출력 ${j.usage.output_tokens ?? '?'}`)
  if (j.stop_reason === 'max_tokens') {
    bits.push('출력 한도에 먼저 걸렸습니다 — 글이 나오기 전에 끊긴 것이니 한도를 줄이거나 분량을 낮춰야 합니다')
  }
  return bits.join(' · ')
}

/** 회사별 응답 모양에서 본문 텍스트만 뽑는다 (순수 함수 — 테스트 대상) */
export function extractText(raw: string): string {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return ''
  }
  const j = json as {
    // Anthropic
    content?: { type?: string; text?: string }[]
    // OpenAI 호환
    choices?: { message?: { content?: string }; text?: string }[]
    // Gemini
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    // CLOVA (v3 이전 모양)
    result?: { message?: { content?: string } }
  }
  if (Array.isArray(j.content)) {
    return j.content
      .filter((c) => (c.type ?? 'text') === 'text' && c.text)
      .map((c) => c.text as string)
      .join('\n')
      .trim()
  }
  if (Array.isArray(j.choices)) {
    return (j.choices[0]?.message?.content ?? j.choices[0]?.text ?? '').trim()
  }
  if (Array.isArray(j.candidates)) {
    return (j.candidates[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim()
  }
  if (j.result?.message?.content) return j.result.message.content.trim()
  return ''
}

/**
 * 모델이 낸 JSON 을 고쳐 쓴다 (순수 함수 — 테스트 대상).
 *
 * **왜 필요한가.** 본문을 JSON 문자열 하나에 담게 하면 모델이 두 가지로 자주 어긋난다.
 *
 *   ① 문자열 안에 **진짜 줄바꿈**을 넣는다 (`\n` 으로 escape 하지 않는다). JSON 규격
 *      위반이라 JSON.parse 가 바로 던진다. 2026-08-06 에 「문단을 12개 이상으로 쪼개라」를
 *      지시에 넣은 뒤로 본문의 줄바꿈이 크게 늘어 이 실패가 잦아졌다.
 *   ② 출력 토큰 한계에 걸려 **중간에 잘린다.** 닫는 괄호가 없어 균형 세기가 끝나지 않는다.
 *
 * 둘 다 회원 화면에는 「글 형식을 읽지 못했습니다」로만 보이고, 2~3분 기다린 뒤에 나온다.
 * 그래서 버리지 않고 고쳐 쓴다 — 글 내용은 멀쩡한데 따옴표 하나 때문에 날리는 건 아깝다.
 *
 * 하는 일: 문자열 안의 제어문자를 escape 하고, 끝나지 않은 문자열·괄호를 닫고,
 * 닫기 직전의 쉼표를 지운다.
 */
export function repairJson(src: string): string {
  let out = ''
  let inStr = false
  let esc = false
  const stack: string[] = []
  for (const ch of src) {
    if (esc) {
      out += ch
      esc = false
      continue
    }
    if (ch === '\\') {
      out += ch
      esc = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      out += ch
      continue
    }
    if (inStr) {
      // 문자열 안의 제어문자는 escape 해야 규격에 맞는다
      if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else if (ch < ' ') out += ''
      else out += ch
      continue
    }
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
    out += ch
  }
  // 잘린 경우를 닫아준다
  if (inStr) out += '"'
  out = out.replace(/,\s*$/, '')
  while (stack.length) out += stack.pop() === '{' ? '}' : ']'
  return out
}

/**
 * 고쳐도 안 되면 필드만 건져낸다 (순수 함수 — 테스트 대상).
 *
 * 앱이 실제로 쓰는 건 title·body·tags 셋뿐이다. 구조가 망가졌어도 이 셋이 남아 있으면
 * 글은 살린다 — 2~3분 기다린 결과를 「형식을 읽지 못했습니다」로 버리는 것보다 낫다.
 */
export function salvageFields(raw: string): { title: string; body: string; tags: string[] } | null {
  const pull = (key: string): string | null => {
    const at = raw.indexOf(`"${key}"`)
    if (at < 0) return null
    const q = raw.indexOf('"', raw.indexOf(':', at) + 1)
    if (q < 0) return null
    let out = ''
    for (let i = q + 1; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === '\\') {
        const next = raw[i + 1]
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next === '"' ? '"' : next === '\\' ? '\\' : ''
        i++
        continue
      }
      if (ch === '"') break
      out += ch
    }
    return out
  }
  const title = pull('title')
  const body = pull('body')
  if (!title || !body) return null
  const tagBlock = raw.match(/"tags"\s*:\s*\[([^\]]*)\]/)
  const tags = tagBlock
    ? [...tagBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter(Boolean)
    : []
  return { title, body, tags }
}

/**
 * 응답에서 JSON 객체만 뽑는다.
 *
 * 모델이 ```json 코드펜스나 앞뒤 설명을 붙여 보내는 경우가 있어서, 중괄호 균형을 세어
 * 첫 완결 객체를 잘라낸다 (순수 함수 — 테스트 대상).
 *
 * 그대로 안 되면 **고쳐서 다시 시도하고, 그래도 안 되면 필드만 건진다** —
 * repairJson·salvageFields 주석 참고.
 */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (esc) {
      esc = false
      continue
    }
    if (ch === '\\') {
      esc = true
      continue
    }
    if (ch === '"') inStr = !inStr
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const slice = raw.slice(start, i + 1)
        try {
          return JSON.parse(slice)
        } catch {
          try {
            return JSON.parse(repairJson(slice))
          } catch {
            return salvageFields(slice)
          }
        }
      }
    }
  }
  // 여기까지 왔으면 닫히지 않았다 = 잘린 응답이다
  const rest = raw.slice(start)
  try {
    return JSON.parse(repairJson(rest))
  } catch {
    return salvageFields(rest)
  }
}
