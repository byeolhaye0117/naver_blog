import { PageHeader } from '@/components/AppShell'
import BlogInspector from './BlogInspector'

export const dynamic = 'force-dynamic'

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const sp = await searchParams
  return (
    <>
      <PageHeader
        eyebrow="블로그 진단"
        title="이 블로그는 어떤 블로그인가"
        desc="아이디나 주소를 넣으면 최근 50편을 읽어 성격(업체 본인·체험단·리뷰 전문)을 판정하고, 밖에서 관찰할 수 있는 지표로 힘을 추정합니다."
      />
      <BlogInspector initialId={sp.id ?? ''} />
    </>
  )
}
