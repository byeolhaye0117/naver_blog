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
export function parseSpellResult(raw: string): { fixes: SpellFix[]; count: number; skipped: number } | null {
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

  const raw_fixes: SpellFix[] = after.map((m, i) => ({
    before: clean(before[i]?.[1] ?? ''),
    after: clean(m[2]),
    kind: KIND_BY_COLOR[m[1]] ?? '기타',
  }))

  /*
   * 쓸 수 없는 제안을 여기서 버린다. 회원이 실제로 본 화면에 이런 게 있었다:
   *
   *   표준어  5시~7시쯤에 → 5시~7시쯤에     (원문과 제안이 똑같다)
   *   맞춤법  무너진다&quot; → 무너진다&quot;라는  (엔티티가 안 풀렸다)
   *
   * ① **원문과 제안이 같은 것** — 검사기가 표준어 대안을 표시만 하고 바꿀 게 없을 때 이렇게
   *    온다. 화면에 띄우면 「뭘 고치라는 거지」가 되고, 다른 제안의 신뢰까지 깎는다.
   * ② **원문이 비어 있는 것** — `origin_html` 의 밑줄 개수가 `html` 의 강조 개수와 다르면
   *    짝이 밀린다. 예전에는 빈 문자열을 그대로 넣어서 「→ 제안」만 보였다. 짝이 안 맞는
   *    것은 어느 낱말 얘긴지 알 수 없으니 버린다.
   *
   * 버린 개수는 `skipped` 로 돌려준다 — 조용히 지우면 「검사기가 놓쳤다」로 읽힌다.
   */
  const fixes = raw_fixes.filter((f) => f.before && f.after && norm(f.before) !== norm(f.after))

  return {
    fixes,
    // errata_count 를 믿되, 없으면 실제로 뽑힌 개수를 쓴다
    count: typeof r.errata_count === 'number' ? r.errata_count : fixes.length,
    skipped: raw_fixes.length - fixes.length,
  }
}

/**
 * 원문과 제안이 같은지 볼 때만 쓴다.
 *
 * **공백을 지우면 안 된다.** 띄어쓰기 교정은 공백만 다르다 (「밥먹었어요 → 밥 먹었어요」).
 * 공백을 지워서 비교하면 그 정당한 제안이 전부 「원문과 같음」으로 버려진다 —
 * 처음에 그렇게 썼다가 테스트가 잡았다. 연속 공백만 한 칸으로 줄여서 비교한다.
 */
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * 태그를 떼고 **HTML 엔티티를 풀어** 사람이 읽는 글자로 만든다.
 *
 * 엔티티를 안 풀어서 회원 화면에 「무너진다&quot; → 무너진다&quot;라는」이 떴다.
 * 따옴표가 든 문장은 우리 글에 흔하다 (상담 대화·리뷰 인용).
 */
function clean(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // &amp; 는 마지막에 — 먼저 풀면 &amp;quot; 가 따옴표로 잘못 바뀐다
    .replace(/&amp;/g, '&')
    .trim()
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
  /** 원문과 같거나 짝이 안 맞아서 버린 제안 수 */
  skipped: number
  /** 우리 낱말(상호명·키워드·기구 이름)이라 뺀 제안 수 */
  ours: number
  headline: string
}

/**
 * 검사기가 모르는 **우리 낱말.**
 *
 * 헬스장 기구·운동 이름은 표준 사전에 없어서 검사기가 엉뚱하게 고치라고 한다. 목록에 있는
 * 말이 든 제안은 아예 안 보여준다 — 매번 같은 것을 눈으로 걸러내게 하면 결국 아무도 안 본다.
 */
export const GYM_WORDS = [
  '랫풀다운', '렛풀다운', '스미스머신', '레그프레스', '레그컬', '레그익스텐션', '체스트프레스',
  '펙덱플라이', '천국의계단', '프리웨이트', '데드리프트', '루마니안', '케틀벨', '덤벨', '바벨',
  '스쿼트', '런지', '플랭크', '유산소존', '인바디', '오티', '피티', '스텝밀', '제로러너',
  '무동력', '트레드밀', '싸이클', '사이클', '푸시업', '풀업', '치닝디핑', '컨디셔닝',
]

