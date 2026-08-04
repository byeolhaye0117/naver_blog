/**
 * 네이버 검색창 자동완성 — 사람들이 **실제로 치는 말**.
 *
 * **왜 필요한가.** 지금까지 후보 키워드는 우리가 만들었다 — 동네 × 의도 접미사(헬스장,
 * PT, 가격, 후기, 24시…). 그건 "이렇게 검색할 것 같다" 는 가설이다. 실제로 자동완성을
 * 읽어보니 우리가 한 번도 떠올리지 못한 말이 나왔다 (2026-08 실측):
 *
 *   쌍용동 헬스장  → 쌍용동 헬스장 24시 · 가격 · 추천 · **일일권** · 서북 천안쌍용동헬스장
 *   봉명동 헬스장  → 봉명동 헬스장 **일일권** · **1일권** · 24시
 *   천안 헬스장    → 천안 헬스장 일일권 · 추천 · 가격 · 24시 · **사우나** · **먹튀**
 *
 * 「일일권」·「사우나」는 우리 접미사 목록에 없었다. 반대로 「먹튀」는 검색량이 있어도
 * 우리가 노려서는 안 되는 말이다 — 그래서 걸러낸다.
 *
 * 공식 API 가 아니다. 막히면 null 을 돌려주고 기존 조합 생성은 그대로 굴러간다.
 */

const ENDPOINT = process.env.NAVER_AC_ENDPOINT?.trim() || 'https://ac.search.naver.com/nx/ac'
const TIMEOUT_MS = 5000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 한 씨앗에서 가져올 최대 개수 */
export const PER_SEED = 10

const flat = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/**
 * 자동완성 응답을 문자열 목록으로 (순수 함수 — 테스트 대상).
 *
 * 모양: `{ items: [ [ ["쌍용동 헬스장","0"], ... ] ] }`
 */
export function parseSuggest(raw: string): string[] {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return []
  }
  const items = (json as { items?: unknown[] })?.items
  if (!Array.isArray(items)) return []

  const out: string[] = []
  for (const group of items) {
    if (!Array.isArray(group)) continue
    for (const row of group) {
      // ["검색어", "0"] 꼴이지만 문자열만 오는 경우도 대비한다
      const word = Array.isArray(row) ? row[0] : row
      if (typeof word === 'string' && word.trim()) out.push(word.trim().replace(/\s+/g, ' '))
    }
  }
  return out
}

/**
 * 같은 말이 두 번 든 자동완성인지 (순수 함수 — 테스트 대상).
 *
 * 실측으로 나온 쓰레기값: 「쌍용동 PT 쌍용동pt」 · 「쌍용동 쌍용동pt」 ·
 * 「쌍용동 PT 쌍용동pt PT」. 자동완성이 원본 질의를 그대로 덧붙여 만든 꼴인데,
 * 사람이 실제로 그렇게 치지는 않는다. 깨끗한 형태는 검색광고 연관 목록에서 이미 온다.
 */
export function hasRepeatedToken(keyword: string): boolean {
  const parts = keyword.split(/\s+/).map(flat).filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    for (let j = 0; j < parts.length; j++) {
      if (i === j) continue
      if (parts[j].includes(parts[i])) return true
    }
  }
  return false
}

/**
 * 씨앗 검색어.
 *
 * 자동완성은 앞부분을 주면 뒤를 채워 준다. 그래서 의도를 우리가 짜 넣지 않고
 * **가장 짧은 뿌리**만 준다 — 뒤는 사람들이 실제로 치는 말로 채워진다.
 */
export function suggestSeeds(areas: string[], city?: string): string[] {
  const out: string[] = []
  for (const raw of areas.map((a) => a.trim()).filter(Boolean)) {
    out.push(`${raw} 헬스장`, `${raw} PT`)
    if (city) out.push(`${city} ${raw} 헬스장`)
  }
  if (city) out.push(`${city} 헬스장`)
  return Array.from(new Set(out))
}

/** 자동완성 한 번. 실패하면 null — 「없음」과 「못 읽음」은 다르다 */
export async function fetchSuggestions(query: string): Promise<string[] | null> {
  const q = query.trim()
  if (!q) return null
  const url =
    `${ENDPOINT}?q=${encodeURIComponent(q)}` +
    '&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100'
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://search.naver.com/' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseSuggest(await res.text()).slice(0, PER_SEED)
  } catch {
    return null
  }
}

/**
 * 씨앗 여러 개를 순서대로 물어본다.
 *
 * 동시에 던지면 막히므로 하나씩 간다 (씨앗은 많아도 7개라 3~4초면 끝난다).
 * 한 씨앗이 실패해도 나머지로 계속한다 — 몇 개 물어봤고 몇 개 답했는지 함께 돌려준다.
 */
export async function gatherSuggestions(
  seeds: string[]
): Promise<{ words: string[]; asked: number; answered: number }> {
  const seen = new Set<string>()
  const words: string[] = []
  let answered = 0

  for (const seed of seeds) {
    const got = await fetchSuggestions(seed)
    if (got === null) continue
    answered++
    for (const w of got) {
      const key = flat(w)
      if (seen.has(key)) continue
      seen.add(key)
      words.push(w)
    }
  }

  return { words, asked: seeds.length, answered }
}
