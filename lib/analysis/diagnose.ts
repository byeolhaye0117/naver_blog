import type { Post, SerpAnalysis } from '@/lib/types'
import { parseBody } from '../writing/checker'
import { looseIndexOf } from './serp'

/**
 * 발행 후 실패 진단 — 순위가 안 나올 때 무엇을 고쳐야 하는지.
 *
 * 지금까지 앱은 발행 후에 아무 말도 하지 않았다. 순위 그래프는 그려지지만 "그래서
 * 뭘 해야 하나" 가 없었다. 여기서 그 답을 만든다: **그 시점 상위권을 다시 분석해
 * 내 글과 항목별로 대조**하고, 차이가 큰 것부터 고칠 순서를 정해준다.
 *
 * 순수 함수다 — 네트워크를 타지 않는다. 상위권 분석 결과와 내 글을 받아 비교만 한다.
 */

export interface Fix {
  id: string
  label: string
  /** 내 글의 현재 값 */
  mine: string
  /** 상위 글 기준 */
  theirs: string
  /** 무엇을 하라는 것인지 — 그대로 AI 지시문에 들어간다 */
  action: string
  /** high = 이것부터 고친다 */
  severity: 'high' | 'mid'
}

export interface Diagnosis {
  /** 한 줄 판정 */
  verdict: string
  fixes: Fix[]
  /** 고칠 게 없을 때 다음에 할 일 */
  note?: string
}

/** 이 순위 밖이면 "안 잡혔다" 로 본다 */
export const OUT_OF_RANGE = 30
/** 발행 후 이만큼은 기다린다 — 네이버가 자리를 잡는 데 시간이 걸린다 */
export const SETTLE_DAYS = 14

/**
 * 지금 진단할 때인가.
 *
 * 발행 직후의 낮은 순위는 실패가 아니다. 반대로 2주가 지나도 30위 밖이면 그냥
 * 기다려서 올라가지 않는다 — 글을 고쳐야 한다.
 */
export function shouldDiagnose(rank: number | null, daysSincePublish: number): boolean {
  if (daysSincePublish < SETTLE_DAYS) return false
  return rank === null || rank > OUT_OF_RANGE
}

function n(v: number): string {
  return v.toLocaleString()
}

