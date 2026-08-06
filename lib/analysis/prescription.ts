import type { Prescription } from '@/lib/types'
import { cutlineLine, isCutlineLine, refreshCutline } from './cutline'
import type { Cutline } from './cutline'

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
  const found = list.find((p) => p.key === key)
  return found ? withFreshCutline(found) : undefined
}

/**
 * 꺼낼 때 커트라인 문장을 **지금 규칙으로 갈아끼운다** (순수 함수 — 테스트 대상).
 *
 * **왜 이렇게까지 하나.** 처방은 분석 시점에 **문장으로** 저장된다 (`items: string[]` —
 * 숫자가 아니다). 그래서 목표 규칙을 고쳐도 이미 저장된 처방은 옛 문장을 그대로 들고
 * 있고, 「글에 반영」을 켜면 그 문장이 AI 지시문으로 간다.
 *
 * 2026-08-06 에 「이미지는 중간값 +1장」을 「6~10장」으로 고쳤다. 그대로 두면 이미 저장된
 * 키워드는 계속 「이미지 19장 이상」을 지시한다 — 실측에서 **가장 나쁜 구간**이다.
 * 키워드마다 「다시 분석」을 눌러야 고쳐지는데 실제로는 아무도 안 누른다.
 *
 * 다행히 저장된 문장 안에 **관측값**이 남아 있다 ("본문 중간값이 1,933자, 이미지 18장").
 * 그 숫자를 읽어 목표만 지금 규칙으로 다시 뽑는다. 못 읽으면 건드리지 않는다 —
 * 형식이 다른 옛 문장을 억지로 고치다 뜻을 바꾸는 것보다 그대로 두는 게 낫다.
 */
export function withFreshCutline(rx: Prescription): Prescription {
  const items = rx.items ?? []
  if (!items.some(isCutlineLine)) return rx
  const rebuilt: string[] = []
  for (const line of items) {
    if (!isCutlineLine(line)) {
      rebuilt.push(line)
      continue
    }
    const parsed = parseCutlineLine(line)
    rebuilt.push(parsed ? cutlineLine(refreshCutline(parsed)) : line)
  }
  return { ...rx, items: rebuilt }
}

/** 저장된 커트라인 문장에서 관측값을 되읽는다 (형식이 다르면 null) */
export function parseCutlineLine(line: string): Cutline | null {
  const n = (s: string | undefined) => Number((s ?? '').replace(/,/g, ''))
  const sampled = line.match(/상위 글\s*([\d,]+)개/)
  const chars = line.match(/본문 중간값이\s*([\d,]+)자/)
  const imgs = line.match(/이미지\s*([\d,]+)장/)
  if (!sampled || !chars || !imgs) return null
  const video = line.match(/영상\s*([\d,]+)개/)
  return {
    sampled: n(sampled[1]),
    charMedian: n(chars[1]),
    imageMedian: n(imgs[1]),
    videoMedian: video ? n(video[1]) : 0,
    charTarget: 0,
    imageTarget: 0,
    imageOvershoot: false,
    videoExpected: /영상/.test(line),
  }
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
