import { PageHeader } from '@/components/AppShell'
import { readDB } from '@/lib/store'
import { blogIdFromInput } from '@/lib/naver/blogrss'
import PeerCompareCard from '@/components/PeerCompareCard'
import BlogInspector from './BlogInspector'

export const dynamic = 'force-dynamic'

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const sp = await searchParams
  /*
   * 우리 블로그 아이디를 미리 채운다 — 지점에 적어둔 블로그 주소에서 뽑는다.
   * 매번 손으로 넣게 하면 비교를 안 하게 된다.
   */
  const db = await readDB()
  const saved = db.stores.map((s) => s.blogUrl).find(Boolean)
  // blogIdFromInput 은 못 읽으면 빈 문자열을 준다 — `??` 로는 안 넘어간다
  const myId = (sp.id ? blogIdFromInput(sp.id) : '') || (saved ? blogIdFromInput(saved) : '')

  return (
    <>
      <PageHeader
        eyebrow="블로그 진단"
        title="이 블로그는 어떤 블로그인가"
        desc="아이디나 주소를 넣으면 최근 50편을 읽어 성격(업체 본인·체험단·리뷰 전문)을 판정하고, 밖에서 관찰할 수 있는 지표로 힘을 추정합니다."
      />
      <BlogInspector initialId={sp.id ?? ''} />
      {/* 회원 요청 (2026-08-20): 상위 5편의 블로그와 블로그 단위로 비교 */}
      <div className="mt-4">
        <PeerCompareCard defaultBlogId={myId} />
      </div>
    </>
  )
}
