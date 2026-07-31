'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Post } from '@/lib/types'
import { RANK_DEPTH, isFirstPage, rankLabel, type RankView } from '@/lib/analysis/rank'
import { Badge, Card, Empty, Field, MockNotice, inputClass } from '@/components/ui'
import LineChart from '@/components/LineChart'

export default function RankTracker({
  initialViews,
  posts,
  prefill,
  keys,
}: {
  initialViews: RankView[]
  posts: Post[]
  prefill: { keyword: string; url: string; postId?: string }
  keys: { search: boolean; searchAd: boolean }
}) {
  const router = useRouter()
  const [views, setViews] = useState(initialViews)
  const [keyword, setKeyword] = useState(prefill.keyword)
  const [url, setUrl] = useState(prefill.url)
  const [postId, setPostId] = useState(prefill.postId ?? '')
  const [adding, setAdding] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const publishedPosts = posts.filter((p) => p.status === 'published')
  const anyMock = views.some((v) => v.history.some((h) => h.mock))

  async function add() {
    if (!keyword.trim() || !url.trim()) {
      setError('키워드와 내 글 URL(또는 블로그 ID)을 모두 입력하세요.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, url, postId: postId || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setKeyword('')
      setUrl('')
      setPostId('')
      await refreshAndCheck(json.target.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록에 실패했습니다.')
    } finally {
      setAdding(false)
    }
  }

  async function refreshAndCheck(targetId?: string) {
    setChecking(targetId ?? 'all')
    setError(null)
    try {
      const res = await fetch('/api/rank/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetId ? { targetId } : {}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setViews(json.views)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '순위 조회에 실패했습니다.')
    } finally {
      setChecking(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('이 추적 항목과 기록을 모두 삭제할까요?')) return
    await fetch(`/api/rank?id=${id}`, { method: 'DELETE' })
    setViews((v) => v.filter((x) => x.target.id !== id))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <Card
        title="추적 항목 추가"
        subtitle={`검색 결과 상위 ${RANK_DEPTH}위까지 훑어 내 글을 찾습니다. 글 URL이 없으면 블로그 ID만 넣어도 그 블로그의 최상위 글 순위를 잡습니다.`}
      >
        <div className="space-y-3.5">
          {publishedPosts.length > 0 && (
            <Field label="발행한 글에서 불러오기">
              <select
                value={postId}
                onChange={(e) => {
                  const p = publishedPosts.find((x) => x.id === e.target.value)
                  setPostId(e.target.value)
                  if (p) {
                    setKeyword(p.mainKeyword)
                    setUrl(p.publishedUrl ?? '')
                  }
                }}
                className={inputClass}
              >
                <option value="">(직접 입력)</option>
                {publishedPosts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.mainKeyword} — {p.title || '(제목 없음)'}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Field label="키워드">
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className={inputClass} placeholder="쌍용동 헬스장" />
            </Field>
            <Field label="내 글 URL 또는 블로그 ID">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputClass}
                placeholder="blog.naver.com/myblog/223…"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={add}
              disabled={adding}
              className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {adding ? '등록 중…' : '추가하고 바로 조회'}
            </button>
            {views.length > 0 && (
              <button
                type="button"
                onClick={() => refreshAndCheck()}
                disabled={checking !== null}
                className="bd rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-slate-500/8 disabled:opacity-50"
              >
                {checking === 'all' ? '조회 중…' : `전체 ${views.length}개 순위 조회`}
              </button>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {!keys.search && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
              검색 API 키가 없으면 순위가 샘플 값으로 채워집니다. 실제 순위를 보려면{' '}
              <Link href="/guide#api" className="underline">
                키를 발급해 넣으세요
              </Link>
              .
            </p>
          )}
        </div>
      </Card>

      {anyMock && <MockNotice what="검색" />}

      {views.length === 0 ? (
        <Card>
          <Empty>추적 중인 항목이 없습니다. 위에서 키워드와 내 글 URL을 등록하세요.</Empty>
        </Card>
      ) : (
        views.map((v) => {
          const points = v.history.map((h) => ({ label: h.date.slice(5), value: h.rank }))
          const worst = Math.max(RANK_DEPTH, ...v.history.map((h) => h.rank ?? 0))
          return (
            <Card
              key={v.target.id}
              title={v.target.keyword}
              subtitle={v.target.url}
              right={
                <div className="flex items-center gap-1.5">
                  {v.delta !== null && v.delta !== 0 && (
                    <span
                      className={`tnum text-[11px] font-bold ${
                        v.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {v.delta > 0 ? `▲ ${v.delta}` : `▼ ${Math.abs(v.delta)}`}
                    </span>
                  )}
                  <Badge tone={isFirstPage(v.current) ? 'good' : v.current === null ? 'default' : 'warn'}>
                    {rankLabel(v.current)}
                  </Badge>
                </div>
              }
            >
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span className="muted">
                  최고 <span className="tnum font-bold">{v.best !== null ? `${v.best}위` : '기록 없음'}</span>
                </span>
                <span className="muted">
                  조회 <span className="tnum font-bold">{v.history.length}회</span>
                </span>
                {v.history.length > 0 && (
                  <span className="muted">
                    발행량{' '}
                    <span className="tnum font-bold">
                      {(v.history[v.history.length - 1].total ?? 0).toLocaleString()}
                    </span>
                  </span>
                )}
              </div>

              {points.length >= 1 ? (
                <LineChart
                  points={points}
                  invert
                  yMin={1}
                  yMax={worst}
                  ticks={[1, 10, 30, worst].filter((t, i, a) => t <= worst && a.indexOf(t) === i)}
                  band={{ from: 1, to: 10, label: '1페이지 (상위 10)' }}
                  format={(v2) => `${v2}위`}
                  nullLabel={`${RANK_DEPTH}위 밖`}
                  valueName="순위"
                />
              ) : (
                <Empty>아직 조회 기록이 없습니다.</Empty>
              )}

              <div className="bd mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                <button
                  type="button"
                  onClick={() => refreshAndCheck(v.target.id)}
                  disabled={checking !== null}
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
                >
                  {checking === v.target.id ? '조회 중…' : '지금 조회'}
                </button>
                <Link
                  href={`/serp?keyword=${encodeURIComponent(v.target.keyword)}`}
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  상위노출 분석
                </Link>
                {v.target.postId && (
                  <Link
                    href={`/write?id=${v.target.postId}`}
                    className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                  >
                    이 글 열기
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => remove(v.target.id)}
                  className="muted ml-auto rounded-lg px-2.5 py-1.5 text-[11px] font-semibold hover:text-rose-600"
                >
                  삭제
                </button>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
