import { readDB } from '@/lib/store'
import { balanceReport, cadenceReport } from '@/lib/writing/rotation'
import { poolStoredRuns } from '@/lib/analysis/factors'
import { PageHeader } from '@/components/AppShell'
import { Stat } from '@/components/ui'
import { IconBalance, IconCheck, IconDoc, IconTrend } from '@/components/icons'
import PostList from './PostList'
import AutoDraftPanel from './AutoDraftPanel'
import { hasTodayAutoDraft } from '@/lib/writing/autodraft'
import StorageNotice from '@/components/StorageNotice'

export const dynamic = 'force-dynamic'

export default async function PostsPage() {
  const db = await readDB()
  const balance = balanceReport(db.posts)
  const cadence = cadenceReport(db.posts)
  const published = db.posts.filter((p) => p.status === 'published')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader title="발행 관리" desc="발행 균형과 주기가 무너지면 잘 쓴 글도 밀립니다." />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat
          label="발행 완료"
          value={`${published.length}편`}
          hint={`전체 ${db.posts.length}편`}
          icon={<IconCheck />}
          iconTone="brand"
        />
        <Stat
          label="검수 대기"
          value={`${db.posts.length - published.length}편`}
          hint="초안 · 검수완료"
          icon={<IconDoc />}
          iconTone="blue"
          tone={db.posts.length - published.length > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="정보 : 홍보"
          value={balance.ratio}
          hint="권장 2 : 1"
          tone={balance.level === 'good' ? 'good' : balance.level === 'warn' ? 'warn' : 'bad'}
          icon={<IconBalance />}
          iconTone="violet"
        />
        <Stat
          label="최근 2주"
          value={`${cadence.last14}편`}
          hint="권장 4~6편"
          tone={cadence.level === 'good' ? 'good' : cadence.level === 'warn' ? 'warn' : 'bad'}
          icon={<IconTrend />}
          iconTone="gold"
        />
      </div>

      <AutoDraftPanel
        runs={db.autoDraftRuns}
        today={today}
        hasTodayDraft={hasTodayAutoDraft(db.posts, today)}
        plan={db.autoDraftPlan}
        /*
         * 고를 수 있는 키워드 — 순위 추적에 등록한 것이 먼저다 (회원이 「이걸로 올라가고
         * 싶다」고 적어둔 목록이라 자동 글이 그 밖으로 나가지 않는다). 지점의 지역 키워드도
         * 함께 보여준다 — 아직 순위 추적을 안 걸었어도 고를 수 있어야 한다.
         */
        keywordPool={[
          ...new Set(
            [
              ...db.rankTargets.map((t) => t.keyword),
              ...db.stores.flatMap((s) => s.localKeywords ?? []),
            ]
              .map((k) => k.trim())
              .filter(Boolean)
          ),
        ]}
      />

      <StorageNotice />
      <PostList posts={db.posts} stores={db.stores} evidence={poolStoredRuns(db.factorRuns)} />
    </>
  )
}
