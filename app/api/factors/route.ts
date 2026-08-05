import { NextResponse } from 'next/server'
import { topBlogPosts } from '@/lib/naver/blogsection'
import { measureTopPosts } from '@/lib/naver/blogpost'
import { readDB, writeDB } from '@/lib/store'
import {
  buildObservation,
  daysBetween,
  poolFactors,
  poolHeadline,
  type FactorSample,
} from '@/lib/analysis/factors'
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
  const pooled = poolFactors(runs as never)
  return NextResponse.json({
    runs: runs.length,
    lastDate: runs.length ? runs[runs.length - 1].date : null,
    keywords: Array.from(new Set(runs.map((r) => r.keyword))),
    pooled,
    headline: poolHeadline(pooled, runs as never),
    recent: runs.slice(-8).reverse(),
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keyword?: string; save?: boolean }
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
        titleLength: title.length,
        keywordPos: pos,
      }
    })

    const observation = buildObservation(keyword, today, samples)

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
