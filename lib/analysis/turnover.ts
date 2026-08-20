/**
 * **자리 회전** — 그 키워드 1페이지가 실제로 얼마나 갈리나.
 *
 * ── 왜 만들었나 (2026-08-20) ─────────────────────────────────
 * 회원 요청: "쌍용동 헬스장, 두정동 헬스장에 상위 노출하려면 어떻게 해야 하냐. 다른
 * 키워드로 우회하고 싶지 않다."
 *
 * 그래서 10일치 조사 기록(studyRuns)으로 그 두 자리의 1페이지를 날짜별로 비교해 봤다.
 *
 *   쌍용동 헬스장 — 9일 동안 새 진입 14편 (하루 1.6편). 첫날 10편 중 5편만 마지막 날에 남음
 *   두정동 헬스장 — 9일 동안 새 진입 14편 (하루 1.6편). 첫날 10편 중 3편만 남음
 *
 * **둘 다 「굳은 자리」가 아니었다.** 1페이지는 주당 11편씩 갈리고 있었다.
 *
 * 내가 만든 등급이 그걸 못 봤다. `openingOf` 는 「1페이지에 7일 이내 글이 있나」만 봤는데,
 * 이 판의 진입 나이는 중간값 36일이고 10% 지점이 9일이다 — 즉 **갓 쓴 글이 바로 올라오지
 * 않을 뿐, 몇 주 뒤에 올라온다.** 그런데 등급은 그걸 「굳은 자리」로 적었고, 그 말은
 * 「못 들어간다」로 읽힌다. 회원이 우회로 얘기를 거절한 것이 맞다 — 우회할 필요가 없는
 * 자리였다.
 *
 * 그래서 자리 회전을 따로 재서 함께 보여준다. 등급은 「갓 올라온 글이 있나」로 이름을
 * 바꿨고(그게 실제로 재는 것이다), 「들어갈 수 있나」는 이 회전 수가 답한다.
 */

export interface DailyTop {
  /** YYYY-MM-DD */
  date: string
  /** 그날 1페이지 글 주소 (순위 순) */
  urls: string[]
}

export interface Turnover {
  /** 비교한 날 수 */
  days: number
  /** 그 기간에 새로 들어온 글 수 */
  entries: number
  /** 주당 새 진입 (7일로 환산) */
  perWeek: number
  /** 첫날 1페이지 글 중 마지막 날에도 있는 수 */
  kept: number
  /** 첫날 1페이지 글 수 */
  keptOf: number
}

/**
 * 날짜별 1페이지 목록에서 새 진입 수를 센다.
 *
 * 어제 없던 주소가 오늘 있으면 **새 진입 1편**이다. 순위가 3위→7위로 내려간 것은 세지
 * 않는다 — 우리가 알고 싶은 것은 「자리가 나는가」이고, 그건 들어온 글 수로 답한다.
 */
export function turnoverOf(daily: DailyTop[]): Turnover | null {
  const days = daily.filter((d) => d.urls.length)
  if (days.length < 2) return null
  let entries = 0
  for (let i = 1; i < days.length; i++) {
    const prev = new Set(days[i - 1].urls)
    entries += days[i].urls.filter((u) => !prev.has(u)).length
  }
  const span = days.length - 1
  const first = new Set(days[0].urls)
  const last = new Set(days[days.length - 1].urls)
  return {
    days: days.length,
    entries,
    perWeek: Math.round((entries / span) * 7 * 10) / 10,
    kept: [...first].filter((u) => last.has(u)).length,
    keptOf: first.size,
  }
}

/**
 * 조사 기록 한 줄 — studyRuns 의 모양 중 여기서 쓰는 부분만.
 *
 * `posts` 를 `unknown[]` 으로 받는다. DB 의 StudyRunRecord 가 그 모양이고(조사 지표가
 * 계속 늘어나서 통째로 저장한다), 여기서 필요한 것은 url·ranks 두 개뿐이다.
 */
export interface StudyRunLike {
  date: string
  posts?: unknown[]
}

interface StudyPostLike {
  url?: unknown
  ranks?: unknown
}

/**
 * 쌓아둔 조사 기록에서 한 키워드의 날짜별 1페이지를 뽑는다.
 *
 * 조사 크론이 매일 상위 글과 순위를 저장해 두므로(studyRuns), 회전을 재려고 네이버를 다시
 * 부를 필요가 없다. **이미 있는 자료로 답할 수 있는 질문이었다.**
 */
export function dailyTopFrom(runs: StudyRunLike[], keyword: string, top = 10): DailyTop[] {
  const out: DailyTop[] = []
  for (const run of [...runs].sort((a, b) => a.date.localeCompare(b.date))) {
    const hits: { rank: number; url: string }[] = []
    for (const raw of run.posts ?? []) {
      const p = raw as StudyPostLike
      const ranks = (p.ranks ?? {}) as Record<string, unknown>
      const rank = ranks[keyword]
      if (typeof p.url === 'string' && typeof rank === 'number' && rank <= top) hits.push({ rank, url: p.url })
    }
    if (hits.length) out.push({ date: run.date, urls: hits.sort((a, b) => a.rank - b.rank).map((h) => h.url) })
  }
  return out
}

/** 회전을 사람 말로 (화면과 지시문이 같은 문장을 쓰게) */
export function turnoverNote(t: Turnover | null): string | null {
  if (!t) return null
  return `${t.days}일 동안 1페이지에 새로 들어온 글 ${t.entries}편 (주당 ${t.perWeek}편) · 첫날 ${t.keptOf}편 중 ${t.kept}편만 남았습니다`
}
