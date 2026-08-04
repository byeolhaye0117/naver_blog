import type { Prescription } from '@/lib/types'

/**
 * 상위노출 처방을 키워드별로 보관하고 꺼내 쓴다.
 *
 * 왜 저장하나. 분석 화면에서 본 처방("제목을 31~39자로", "이미지 8장 이상")이 글 쓰는
 * 화면까지 오지 않으면 회원이 외워서 옮겨 적어야 한다 — 실제로는 아무도 안 한다.
 * 그래서 분석할 때 저장해 두고, 그 키워드로 글을 열면 자동으로 꺼내 AI 지시문에 넣는다.
 *
 * 전부 순수 함수다 — 저장소를 모른다.
 */

/** 띄어쓰기 차이로 못 찾는 일을 막는다 ("쌍용동 헬스장" = "쌍용동헬스장") */
export function prescriptionKey(keyword: string): string {
  return (keyword ?? '').replace(/\s+/g, '').toLowerCase()
}

/** 키워드당 하나만 남긴다 — 다시 분석하면 갱신 */
export function upsertPrescription(list: Prescription[], entry: Prescription): Prescription[] {
  const rest = list.filter((p) => p.key !== entry.key)
  // 새 것을 앞에 둔다. 무한정 쌓이지 않게 상한을 둔다 (저장소가 JSON 한 덩어리다)
  return [entry, ...rest].slice(0, 60)
}

export function findPrescription(
  list: Prescription[],
  keyword: string | undefined
): Prescription | undefined {
  const key = prescriptionKey(keyword ?? '')
  if (!key) return undefined
  return list.find((p) => p.key === key)
}

/** 며칠 전 분석인지 — 오래된 처방은 상위권이 이미 바뀌었을 수 있다 */
export function prescriptionAgeDays(date: string, today = new Date()): number {
  const t = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(t)) return 0
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)
  return Math.max(0, Math.round((now - t) / 86400000))
}

/** 이 처방을 그대로 믿어도 되나 (2주가 넘으면 다시 분석하라고 말해준다) */
export const PRESCRIPTION_STALE_DAYS = 14

export function isPrescriptionStale(date: string, today = new Date()): boolean {
  return prescriptionAgeDays(date, today) > PRESCRIPTION_STALE_DAYS
}
