import type { RankSnapshot } from '@/lib/types'

/**
 * 고쳐서 다시 올린 글의 순위 변화 — **실험이다.**
 *
 * **왜 실험인가.** 관찰소에서 최신성이 가장 센 신호로 나왔다 (6회 중 5회 유리, 거꾸로
 * 0회). 그러면 새 글만 쓰는 것은 절반만 쓰는 셈이다 — 순위가 떨어진 옛 글에 정보를
 * 더해 다시 올리면 어떻게 될까?
 *
 * **모른다.** 네이버가 수정일을 순위에 반영하는지는 공개돼 있지 않고, 우리도 확인한
 * 적이 없다. 그래서 「수정하면 오릅니다」라고 말하지 않는다. 대신 **수정한 날을
 * 기록해 두고 그 앞뒤 순위를 비교해서 우리 판에서 실제로 어떤지 재본다.**
 *
 * 이 파일은 그 비교만 한다 (순수 함수 — 테스트 대상).
 */

/** 수정 직후 며칠은 판정하지 않는다 — 색인이 다시 돌 시간이 필요하다 */
export const SETTLE_DAYS = 3

export interface ReviseEffect {
  /** 수정 전 마지막으로 잰 순위 (null = 순위 밖 또는 기록 없음) */
  before: number | null
  /** 수정 후 가장 최근에 잰 순위 */
  after: number | null
  /** 며칠이 지났나 */
  daysSince: number
  /** 오른 칸 수 (+ = 위로). 한쪽이 없으면 null */
  delta: number | null
  /** 아직 판정하기 이른지 */
  tooEarly: boolean
  note: string
}

/**
 * 수정 전후 순위를 비교한다.
 *
 * 「수정 전」은 수정일 **이전**의 마지막 측정, 「수정 후」는 수정일 이후의 마지막 측정이다.
 * 수정일 당일 측정은 어느 쪽인지 알 수 없어(오전에 재고 오후에 고쳤을 수 있다) 쓰지 않는다.
 */
export function reviseEffect(
  snapshots: RankSnapshot[],
  revisedAt: string,
  today = new Date().toISOString().slice(0, 10)
): ReviseEffect | null {
  if (!revisedAt) return null
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const beforeSnaps = sorted.filter((s) => s.date < revisedAt)
  const afterSnaps = sorted.filter((s) => s.date > revisedAt)

  const before = beforeSnaps.length ? beforeSnaps[beforeSnaps.length - 1].rank : null
  const after = afterSnaps.length ? afterSnaps[afterSnaps.length - 1].rank : null
  const daysSince = Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${revisedAt}T00:00:00Z`)) / 86400000)
  )
  const tooEarly = daysSince < SETTLE_DAYS || afterSnaps.length === 0

  // 순위 숫자는 작을수록 위 — 오른 칸 수는 before - after 다
  const delta = before !== null && after !== null ? before - after : null

  let note: string
  if (!beforeSnaps.length) {
    note = '수정 전 순위 기록이 없어 비교할 수 없습니다. 다음부터는 고치기 전에 순위를 한 번 재두세요.'
  } else if (tooEarly) {
    note = `수정 후 ${daysSince}일 — 아직 판정하지 않습니다. 색인이 다시 도는 데 며칠 걸립니다 (${SETTLE_DAYS}일 지나고 다시 보세요).`
  } else if (delta === null) {
    note =
      after === null
        ? `수정 전 ${before}위였는데 수정 후에는 순위 안에서 못 찾았습니다. 수정이 도움이 됐다고 볼 수 없습니다.`
        : `수정 전에는 순위 밖이었고 지금은 ${after}위입니다 — 올라온 것은 맞지만 수정 때문인지는 이 기록만으로 알 수 없습니다.`
  } else if (delta > 0) {
    note = `수정 전 ${before}위 → 수정 후 ${after}위 (${delta}칸 올랐습니다). 다만 같은 기간에 경쟁 글이 바뀌었을 수도 있어, 수정이 원인이라고 단정할 수는 없습니다.`
  } else if (delta < 0) {
    note = `수정 전 ${before}위 → 수정 후 ${after}위 (${-delta}칸 내려갔습니다). 수정이 도움이 되지 않았거나, 경쟁 글이 새로 올라온 것입니다.`
  } else {
    note = `수정 전후 모두 ${before}위입니다 — 변화가 없었습니다.`
  }

  return { before, after, daysSince, delta, tooEarly, note }
}

/**
 * 여러 실험을 모아 「우리 판에서 수정이 통하나」를 본다.
 *
 * 하나로는 아무것도 알 수 없다 — 경쟁 글이 바뀐 것과 수정 효과를 가를 수 없기 때문이다.
 * 여러 번 쌓아 **오른 쪽이 몇 번인지** 세는 것이 우리가 할 수 있는 최선이다.
 */
export function reviseSummary(effects: ReviseEffect[]): string {
  const judged = effects.filter((e) => !e.tooEarly && e.delta !== null)
  if (!judged.length) {
    return '아직 판정할 수 있는 수정 기록이 없습니다. 고치기 전에 순위를 재두고, 3일 뒤에 다시 보세요.'
  }
  const up = judged.filter((e) => (e.delta as number) > 0).length
  const down = judged.filter((e) => (e.delta as number) < 0).length
  const same = judged.length - up - down
  const avg =
    Math.round(
      (judged.reduce((n, e) => n + (e.delta as number), 0) / judged.length) * 10
    ) / 10
  return `수정 기록 ${judged.length}건 — 오름 ${up} · 내림 ${down} · 그대로 ${same} (평균 ${avg > 0 ? '+' : ''}${avg}칸). 네이버가 수정일을 순위에 반영하는지는 공개돼 있지 않아, 이 숫자가 우리가 가진 유일한 근거입니다.`
}
