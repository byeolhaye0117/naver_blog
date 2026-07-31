import { readDB } from '@/lib/store'
import { balanceReport, cadenceReport } from '@/lib/writing/rotation'
import { PageHeader } from '@/components/AppShell'
import { Stat } from '@/components/ui'
import PostList from './PostList'

export const dynamic = 'force-dynamic'

export default function PostsPage() {
  const db = readDB()
  const balance = balanceReport(db.posts)
  const cadence = cadenceReport(db.posts)
  const published = db.posts.filter((p) => p.status === 'published')

  return (
    <>
      <PageHeader
        title="발행 관리"
        desc="글 하나가 아니라 블로그 단위로 봅니다. 발행 균형과 주기가 무너지면 잘 쓴 글도 밀립니다."
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat label="전체" value={`${db.posts.length}편`} />
        <Stat label="발행 완료" value={`${published.length}편`} />
        <Stat
          label="정보 : 홍보"
          value={balance.ratio}
          hint="권장 2 : 1"
          tone={balance.level === 'good' ? 'good' : balance.level === 'warn' ? 'warn' : 'bad'}
        />
        <Stat
          label="최근 2주"
          value={`${cadence.last14}편`}
          hint="권장 4~6편"
          tone={cadence.level === 'good' ? 'good' : cadence.level === 'warn' ? 'warn' : 'bad'}
        />
      </div>

      <PostList posts={db.posts} stores={db.stores} />
    </>
  )
}
