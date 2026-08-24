import Link from 'next/link'
import { readDB } from '@/lib/store'
import { balanceReport, cadenceReport } from '@/lib/writing/rotation'
import { poolStoredRuns } from '@/lib/analysis/factors'
import { PageHeader } from '@/components/AppShell'
import { Stat } from '@/components/ui'
import { IconBalance, IconCheck, IconDoc, IconTrend } from '@/components/icons'
import PostList from './PostList'
import StorageNotice from '@/components/StorageNotice'

export const dynamic = 'force-dynamic'

export default async function PostsPage() {
  const db = await readDB()
  const balance = balanceReport(db.posts)
  const cadence = cadenceReport(db.posts)
  const published = db.posts.filter((p) => p.status === 'published')

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

      {/*
        **자동 작성은 자기 화면으로 옮겼다** (2026-08-24 회원 요청). 두 곳에 두면 어디서
        고쳐야 하는지 회원이 판단해야 한다 — 여기는 길만 알려준다.
      */}
      <Link
        href="/autodraft"
        className="panel mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold hover:bg-slate-500/8"
      >
        매일 정보글 초안 자동 작성
        <span className="muted font-medium">— 무엇으로 쓸지 정하기 · 실행 기록 보기</span>
        <span className="text-brand-600 dark:text-brand-100 ml-auto">자동 작성 열기 →</span>
      </Link>

      <StorageNotice />
      <PostList posts={db.posts} stores={db.stores} evidence={poolStoredRuns(db.factorRuns)} />
    </>
  )
}
