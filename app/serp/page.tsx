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
        desc="지금 이 키워드로 1페이지에 있는 글들을 뜯어봅니다. 제목 길이·키워드 위치·최신성·공통 소재를 읽어 '무엇을 맞춰야 하는지'로 번역합니다."
      />
      <SerpAnalyzer initialKeyword={keyword ?? ''} />
    </>
  )
}
