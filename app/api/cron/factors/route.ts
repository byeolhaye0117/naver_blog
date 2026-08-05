import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { topBlogPosts } from '@/lib/naver/blogsection'
import { measureTopPosts } from '@/lib/naver/blogpost'
import { buildObservation, daysBetween, type FactorSample } from '@/lib/analysis/factors'
import { areasFromStore } from '@/lib/analysis/keyword'
import { countSignals } from '@/lib/analysis/content'
import { countLoose } from '@/lib/writing/banned'
import { isQuestionTitle } from '@/lib/analysis/title'
import { fetchLikeCounts } from '@/lib/naver/reaction'
import type { FactorRun } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 한 번에 관찰할 키워드 수 (키워드마다 목록 1콜 + 본문 8콜) */
const MAX_KEYWORDS = 3
const TOP = 10
const BODY = 8
const KEEP = 200

/**
 * 랭킹 요인을 **주기적으로 다시 잰다.**
 *
 * 회원 요청 그대로다 — "네이버가 블로그 상위 노출 띄어주는 기준을 분석하고 매번 최신
 * 업데이트 되게." 한 번 분석해 못 박으면 그 순간부터 낡는다. 기준은 공개되지 않고 조용히
 * 바뀌므로, 같은 키워드를 계속 다시 재서 **방향이 유지되는지** 보는 게 유일하게 정직한
 * 방법이다.
 *
 * 매일 키워드 3개씩 돌아가며 잰다. 지점 지역 키워드를 순서대로 쓰고, 이미 오늘 잰
 * 키워드는 건너뛴다 — 그러면 며칠에 걸쳐 전 키워드를 한 바퀴 돈다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
  }

  const db = await readDB()
  const today = new Date().toISOString().slice(0, 10)
  const runs = db.factorRuns ?? []

  /*
   * 관찰할 키워드 고르기.
   *
   * 지점 지역 키워드 + 순위를 추적 중인 키워드를 합친다. 순위를 재고 있는 키워드는
   * 우리가 실제로 싸우는 판이라 관찰 값이 가장 쓸모 있다.
   */
  const pool = Array.from(
    new Set([
      ...db.rankTargets.map((t) => t.keyword),
      ...db.stores.flatMap((s) => {
        const areas = areasFromStore(s)
        return areas.map((a) => `${a} 헬스장`)
      }),
    ])
  ).filter(Boolean)

  /*
   * 참고용 전국 키워드 — **우리 판 뒤에 붙인다.**
   *
   * 회원 요청("전국에서 잘 되는 블로그 톤을 참고하자")으로 만든 자리다. 다만 순서를
   * 뒤로 둔다 — 하루에 도는 양이 정해져 있어서 앞에 두면 우리 판 관찰이 밀린다.
   * 집계도 섞지 않는다 (arena: 'reference').
   */
  const benchmark = (db.benchmarkKeywords ?? []).filter(Boolean)

  // 오늘 이미 잰 것은 건너뛰고, 가장 오래 안 잰 것부터
  const lastSeen = new Map<string, string>()
  for (const r of runs) lastSeen.set(r.keyword, r.date)
  const pick = (list: string[], n: number) =>
    list
      .filter((k) => lastSeen.get(k) !== today)
      .sort((a, b) => (lastSeen.get(a) ?? '').localeCompare(lastSeen.get(b) ?? ''))
      .slice(0, n)

  const localTargets = pick(pool, MAX_KEYWORDS)
  // 참고 판은 하루 1개만 — 남은 자리가 있을 때만 돈다
  const refTargets = pick(benchmark, Math.max(0, MAX_KEYWORDS + 1 - localTargets.length))
  const targets: { keyword: string; arena: 'local' | 'reference' }[] = [
    ...localTargets.map((keyword) => ({ keyword, arena: 'local' as const })),
    ...refTargets.map((keyword) => ({ keyword, arena: 'reference' as const })),
  ]

  const done: { keyword: string; sampled: number; measured: number; arena: string }[] = []
  const failed: { keyword: string; why: string }[] = []
  const fresh: FactorRun[] = []

  for (const { keyword, arena } of targets) {
    try {
      const top = await topBlogPosts(keyword, TOP)
      if (!top.items.length) {
        failed.push({ keyword, why: '상위 글 목록을 읽지 못했습니다.' })
        continue
      }
      const measured = await measureTopPosts(
        top.items.map((i) => i.url),
        BODY
      ).catch(() => [])
      const byUrl = new Map(measured.map((m) => [m.url, m]))
      // 공감 수는 본문과 다른 경로다 (블로그 화면이 쓰는 반응 API)
      const likes = await fetchLikeCounts(top.items.map((i) => i.url)).catch(() => new Map())
      const flatKeyword = keyword.replace(/\s+/g, '')

      const samples: FactorSample[] = top.items.map((it, i) => {
        const m = byUrl.get(it.url)
        const title = it.title ?? ''
        return {
          rank: i + 1,
          ageDays: it.date ? daysBetween(it.date, today) : null,
          charCount: m ? m.charCount : null,
          imageCount: m ? m.imageCount : null,
          videoCount: m ? m.videoCount : null,
          // 본문을 못 읽으면 null — 0 으로 두면 「정보가 하나도 없는 글」이라는 거짓이 된다
          infoWords: m ? countSignals(m.text).info : null,
          promoWords: m ? countSignals(m.text).promo : null,
          experienceWords: m ? countSignals(m.text).experience : null,
          likes: likes.has(it.url) ? (likes.get(it.url) as number) : null,
          titleLength: title.length,
          titleQuestion: isQuestionTitle(title) ? 1 : 0,
          keywordCount: m ? countLoose(`${title}\n${m.text}`, keyword) : null,
          density: m
            ? Math.round(
                ((keyword.replace(/\s+/g, '').length * countLoose(m.text, keyword)) /
                  Math.max(1, m.charCount)) *
                  1000
              ) / 10
            : null,
          keywordPos: title.replace(/\s+/g, '').indexOf(flatKeyword),
        }
      })

      fresh.push({ ...buildObservation(keyword, today, samples), arena } as FactorRun)
      done.push({ keyword, sampled: samples.length, measured: measured.length, arena })
    } catch (e) {
      failed.push({ keyword, why: e instanceof Error ? e.message : '관찰 실패' })
    }
  }

  if (fresh.length) {
    await mutate((cur) => {
      const keep = (cur.factorRuns ?? []).filter(
        (r) => !fresh.some((f) => f.keyword === r.keyword && f.date === r.date)
      )
      return { ...cur, factorRuns: [...keep, ...fresh].slice(-KEEP) }
    })
  }

  return NextResponse.json({
    date: today,
    pool: pool.length,
    benchmark: benchmark.length,
    observed: done,
    failed,
    stored: (await readDB()).factorRuns?.length ?? 0,
  })
}
