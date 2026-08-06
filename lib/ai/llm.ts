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

export function aiStatus(): { ready: boolean; provider: Provider | null; label: string | null } {
  const c = detectProvider()
  return {
    ready: Boolean(c),
    provider: c?.provider ?? null,
    label: c ? PROVIDER_LABEL[c.provider] : null,
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
export async function askLlm(system: string, messages: AiMessage[], maxTokens = 8192): Promise<string> {
  try {
    return await askOnce(system, messages, maxTokens)
  } catch (e) {
    /*
     * 모델이 「생각하기 끄기」를 거부하면(회사·모델마다 규칙이 다르다) 그 필드만 빼고
     * 한 번 다시 부른다 — 이름으로 걸러낸 목록이 최신이 아닐 수 있으므로 실패로 배운다.
     */
    if (e instanceof AiError && e.status === 400 && /thinking/i.test(e.message)) {
      console.warn('[ai] 이 모델은 생각하기를 끌 수 없다 — 그 설정을 빼고 다시 부른다')
      return await askOnce(system, messages, maxTokens, true)
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
    return await askOnce(system, messages, maxTokens)
  }
}

async function askOnce(
  system: string,
  messages: AiMessage[],
  maxTokens: number,
  /** 400 이 「thinking」을 문제 삼으면 이 필드만 빼고 한 번 더 부른다 */
  omitThinking = false
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
    body = {
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(!omitThinking && supportsDisabledThinking(model) ? { thinking: { type: 'disabled' } } : {}),
    }
  } else if (c.provider === 'gemini') {
    url = `${c.base}/models/${model}:generateContent?key=${c.key}`
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: maxTokens },
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
    throw new AiError(
      `글 생성 실패 (${res.status}, ${PROVIDER_LABEL[c.provider]} · ${model}). ${errorText(raw)}`,
      res.status
    )
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
