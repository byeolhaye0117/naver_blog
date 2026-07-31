'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Post } from '@/lib/types'
import {
  RANK_BASIS,
  RANK_DEPTH,
  isFirstPage,
  naverBlogTabUrl,
  naverSearchUrl,
  rankLabel,
  type RankView,
} from '@/lib/analysis/rank'
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
  const [publishedAt, setPublishedAt] = useState('')
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
        body: JSON.stringify({ keyword, url, postId: postId || undefined, publishedAt: publishedAt || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setKeyword('')
      setUrl('')
      setPostId('')
      setPublishedAt('')
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
                    setPublishedAt((p.publishedAt ?? '').slice(0, 10))
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

          <Field
            label="발행일"
            hint="같은 '순위 밖'도 발행 3일차와 3주차는 뜻이 다릅니다. 발행일을 넣으면 지금이 색인 구간인지, 진입 실패로 볼 시점인지 함께 알려줍니다."
          >
            <input
              type="date"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              className={inputClass}
            />
          </Field>

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
              <Link href="/deploy" className="underline">
                키를 발급해 넣으세요
              </Link>
              .
            </p>
          )}
        </div>
      </Card>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 px-4 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
        <strong className="font-bold">이 화면이 재는 순위: {RANK_BASIS}</strong>
        <p className="mt-1.5">
          최신순이 아닙니다 — 최신순은 발행만 하면 위에 있으니 의미가 없습니다. 다만 이 값은{' '}
          <strong>실제 통합검색 상단과 같지 않습니다.</strong> 검색 API 는 평면 목록만 주는데, 실제 화면은
          의도별 <strong>스마트블록</strong>으로 재배치되고 그 자리는 API 로 볼 수 없습니다. 즉 여기 순위는
          추세를 보는 <strong>대리 지표</strong>이고, 진짜 자리는 아래 링크로 직접 확인하세요.
        </p>
      </div>

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
              {/* 발행 후 며칠인지에 따라 같은 순위도 뜻이 달라진다 */}
              {v.phase ? (
                <div
                  className={`mb-3 rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${
                    v.phase.tone === 'good'
                      ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200'
                      : v.phase.tone === 'warn'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        : v.phase.tone === 'bad'
                          ? 'border-rose-500/30 bg-rose-500/8 text-rose-800 dark:text-rose-200'
                          : 'border-sky-500/30 bg-sky-500/8 text-sky-900 dark:text-sky-200'
                  }`}
                >
                  <strong className="font-bold">{v.phase.label}</strong>
                  <span className="mx-1.5 opacity-50">·</span>
                  {v.phase.note}
                </div>
              ) : (
                <div className="muted bd mb-3 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed">
                  발행일을 넣으면 지금이 색인 구간인지, 진입 실패로 볼 시점인지 함께 알려줍니다. 이 항목을 지우고
                  발행일과 함께 다시 등록하거나, 연결된 글에 발행일을 채우세요.
                </div>
              )}

              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span className="muted">
                  최고 <span className="tnum font-bold">{v.best !== null ? `${v.best}위` : '기록 없음'}</span>
                </span>
                <span className="muted">
                  조회 <span className="tnum font-bold">{v.history.length}회</span>
                </span>
                {v.publishedAt && (
                  <span className="muted">
                    발행 <span className="tnum font-bold">{v.publishedAt.slice(0, 10)}</span>
                  </span>
                )}
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
                <a
                  href={naverSearchUrl(v.target.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  네이버 통합검색에서 확인
                </a>
                <a
                  href={naverBlogTabUrl(v.target.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  블로그 탭
                </a>
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
