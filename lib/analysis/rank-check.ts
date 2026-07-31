import type { RankSnapshot, RankTarget } from '@/lib/types'
import { searchBlog } from '../naver/search'
import { seededInt } from '../naver/client'
import { newId } from '../id'
import { RANK_DEPTH, normalizeUrl } from './rank'

/**
 * 내 글이 이 키워드로 몇 위인지 찾는다. (서버 전용 — 네이버 API 를 호출한다)
 * 정확한 글 URL이 없으면 블로그 ID만 넣어도 그 블로그의 최상위 노출 글 순위를 잡는다.
 */
export async function checkRank(target: RankTarget): Promise<RankSnapshot> {
  const needle = normalizeUrl(target.url)
  const res = await searchBlog(target.keyword, { display: RANK_DEPTH, sort: 'sim' })

  let rank: number | null = null
  for (let i = 0; i < res.items.length; i++) {
    const link = normalizeUrl(res.items[i].link)
    const blog = normalizeUrl(res.items[i].bloggerlink)
    if (link.includes(needle) || needle.includes(link) || blog.includes(needle)) {
      rank = i + 1
      break
    }
  }

  const date = new Date().toISOString().slice(0, 10)

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
    mock: res.mock,
  }
}
