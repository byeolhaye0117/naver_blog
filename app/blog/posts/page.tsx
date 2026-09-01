import { PageHeader } from '@/components/AppShell'
import { readDB } from '@/lib/store'
import { blogIdFromInput } from '@/lib/naver/blogrss'
import BlogPostList from './BlogPostList'

export const dynamic = 'force-dynamic'

/**
 * **아이디 하나로 그 블로그가 무슨 글을 썼는지 본다** (2026-09-01 회원 요청).
 *
 * 회원: "블로그 url 앞에 있는 아이디를 보고 이 아이디에 어떤 글들을 썼는지 확인할 수
 * 있는 페이지 만들어주면 좋겠어."
 *
 * 옆 화면 `/blog`(블로그 진단)와 하는 일이 다르다 — 그건 성격을 판정하고 힘을 재느라
 * 조회가 수십 번 들고, 이건 목록만 본다. 섞으면 목록 한 번 보는 데 2분을 기다리게 된다.
 */
export default async function BlogPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const sp = await searchParams
  /*
   * 우리 블로그 아이디를 미리 채운다 — 지점에 적어둔 블로그 주소에서 뽑는다.
   * 매번 손으로 넣게 하면 열어 보지 않게 된다 (`/blog` 도 같은 방식이다).
   */
  const db = await readDB()
  const saved = db.stores.map((s) => s.blogUrl).find(Boolean)
  const initialId = (sp.id ? blogIdFromInput(sp.id) : '') || (saved ? blogIdFromInput(saved) : '')

  return (
    <>
      <PageHeader
        eyebrow="블로그 글 목록"
        title="이 아이디는 어떤 글을 썼나"
        desc="블로그 아이디나 글 주소를 넣으면 그 블로그가 올린 글을 최신순으로 보여줍니다. 앱에서 쓴 글과 순위 추적 중인 글에는 표시가 붙습니다."
      />
      <BlogPostList initialId={initialId} />
    </>
  )
}
