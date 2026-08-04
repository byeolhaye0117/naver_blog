import type { RankSnapshot, RankTarget } from '@/lib/types'
import { searchBlog } from '../naver/search'
import { findBlogRank, normalizeBlogUrl } from '../naver/blogsection'
import { fetchUnifiedBlocks, findUnifiedRank } from '../naver/unified'
import { seededInt } from '../naver/client'
import { newId } from '../id'
import { RANK_DEPTH, normalizeUrl } from './rank'

/**
 * 내 글이 이 키워드로 몇 위인지 찾는다. (서버 전용 — 네이버를 호출한다)
 *
 * **순서가 중요하다.**
 *  1. 블로그 섹션 검색 — 실제 블로그 검색 결과 화면이라 순서가 눈으로 보는 순위와 같다.
 *  2. 실패하면 검색 API — 공식이라 안정적이지만 sort=sim 순서가 화면과 달라 근사치다.
 *  3. 둘 다 없으면 목업.
 *
 * 정확한 글 URL이 없으면 블로그 주소만 넣어도 그 블로그의 최상위 노출 글 순위를 잡는다.
 */
export async function checkRank(target: RankTarget): Promise<RankSnapshot> {
  const date = new Date().toISOString().slice(0, 10)

  /**
   * 통합검색 스마트블록 위치도 함께 잰다 (조회 1번).
   *
   * 블로그탭 순위와 다르고, 사람이 실제로 보는 자리는 이쪽이다. 실패하면 그냥 없이
   * 간다 — 블로그탭 순위 기록을 막지 않는다.
   */
  const unified = await fetchUnifiedBlocks(target.keyword).catch(() => null)
  const hit = unified ? findUnifiedRank(unified, target.url) : null
  const unifiedFields = hit
    ? { unifiedBlock: hit.block, unifiedRank: hit.rank, unifiedBlockOrder: hit.blockOrder }
    : {}

  // ① 화면 순위와 같은 경로부터
  const section = await findBlogRank(target.keyword, target.url, RANK_DEPTH)
  if (section.ok) {
    return {
      id: newId('snap'),
      targetId: target.id,
      date,
      rank: section.rank,
      total: section.total ?? 0,
      ...unifiedFields,
      mock: false,
      source: 'api',
    }
  }

  // ② 섹션 검색이 막혔을 때만 공식 검색 API
  const needle = normalizeUrl(target.url)
  const flat = normalizeBlogUrl(target.url)
  const res = await searchBlog(target.keyword, { display: RANK_DEPTH, sort: 'sim' })

  let rank: number | null = null
  for (let i = 0; i < res.items.length; i++) {
    const link = normalizeBlogUrl(res.items[i].link)
    const blog = normalizeBlogUrl(res.items[i].bloggerlink)
    if (link === flat || link.startsWith(`${flat}/`) || flat.startsWith(`${link}/`) || blog === flat) {
      rank = i + 1
      break
    }
    // 회원이 주소를 대충 넣은 경우도 놓치지 않게 예전 판정을 함께 쓴다
    const loose = normalizeUrl(res.items[i].link)
    if (needle && (loose.includes(needle) || needle.includes(loose))) {
      rank = i + 1
      break
    }
  }

  // 목업 검색 결과에는 사용자의 실제 URL이 있을 수 없어서 항상 "순위 밖"이 나온다.
  // 그러면 키 없이 써보는 사람은 이 기능이 고장난 것처럼 느끼므로,
  // (키워드+URL)로 정해지는 기준 순위에 날짜별 흔들림을 얹어 그럴듯한 추이를 만든다.
  // mock: true 로 표시되므로 화면에서는 샘플 데이터임을 계속 알려준다.
  if (res.mock && rank === null) {
    const base = seededInt(`rank:${target.keyword}:${target.url}`, 3, 34)
    const wobble = seededInt(`rank:${target.keyword}:${target.url}:${date}`, 0, 8) - 4
    rank = Math.max(1, Math.min(RANK_DEPTH, base + wobble))
  }

  return {
    id: newId('snap'),
    targetId: target.id,
    date,
    rank,
    total: res.total,
    ...unifiedFields,
    mock: res.mock,
    source: 'api',
  }
}
