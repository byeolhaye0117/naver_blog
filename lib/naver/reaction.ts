/**
 * 글의 공감 수 — 「인기글」 블록의 동력인가?
 *
 * **왜 재나.** 우리 지역 키워드는 통합검색에서 「인기글」 블록으로 나온다(실측). 이름이
 * 인기글이니 반응(공감)이 자리를 만든다고 짐작하기 쉽다. 그래서 실제로 재봤다.
 *
 * 실측 (2026-08-05):
 *   쌍용동 헬스장  1위 0 · 2위 23 · 3위 4 · 4~6위 0
 *   봉명동 헬스장  1위 0 · 2위 0 · 3위 0 · **4위 81** · 5위 0 · **6위 49**
 *
 * **공감이 가장 많은 글이 4위, 두 번째로 많은 글이 6위였다.** 즉 공감 수로 순위가
 * 설명되지 않는다. 그래도 관찰 대상에 넣는다 — 「공감을 늘리려 애쓸 필요 없다」를
 * 데이터로 말할 수 있고, 네이버가 기준을 바꾸면 여기서 보인다.
 *
 * 공식 API 가 아니다(블로그 화면이 쓰는 경로). 막히면 null 을 돌려주고, 0 으로 대신
 * 쓰지 않는다 — 「공감이 없다」와 「못 읽었다」는 다르다.
 */

const ENDPOINT =
  process.env.NAVER_LIKE_ENDPOINT?.trim() || 'https://blog.like.naver.com/v1/search/contents'
const TIMEOUT_MS = 5000

/** 주소에서 blogId / logNo 를 뽑는다 (순수 함수 — 테스트 대상) */
export function likeKey(url: string): string | null {
  const q = url.match(/[?&]blogId=([^&#]+)/i)
  if (q) {
    const log = url.match(/[?&]logNo=(\d+)/i)
    return log ? `${q[1]}_${log[1]}` : null
  }
  const m = url.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/i)
  return m ? `${m[1]}_${m[2]}` : null
}

/**
 * 응답에서 공감 합계를 센다 (순수 함수 — 테스트 대상).
 *
 * 반응은 종류별로 쪼개져 온다 (좋아요·감동·웃김…). 우리가 궁금한 것은 「반응이 몇 개
 * 붙었나」이므로 다 더한다. reactions 가 빈 배열이면 0 이다 — 그건 못 읽은 게 아니라
 * 실제로 없는 것이다.
 */
export function parseLikeCount(raw: string): number | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const contents = (json as { contents?: unknown[] })?.contents
  if (!Array.isArray(contents) || !contents.length) return null
  const reactions = (contents[0] as { reactions?: { count?: unknown }[] })?.reactions
  if (!Array.isArray(reactions)) return null
  let sum = 0
  for (const r of reactions) {
    const n = typeof r?.count === 'number' ? r.count : Number(r?.count)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

/** 공감 수. null = 못 읽음 (0 과 구별한다) */
export async function fetchLikeCount(url: string): Promise<number | null> {
  const key = likeKey(url)
  if (!key) return null
  const q = encodeURIComponent(`BLOG[${key}]`)
  try {
    const res = await fetch(
      `${ENDPOINT}?suppress_response_codes=true&pool=blogid&q=${q}&isDuplication=false`,
      {
        headers: { Referer: `https://blog.naver.com/${key.replace('_', '/')}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    )
    if (!res.ok) return null
    return parseLikeCount(await res.text())
  } catch {
    return null
  }
}

/** 여러 글을 한 번에 (동시에 다 던지면 막히므로 3개씩) */
export async function fetchLikeCounts(urls: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const BATCH = 3
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH)
    const got = await Promise.all(slice.map((u) => fetchLikeCount(u).catch(() => null)))
    slice.forEach((u, j) => {
      const n = got[j]
      if (n !== null) out.set(u, n)
    })
  }
  return out
}
