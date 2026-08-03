// 네이버 API 자격증명 관리 + 키가 없을 때 쓰는 결정적(deterministic) 목업 난수.

export interface NaverKeys {
  /** 네이버 개발자센터 (검색 API·데이터랩) */
  clientId?: string
  clientSecret?: string
  /**
   * NAVER API HUB (네이버 클라우드 콘솔에서 발급).
   *
   * 개발자센터에서 쓰던 검색 API·데이터랩이 이쪽으로 이관됐다. 우리 개발자센터
   * 계정은 errorCode 024(Scope Status Invalid)로 검색 API 를 쓸 수 없었는데,
   * 허브는 발급 창구가 달라 그 제약을 받지 않는다.
   *
   * 헤더 이름이 X-NCP-APIGW-API-KEY-ID 라서 계정 Access Key ID 처럼 보이지만,
   * 실제로 넣는 값은 Application 의 Client ID 다.
   */
  hubClientId?: string
  hubClientSecret?: string
  /** 네이버 검색광고 (키워드도구 — 월간 검색량) */
  adApiKey?: string
  adSecret?: string
  adCustomerId?: string
}

export function getKeys(): NaverKeys {
  return {
    clientId: process.env.NAVER_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.NAVER_CLIENT_SECRET?.trim() || undefined,
    hubClientId: process.env.NAVER_HUB_CLIENT_ID?.trim() || undefined,
    hubClientSecret: process.env.NAVER_HUB_CLIENT_SECRET?.trim() || undefined,
    adApiKey: process.env.NAVER_AD_API_KEY?.trim() || undefined,
    adSecret: process.env.NAVER_AD_SECRET?.trim() || undefined,
    adCustomerId: process.env.NAVER_AD_CUSTOMER_ID?.trim() || undefined,
  }
}

/** API 허브 키가 있나 (있으면 개발자센터 대신 이쪽을 쓴다) */
export function hasHubKeys(): boolean {
  const k = getKeys()
  return Boolean(k.hubClientId && k.hubClientSecret)
}

/** 검색·트렌드를 호출할 수 있나 — 허브든 개발자센터든 하나만 있으면 된다 */
export function hasSearchKeys(): boolean {
  const k = getKeys()
  return hasHubKeys() || Boolean(k.clientId && k.clientSecret)
}

export const HUB_BASE = 'https://naverapihub.apigw.ntruss.com'

/**
 * 지금 쓸 창구와 인증 헤더.
 *
 * 허브가 있으면 허브를 쓴다 — 개발자센터 키는 이 계정에서 검색 API 권한이 없다.
 */
export function searchChannel(): {
  channel: 'hub' | 'dev'
  headers: Record<string, string>
} | null {
  const k = getKeys()
  if (k.hubClientId && k.hubClientSecret) {
    return {
      channel: 'hub',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': k.hubClientId,
        'X-NCP-APIGW-API-KEY': k.hubClientSecret,
      },
    }
  }
  if (k.clientId && k.clientSecret) {
    return {
      channel: 'dev',
      headers: {
        'X-Naver-Client-Id': k.clientId,
        'X-Naver-Client-Secret': k.clientSecret,
      },
    }
  }
  return null
}

export function hasAdKeys(): boolean {
  const k = getKeys()
  return Boolean(k.adApiKey && k.adSecret && k.adCustomerId)
}

export function keyStatus() {
  return {
    search: hasSearchKeys(),
    searchAd: hasAdKeys(),
    /** 어느 창구로 검색·트렌드를 부르고 있나 (화면에 밝히려고) */
    searchChannel: searchChannel()?.channel ?? null,
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
