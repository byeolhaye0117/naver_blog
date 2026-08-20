import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import Editor from './Editor'
import type { PostType } from '@/lib/types'
import StorageNotice from '@/components/StorageNotice'
import { findPrescription } from '@/lib/analysis/prescription'
import { poolStoredRuns } from '@/lib/analysis/factors'
import { aiStatus, canSearchWeb } from '@/lib/ai/llm'
import { arenaOf } from '@/lib/writing/arena'

export const dynamic = 'force-dynamic'

export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string
    main?: string
    /** 「시너지 세트」에서 넘어오는 서브 키워드 — 쉼표로 구분, 2개까지 쓴다 */
    subs?: string
    local?: string
    type?: string
    store?: string
    new?: string
  }>
}) {
  const sp = await searchParams
  const subs = (sp.subs ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
  const db = await readDB()
  const type = (['promo', 'info', 'review'] as PostType[]).includes(sp.type as PostType)
    ? (sp.type as PostType)
    : undefined

  /**
   * 그냥 「글 작성」을 눌러 들어온 경우엔 쓰던 초안을 바로 열어준다.
   * 발행 관리로 돌아가 글을 찾아 누르게 하지 않는다 — 대부분은 어제 쓰던 글을 이어 쓴다.
   * 새로 시작하려면 ?new=1 (헤더의 「새 글」 버튼이 이 주소를 쓴다).
   *
   * ─── 자동으로 열지 않는다 (2026-08-10) ─────────────────────────────
   *
   * 회원 요청: "차라리 처음 보이는 게 후기글이 아니라 홍보글로 선택될 수 있게 다시 해줘."
   *
   * 원인이 기본값이 아니었다. 기본 유형은 이미 홍보글인데, **예전에 만든 후기글 초안이
   * 자동으로 열려서** 그 유형이 화면을 차지했다. 회원은 새 글을 쓰려고 들어왔는데 옛 후기글을
   * 이어 쓰는 상태였고, 유형만 홍보글로 바꾸니 본문은 후기라서 화자 경고가 떴다.
   *
   * 처음엔 「오늘 손댄 초안만 열기」로 좁혔는데 그것도 부족했다 — 그 초안을 오늘 한 번이라도
   * 저장했으면 다시 열린다. 「대부분은 어제 쓰던 글을 이어 쓴다」는 내 짐작이 틀렸으므로
   * **자동으로 여는 것을 그만둔다.** 들어오면 항상 새 홍보글이다.
   *
   * 초안은 지우지도 감추지도 않는다 — 가장 최근 것을 배너로 알려 한 번에 열 수 있게 한다
   * (resumable). 주소로 지목했을 때만(`?id=`) 그 글을 연다.
   */
  const drafts = [...db.posts]
    .filter((p) => p.status !== 'published')
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const newest = !sp.id ? drafts[0] : undefined
  /** 자동으로 열지 않은 초안 — 배너로만 알린다 */
  const resumable = newest
    ? { id: newest.id, title: newest.title, type: newest.type, updatedAt: newest.updatedAt ?? '' }
    : undefined
  const existing = sp.id ? db.posts.find((p) => p.id === sp.id) : undefined

  /**
   * 이 글의 메인 키워드로 분석해 둔 처방을 꺼낸다.
   *
   * 상위노출 분석 화면에서 본 처방("제목 31~39자", "이미지 8장 이상")이 여기까지
   * 와야 글에 반영된다. 예전에는 /api/write 가 처방을 받을 준비는 돼 있는데 화면이
   * 보내지 않아서, 분석 결과가 글에 반영되는 경로가 하나도 없었다.
   */
  const mainKeyword = existing?.mainKeyword || sp.main
  const prescription = findPrescription(db.prescriptions, mainKeyword)

  /*
   * 매일 도는 「지금 뚫릴 만한 키워드」 측정에서 발행량을 꺼내 경쟁 수준을 만든다.
   * 회원 질문 (2026-08-20): "경쟁 높은 키워드용 글쓰기 도구가 있는거야?" — 이 줄이 그 연결이다.
   */
  const runs = db.openingRuns ?? []
  const lastRun = runs.length ? runs[runs.length - 1] : null
  const arenas: Record<string, ReturnType<typeof arenaOf>> = {}
  for (const row of lastRun?.rows ?? []) {
    arenas[row.keyword] = arenaOf({ recent30: row.recent30 })
  }

  return (
    <>
      <PageHeader
        title={existing ? '글 수정' : '글 작성'}
        desc="쓰는 동안 키워드 횟수·밀도·금칙어·이미지 배치를 실시간으로 검사합니다. 오른쪽 점수가 85점 이상이면 발행해도 좋은 상태입니다."
      />
      <StorageNotice />
      {/*
        key 를 주는 이유: 화면 안에서 /write → /write?new=1 처럼 같은 경로로 이동하면
        React 가 편집기를 그대로 재사용해서 이전 글의 제목·본문이 남는다. 무엇을 편집하는지가
        바뀌면 편집기를 새로 만들어야 한다.
      */}
      <Editor
        /*
         * 키워드별 경쟁 수준 — 매일 도는 측정(openingRuns)에서 그대로 가져온다.
         * 글 쓸 때 네이버를 다시 부르지 않는다. 잰 적 없는 키워드는 값이 없고, 그러면
         * 「모름」으로 두고 아무 규칙도 붙이지 않는다 (arenaOf 주석).
         */
        arenas={arenas}
        key={
          existing?.id ??
          `new:${sp.type ?? ''}:${sp.main ?? ''}:${sp.subs ?? ''}:${sp.store ?? ''}`
        }
        stores={db.stores}
        posts={db.posts}
        existing={existing}
        initialMain={sp.main}
        initialSubs={subs}
        initialLocal={sp.local}
        initialType={type}
        initialStoreId={sp.store}
        prescription={prescription}
        evidence={poolStoredRuns(db.factorRuns)}
        resumable={resumable}
        /*
         * 어떤 키로 도는지, 자료 검색이 되는지를 **버튼 옆에서** 보이게 넘긴다.
         * 회원이 "지금 어떤 키 쓰는지 알아봐"라고 물었는데, 그건 글을 쓰기 전에 알아야 하는
         * 정보다 — 검색이 되는 키에서만 정보글에 출처가 붙는다.
         */
        ai={{ label: aiStatus().label, canSearch: canSearchWeb() }}
      />
    </>
  )
}
