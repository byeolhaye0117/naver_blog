import type { PostType } from '@/lib/types'
import { WEAK, type FactorObservation } from './factors'

/**
 * 「이 키워드는 어떤 글이 유리한가」 제안.
 *
 * **왜 필요한가.** 실측에서 같은 업종인데 검색어에 따라 정반대로 나왔다 (2026-08-05,
 * 관찰소 6회):
 *   쌍용동 PT   → 경험 요소 **+0.78** (겪은 이야기를 쓴 글이 위에)
 *   천안 헬스장  → 경험 요소 **-0.81** (경험을 덜 쓴 글이 위에)
 * 「PT」는 사람을 겪은 이야기를 찾는 검색이고, 「○○ 헬스장」은 어디가 있는지 훑는
 * 검색이다. 같은 골격으로 둘 다 쓰면 한쪽은 늘 진다.
 *
 * **결정은 회원이 한다.** 앱은 근거를 펼쳐 보이고 제안만 한다 — 회원이 고른 유형과
 * 다르게 나올 수 있고, 그때 앱 말이 맞다고 볼 근거가 없다(관찰 6회, 표본 60편).
 */

export interface IntentInput {
  keyword: string
  /** 통합검색에서 이 키워드에 붙은 블록 이름들 (예: 「스포츠 인기글」) */
  blocks?: string[]
  /** 이 키워드로 쌓인 관찰 (없으면 블록 이름만으로 본다) */
  runs?: FactorObservation[]
}

export interface IntentSuggestion {
  /** 제안하는 글 유형 */
  suggest: PostType
  /** 왜 그렇게 봤는지 (근거 줄들) */
  reasons: string[]
  /** 얼마나 믿을 만한지 */
  confidence: 'measured' | 'blockOnly' | 'none'
  /** 화면에 그대로 띄우는 한 줄 */
  note: string
}

/**
 * 블록 이름이 알려주는 것.
 *
 * 실측: 「쌍용동 헬스장」·「천안 헬스장」 → 「스포츠 인기글」 / 「쌍용동 PT」 → 「인기글」 /
 * 「다이어트 정체기」 → 「AI 브리핑」·「네이버 클립」·「이미지」.
 * 앞의 셋은 블로그 글이 자리를 받는 판이고, 마지막은 블로그가 다른 형식과 겨루는 판이다.
 */
export function blockHint(blocks: string[] = []): string | null {
  const joined = blocks.join(' ')
  if (!joined.trim()) return null
  if (joined.includes('인기글')) {
    return '통합검색이 이 키워드에 「인기글」 블록을 줍니다 — 최신·반응이 좋은 글에 자리를 주는 블록입니다.'
  }
  if (joined.includes('AI 브리핑') || joined.includes('클립') || joined.includes('이미지')) {
    return '통합검색이 이 키워드에 「AI 브리핑·클립·이미지」를 먼저 줍니다 — 블로그 자리가 좁고 영상·이미지와 겨루는 판입니다.'
  }
  if (joined.includes('블로그')) {
    return '통합검색에 「블로그」 블록이 붙습니다 — 글로 승부가 나는 판입니다.'
  }
  return `통합검색 블록: ${blocks.slice(0, 3).join(' · ')}`
}

/** 그 키워드 관찰에서 경험·정보 신호를 꺼낸다 */
function signalOf(runs: FactorObservation[], key: 'experience' | 'info' | 'promo') {
  const got = runs
    .map((r) => r.results.find((x) => x.key === key))
    .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.advantage !== null)
  if (!got.length) return null
  const samples = got.reduce((n, r) => n + r.n, 0)
  const avg = got.reduce((a, r) => a + (r.advantage as number) * r.n, 0) / samples
  return { advantage: Math.round(avg * 100) / 100, runs: got.length, samples }
}

export function suggestPostType(input: IntentInput): IntentSuggestion {
  const reasons: string[] = []
  const hint = blockHint(input.blocks)
  if (hint) reasons.push(hint)

  const runs = (input.runs ?? []).filter((r) => r.keyword === input.keyword)
  const exp = signalOf(runs, 'experience')
  const info = signalOf(runs, 'info')

  if (exp) {
    reasons.push(
      exp.advantage >= WEAK
        ? `이 키워드 관찰 ${exp.runs}회에서 경험 요소가 +${exp.advantage} — 겪은 이야기를 쓴 글이 위에 있었습니다.`
        : exp.advantage <= -WEAK
          ? `이 키워드 관찰 ${exp.runs}회에서 경험 요소가 ${exp.advantage} — 경험을 덜 쓴 글이 오히려 위에 있었습니다.`
          : `이 키워드 관찰 ${exp.runs}회에서 경험 요소는 ${exp.advantage} 로 이렇다 할 방향이 없었습니다.`
    )
  }
  if (info) {
    reasons.push(
      info.advantage >= WEAK
        ? `정보 요소는 +${info.advantage} — 읽는 사람이 가져갈 정보가 많은 글이 위에 있었습니다.`
        : `정보 요소는 ${info.advantage} 입니다.`
    )
  }

  /*
   * 유형 고르기.
   *
   * 경험 신호가 뚜렷하면 후기글, 뚜렷하게 반대면 홍보글(센터가 1인칭으로 쓰는 글)로 본다.
   * 정보 신호만 강하고 지역 키워드가 아니면 정보글이다.
   * 근거가 약하면 **바꾸라고 하지 않는다** — 기본값 홍보글을 그대로 둔다.
   */
  const isLocal = /동|읍|면|구|시|역/.test(input.keyword)
  let suggest: PostType = 'promo'
  let confidence: IntentSuggestion['confidence'] = hint ? 'blockOnly' : 'none'

  if (exp && exp.advantage >= WEAK) {
    suggest = 'review'
    confidence = 'measured'
  } else if (exp && exp.advantage <= -WEAK) {
    suggest = 'promo'
    confidence = 'measured'
  } else if (!isLocal && info && info.advantage >= WEAK) {
    suggest = 'info'
    confidence = 'measured'
  }

  const label = { promo: '홍보글', info: '정보글', review: '후기글' }[suggest]
  const note =
    confidence === 'measured'
      ? `${label}이 유리해 보입니다 — 위 근거로 제안한 것이고, 관찰이 아직 적으니 회원님 판단이 우선입니다.`
      : confidence === 'blockOnly'
        ? `아직 이 키워드로 관찰한 기록이 없어 블록 이름만 보고 ${label}을 기본으로 뒀습니다. 상위노출 분석에서 「지금 관찰하기」를 누르면 근거가 쌓입니다.`
        : '근거가 없어 제안하지 않습니다. 상위노출 분석에서 이 키워드를 관찰하면 다음부터 근거가 붙습니다.'

  return { suggest, reasons, confidence, note }
}