export function diagnose(input: {
  post: Post
  serp: SerpAnalysis
  rank: number | null
  daysSincePublish: number
}): Diagnosis {
  const { post, serp, rank } = input
  const fixes: Fix[] = []
  const parsed = parseBody(post.body)
  const charCount = parsed.prose.replace(/\s/g, '').length
  const title = post.title.trim()
  const kw = post.mainKeyword.trim()

  // ── 제목 ─────────────────────────────────────────────
  // 제목은 가장 먼저 본다. 상위권과 길이·키워드 위치가 어긋나면 본문을 고쳐도 안 잡힌다.
  const theirTitle = serp.stats.avgTitleLength
  if (theirTitle > 0 && title.length < theirTitle - 8) {
    fixes.push({
      id: 'title-short',
      label: '제목이 짧습니다',
      mine: `${title.length}자`,
      theirs: `상위 평균 ${theirTitle}자`,
      action: `제목을 ${Math.max(28, theirTitle - 4)}~${theirTitle + 4}자로 다시 쓰세요. 세부 의도(새벽·여성전용·가격·초보 같은 말)를 더 담으면 자연스럽게 길어집니다.`,
      severity: 'high',
    })
  }

  const pos = kw ? looseIndexOf(title, kw) : -1
  if (kw && pos < 0) {
    fixes.push({
      id: 'title-no-keyword',
      label: '제목에 메인 키워드가 없습니다',
      mine: '없음',
      theirs: `상위 글 ${serp.stats.keywordInTitleRate}%가 제목에 포함`,
      action: `제목 앞부분에 "${kw}"를 그대로 넣으세요.`,
      severity: 'high',
    })
  } else if (kw && pos > 6 && serp.stats.keywordFrontRate >= 50) {
    fixes.push({
      id: 'title-keyword-late',
      label: '제목에서 키워드가 뒤로 밀렸습니다',
      mine: `앞 ${pos + 1}자 뒤`,
      theirs: `상위 글 ${serp.stats.keywordFrontRate}%가 앞 7자 안`,
      action: `"${kw}"를 제목 맨 앞으로 옮기세요.`,
      severity: 'high',
    })
  }

  // ── 본문 실측 대조 ────────────────────────────────────
  // 커트라인이 있을 때만 비교한다. 없으면 "상위가 얼마인지" 를 모르는데 부족하다고 말할 수 없다.
  const c = serp.cutline
  if (c) {
    if (charCount < c.charMedian) {
      fixes.push({
        id: 'body-short',
        label: '본문이 상위 글보다 짧습니다',
        mine: `${n(charCount)}자`,
        theirs: `상위 중간값 ${n(c.charMedian)}자`,
        action: `본문을 ${n(c.charTarget)}자 이상으로 늘리세요. 분량만 채우지 말고 구체 수치(가격·운영시간·기구 수·거리)와 직접 겪은 장면을 더하세요.`,
        severity: 'high',
      })
    }
    if (parsed.images.length < c.imageMedian) {
      fixes.push({
        id: 'body-images',
        label: '이미지가 부족합니다',
        mine: `${parsed.images.length}장`,
        theirs: `상위 중간값 ${c.imageMedian}장`,
        action: `직접 촬영한 이미지를 ${c.imageTarget}장 이상으로 늘리세요.`,
        severity: 'high',
      })
    }
    if (c.videoExpected && !/\[영상|\[동영상/.test(post.body)) {
      fixes.push({
        id: 'body-video',
        label: '영상이 없습니다',
        mine: '없음',
        theirs: `상위 글 절반 이상이 영상 ${Math.max(1, c.videoMedian)}개`,
        action: '30초~3분 영상 1개를 넣으세요 (시설 한 바퀴·기구 사용 장면).',
        severity: 'mid',
      })
    }
  }

  // ── 소제목 ───────────────────────────────────────────
  if (parsed.headings.length < 4) {
    fixes.push({
      id: 'headings',
      label: '소제목이 적습니다',
      mine: `${parsed.headings.length}개`,
      theirs: '4~6개 권장',
      action: '소제목을 4개 이상으로 나누세요. 상위 제목에 반복되는 말을 소제목으로 쓰면 스마트블록에 걸릴 기회가 생깁니다.',
      severity: 'mid',
    })
  }

  // ── 상위권이 쓰는 말 ─────────────────────────────────
  const missingTokens = serp.stats.commonTokens
    .slice(0, 6)
    .filter((t) => !post.body.includes(t.token) && !title.includes(t.token))
    .map((t) => t.token)
  if (missingTokens.length >= 2) {
    fixes.push({
      id: 'tokens',
      label: '상위권이 쓰는 말이 글에 없습니다',
      mine: `${missingTokens.join(', ')} 없음`,
      theirs: '상위 제목에 반복 등장',
      action: `"${missingTokens.slice(0, 3).join('", "')}" 를 소제목이나 본문에 자연스럽게 넣으세요. 검색하는 사람이 실제로 알고 싶은 것입니다.`,
      severity: 'mid',
    })
  }

  // ── 최신성 ───────────────────────────────────────────
  if (serp.stats.datedCount >= 4 && serp.stats.freshWithin30dRate >= 60) {
    fixes.push({
      id: 'freshness',
      label: '상위권이 최근 글로 계속 교체됩니다',
      mine: `발행 후 ${input.daysSincePublish}일`,
      theirs: `상위 ${serp.stats.freshWithin30dRate}%가 30일 이내 글`,
      action:
        '이 키워드는 최신성 압박이 큽니다. 고쳐 쓴 뒤에도 밀리면 같은 주제를 새 글로 다시 올리는 편이 빠릅니다.',
      severity: 'mid',
    })
  }

  // ── 선점 ─────────────────────────────────────────────
  const worst = serp.stats.repeatBloggers[0]
  if (worst && worst.count >= 3) {
    fixes.push({
      id: 'dominated',
      label: '특정 블로그가 선점했습니다',
      mine: rank === null ? `${OUT_OF_RANGE}위 밖` : `${rank}위`,
      theirs: `"${worst.name}" 가 ${worst.count}칸`,
      action: `이 키워드는 정면으로 이기기 어렵습니다. "${post.mainKeyword} 가격"·"${post.mainKeyword} 새벽" 처럼 세부 의도를 붙인 키워드로 우회하세요.`,
      severity: 'mid',
    })
  }

  const high = fixes.filter((f) => f.severity === 'high').length
  const verdict = fixes.length
    ? rank === null
      ? `${OUT_OF_RANGE}위 안에 안 잡힙니다. 고칠 곳 ${fixes.length}개를 찾았습니다${high ? ` (먼저 고칠 것 ${high}개)` : ''}.`
      : `${rank}위입니다. 고칠 곳 ${fixes.length}개를 찾았습니다${high ? ` (먼저 고칠 것 ${high}개)` : ''}.`
    : '글 자체는 상위권 기준을 이미 맞췄습니다.'

  return {
    verdict,
    fixes: [...fixes].sort(
      (a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')
    ),
    note: fixes.length
      ? undefined
      : '이 키워드는 글 품질 문제가 아닙니다. 블로그 지수(C-Rank)가 쌓여야 하는 구간이니 정보글을 꾸준히 올리거나, 세부 의도를 붙인 키워드로 우회하세요.',
  }
}

/** 진단 결과를 처방 문장으로 — 글쓰기 화면이 이걸 그대로 AI 지시문에 넣는다 */
export function diagnosisToPrescription(d: Diagnosis): string[] {
  const out = d.fixes.map((f) => `${f.label} (지금 ${f.mine} / ${f.theirs}) → ${f.action}`)
  if (d.note) out.push(d.note)
  return out
}
