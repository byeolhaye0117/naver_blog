import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import Editor from './Editor'
import type { PostType } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; main?: string; type?: string; store?: string }>
}) {
  const sp = await searchParams
  const db = readDB()
  const existing = sp.id ? db.posts.find((p) => p.id === sp.id) : undefined
  const type = (['promo', 'info', 'review'] as PostType[]).includes(sp.type as PostType)
    ? (sp.type as PostType)
    : undefined

  return (
    <>
      <PageHeader
        title={existing ? '글 수정' : '글 작성'}
        desc="쓰는 동안 키워드 횟수·밀도·금칙어·이미지 배치를 실시간으로 검사합니다. 오른쪽 점수가 85점 이상이면 발행해도 좋은 상태입니다."
      />
      <Editor
        stores={db.stores}
        posts={db.posts}
        existing={existing}
        initialMain={sp.main}
        initialType={type}
        initialStoreId={sp.store}
      />
    </>
  )
}
