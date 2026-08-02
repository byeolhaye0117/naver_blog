/**
 * 네이버 플레이스 정보 조회 (상호명 → 주소·업종·전화·예약링크).
 *
 * 스마트플레이스(사업주 콘솔)는 로그인이 필요해 읽을 수 없지만, **누구나 보는 통합검색
 * 결과에 플레이스 정보가 JSON 으로 들어 있다.** 그걸 그대로 읽는다.
 *
 * 다른 경로는 실측으로 막힌 것을 확인했다:
 *  - map.naver.com allSearch API → 서버 IP 에 캡차 (ncaptcha-all-search-no-result)
 *  - m.place.naver.com 목록/상세 → 자바스크립트로 그려서 HTML 에 정보가 없거나 429
 *
 * 공식 API 가 아니므로 언제든 응답 구조가 바뀔 수 있다. 실패하면 빈 배열을 돌려주고
 * 화면에서는 직접 입력으로 받는다.
 */

// 테스트용 주소 갈아끼우기 — 운영에서는 설정하지 않는다
const SEARCH = process.env.NAVER_SEARCH_ENDPOINT?.trim() || 'https://search.naver.com/search.naver'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 9000
const MAX_RESULTS = 6

export interface PlaceInfo {
  id: string
  /** 업체명 (검색어 강조 태그 제거) */
  name: string
  /** 업종 (예: 헬스장) */
  category: string
  /** 지번 주소 (예: 쌍용동 1149) */
  address: string
  /** 시·구·동 (예: 충남 천안시 서북구 쌍용동) */
  commonAddress: string
  /** 도로명 상세 (예: 미라7길 26 쌍봉빌딩 4층) */
  roadAddress: string
  phone: string | null
  bookingUrl: string | null
  homePage: string | null
  placeUrl: string
}

/** <mark> 강조 태그와 HTML 엔티티 제거 */
function clean(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/**
 * 통합검색 HTML 에서 플레이스 레코드를 뽑는다.
 *
 * HTML 이 거대하고(700KB) 구조가 자주 바뀌므로, DOM 을 파싱하지 않고
 * `"commonAddress"` 를 가진 JSON 객체만 중괄호 균형을 맞춰 잘라낸다.
 * 이 방식은 주변 마크업이 바뀌어도 살아남는다.
 */
export function parsePlaceRecords(html: string): PlaceInfo[] {
  const out: PlaceInfo[] = []
  const seen = new Set<string>()

  for (const m of html.matchAll(/"commonAddress"/g)) {
    const start = openingBrace(html, m.index)
    if (start < 0) continue
    const end = closingBrace(html, start)
    if (end < 0) continue

    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(html.slice(start, end + 1))
    } catch {
      continue
    }

    const str = (k: string): string => (typeof rec[k] === 'string' ? (rec[k] as string) : '')
    const id = str('id')
    const commonAddress = clean(str('commonAddress'))
    if (!id || !commonAddress || seen.has(id)) continue
    seen.add(id)

    out.push({
      id,
      name: clean(str('normalizedName') || str('name')),
      category: clean(str('category')),
      address: clean(str('address')),
      commonAddress,
      roadAddress: clean(str('roadAddress')),
      // phone 이 비어 있고 안심번호만 있는 업체가 많다
      phone: clean(str('phone')) || clean(str('virtualPhone')) || null,
      bookingUrl: str('bookingUrl') || null,
      homePage: str('homePage') || null,
      placeUrl: `https://m.place.naver.com/place/${id}/home`,
    })
    if (out.length >= MAX_RESULTS) break
  }

  return out
}

/** m.index 지점을 감싸는 여는 중괄호 위치 */
function openingBrace(h: string, from: number): number {
  let depth = 0
  for (let i = from; i >= 0; i--) {
    if (h[i] === '}') depth++
    else if (h[i] === '{') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}

/** start 의 짝이 되는 닫는 중괄호 위치 (문자열 안의 중괄호는 세지 않는다) */
function closingBrace(h: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < h.length; i++) {
    const c = h[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 상호명으로 플레이스 후보를 찾는다. 실패하면 빈 배열 */
export async function lookupPlaces(query: string): Promise<PlaceInfo[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const res = await fetch(`${SEARCH}?query=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return []
    return parsePlaceRecords(await res.text())
  } catch {
    return []
  }
}

/**
 * 플레이스 주소에서 동네 이름을 뽑는다.
 * commonAddress("충남 천안시 서북구 쌍용동")와 지번 주소("쌍용동 1149") 둘 다 본다.
 */
export function areasFromPlace(place: Pick<PlaceInfo, 'commonAddress' | 'address'>): string[] {
  const pool = `${place.commonAddress} ${place.address}`
  const found = Array.from(pool.matchAll(/([가-힣]{2,10}?(?:동|읍|면))(?=[\s,·/()[\]]|$)/g)).map(
    (m) => m[1]
  )
  return Array.from(new Set(found))
}
