/**
 * 본문 생성용 Claude 호출.
 *
 * SDK 를 쓰지 않고 fetch 로 직접 부른다 — 이 앱의 런타임 의존성은 next/react 뿐이고,
 * 필요한 것은 Messages API 하나뿐이다.
 *
 * 키가 없으면 아무것도 하지 않고 그렇게 알린다 (샘플 글을 만들어 내려주지 않는다 —
 * 지어낸 문장을 실제 글로 착각하면 그게 제일 위험하다).
 */

const BASE = process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com'
const VERSION = '2023-06-01'
const TIMEOUT_MS = 120_000

/** 긴 한글 본문을 쓰는 작업이라 최신 중급 모델을 기본값으로 둔다 */
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5'

export function hasAiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export function aiStatus(): { ready: boolean; model: string } {
  return { ready: hasAiKey(), model: DEFAULT_MODEL }
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

/** Messages API 한 번 호출 — 응답 텍스트만 돌려준다 */
export async function askClaude(
  system: string,
  messages: AiMessage[],
  maxTokens = 4096
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new AiError('ANTHROPIC_API_KEY 가 설정되지 않았습니다.', 400)

  let res: Response
  try {
    res = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': VERSION,
      },
      body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: maxTokens, system, messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new AiError('글 생성 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.', 503)
  }

  const text = await res.text()
  if (!res.ok) {
    // 청구·한도 문제는 사용자가 직접 조치해야 하므로 원문 메시지를 남겨 준다
    let detail = text.slice(0, 300)
    try {
      const j = JSON.parse(text) as { error?: { message?: string } }
      if (j.error?.message) detail = j.error.message
    } catch {
      /* 원문 그대로 */
    }
    throw new AiError(`글 생성 실패 (${res.status}). ${detail}`, res.status)
  }

  try {
    const json = JSON.parse(text) as { content?: { type: string; text?: string }[] }
    const out = (json.content ?? [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text as string)
      .join('\n')
      .trim()
    if (!out) throw new Error('빈 응답')
    return out
  } catch {
    throw new AiError('글 생성 응답을 읽지 못했습니다.', 502)
  }
}

/**
 * 응답에서 JSON 객체만 뽑는다.
 *
 * 모델이 ```json 코드펜스나 앞뒤 설명을 붙여 보내는 경우가 있어서, 중괄호 균형을 세어
 * 첫 완결 객체를 잘라낸다 (순수 함수 — 테스트 대상).
 */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\') {
      esc = true
      continue
    }
    if (c === '"') inStr = !inStr
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}
