import { STRONG, WEAK, type FactorKey, type PooledFactor } from '../analysis/factors'

/**
 * 검수 기준을 **관찰에 연결한다.**
 *
 * **왜 필요한가.** 관찰소는 매일 상위 글을 다시 재지만, 검수 26개 항목은 상수로 박혀
 * 있었다 — checker.ts 가 관찰 기록을 한 번도 읽지 않았다. 그래서 네이버가 기준을 바꾸면
 * 관찰소 숫자만 바뀌고 **점수는 옛 기준 그대로** 남았다. 회원 요청("매번 최신 업데이트")의
 * 절반이 빠져 있던 셈이다.
 *
 * 여기서 하는 일은 두 가지다.
 *   1. 항목마다 「관찰 N회: 유리 x · 거꾸로 y」를 붙인다 — 왜 이 기준인지 보이게.
 *   2. 그 관찰에 따라 **가중치를 올리거나 내린다** — 거꾸로 나온 항목이 점수를 흔들지 않게.
 *
 * **하지 않는 일:** 목표 수치 자체를 자동으로 바꾸지 않는다. 「2,000자」를 관찰 평균으로
 * 갈아끼우는 것은 표본 60편으로 할 일이 아니고, 상위 글이 그렇다는 것과 그래야 오른다는
 * 것은 다르다. 가중치만 움직인다 — 근거가 없는 항목은 점수에서 조용히 물러난다.
 */

/** 검수 항목 ↔ 관찰 신호. 여기에 없는 항목은 아직 재는 방법이 없는 것이다. */
export const ITEM_FACTOR: Record<string, FactorKey> = {
  charCount: 'chars',
  titleLength: 'titleLength',
  titleKeyword: 'keywordFront',
  images: 'images',
  video: 'videos',
  'info-substance': 'info',
  'promo-restraint': 'promo',
}

/**
 * 근거만 붙이고 **비중은 절대 내리지 않는** 항목.
 *
 * 관찰과 검수가 같은 것을 재고 있지 않은 경우다. 「제목 앞쪽에 메인 키워드」가 그렇다 —
 * 관찰이 재는 것은 *제목 안에서 몇 번째 글자인지*지만, 이 항목이 실제로 걸러내는 것은
 * **제목에 키워드가 아예 없는 글**이다. 그건 상관이 아니라 조건이다: 제목에 없으면 그
 * 키워드로 거의 노출되지 않는다. 위치의 근거가 약하다고 이 항목을 1점으로 내리면,
 * 근거가 약한 부분(위치) 때문에 확실한 부분(존재)까지 같이 힘을 잃는다.
 */
export const ANNOTATE_ONLY = new Set(['titleKeyword'])

/** 가중치를 이 아래로는 내리지 않는다 — 0 으로 만들면 항목이 사라진 것처럼 보인다 */
export const MIN_WEIGHT = 1
/** 가중치를 이 위로는 올리지 않는다 — 관찰 몇 번으로 한 항목이 점수를 지배하면 안 된다 */
export const MAX_WEIGHT = 5
/** 이 횟수 미만이면 관찰로 가중치를 건드리지 않는다 (한두 번은 우연이다) */
export const MIN_RUNS = 3

export type EvidenceVerdict =
  /** 관찰이 없거나 너무 적다 — 손대지 않는다 */
  | 'none'
  /** 여러 관찰에서 뚜렷하게 유리했다 */
  | 'supported'
  /** 유리한 쪽이지만 약하다 */
  | 'weak'
  /** 거꾸로 나온 관찰이 유리한 관찰만큼 있다 — 서로 부딪힌다 */
  | 'mixed'
  /**
   * 부딪히지는 않지만 순위와 거의 같이 움직이지 않았다.
   *
   * mixed 와 구별한다. 「유리 2·거꾸로 2」와 「유리 1·거꾸로 0인데 평균 0.1」은 다른
   * 상황이고, 후자에 「방향이 갈립니다」라고 쓰면 없는 갈등을 만든 거짓말이 된다.
   */
  | 'flat'
  /** 거꾸로 나왔다 — 이 기준을 맞출수록 상위권과 멀어진다 */
  | 'against'

export interface ItemEvidence {
  key: FactorKey
  verdict: EvidenceVerdict
  /** 항목 아래 한 줄로 붙일 말 */
  line: string
  /** 관찰을 반영한 가중치 */
  weight: number
  /** 바뀌기 전 가중치 (화면에서 「내렸다」를 보여주려고 남긴다) */
  baseWeight: number
}

function verdictOf(p: PooledFactor): EvidenceVerdict {
  if (p.runs < MIN_RUNS || p.advantage === null) return 'none'
  if (p.advantage <= -WEAK) return 'against'
  /*
   * mixed 는 **양쪽이 실제로 부딪힐 때만** 쓴다.
   *
   * 프로덕션에서 잡혔다 — 「유리 0회 · 거꾸로 1회」(나머지 5회는 판정 불가)에
   * 「방향이 갈립니다」가 붙어 있었다. 갈린 게 아니라 한쪽만 약하게 나온 것이다.
   * 그래서 유리·거꾸로가 **둘 다** 있을 때만 갈렸다고 말한다.
   */
  if (p.agree > 0 && p.disagree > 0 && p.disagree >= p.agree) return 'mixed'
  if (Math.abs(p.advantage) < WEAK) return 'flat'
  return p.advantage >= STRONG && p.disagree === 0 ? 'supported' : 'weak'
}

