/**
 * 맞춤법·띄어쓰기 검사 (네이버 검사기).
 *
 * **왜 붙였나.** 검수 항목 26개 중 맞춤법을 보는 게 하나도 없었다. 금칙어·어미 반복·문장
 * 리듬만 봤다. 그런데 오탈자는 글의 신뢰를 가장 빨리 깎는 것이고, 사람이 매번 다른 창을
 * 열어 붙여넣는 일은 실제로는 잘 안 한다.
 *
 * **공식 API 가 아니다.** 네이버 검색 화면이 내부적으로 쓰는 주소다. 그래서 두 가지를
 * 지킨다.
 *
 *   1. `passportKey` 를 검색 페이지에서 그때그때 뽑는다 (고정 키가 없다).
 *   2. **못 읽으면 못 읽었다고 한다.** 실측에서 연속 호출이 자주 500 으로 막혔다 —
 *      515자 요청은 통과하고 265자 요청이 막히는 식이라 길이 문제가 아니라 호출 제한이다.
 *      이때 「교정 0건」으로 답하면 회원은 맞춤법이 깨끗하다고 믿는다. 그건 거짓이다.
 *
 * 이 파일의 순수 함수(키 뽑기·응답 읽기)만 테스트한다.
 */

const SPELL_URL =
  process.env.NAVER_SPELL_ENDPOINT?.trim() ||
  'https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy'
const KEY_PAGE =
  process.env.NAVER_SPELL_KEY_PAGE?.trim() ||
  'https://search.naver.com/search.naver?where=nexearch&query=%EB%A7%9E%EC%B6%A4%EB%B2%95%EA%B2%80%EC%82%AC%EA%B8%B0'

const TIMEOUT_MS = 15000
/** 한 번에 보낼 글자 수 — 길면 잘리고, 너무 짧게 쪼개면 호출 수가 늘어 더 막힌다 */
export const CHUNK_MAX = 450
/** 호출 제한에 걸렸을 때 다시 시도하는 횟수 */
export const RETRIES = 2

/** 검색 페이지 HTML 에서 passportKey 를 뽑는다 (순수 함수 — 테스트 대상) */
export function parsePassportKey(html: string): string | null {
  const m = html.match(/passportKey=([A-Za-z0-9]{10,})/)
  return m ? m[1] : null
}

export interface SpellFix {
  /** 원래 쓴 말 */
  before: string
  /** 검사기가 제안한 말 */
  after: string
  /** 무슨 종류인지 — 네이버가 색으로 구분한다 */
  kind: '맞춤법' | '띄어쓰기' | '표준어' | '기타'
}

/** 색 이름 → 사람이 읽는 분류. 네이버 검사기의 표기를 그대로 옮긴다 */
const KIND_BY_COLOR: Record<string, SpellFix['kind']> = {
  red_text: '맞춤법',
  green_text: '띄어쓰기',
  violet_text: '표준어',
  purple_text: '표준어',
  blue_text: '기타',
}

/**
 * 검사 결과 HTML 에서 교정 목록을 뽑는다 (순수 함수 — 테스트 대상).
 *
 * 응답은 `오늘 날씨가 <em class='red_text'>좋네요</em>` 처럼 온다. 원문 쪽은
 * `<span class='result_underline'>조으네요</span>` 로 표시돼 있어, 둘을 순서대로 짝짓는다.
 */
export function parseSpellResult(raw: string): { fixes: SpellFix[]; count: number } | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    // 500 페이지(HTML)가 오면 여기로 온다 — 못 읽은 것이다
    return null
  }
  const result = (json as { message?: { result?: unknown; error?: unknown } })?.message?.result
  if (!result || typeof result !== 'object') return null
  const r = result as { html?: string; origin_html?: string; errata_count?: number }
  if (typeof r.html !== 'string') return null

  const after = [...r.html.matchAll(/<em class='([a-z_]+)'>([\s\S]*?)<\/em>/g)]
  const before = [...(r.origin_html ?? '').matchAll(
    /<span class='result_underline'>([\s\S]*?)<\/span>/g
  )]

  const fixes: SpellFix[] = after.map((m, i) => ({
    before: stripTags(before[i]?.[1] ?? ''),
    after: stripTags(m[2]),
    kind: KIND_BY_COLOR[m[1]] ?? '기타',
  }))

  return {
    fixes,
    // errata_count 를 믿되, 없으면 실제로 뽑힌 개수를 쓴다
    count: typeof r.errata_count === 'number' ? r.errata_count : fixes.length,
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim()
}

