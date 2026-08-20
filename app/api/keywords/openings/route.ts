import { NextResponse } from 'next/server'
import { mutate, readDB } from '@/lib/store'
import { OPENING_RUNS_KEEP } from '@/lib/analysis/openings'
import { keywordOwners, mergeOpeningRuns, scanDetours, scanOpenings } from '@/lib/analysis/openings-scan'
import type { OpeningRun } from '@/lib/types'

export const dynamic = 'force-dynamic'
/** 키워드마다 목록 1콜 + 발행량 조회라 시간이 걸린다 */
export const maxDuration = 300

/** 한 번에 잴 키워드 수 — 넘치면 화면에서 다음 묶음을 요청한다 */
const MAX_KEYWORDS = 24

/**
 * **지금 뚫릴 만한 키워드 찾기.**
 *
 * 회원 질문 (2026-08-18): "페이지에 업데이트된 거야?" — 아니었다. 순위표를 스크립트
 * (`npm run keywords:openings`)로만 뽑고 있었으니, 회원은 볼 방법이 없었다. 판단에 쓰는
 * 자료를 제 터미널에만 두는 것은 도구를 만든 게 아니다.
 *
 * 블로그 크기는 재지 않는다. 등급에 쓰지 않기 때문이다(`lib/analysis/openings.ts` 주석) —
 * 그리고 키워드마다 10곳씩 더 부르면 한 요청에 못 끝난다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keywords?: string[] }
    const db = await readDB()
    const owners = keywordOwners(db.stores)
    // 화면에서 고른 것만 재도 되게 한다 (다시 재기·묶음 나누기)
    const picked = (body.keywords ?? []).map((k) => k.trim()).filter(Boolean)
    const list = (picked.length ? picked : [...owners.keys()]).slice(0, MAX_KEYWORDS)

    if (!list.length) {
      return NextResponse.json(
        { error: '지점에 저장된 지역 키워드가 없습니다. 「지점 관리」에서 먼저 넣어주세요.' },
        { status: 400 }
      )
    }

    // 재는 부분은 크론과 **같은 함수**다 (lib/analysis/openings-scan.ts)
    const { rows: storeRows, failed } = await scanOpenings(list, owners)

    /*
     * 굳은 자리가 나오면 그 동네의 세부 의도 키워드도 함께 잰다 — 「굳은 자리로 들어가는 문」.
     * 몇 개만 다시 잰 경우(picked)에는 건너뛴다: 표 전체가 없으면 우회로를 붙일 자리도 없다.
     */
    const detours = picked.length ? { rows: [], failed: [] } : await scanDetours(storeRows)
    const rows = [...storeRows, ...detours.rows]
    failed.push(...detours.failed)

    /*
     * 눌러서 잰 것도 저장한다.
     *
     * 앞 판은 결과를 화면 상태에만 뒀다 — 새로 고치면 사라졌다. 저장해 두면 다음에 화면을
     * 열자마자 보이고, 매일 도는 크론과 같은 자리에 쌓여서 「어제와 비교」가 이어진다.
     * 다만 **전체를 잰 경우만** 남긴다 — 몇 개만 다시 잰 결과를 그날 값으로 덮으면 표가
     * 반쪽이 된다.
     */
    if (rows.length && !picked.length) {
      const fresh: OpeningRun = {
        at: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        by: 'user',
        rows,
        failed,
      }
      await mutate((cur) => {
        cur.openingRuns = mergeOpeningRuns(cur.openingRuns, fresh, OPENING_RUNS_KEEP)
      })
    }

    return NextResponse.json({
      measuredAt: new Date().toISOString(),
      rows,
      failed,
      /** 지점에 저장된 키워드가 한 번에 재는 수보다 많으면 알려준다 */
      more: Math.max(0, owners.size - list.length),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '키워드를 재지 못했습니다.' },
      { status: 500 }
    )
  }
}