/**
 * 판정에 따른 가중치.
 *
 * 올리는 폭(+1)은 내리는 폭보다 작다. 「이게 맞다」보다 「이건 근거가 없다」를 말하는 쪽이
 * 안전하기 때문이다 — 상관이 인과라는 보장이 없으므로, 관찰이 좋게 나왔다고 그 항목을
 * 점수의 주인으로 만들지는 않는다.
 */
function weightFor(base: number, verdict: EvidenceVerdict): number {
  switch (verdict) {
    case 'supported':
      return Math.min(MAX_WEIGHT, base + 1)
    case 'weak':
      return base
    case 'mixed':
    case 'flat':
    case 'against':
      return MIN_WEIGHT
    case 'none':
      return base
  }
}

function lineFor(p: PooledFactor, verdict: EvidenceVerdict): string {
  const runs = `관찰 ${p.runs}회 · 상위 글 ${p.samples}편`
  switch (verdict) {
    case 'none':
      return p.runs === 0
        ? '아직 관찰 기록이 없어 이 기준은 업계 통설입니다 — 관찰소에서 재보면 여기에 근거가 붙습니다.'
        : `관찰 ${p.runs}회뿐입니다 (${MIN_RUNS}회부터 점수에 반영). 아직은 업계 통설 기준입니다.`
    case 'supported':
      return `${runs}: 유리 ${p.agree}회 · 거꾸로 ${p.disagree}회 (평균 ${p.advantage}) — 상위권이 실제로 이렇게 쓰고 있습니다.`
    case 'weak':
      return `${runs}: 유리 ${p.agree}회 · 거꾸로 ${p.disagree}회 (평균 ${p.advantage}) — 방향은 맞지만 약합니다.`
    case 'mixed':
      return `${runs}: 유리 ${p.agree}회 · 거꾸로 ${p.disagree}회 — 방향이 갈립니다. 순위를 가르는 요인으로 보기 어렵습니다.`
    case 'flat':
      return `${runs}: 유리 ${p.agree}회 · 거꾸로 ${p.disagree}회 (평균 ${p.advantage}) — 순위와 뚜렷하게 같이 움직이지 않았습니다. 규격으로 맞출 필요는 없습니다.`
    case 'against':
      return `${runs}: 거꾸로 ${p.disagree}회 (평균 ${p.advantage}) — 이 기준을 맞춘 글이 오히려 아래에 있었습니다. 맞춰도 좋지만 이걸로 순위가 오르진 않습니다.`
  }
}

/**
 * 관찰 묶음 → 항목별 근거.
 *
 * `pooled` 가 비어 있으면 빈 Map 을 돌려준다 — 그러면 검수는 원래 가중치로 돈다.
 * 「근거가 없다」와 「근거가 나쁘다」를 섞지 않기 위해서다.
 */
export function itemEvidence(
  pooled: PooledFactor[] | undefined,
  baseWeights: Record<string, number>
): Map<string, ItemEvidence> {
  const out = new Map<string, ItemEvidence>()
  if (!pooled?.length) return out
  for (const [itemId, key] of Object.entries(ITEM_FACTOR)) {
    const p = pooled.find((x) => x.key === key)
    if (!p) continue
    const base = baseWeights[itemId]
    if (typeof base !== 'number') continue
    const verdict = verdictOf(p)
    // 근거만 붙일 항목은 비중을 그대로 둔다 (ANNOTATE_ONLY 주석)
    const weight = ANNOTATE_ONLY.has(itemId) ? base : weightFor(base, verdict)
    out.set(itemId, { key, verdict, line: lineFor(p, verdict), weight, baseWeight: base })
  }
  return out
}

/**
 * 화면 위쪽에 한 줄로 — 「이 점수의 근거가 얼마나 되나」.
 *
 * 점수를 믿을 만한지 먼저 말해준다. 26개 항목 중 관찰로 확인된 게 3개면 그렇다고 밝히는
 * 편이, 85점을 근거 있는 85점처럼 보이게 두는 것보다 낫다.
 */
export function evidenceHeadline(ev: Map<string, ItemEvidence>, itemCount: number): string {
  if (!ev.size) {
    return `검수 ${itemCount}개 항목이 모두 업계 통설 기준입니다. 관찰소에서 상위 글을 재면 항목마다 근거가 붙고, 근거가 없거나 거꾸로인 항목은 점수 비중이 내려갑니다.`
  }
  const list = [...ev.values()]
  const backed = list.filter((e) => e.verdict === 'supported' || e.verdict === 'weak').length
  const lowered = list.filter((e) => e.weight < e.baseWeight).length
  const parts = [`검수 ${itemCount}개 항목 중 ${list.length}개를 관찰과 맞춰봤습니다`]
  parts.push(`근거 있음 ${backed}개`)
  if (lowered) parts.push(`근거가 약해 비중을 낮춘 항목 ${lowered}개`)
  parts.push(`나머지 ${itemCount - list.length}개는 아직 재는 방법이 없어 업계 통설 기준입니다`)
  return `${parts.join(' · ')}.`
}
