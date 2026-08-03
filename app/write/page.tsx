import { readDB } from '@/lib/store'
import { PageHeader } from '@/components/AppShell'
import Editor from './Editor'
import type { PostType } from '@/lib/types'
import StorageNotice from '@/components/StorageNotice'

export const dynamic = 'force-dynamic'

export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; main?: string; type?: string; store?: string; new?: string }>
}) {
  const sp = await searchParams
  const db = await readDB()
  const type = (['promo', 'info', 'review'] as PostType[]).includes(sp.type as PostType)
    ? (sp.type as PostType)
    : undefined

  /**
   * 그냥 「글 작성」을 눌러 들어온 경우엔 쓰던 초안을 바로 열어준다.
   * 발행 관리로 돌아가 글을 찾아 누르게 하지 않는다 — 대부분은 어제 쓰던 글을 이어 쓴다.
   * 새로 시작하려면 ?new=1 (헤더의 「새 글」 버튼이 이 주소를 쓴다).
   */
  const wantsNew = sp.new === '1' || Boolean(sp.type || sp.main || sp.store)
  const latestDraft =
    !sp.id && !wantsNew
      ? [...db.posts]
          .filter((p) => p.status !== 'published')
          .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
      : undefined
  const existing = sp.id ? db.posts.find((p) => p.id === sp.id) : latestDraft

  return (
    <>
      <PageHeader
        title={latestDraft ? '이어서 쓰기' : existing ? '글 수정' : '글 작성'}
        desc="쓰는 동안 키워드 횟수·밀도·금칙어·이미지 배치를 실시간으로 검사합니다. 오른쪽 점수가 85점 이상이면 발행해도 좋은 상태입니다."
      />
      <StorageNotice />
      {/*
        key 를 주는 이유: 화면 안에서 /write → /write?new=1 처럼 같은 경로로 이동하면
        React 가 편집기를 그대로 재사용해서 이전 글의 제목·본문이 남는다. 무엇을 편집하는지가
        바뀌면 편집기를 새로 만들어야 한다.
      */}
      <Editor
        key={existing?.id ?? `new:${sp.type ?? ''}:${sp.main ?? ''}:${sp.store ?? ''}`}
        stores={db.stores}
        posts={db.posts}
        existing={existing}
        initialMain={sp.main}
        initialType={type}
        initialStoreId={sp.store}
        autoOpened={Boolean(latestDraft)}
      />
    </>
  )
}
