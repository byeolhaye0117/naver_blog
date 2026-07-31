import { readDB } from '@/lib/store'
import { keyStatus } from '@/lib/naver/client'
import { PageHeader } from '@/components/AppShell'
import KeywordExplorer from './KeywordExplorer'

export const dynamic = 'force-dynamic'

export default function KeywordsPage() {
  const db = readDB()
  return (
    <>
      <PageHeader
        title="키워드 조사"
        desc="검색량이 아니라 경쟁률을 보세요. 월 검색량 500~5,000 구간 + 낮은 경쟁률이 실제로 1페이지에 갈 수 있는 자리입니다."
      />
      <KeywordExplorer stores={db.stores} keys={keyStatus()} />
    </>
  )
}
