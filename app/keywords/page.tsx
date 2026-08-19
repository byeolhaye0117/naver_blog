import { readDB } from '@/lib/store'
import { keyStatus } from '@/lib/naver/client'
import { PageHeader } from '@/components/AppShell'
import KeywordExplorer from './KeywordExplorer'

export const dynamic = 'force-dynamic'

export default async function KeywordsPage() {
  const db = await readDB()
  return (
    <>
      <PageHeader
        title="키워드 조사"
        desc="검색량이 아니라 경쟁률을 보세요. 월 검색량 500~5,000 구간 + 낮은 경쟁률이 실제로 1페이지에 갈 수 있는 자리입니다. API 키가 없어도 검색량·발행량을 직접 넣으면 같은 기준으로 등급이 나옵니다."
      />
      {/* 매일 도는 크론이 쌓아둔 「지금 뚫릴 만한 키워드」 — 화면을 열자마자 보이게 서버에서 넘긴다 */}
      <KeywordExplorer stores={db.stores} keys={keyStatus()} openingRuns={db.openingRuns} />
    </>
  )
}