/**
 * 검사할 글을 덩어리로 나눈다 (순수 함수 — 테스트 대상).
 *
 * 문장 경계에서 자른다 — 문장 중간에서 끊으면 검사기가 없는 오류를 만들어낸다
 * (끊긴 조각이 비문으로 읽힌다).
 */
export function chunkForSpell(text: string, max = CHUNK_MAX): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  let buf = ''
  for (const s of sentences) {
    // 한 문장이 상한보다 길면 그 문장만 따로 보낸다 (자르지 않는다)
    if (s.length >= max) {
      if (buf) out.push(buf)
      out.push(s)
      buf = ''
      continue
    }
    if (buf.length + s.length + 1 > max) {
      out.push(buf)
      buf = s
    } else {
      buf = buf ? `${buf} ${s}` : s
    }
  }
  if (buf) out.push(buf)
  return out
}

export interface SpellReport {
  fixes: SpellFix[]
  /** 검사한 덩어리 수 */
  checked: number
  /** 호출 제한 등으로 못 읽은 덩어리 수 — 0 이 아니면 결과가 반쪽이다 */
  failed: number
  headline: string
}

/**
 * 결과를 사람 말로 (순수 함수 — 테스트 대상).
 *
 * **못 읽은 덩어리가 있으면 그걸 먼저 말한다.** 「0건」과 「못 읽음」을 섞으면 안 된다.
 */
export function spellHeadline(fixes: SpellFix[], checked: number, failed: number): string {
  const part = failed
    ? ` 다만 ${failed}덩어리는 네이버 검사기가 호출을 막아 확인하지 못했습니다 (공식 API 가 아니라 자주 막힙니다) — 발행 전에 그 부분은 눈으로 한 번 보세요.`
    : ''
  if (!checked) {
    return `네이버 맞춤법 검사기를 읽지 못했습니다 (${failed}덩어리 전부 실패). 지금은 검사 결과가 없는 상태이며, 맞춤법이 깨끗하다는 뜻이 아닙니다.`
  }
  if (!fixes.length) {
    return `${checked}덩어리를 검사했고 교정할 곳이 없습니다.${part}`
  }
  const byKind = new Map<string, number>()
  for (const f of fixes) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)
  const summary = [...byKind.entries()].map(([k, n]) => `${k} ${n}건`).join(' · ')
  return `${checked}덩어리에서 ${fixes.length}건 나왔습니다 (${summary}).${part}`
}

async function fetchKey(): Promise<string | null> {
  try {
    const res = await fetch(KEY_PAGE, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://search.naver.com/' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parsePassportKey(await res.text())
  } catch {
    return null
  }
}

async function checkChunk(text: string, key: string): Promise<SpellFix[] | null> {
  const url =
    `${SPELL_URL}?passportKey=${encodeURIComponent(key)}` +
    `&where=nexearch&color_blindness=0&q=${encodeURIComponent(text)}`
  try {
    const res = await fetch(url, {
      headers: { Referer: 'https://search.naver.com/', 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const parsed = parseSpellResult(await res.text())
    return parsed ? parsed.fixes : null
  } catch {
    return null
  }
}

/**
 * 글 전체를 검사한다.
 *
 * 덩어리마다 **키를 새로 받고** 실패하면 다시 시도한다. 실측에서 같은 키로 연속 호출하면
 * 첫 건만 통과했다. 그래도 막히면 실패로 세고 그 사실을 결과에 남긴다 —
 * 조용히 넘기면 「검사했는데 0건」으로 보인다.
 */
export async function spellCheck(text: string): Promise<SpellReport> {
  const chunks = chunkForSpell(text)
  const fixes: SpellFix[] = []
  let checked = 0
  let failed = 0

  for (const chunk of chunks) {
    let got: SpellFix[] | null = null
    for (let attempt = 0; attempt <= RETRIES && got === null; attempt++) {
      const key = await fetchKey()
      if (!key) continue
      got = await checkChunk(chunk, key)
    }
    if (got === null) failed++
    else {
      checked++
      fixes.push(...got)
    }
  }

  return { fixes, checked, failed, headline: spellHeadline(fixes, checked, failed) }
}
