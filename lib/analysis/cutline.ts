import type { PostMetrics } from '../naver/blogpost'

/**
 * 이 키워드의 커트라인 — 상위 글 본문 실측값에서 뽑는다.
 *
 * 평균이 아니라 **중간값**을 쓴다. 상위권에는 이미지 40장짜리 글이 하나 섞여 있는
 * 일이 흔해서, 평균을 쓰면 목표가 비현실적으로 올라간다. 중간값은 "절반이 이보다
 * 많다" 는 뜻이라 목표로 삼기에 정직하다.
 *
 * **목표를 중간값보다 올리지 않는다** (2026-08-06 실측으로 고쳤다).
 *
 * 예전에는 「같은 수준은 겨우 붙는 조건이니 조금 더 얹자」로 본문 +10%, 이미지 +1장을
 * 목표로 줬다. 상위 글 161편을 재보니 그 논리가 반대로 갔다.
 *
 *   이미지  ~5장 4.79위(1~3위 38%) · **6~10장 4.27위(54%)** · 11~15장 5.82위(18%) ·
 *          16장 이상 6.35위(25%)
 *   분량    홍보글은 순위와 무관했고, 후기글은 1,700~2,200자가 가장 좋았으며
 *          3,000자 이상은 7.50위로 떨어졌다
 *
 * 즉 **더 많이 쓰는 것이 이기는 조건이 아니다.** 이미지 18장인 판에서 19장을 목표로 주면
 * 가장 나쁜 구간으로 밀어넣는 셈이었다. 그래서 이미지 목표는 6~10장으로 묶고, 분량은
 * 중간값에 맞추게 한다 (검수 기준과 부딪히지 않도록 구간 안으로 눌러 담는다).
 */

export interface Cutline {
  /** 실측한 글 수 */
  sampled: number
  charMedian: number
  imageMedian: number
  videoMedian: number
  /** 이 키워드에서 노려야 하는 값 */
  charTarget: number
  /** 이미지 목표 — 실측 최적 구간(6~10장) 안으로 눌러 담은 값 */
  imageTarget: number
  /** 상위 글이 우리 권장(10장)보다 많이 쓰고 있다 — 굳이 맞추지 말라고 설명해야 한다 */
  imageOvershoot: boolean
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

/**
 * 이미지 최적 구간 — 실측 161편.
 *   ~5장 1~3위 38% · **6~10장 54%** · 11~15장 18% · 16장 이상 25%
 * 1~3위가 실제로 쓴 장수는 중간값 8장, 7~10위는 12장이었다. 늘려서 이기는 항목이 아니다.
 */
export const IMAGE_BEST_MIN = 6
export const IMAGE_BEST_MAX = 10

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
    /*
     * 중간값에 맞춘다 (예전에는 ×1.1 이었다). 검수 기준과 부딪히지 않게 구간 안으로
     * 눌러 담는다 — 홍보글 1,750~2,400 · 후기글 1,700~2,800 이라 1,700~2,400 이 공통이다.
     * 처방이 「1,200자」라고 하는데 검수가 「1,750자 이상」이라고 하면 회원이 둘 사이에서
     * 헤맨다.
     */
    charTarget: Math.min(Math.max(roundUpTo(charMedian, 100), 1700), 2400),
    // 6~10장이 실측 최적 구간이다. 중간값이 그 밖이면 구간 쪽으로 당긴다
    imageTarget: Math.min(Math.max(imageMedian, IMAGE_BEST_MIN), IMAGE_BEST_MAX),
    imageOvershoot: imageMedian > IMAGE_BEST_MAX,
    // 중간값으로 판단하면 0,0,1,8 이 1 로 반올림돼 "절반 이상" 이 된다.
    // 물어야 하는 것은 "몇 편이 영상을 넣었나" 이므로 그대로 센다.
    videoExpected: metrics.filter((m) => m.videoCount >= 1).length / metrics.length > 0.5,
  }
}

/** 커트라인을 처방 한 줄로 (분석 화면·AI 지시문에 그대로 들어간다) */
export function cutlineLine(c: Cutline): string {
  const parts = [
    `상위 글 ${c.sampled}개를 실제로 읽어 재보니 본문 중간값이 ${c.charMedian.toLocaleString()}자, 이미지 ${c.imageMedian}장입니다`,
    `본문은 ${c.charTarget.toLocaleString()}자쯤 맞추면 충분합니다 — 늘려서 이기는 항목이 아닙니다`,
  ]
  /*
   * 상위 글이 10장을 넘겨 쓰고 있으면 **맞추지 말라고** 분명히 말한다.
   * 「상위가 18장인데 왜 6~10장이냐」가 당연한 의문이므로 이유를 같이 준다.
   */
  parts.push(
    c.imageOvershoot
      ? `이미지는 ${IMAGE_BEST_MIN}~${IMAGE_BEST_MAX}장으로 쓰세요 — 상위 글이 ${c.imageMedian}장을 쓰지만 실측에서 11장 이상은 오히려 순위가 낮았습니다(6~10장 1~3위 54% / 16장 이상 25%). 장수를 맞추려 하지 마세요`
      : `이미지는 ${IMAGE_BEST_MIN}~${IMAGE_BEST_MAX}장으로 쓰세요 (실측 최적 구간)`
  )
  if (c.videoExpected) {
    parts.push(`상위 글 절반 이상이 영상을 넣었으니 영상 ${Math.max(1, c.videoMedian)}개도 넣으세요`)
  }
  return `${parts.join('. ')}.`
}

/**
 * 저장된 커트라인의 목표값을 **지금 규칙으로 다시 계산한다** (순수 함수 — 테스트 대상).
 *
 * **왜 필요한가.** 처방은 분석할 때 문장으로 저장된다. 그래서 목표 규칙을 고쳐도 이미
 * 저장된 처방은 옛 문장을 그대로 들고 있다 — 회원이 키워드마다 「다시 분석」을 눌러야
 * 새 값이 나온다. 실제로는 아무도 안 누른다.
 *
 * 중간값(charMedian·imageMedian)은 **관측된 사실**이라 그대로 쓸 수 있다. 목표값만
 * 지금 규칙으로 다시 뽑으면, 옛 처방도 꺼낼 때 고쳐진다.
 */
export function refreshCutline(c: Cutline): Cutline {
  return {
    ...c,
    charTarget: Math.min(Math.max(roundUpTo(c.charMedian, 100), 1700), 2400),
    imageTarget: Math.min(Math.max(c.imageMedian, IMAGE_BEST_MIN), IMAGE_BEST_MAX),
    imageOvershoot: c.imageMedian > IMAGE_BEST_MAX,
  }
}

/** 커트라인 문장인지 — 저장된 옛 문장을 갈아끼울 때 쓴다 */
export function isCutlineLine(line: string): boolean {
  return line.includes('실제로 읽어 재보니') || line.includes('이 키워드의 목표는')
}
