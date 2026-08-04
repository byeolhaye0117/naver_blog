import type { PostMetrics } from '../naver/blogpost'

/**
 * 이 키워드의 커트라인 — 상위 글 본문 실측값에서 뽑는다.
 *
 * 평균이 아니라 **중간값**을 쓴다. 상위권에는 이미지 40장짜리 글이 하나 섞여 있는
 * 일이 흔해서, 평균을 쓰면 목표가 비현실적으로 올라간다. 중간값은 "절반이 이보다
 * 많다" 는 뜻이라 목표로 삼기에 정직하다.
 *
 * 목표값은 중간값보다 살짝 높게 잡는다 — 같은 수준으로 맞추는 것은 이기는 조건이
 * 아니라 겨우 붙는 조건이다.
 */

export interface Cutline {
  /** 실측한 글 수 */
  sampled: number
  charMedian: number
  imageMedian: number
  videoMedian: number
  /** 이 키워드에서 노려야 하는 값 */
  charTarget: number
  imageTarget: number
  /** 영상을 넣은 글이 절반을 넘는지 — 중간값이 아니라 "몇 편이 넣었나" 로 센다 */
  videoExpected: boolean
}

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** 100자 단위로 올려 사람이 기억할 수 있는 목표로 만든다 */
function roundUpTo(n: number, step: number): number {
  return Math.ceil(n / step) * step
}

/**
 * 실측값이 3개 미만이면 커트라인을 만들지 않는다 — 한두 글로 기준을 세우면
 * 그 글의 특이성이 기준이 된다.
 */
export const CUTLINE_MIN_SAMPLE = 3

export function buildCutline(metrics: PostMetrics[]): Cutline | null {
  if (metrics.length < CUTLINE_MIN_SAMPLE) return null

  const charMedian = median(metrics.map((m) => m.charCount))
  const imageMedian = median(metrics.map((m) => m.imageCount))
  const videoMedian = median(metrics.map((m) => m.videoCount))

  return {
    sampled: metrics.length,
    charMedian,
    imageMedian,
    videoMedian,
    // 중간값보다 10% 위, 100자 단위로 올림
    charTarget: roundUpTo(Math.round(charMedian * 1.1), 100),
    imageTarget: imageMedian + 1,
    // 중간값으로 판단하면 0,0,1,8 이 1 로 반올림돼 "절반 이상" 이 된다.
    // 물어야 하는 것은 "몇 편이 영상을 넣었나" 이므로 그대로 센다.
    videoExpected: metrics.filter((m) => m.videoCount >= 1).length / metrics.length > 0.5,
  }
}

/** 커트라인을 처방 한 줄로 (분석 화면·AI 지시문에 그대로 들어간다) */
export function cutlineLine(c: Cutline): string {
  const parts = [
    `상위 글 ${c.sampled}개를 실제로 읽어 재보니 본문 중간값이 ${c.charMedian.toLocaleString()}자, 이미지 ${c.imageMedian}장입니다`,
    `이 키워드의 목표는 본문 ${c.charTarget.toLocaleString()}자 이상, 이미지 ${c.imageTarget}장 이상입니다`,
  ]
  if (c.videoExpected) {
    parts.push(`상위 글 절반 이상이 영상을 넣었으니 영상 ${Math.max(1, c.videoMedian)}개도 넣으세요`)
  }
  return `${parts.join('. ')}.`
}
