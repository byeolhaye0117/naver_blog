/**
 * **정보글 초안을 매일 하나씩 자동으로 써 둔다.**
 *
 * ── 회원 요청 (2026-08-21) ───────────────────────────────────
 * "정보성 블로그가 매일 1편씩 자동으로 작성되게 만들고 싶어."
 *
 * ── 먼저 못 하는 것부터 ─────────────────────────────────────
 * **네이버에 자동으로 발행할 수는 없다.** 네이버 블로그 글쓰기 API 가 없어졌고, 로그인해서
 * 대신 올려주는 방식은 자동화 도구로 취급돼 계정이 위험해진다. 이 앱이 회원 계정으로 글을
 * 올리는 일은 하지 않는다.
 *
 * 그래서 **여기까지가 자동이다**: 매일 밤 정보글 한 편을 써서 검수까지 돌려 초안으로 넣어
 * 둔다. 아침에 화면에서 열어 사진만 넣고 복사해 붙이면 끝난다. 손으로 하던 일 중 글쓰기가
 * 빠지는 것이고, 발행 버튼은 회원이 누른다.
 *
 * ── 왜 이 파일이 lib 에 있나 ────────────────────────────────
 * 라우트 파일은 테스트가 못 읽는다 (scripts/test.mjs 는 lib 만 컴파일한다). 「오늘 것이
 * 이미 있나」·「무엇을 쓸 차례인가」는 틀리면 매일 같은 글을 쓰거나 하루에 여러 편을 쓰는
 * 종류의 실수라, 테스트가 볼 수 있는 자리에 둔다. 라우트는 이 결정을 받아 실행만 한다.
 */
import type { Post } from '../types'

/**
 * 정보글 주제 풀.
 *
 * 화면(app/write/Editor.tsx)의 「주제 보기」 칩과 **같은 목록이어야 한다** — 두 곳에 따로
 * 적으면 한쪽만 늘어난다. 그래서 여기를 원본으로 두고 화면이 들여다 쓴다.
 *
 * 주제를 고를 때 기준은 하나다: **한 주제 안에서 정보 5종류가 채워지는가.** 실측에서 순위를
 * 가른 것이 정보의 종류 수였고(3~4종류 1~3위 17% / 5종류 이상 40%), 너무 좁은 주제는 그걸
 * 못 채운다.
 */
export const INFO_TOPICS: string[] = [
  '새벽 운동 시작하기',
  '다이어트 첫 달에 할 것',
  '처음 등록했을 때 첫 2주',
  '체중이 안 빠질 때 점검할 것',
  '하체 운동 자세 잡기',
  '퇴근 후 30분 루틴',
  '저녁 폭식이 반복될 때',
  '무릎이 아플 때 대신 할 운동',
  '운동해도 배가 안 빠질 때',
  '주 2회밖에 못 갈 때 짜는 순서',
]

/*
 * **유사성 3축(format·topicGroup)에 값을 넣지 않는다.**
 *
 * 처음엔 `format: 'auto'` 와 `topicGroup: 주제` 로 저장했는데, 그 둘은 이미 로테이션이
 * 쓰는 칸이다 (INFO_FORMATS·TOPIC_GROUPS). 거기에 다른 값을 넣으면 「최근에 안 쓴 형식」
 * 계산이 망가져서 **매번 같은 형식으로 쓰게 된다** — 자동화가 유사문서를 만드는 바로 그
 * 경로다. 그래서 자동 초안은 `auto`·`autoTopic` 이라는 자기 칸을 쓴다 (lib/types.ts).
 */

export interface Assignment {
  /** 정보글 메인 키워드 (지역 키워드를 메인으로 잡는다 — 2026-08-21 회원 결정) */
  mainKeyword: string
  /** 이번 글에서 다룰 주제 */
  topic: string
  /** 왜 이 조합인지 — 화면·로그에 그대로 적는다 */
  why: string
}

/** 그 글이 이 자동 초안 기능으로 쓰인 것인가 */
export function isAutoDraft(p: Pick<Post, 'auto'>): boolean {
  return p.auto === true
}

/** YYYY-MM-DD */
function day(iso?: string): string {
  return (iso ?? '').slice(0, 10)
}

/**
 * 오늘 몫이 이미 있나 — **크론이 두 번 불려도 하루 한 편**이다.
 *
 * Vercel 크론은 재시도가 있고, 회원이 화면에서 손으로 한 번 더 누를 수도 있다. 그때마다
 * 한 편씩 더 쌓이면 하루에 세 편이 생긴다 — 발행 간격이 무너지고, 같은 날 비슷한 글이
 * 여러 편이면 유사문서로 묶인다.
 */
export function hasTodayAutoDraft(posts: Post[] | undefined, today: string): boolean {
  return (posts ?? []).some((p) => isAutoDraft(p) && day(p.createdAt) === day(today))
}

