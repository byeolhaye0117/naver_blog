'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { Post, PostStatus, PostType, Store } from '@/lib/types'
import { POST_STATUS_LABEL, POST_TYPE_LABEL } from '@/lib/types'
import { checkPost } from '@/lib/writing/checker'
import { postLogLine } from '@/lib/writing/export'
import { Badge, Card, Empty, inputClass } from '@/components/ui'
import CopyButton from '@/components/CopyButton'

export default function PostList({ posts, stores }: { posts: Post[]; stores: Store[] }) {
  const router = useRouter()
  const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all')
  const [storeFilter, setStoreFilter] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      posts
        .filter((p) => typeFilter === 'all' || p.type === typeFilter)
        .filter((p) => statusFilter === 'all' || p.status === statusFilter)
        .filter((p) => storeFilter === 'all' || p.storeId === storeFilter)
        .sort((a, b) =>
          (b.publishedAt ?? b.updatedAt ?? '').localeCompare(a.publishedAt ?? a.updatedAt ?? '')
        ),
    [posts, typeFilter, statusFilter, storeFilter]
  )

  /** 지금 몇 개의 조건이 걸려 있는지 — 접힌 상태에서도 알 수 있어야 한다 */
  const activeFilters = [typeFilter, statusFilter, storeFilter].filter((v) => v !== 'all').length

  async function setStatus(post: Post, status: PostStatus) {
    setBusy(post.id)
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setBusy(null)
    router.refresh()
  }

  async function remove(post: Post) {
    if (!confirm(`"${post.title || '(제목 없음)'}" 을 삭제할까요? 되돌릴 수 없습니다.`)) return
    setBusy(post.id)
    await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    setBusy(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* 걸러보기는 접어 둔다 — 글이 몇 편일 때 필터 3개가 화면 절반을 먹으면 안 된다 */}
      <details className="card rounded-2xl px-4 py-3 sm:px-5">
        <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-bold select-none">
          걸러보기
          <span className="muted font-semibold">
            {activeFilters ? `${activeFilters}개 적용 중 · ${filtered.length}편` : `전체 ${posts.length}편`}
          </span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <span className="muted mb-1.5 block text-[11px] font-semibold">유형</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as PostType | 'all')}
              className={inputClass}
            >
              <option value="all">전체</option>
              {(['promo', 'info', 'review'] as PostType[]).map((t) => (
                <option key={t} value={t}>
                  {POST_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted mb-1.5 block text-[11px] font-semibold">상태</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PostStatus | 'all')}
              className={inputClass}
            >
              <option value="all">전체</option>
              {(['draft', 'reviewed', 'published'] as PostStatus[]).map((s) => (
                <option key={s} value={s}>
                  {POST_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted mb-1.5 block text-[11px] font-semibold">지점</span>
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className={inputClass}>
              <option value="all">전체</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {filtered.length === 0 ? (
        <Card>
          <Empty>
            조건에 맞는 글이 없습니다.{' '}
            <Link href="/write" className="text-brand-600 dark:text-brand-100 font-semibold underline">
              새 글 작성
            </Link>
          </Empty>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => {
            const store = stores.find((s) => s.id === p.storeId)
            const result = checkPost({
              type: p.type,
              title: p.title,
              body: p.body,
              mainKeyword: p.mainKeyword,
              subKeywords: p.subKeywords,
              localKeyword: p.localKeyword,
              tags: p.tags,
              legalName: store?.legalName,
              womenOnly: store?.womenOnly,
              sponsorship: p.sponsorship ?? 'unset',
            })
            const scoreTone = result.score >= 85 ? 'good' : result.score >= 65 ? 'warn' : 'bad'

            return (
              <li key={p.id} className="panel rounded-xl px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={p.type === 'info' ? 'info' : p.type === 'promo' ? 'brand' : 'default'}>
                        {POST_TYPE_LABEL[p.type]}
                      </Badge>
                      <Badge tone={p.status === 'published' ? 'good' : p.status === 'reviewed' ? 'info' : 'default'}>
                        {POST_STATUS_LABEL[p.status]}
                      </Badge>
                      <Badge tone={scoreTone}>
                        <span className="tnum">{result.score}점</span>
                      </Badge>
                      {result.risks.some((r) => r.level === 'fail') && <Badge tone="bad">위험 표현</Badge>}
                    </div>
                    <Link href={`/write?id=${p.id}`} className="block text-[14px] font-semibold hover:underline">
                      {p.title || '(제목 없음)'}
                    </Link>
                    <p className="muted mt-1 text-[11px]">
                      {store?.name ?? '지점 미지정'} · {p.mainKeyword || '키워드 미지정'} ·{' '}
                      {result.stats.charCount.toLocaleString()}자 · 이미지 {result.stats.imageCount}장
                      {p.publishedAt ? ` · ${p.publishedAt.slice(0, 10)} 발행` : ''}
                    </p>
                    {p.publishedUrl && (
                      <a
                        href={p.publishedUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="muted mt-1 block truncate text-[11px] underline"
                      >
                        {p.publishedUrl}
                      </a>
                    )}
                  </div>
                </div>

                <div className="bd mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                  <Link
                    href={`/write?id=${p.id}`}
                    className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                  >
                    수정 · 발행 패키지
                  </Link>
                  {p.status !== 'reviewed' && p.status !== 'published' && (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => setStatus(p, 'reviewed')}
                      className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
                    >
                      검수완료로
                    </button>
                  )}
                  {p.status !== 'published' && (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => setStatus(p, 'published')}
                      className="bg-brand-600 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      발행완료로
                    </button>
                  )}
                  {p.status === 'published' && (
                    <Link
                      href={`/rank?keyword=${encodeURIComponent(p.mainKeyword)}&url=${encodeURIComponent(
                        p.publishedUrl ?? ''
                      )}&postId=${p.id}`}
                      className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                    >
                      순위 추적 등록
                    </Link>
                  )}
                  <CopyButton
                    text={postLogLine(p, store)}
                    label="발행 기록 복사"
                    className="!bg-transparent !text-current bd border !px-2.5 !py-1.5 !text-[11px] hover:bg-slate-500/8"
                  />
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => remove(p)}
                    className="muted ml-auto rounded-xl px-2.5 py-1.5 text-[11px] font-semibold hover:text-rose-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
