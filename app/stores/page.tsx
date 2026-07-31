import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import StoreManager from './StoreManager'

export const dynamic = 'force-dynamic'

export default async function StoresPage() {
  const db = await readDB()
  return (
    <>
      <PageHeader
        title="지점 정보"
        desc="여기에 없는 정보는 글에 지어내지 않습니다. 정식 상호명은 홍보글에서 3회 이상 노출되는지 검사하는 기준이 됩니다."
      />
      <StoreManager stores={db.stores} />
    </>
  )
}
