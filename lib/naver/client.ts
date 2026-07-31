// 네이버 API 자격증명 관리 + 키가 없을 때 쓰는 결정적(deterministic) 목업 난수.

export interface NaverKeys {
  /** 네이버 개발자센터 (검색 API·데이터랩) */
  clientId?: string
  clientSecret?: string
  /** 네이버 검색광고 (키워드도구 — 월간 검색량) */
  adApiKey?: string
  adSecret?: string
  adCustomerId?: string
}

export function getKeys(): NaverKeys {
  return {
    clientId: process.env.NAVER_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.NAVER_CLIENT_SECRET?.trim() || undefined,
    adApiKey: process.env.NAVER_AD_API_KEY?.trim() || undefined,
    adSecret: process.env.NAVER_AD_SECRET?.trim() || undefined,
    adCustomerId: process.env.NAVER_AD_CUSTOMER_ID?.trim() || undefined,
  }
}

export function hasSearchKeys(): boolean {
  const k = getKeys()
  return Boolean(k.clientId && k.clientSecret)
}

export function hasAdKeys(): boolean {
  const k = getKeys()
  return Boolean(k.adApiKey && k.adSecret && k.adCustomerId)
}

export function keyStatus() {
  return {
    search: hasSearchKeys(),
    searchAd: hasAdKeys(),
  }
}

// ─── 목업용 결정적 난수 ────────────────────────────────────────
// 같은 키워드에 대해 항상 같은 값이 나와야 화면이 흔들리지 않는다.

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** seed 로 초기화되는 0~1 난수 생성기 (mulberry32) */
export function seededRandom(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededInt(seed: string, min: number, max: number): number {
  return Math.floor(seededRandom(seed)() * (max - min + 1)) + min
}

export class NaverApiError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'NaverApiError'
    this.status = status
  }
}
