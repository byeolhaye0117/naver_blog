import { readDB } from '@/lib/store'
import { buildRankViews } from '@/lib/analysis/rank'
import { keyStatus } from '@/lib/naver/client'
import { PageHeader } from '@/components/AppShell'
import RankTracker from './RankTracker'
import StorageNotice from '@/components/StorageNotice'

export const dynamic = 'force-dynamic'

export default async function RankPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; url?: string; postId?: string }>
}) {
  const sp = await searchParams
  const db = await readDB()
  const views = buildRankViews(db.rankTargets, db.rankSnapshots)

  return (
    <>
      <PageHeader
        title="순위 추적"
        desc="발행한 글이 실제로 몇 위인지 기록합니다. 조회할 때마다 그날의 순위가 쌓여 변동 추이를 볼 수 있습니다."
      />
      <StorageNotice />
      <RankTracker
        initialViews={views}
        posts={db.posts}
        prefill={{ keyword: sp.keyword ?? '', url: sp.url ?? '', postId: sp.postId }}
        keys={keyStatus()}
      />
    </>
  )
}
