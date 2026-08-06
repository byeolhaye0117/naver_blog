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
export async function askLlm(system: string, messages: AiMessage[], maxTokens = 8192): Promise<string> {
  const c = detectProvider()
  if (!c) throw new AiError('AI 키가 설정되지 않았습니다.', 400)
  const model = await resolveModel(c)

  let url: string
  let headers: Record<string, string> = { 'content-type': 'application/json' }
  let body: unknown

  if (c.provider === 'anthropic') {
    url = `${c.base}/v1/messages`
    headers = { ...headers, 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }
    body = { model, max_tokens: maxTokens, system, messages }
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
  if (!out) throw new AiError('글 생성 응답을 읽지 못했습니다.', 502)
  return out
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