/**
 * 무엇을 쓸 차례인가 — **가장 오래 안 쓴 (키워드 × 주제) 조합**을 고른다.
 *
 * ── 왜 조합으로 도는가 ──────────────────────────────────────
 * 키워드만 돌리면 4개짜리 목록이 나흘에 한 바퀴다. 같은 키워드로 나흘마다 쓰면 글이 서로
 * 닮고, 그건 유사문서로 묶이는 지름길이다. 주제까지 곱하면 키워드 4개 × 주제 10개 = 40일
 * 이라, 같은 조합이 다시 오기 전에 한 달이 지난다.
 *
 * ── 최근에 쓴 주제는 한 번 더 피한다 ────────────────────────
 * 조합이 달라도 **주제가 같으면 본문이 닮는다** (키워드는 제목·인사에만 들어간다). 그래서
 * 최근 글에 쓴 주제는 뒤로 미룬다. 다 걸리면(주제 수보다 최근 글이 많으면) 그때는 가장
 * 오래된 것을 쓴다 — 못 쓰는 것보다 낫다.
 */
export function pickAssignment(args: {
  posts: Post[] | undefined
  keywords: string[]
  topics?: string[]
  /** 이만큼 안에 쓴 주제는 피한다 */
  avoidRecent?: number
}): Assignment | null {
  const keywords = args.keywords.map((k) => k.trim()).filter(Boolean)
  const topics = (args.topics ?? INFO_TOPICS).map((t) => t.trim()).filter(Boolean)
  if (!keywords.length || !topics.length) return null

  /*
   * 정보글만 본다. 홍보글·후기글이 같은 키워드를 써도 본문이 전혀 다르므로 로테이션을
   * 흔들 이유가 없다.
   */
  const infoPosts = (args.posts ?? [])
    .filter((p) => p.type === 'info')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  /** 그 조합을 마지막으로 쓴 순서 (0 = 가장 최근). 안 썼으면 Infinity */
  const lastUsed = (kw: string, topic: string): number => {
    const i = infoPosts.findIndex((p) => p.mainKeyword === kw && p.autoTopic === topic)
    return i < 0 ? Infinity : i
  }
  /** 그 주제를 마지막으로 쓴 순서 — 키워드가 달라도 본문이 닮는다 */
  const topicLastUsed = (topic: string): number => {
    const i = infoPosts.findIndex((p) => p.autoTopic === topic)
    return i < 0 ? Infinity : i
  }

  const avoid = args.avoidRecent ?? Math.min(3, topics.length - 1)
  const pairs: { kw: string; topic: string; pairAge: number; topicAge: number }[] = []
  for (const kw of keywords) {
    for (const topic of topics) {
      pairs.push({ kw, topic, pairAge: lastUsed(kw, topic), topicAge: topicLastUsed(topic) })
    }
  }

  /*
   * 고르는 순서:
   *   ① 최근 `avoid` 편 안에 쓴 주제는 뒤로 (topicAge >= avoid 인 것을 먼저)
   *   ② 조합을 오래 안 쓴 순서 (pairAge 큰 것 먼저 — 안 쓴 것은 Infinity)
   *   ③ 주제를 오래 안 쓴 순서
   *   ④ 그래도 같으면 목록 순서 (같은 입력이면 늘 같은 답이 나오게)
   */
  const fresh = (p: (typeof pairs)[number]) => (p.topicAge >= avoid ? 0 : 1)
  pairs.sort(
    (a, b) =>
      fresh(a) - fresh(b) ||
      b.pairAge - a.pairAge ||
      b.topicAge - a.topicAge ||
      keywords.indexOf(a.kw) - keywords.indexOf(b.kw) ||
      topics.indexOf(a.topic) - topics.indexOf(b.topic)
  )

  const best = pairs[0]
  const never = best.pairAge === Infinity
  return {
    mainKeyword: best.kw,
    topic: best.topic,
    why: never
      ? `아직 안 쓴 조합입니다 (「${best.kw}」 × 「${best.topic}」).`
      : `이 조합을 가장 오래 안 썼습니다 — 정보글 ${best.pairAge + 1}편 전.`,
  }
}

/**
 * 초안이 쓸 만한가 — **점수로 거르지 않는다.**
 *
 * 발행선(85)에 못 미쳐도 지우지 않고 남긴다. 이유는 둘이다:
 *   ① 지워 버리면 회원이 **무엇이 왜 모자랐는지** 볼 기회가 없다. 검수 항목이 그걸 알려주는
 *      화면이 이미 있고, 고쳐 쓰기 버튼도 거기 있다.
 *   ② 자동으로 지우면 「오늘은 왜 글이 없지」가 된다. 조용히 아무 일도 안 한 것처럼 보인다.
 *
 * 대신 **화면에서 눈에 띄게** 한다 — 아래 `draftNote` 가 그 한 줄을 만든다.
 */
export function draftNote(score: number, threshold: number): { level: 'good' | 'warn'; text: string } {
  return score >= threshold
    ? { level: 'good', text: `${score}점 — 발행선(${threshold}) 넘었습니다. 사진 넣고 올리시면 됩니다.` }
    : {
        level: 'warn',
        text: `${score}점 — 발행선(${threshold})에 못 미칩니다. 검수 항목을 보고 「고쳐 쓰기」를 한 번 눌러 보세요.`,
      }
}
