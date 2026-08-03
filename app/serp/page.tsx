import { PageHeader } from '@/components/AppShell'
import SerpAnalyzer from './SerpAnalyzer'

export const dynamic = 'force-dynamic'

export default async function SerpPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string }>
}) {
  const { keyword } = await searchParams
  return (
    <>
      <PageHeader
        title="상위노출 분석"
        desc="키워드를 넣고 「분석」만 누르면 지금 그 검색어로 상위에 올라 있는 블로그 글들을 앱이 직접 읽어옵니다. 그 글들의 제목 길이·키워드 위치·발행 시점·반복되는 소재를 세어서, 내가 글 쓸 때 무엇을 맞춰야 하는지로 바꿔 보여줍니다. 붙여넣기도, API 키도 필요 없습니다."
      />
      <SerpAnalyzer initialKeyword={keyword ?? ''} />
    </>
  )
}
