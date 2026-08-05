import { NextResponse } from 'next/server'
import { topBlogPosts } from '@/lib/naver/blogsection'
import { measureTopPosts } from '@/lib/naver/blogpost'
import { readDB, writeDB } from '@/lib/store'
import {
  buildObservation,
  daysBetween,
  poolFactors,
  poolHeadline,
  splitByArena,
  type FactorObservation,
  type FactorSample,
} from '@/lib/analysis/factors'
import { countSignals } from '@/lib/analysis/content'
import { isQuestionTitle } from '@/lib/analysis/title'
import { fetchLikeCounts } from '@/lib/naver/reaction'
import type { FactorRun } from '@/lib/types'

export const dynamic = 'force-dynamic'
// 상위 10편 목록 + 본문 8편 실측
export const maxDuration = 90

/** 순위를 볼 깊이 */
const TOP = 10
/** 본문까지 읽을 편수 */
const BODY = 8
/** 쌓아 둘 관찰 최대 개수 (오래된 것부터 버린다) */
const KEEP = 200
/**
 * 참고 키워드 상한.
 *
 * 크론이 하루에 도는 양은 정해져 있다(키워드 3개). 참고 키워드를 늘리면 그만큼 우리 판
 * 관찰이 밀린다 — 참고는 참고니까 우리 판보다 뒤로 둔다.
 */
const BENCHMARK_MAX = 5

/**
 * 랭킹 요인 관찰 — 「네이버가 무엇을 보고 띄워주는가」를 우리 판에서 재서 쌓는다.
 *
 * GET  : 지금까지 쌓인 관찰을 모아 보여준다 (네트워크 안 탐)
 * POST : 키워드 하나를 새로 관찰해 기록에 더한다
 *
 * 기준은 공개돼 있지 않고 조용히 바뀐다. 그래서 한 번 분석해 못 박는 대신 계속 다시
 * 재고, 관찰이 몇 번인지·표본이 몇 편인지 항상 함께 보여준다.
 */
export async function GET() {
  const db = await readDB()
  const runs = db.factorRuns ?? []
  /*
   * **판을 나눠서 집계한다.** 섞으면 숫자가 망가진다 — 실측에서 최신성이 지역 +0.63 /
   * 전국 +0.04, 홍보 요소가 지역 -0.18 / 전국 +0.63 으로 정반대였다.
   * 참고 판은 「우리도 이렇게 하자」가 아니라 「우리 판과 무엇이 다른가」를 보는 자리다.
   */
  const split = splitByArena(runs as never)
  const view = (list: FactorObservation[]) => {
    const pooled = poolFactors(list)
    return {
      runs: list.length,
      lastDate: list.length ? list[list.length - 1].date : null,
      keywords: Array.from(new Set(list.map((r) => r.keyword))),
      pooled,
      headline: poolHeadline(pooled, list),
      recent: list.slice(-6).reverse(),
    }
  }
  return NextResponse.json({
    local: view(split.local),
    reference: view(split.reference),
    benchmarkKeywords: db.benchmarkKeywords ?? [],
    // 예전 화면이 쓰던 모양 — 우리 판 기준으로 그대로 준다
    ...view(split.local),
  })
}

/** 참고할 전국 키워드 등록·삭제 */
export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      add?: string
      remove?: string
    }
    const add = body.add?.trim()
    const remove = body.remove?.trim()
    if (!add && !remove) {
      return NextResponse.json({ error: '추가하거나 지울 키워드를 넣어주세요.' }, { status: 400 })
    }
    const db = await readDB()
    let list = db.benchmarkKeywords ?? []
    if (remove) list = list.filter((k) => k !== remove)
    if (add && !list.includes(add)) {
      if (list.length >= BENCHMARK_MAX) {
        return NextResponse.json(
          {
            error: `참고 키워드는 ${BENCHMARK_MAX}개까지입니다. 매일 관찰해야 하므로 늘리면 우리 판 관찰이 밀립니다.`,
          },
          { status: 400 }
        )
      }
      list = [...list, add]
    }
    await writeDB({ ...db, benchmarkKeywords: list })
    return NextResponse.json({ benchmarkKeywords: list })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keyword?: string; save?: boolean; arena?: 'local' | 'reference' }
    const keyword = body.keyword?.trim()
    if (!keyword) {
      return NextResponse.json({ error: '관찰할 키워드를 넣어주세요.' }, { status: 400 })
    }

    const top = await topBlogPosts(keyword, TOP)
    if (!top.items.length) {
      return NextResponse.json(
        { error: '네이버에서 상위 글 목록을 가져오지 못했습니다. 잠시 후 다시 시도하세요.' },
        { status: 502 }
      )
    }

    // 본문 수치는 실제로 읽어야 나온다 (글자수·이미지·영상)
    const measured = await measureTopPosts(
      top.items.map((i) => i.url),
      BODY
    ).catch(() => [])
    const byUrl = new Map(measured.map((m) => [m.url, m]))
    // 공감 수는 본문과 다른 경로다 (블로그 화면이 쓰는 반응 API)
    const likes = await fetchLikeCounts(top.items.map((i) => i.url)).catch(() => new Map())

    const today = new Date().toISOString().slice(0, 10)
    const flatKeyword = keyword.replace(/\s+/g, '')

    const samples: FactorSample[] = top.items.map((it, i) => {
      const m = byUrl.get(it.url)
      const title = it.title ?? ''
      // 제목에서 키워드 위치 — 띄어쓰기가 달라도 찾아야 한다
      const flatTitle = title.replace(/\s+/g, '')
      const pos = flatTitle.indexOf(flatKeyword)
      return {
        rank: i + 1,
        // 날짜를 못 읽으면 null (0 으로 두면 "오늘 쓴 글" 이라는 거짓이 된다)
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
        keywordPos: pos,
      }
    })

    const observation = {
      ...buildObservation(keyword, today, samples),
      arena: body.arena === 'reference' ? ('reference' as const) : ('local' as const),
    }

    // 기록에 더한다 (같은 키워드·같은 날 관찰은 새 값으로 바꾼다)
    let saved = false
    if (body.save !== false) {
      try {
        const db = await readDB()
        const runs = (db.factorRuns ?? []).filter(
          (r) => !(r.keyword === keyword && r.date === today)
        )
        runs.push(observation as FactorRun)
        await writeDB({ ...db, factorRuns: runs.slice(-KEEP) })
        saved = true
      } catch {
        // 저장이 막혀도 관찰 결과 자체는 돌려준다 (읽기만 하는 값이다)
      }
    }

    return NextResponse.json({
      ...observation,
      saved,
      measured: measured.length,
      note:
        measured.length < samples.length
          ? `상위 ${samples.length}편 중 ${measured.length}편만 본문을 읽었습니다 — 나머지는 접근이 막힌 글입니다. 본문 관련 항목은 읽은 편수로만 계산했습니다.`
          : undefined,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '관찰 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