/**
 * 우리 낱말이 든 제안을 뺀다.
 *
 * **키워드가 특히 중요하다.** 회원 화면에 「쌍용동PT까지 → 쌍용동 PT까지」가 떴는데, 그건
 * 따르면 안 되는 제안이다 — 검색 키워드는 붙여 써야 그 검색어에 걸린다. 검사기 말대로
 * 띄우면 키워드 횟수가 0 이 된다. 맞춤법보다 우선하는 규칙이라 목록에서 뺀다.
 */
export function dropOurWords(fixes: SpellFix[], ignore: string[]): { kept: SpellFix[]; ours: number } {
  const words = [...GYM_WORDS, ...ignore]
    .flatMap((w) => (w ?? '').split(/[^0-9A-Za-z가-힣]+/))
    .map((w) => w.trim())
    // 두 글자 미만은 너무 흔해서 멀쩡한 제안까지 지운다
    .filter((w) => w.length >= 2)
  const flat = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const hay = words.map(flat)
  const kept = fixes.filter((f) => {
    const b = flat(f.before)
    const a = flat(f.after)
    return !hay.some((w) => b.includes(w) || a.includes(w))
  })
  return { kept, ours: fixes.length - kept.length }
}

/**
 * 결과를 사람 말로 (순수 함수 — 테스트 대상).
 *
 * **못 읽은 덩어리가 있으면 그걸 먼저 말한다.** 「0건」과 「못 읽음」을 섞으면 안 된다.
 */
export function spellHeadline(
  fixes: SpellFix[],
  checked: number,
  failed: number,
  skipped = 0,
  ours = 0
): string {
  const part = failed
    ? ` 다만 ${failed}덩어리는 네이버 검사기가 호출을 막아 확인하지 못했습니다 (공식 API 가 아니라 자주 막힙니다) — 발행 전에 그 부분은 눈으로 한 번 보세요.`
    : ''
  /*
   * 버린 것을 **말한다.** 조용히 지우면 「검사기가 놓쳤다」로 읽히고, 다음에 같은 제안이
   * 안 보이는 이유도 모르게 된다.
   */
  const dropped = [
    skipped ? `원문과 같거나 짝이 안 맞은 제안 ${skipped}건` : '',
    ours ? `우리 낱말(상호명·키워드·기구 이름)이라 뺀 제안 ${ours}건` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const droppedPart = dropped ? ` ${dropped}은 빼고 보여줍니다.` : ''
  if (!checked) {
    return `네이버 맞춤법 검사기를 읽지 못했습니다 (${failed}덩어리 전부 실패). 지금은 검사 결과가 없는 상태이며, 맞춤법이 깨끗하다는 뜻이 아닙니다.`
  }
  if (!fixes.length) {
    return `${checked}덩어리를 검사했고 교정할 곳이 없습니다.${droppedPart}${part}`
  }
  const byKind = new Map<string, number>()
  for (const f of fixes) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)
  const summary = [...byKind.entries()].map(([k, n]) => `${k} ${n}건`).join(' · ')
  return `${checked}덩어리에서 ${fixes.length}건 나왔습니다 (${summary}).${droppedPart}${part}`
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

async function checkChunk(
  text: string,
  key: string
): Promise<{ fixes: SpellFix[]; skipped: number } | null> {
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
    return parsed ? { fixes: parsed.fixes, skipped: parsed.skipped } : null
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
export async function spellCheck(text: string, ignore: string[] = []): Promise<SpellReport> {
  const chunks = chunkForSpell(text)
  const found: SpellFix[] = []
  let checked = 0
  let failed = 0
  let skipped = 0

  for (const chunk of chunks) {
    let got: { fixes: SpellFix[]; skipped: number } | null = null
    for (let attempt = 0; attempt <= RETRIES && got === null; attempt++) {
      const key = await fetchKey()
      if (!key) continue
      got = await checkChunk(chunk, key)
    }
    if (got === null) failed++
    else {
      checked++
      found.push(...got.fixes)
      skipped += got.skipped
    }
  }

  // 같은 제안이 여러 덩어리에서 나오면 한 번만 보여준다
  const seen = new Set<string>()
  const unique = found.filter((f) => {
    const key = `${f.before}→${f.after}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  skipped += found.length - unique.length

  const { kept, ours } = dropOurWords(unique, ignore)

  return {
    fixes: kept,
    checked,
    failed,
    skipped,
    ours,
    headline: spellHeadline(kept, checked, failed, skipped, ours),
  }
}
