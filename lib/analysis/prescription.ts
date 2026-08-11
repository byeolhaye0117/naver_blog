import type { Prescription, PostType } from '@/lib/types'
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

/**
 * 처방을 **글 유형에 맞게 걸러낸다** (순수 함수 — 테스트 대상).
 *
 * **왜 필요한가.** 처방은 키워드 단위로 저장되고 글 유형을 모른다. 그런데 어떤 처방은
 * 유형과 정면으로 부딪힌다. 실제로 회원이 홍보글을 요청했는데 후기 톤 글이 나왔고,
 * 원인은 처방의 이 줄이었다.
 *
 *   「상위 제목에 다른 업체 이름이 반복됩니다 … **우리도 방문 후기 형태로 맞붙거나**,
 *    세부 의도를 붙여 우회하세요.」
 *
 * 「글에 반영」을 켜면 이 문장이 AI 지시문으로 가고, 모델은 그대로 따른다 — 홍보글인데
 * 제목에 「후기」가 박히고 본문이 방문자 말투가 된다. 처방 자체는 맞는 조언이지만
 * **그건 후기글(gym-review-writer)에게 할 말**이다.
 *
 * 같은 이유로 「상위 제목에 반복되는 말: PT, 후기, 추천」에서 방문자 어휘를 뺀다 —
 * 홍보글에 「후기」를 반영하라고 하면 거짓 제목이 된다 (센터가 쓴 글이다).
 *
 * 저장된 문장을 고치지 않고 **꺼내 쓸 때** 거른다. 같은 처방이 후기글에는 그대로 쓸모가 있다.
 */
export function prescriptionForType(items: string[], type: PostType): string[] {
  if (type === 'review') return items
  /** 방문자만 쓸 수 있는 말 — 센터가 쓰는 글에 반영하면 거짓이 된다 */
  const VISITOR_WORDS = ['후기', '내돈내산', '체험', '리뷰']
  const out: string[] = []
  for (const line of items) {
    // 「방문 후기 형태로 맞붙어라」는 후기글에게 할 말이다
    if (line.includes('방문 후기 형태로 맞붙') || line.includes('후기글로 맞붙')) {
      out.push(
        line
          .replace(
            '우리도 방문 후기 형태로 맞붙거나, 세부 의도를 붙여 우회하세요.',
            '이 유형(홍보·정보글)에서는 후기로 맞붙지 않습니다 — 세부 의도를 붙여 우회하세요. 후기로 붙으려면 후기글로 따로 쓰는 것이 맞습니다.'
          )
          .replace(
            '**후기글로 맞붙거나**, 홍보·정보글이라면 세부 의도를 붙여 우회하세요.',
            '이 유형(홍보·정보글)에서는 후기로 맞붙지 않습니다 — 세부 의도를 붙여 우회하세요. 후기로 붙으려면 후기글로 따로 쓰는 것이 맞습니다.'
          )
      )
      continue
    }
    // 반영하라는 낱말 목록에서 방문자 어휘만 뺀다 (줄 전체를 버리지 않는다)
    const m = line.match(/^(상위 (?:제목에 반복되는 말|1~5위가 모두 쓴 말): )([^.]+)(\..*)$/)
    if (m) {
      const kept = m[2]
        .split(',')
        .map((w) => w.trim())
        .filter((w) => w && !VISITOR_WORDS.some((v) => w.includes(v)))
      if (!kept.length) continue
      out.push(`${m[1]}${kept.join(', ')}${m[3]}`)
      continue
    }
    out.push(line)
  }
  return out
}

/**
 * 회원이 빼달라고 한 낱말을 처방에서 걸러낸다 (순수 함수 — 테스트 대상).
 *
 * 회원 지적 (2026-08-11): "24시 내용 빼달라 그랬는데 더 홍보하고 있어." 프롬프트 전체를
 * 훑어보니 가장 센 자리가 여기였다:
 *
 *   - 상위 제목에 반복되는 말: **24시**, PT, 후기, 추천
 *
 * 「이 말들을 제목에 넣어라」는 뜻이라 요청과 정면으로 부딪힌다. 앵글을 바꿔도 이 줄이
 * 남아 있으면 모델은 24시를 쓴다 — 그리고 **처방은 구체적이라 더 강하게 따른다.**
 *
 * 낱말 목록에서는 그 말만 빼고 줄은 살린다 (나머지 낱말은 여전히 쓸모가 있다).
 * 줄 전체가 그 낱말 얘기면 줄을 버린다.
 */
export function dropExcluded(items: string[], excluded: string[]): string[] {
  const words = excluded.filter((w) => w && w.length >= 2)
  if (!words.length) return items
  const out: string[] = []
  for (const line of items) {
    // ① 반영하라는 낱말 목록 — 그 말만 뺀다
    const m = line.match(/^(상위 (?:제목에 반복되는 말|1~5위가 모두 쓴 말): )([^.]+)(\..*)$/)
    if (m) {
      const kept = m[2]
        .split(',')
        .map((w) => w.trim())
        .filter((w) => w && !words.some((x) => w.includes(x)))
      if (!kept.length) continue
      out.push(`${m[1]}${kept.join(', ')}${m[3]}`)
      continue
    }
    // ② 줄 전체가 그 낱말 얘기면 버린다 (「24시 검색량이 큽니다」 같은 조언)
    if (words.some((w) => line.includes(w))) continue
    out.push(line)
  }
  return out
}
