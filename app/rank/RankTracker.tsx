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
import { FIRST_PAGE, OUT_OF_RANGE, SETTLE_DAYS, shouldDiagnose, type Diagnosis } from '@/lib/analysis/diagnose'
import { SECTION_CAP } from '@/lib/naver/blogsection'
import { Badge, Card, Empty, Field, MockNotice, inputClass } from '@/components/ui'
import LineChart from '@/components/LineChart'

interface DiagnoseResult {
  diagnosis: Diagnosis
  rank: number | null
  daysSincePublish: number
  /** 앱에서 쓴 글이면 그 id — 네이버에서 읽어온 글은 null */
  postId: string | null
  /** 본문을 어디서 읽었나 */
  postSource: 'app' | 'naver'
  title: string
  measured: number
  measuredMine: { charCount: number; imageCount: number; videoCount: number }
}

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
  const [manual, setManual] = useState<Record<string, { rank: string; date: string; note: string }>>({})
  const [savingManual, setSavingManual] = useState<string | null>(null)
  const [manualMsg, setManualMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 발행 후 실패 진단 (항목별) */
  const [dxBusy, setDxBusy] = useState<string | null>(null)
  const [dx, setDx] = useState<Record<string, DiagnoseResult>>({})
  const [dxError, setDxError] = useState<{ id: string; text: string } | null>(null)

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
      // 띄어쓰기만 다른 같은 글이 이미 있으면 알려준다 (등록은 됐다)
      if (json.notice) setError(json.notice)
      setKeyword('')
      setUrl('')
      setPostId('')
      setPublishedAt('')
      // 항목은 이미 만들어졌으므로 목록을 먼저 갱신한다.
      // 자동 조회가 막혀 있어도(검색 API 미발급 등) 직접 입력 자리가 화면에 나와야 한다.
      await reloadViews()
      await refreshAndCheck(json.target.id, { silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록에 실패했습니다.')
    } finally {
      setAdding(false)
    }
  }

  /**
   * 저장된 추적 목록을 다시 읽는다.
   *
   * API 조회가 실패해도 항목 자체는 만들어져 있으므로 목록을 갱신해야 한다.
   * 이걸 안 하면 "등록은 됐다"는 안내만 뜨고 정작 순위를 직접 넣을 자리가 화면에 없다.
   */
  async function reloadViews() {
    try {
      const res = await fetch('/api/rank', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok && Array.isArray(json.views)) setViews(json.views)
    } catch {
      /* 목록 갱신 실패는 조용히 넘긴다 — 화면을 새로고침하면 복구된다 */
    }
  }

  /**
   * 지금 상위권을 다시 분석해 내 글과 대조한다.
   * 결과는 처방으로 저장되므로, 글쓰기 화면을 열면 이미 AI 지시문에 실려 있다.
   */
  async function runDiagnose(targetId: string) {
    setDxBusy(targetId)
    setDxError(null)
    try {
      const res = await fetch('/api/rank/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '진단에 실패했습니다.')
      setDx((m) => ({ ...m, [targetId]: json }))
    } catch (e) {
      setDxError({ id: targetId, text: e instanceof Error ? e.message : '진단 중 오류가 발생했습니다.' })
    } finally {
      setDxBusy(null)
    }
  }

  async function refreshAndCheck(targetId?: string, opts?: { silent?: boolean }) {
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
      const msg = e instanceof Error ? e.message : '순위 조회에 실패했습니다.'
      setError(
        opts?.silent
          ? `추적 항목은 등록됐습니다. 다만 API 자동 조회가 안 됩니다 — 아래 "네이버에서 직접 본 순위 기록"으로 넣으세요. (${msg})`
          : msg
      )
      await reloadViews()
      router.refresh()
    } finally {
      setChecking(null)
    }
  }

  const today = () => new Date().toISOString().slice(0, 10)

  function manualOf(id: string) {
    return manual[id] ?? { rank: '', date: today(), note: '' }
  }

  function setManualField(id: string, patch: Partial<{ rank: string; date: string; note: string }>) {
    setManual((m) => ({ ...m, [id]: { ...manualOf(id), ...patch } }))
  }

  /** 네이버에서 직접 본 순위를 기록한다. 비워두면 "순위 밖"으로 저장 */
  async function saveManual(targetId: string) {
    const v = manualOf(targetId)
    const raw = v.rank.trim()
    const parsed = raw === '' ? null : Number(raw)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1 || parsed > 300)) {
      setManualMsg({ id: targetId, text: '순위는 1~300 사이 숫자로 입력하세요. 비워두면 "순위 밖"으로 기록됩니다.', ok: false })
      return
    }

    setSavingManual(targetId)
    setManualMsg(null)
    try {
      const res = await fetch('/api/rank/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, date: v.date, rank: parsed, note: v.note }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setViews(json.views)
      setManual((m) => ({ ...m, [targetId]: { rank: '', date: today(), note: '' } }))
      setManualMsg({
        id: targetId,
        text: parsed === null ? '"순위 밖"으로 기록했습니다.' : `${parsed}위로 기록했습니다.`,
        ok: true,
      })
      router.refresh()
    } catch (e) {
      setManualMsg({ id: targetId, text: e instanceof Error ? e.message : '기록에 실패했습니다.', ok: false })
    } finally {
      setSavingManual(null)
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
        subtitle={`등록하면 두 가지로 순위를 남길 수 있습니다 — 네이버에서 직접 본 순위를 입력하거나(권장, API 없이도 가능), 검색 API 로 상위 ${RANK_DEPTH}위까지 자동 조회하거나. 글 URL 대신 블로그 ID만 넣어도 됩니다.`}
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
              className="bg-brand-600 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {adding ? '등록 중…' : '추가하고 바로 조회'}
            </button>
            {views.length > 0 && (
              <button
                type="button"
                onClick={() => refreshAndCheck()}
                disabled={checking !== null}
                className="bd rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-500/8 disabled:opacity-50"
              >
                {checking === 'all' ? '조회 중…' : `전체 ${views.length}개 순위 조회`}
              </button>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {!keys.search && (
            <p className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
              순위 조회는 <b>키 없이도 됩니다</b> — 블로그 검색 결과 화면을 직접 읽습니다. 그 경로가
              막힌 경우에만 검색 API 로 넘어가고, 그것도 없으면 샘플 값이 채워집니다(샘플일 때는
              따로 표시됩니다).{' '}
              <Link href="/deploy" className="underline">
                키를 넣는 방법
              </Link>
            </p>
          )}
        </div>
      </Card>

      {/* 자동 추적은 눈에 보이지 않으니 명시한다 — 안 보이면 안 되는 줄 안다 */}
      <div className="bd panel rounded-xl border px-4 py-3 text-[12px] leading-relaxed">
        <strong className="font-bold">자동 추적 중</strong>
        <span className="mx-1.5 opacity-40">·</span>
        등록한 항목은 <b>매일 오전 9시·오후 6시에 앱이 스스로 순위를 재서</b> 기록합니다. 발행 첫날부터
        점이 찍히니 며칠째에 올라왔는지 추세로 보입니다.{' '}
        <b>발행 2주 뒤에도 1페이지 밖이면 진단까지 자동으로 해둡니다</b> — 그 결과는 처방으로 저장돼
        글쓰기 화면에 바로 실립니다.
        <span className="muted mt-1 block text-[11px]">
          「API 로 조회」는 지금 당장 다시 재고 싶을 때 쓰면 됩니다. 순위는 하루 안에도 흔들려서
          분 단위로 재는 것은 잡음만 늘립니다 — 그래서 하루 두 번입니다.
        </span>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 px-4 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
        <strong className="font-bold">이 화면이 재는 순위: {RANK_BASIS}</strong>
        <p className="mt-1.5">
          최신순이 아닙니다 — 최신순은 발행만 하면 위에 있으니 의미가 없습니다. <strong>블로그 검색
          결과 화면을 그대로 읽으므로 블로그 탭 순위와 일치합니다.</strong> 그리고 이제{' '}
          <strong>통합검색 스마트블록 위치도 함께 잽니다</strong> — 둘은 실제로 다릅니다. 실측에서
          블로그탭 14위인 글이 통합검색 「스포츠 인기글」 블록에서는 4번째였습니다. 사람이 눈으로 보는
          자리는 통합검색 쪽입니다.
        </p>
        <p className="mt-2">
          그래도 스마트블록은 로그인 상태·지역·개인화에 따라 달라질 수 있습니다. 그래서 각 항목에{' '}
          <strong>“네이버에서 직접 본 순위 기록”</strong> 을 두었습니다 — 직접 확인한 값이 가장 정확하고,
          넣으면 그래프·변동·구간 판정이 똑같이 동작합니다.
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
                  {/* 「4위」만 쓰면 "검색하면 4번째" 로 읽힌다 — 어느 자리 기준인지 붙인다 */}
                  <Badge tone={isFirstPage(v.current) ? 'good' : v.current === null ? 'default' : 'warn'}>
                    블로그탭 {rankLabel(v.current)}
                  </Badge>
                </div>
              }
            >
              {/* 발행 후 며칠인지에 따라 같은 순위도 뜻이 달라진다 */}
              {v.phase ? (
                <div
                  className={`mb-3 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${
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
                <div className="muted bd mb-3 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed">
                  발행일을 넣으면 지금이 색인 구간인지, 진입 실패로 볼 시점인지 함께 알려줍니다. 이 항목을 지우고
                  발행일과 함께 다시 등록하거나, 연결된 글에 발행일을 채우세요.
                </div>
              )}

              {/* 통합검색 위치 — 사람이 실제로 보는 자리 (블로그탭 순위와 다르다) */}
              {(() => {
                const last = v.history[v.history.length - 1]
                /*
                  읽어봤는데 없는 경우를 반드시 말해준다. 실제로 블로그탭 4위인 글이
                  통합검색 인기글 블록에는 아예 없었고, 「4위」만 보고 잘 되고 있다고
                  오해할 수 있었다.
                */
                if (last?.unifiedChecked && !last.unifiedBlock) {
                  return (
                    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
                      <strong className="font-bold">통합검색 첫 화면에는 없습니다</strong>
                      <p className="mt-1 text-[11px] leading-relaxed">
                        블로그탭에서는 {rankLabel(v.current)}지만, 검색하면 처음 보이는 통합검색
                        스마트블록(인기글 등)에는 이 글이 들어가지 못했습니다. 블록은 보통 6편만 뽑고
                        블로그탭과 뽑는 기준이 다릅니다 — <b>사람 눈에 닿는 자리는 이쪽</b>이니, 블로그탭
                        순위만 보고 판단하지 마세요.
                      </p>
                    </div>
                  )
                }
                if (!last?.unifiedBlock) return null
                return (
                  <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-emerald-900 dark:text-emerald-200">
                    <strong className="font-bold">
                      통합검색 「{last.unifiedBlock}」 {last.unifiedRank}번째
                    </strong>
                    <span className="mx-1.5 opacity-50">·</span>
                    페이지에서 {last.unifiedBlockOrder}번째 블록
                    <p className="mt-1 text-[11px] opacity-80">
                      사람이 눈으로 보는 자리입니다. 위 블로그탭 순위와 다를 수 있습니다 — 다르면 이쪽이
                      실제 노출에 가깝습니다.
                    </p>
                  </div>
                )
              })()}

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
                {v.history.length > 0 &&
                  (() => {
                    // 네이버는 총 건수를 1,000 에서 잘라서 준다. 잘린 값을 실측처럼
                    // 보여주면 "정확히 1,000건" 으로 읽힌다 — 키워드 화면과 같게 표시한다.
                    const t = v.history[v.history.length - 1].total ?? 0
                    const capped = t >= SECTION_CAP
                    return (
                      <span className="muted" title={capped ? '네이버가 1,000에서 잘라 준 값입니다' : undefined}>
                        발행량{' '}
                        <span className="tnum font-bold">
                          {t.toLocaleString()}
                          {capped ? '+' : ''}
                        </span>
                        {capped && <span className="text-[10px]"> (잘림)</span>}
                      </span>
                    )
                  })()}
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

              {/*
                발행 후 실패 진단.
                예전에는 순위 그래프만 있고 "그래서 뭘 해야 하나" 가 없었다. 2주가 지나도
                30위 밖이면 기다려서 올라가지 않는다 — 그때 상위권을 다시 분석해 내 글과
                대조하고 고칠 순서를 준다.
              */}
              {(() => {
                const days = v.publishedAt
                  ? Math.max(0, Math.floor((Date.now() - Date.parse(v.publishedAt)) / 86400000))
                  : null
                const due = days !== null && shouldDiagnose(v.current, days)
                const got = dx[v.target.id]
                if (!due && !got) return null
                return (
                  <div
                    data-dx="block"
                    className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[12.5px] font-bold text-amber-900 dark:text-amber-200">
                        발행 {days}일째 · {v.current === null ? `${OUT_OF_RANGE}위 밖` : `${v.current}위`} — 무엇을 고쳐야 하나
                      </h4>
                      <button
                        type="button"
                        onClick={() => runDiagnose(v.target.id)}
                        disabled={dxBusy === v.target.id}
                        className="bg-brand-600 ml-auto rounded-xl px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        {dxBusy === v.target.id ? '분석 중…' : got ? '다시 진단' : '진단하기'}
                      </button>
                    </div>
                    {!got && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                        발행 후 {SETTLE_DAYS}일이 지났는데 아직 1페이지(상위 {FIRST_PAGE}) 밖입니다. 지금 상위
                        글을 다시 읽어 내 글과 대조합니다 (본문 글자수·이미지까지 실측).
                      </p>
                    )}
                    {dxError?.id === v.target.id && (
                      <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                        {dxError.text}
                      </p>
                    )}
                    {got && (
                      <>
                        <p className="mt-2 text-[12px] font-bold">{got.diagnosis.verdict}</p>
                        <p className="muted mt-0.5 text-[10.5px] leading-relaxed">
                          {got.measured > 0 && `상위 글 ${got.measured}개의 본문을 실제로 읽어 비교했습니다. `}
                          {got.postSource === 'naver'
                            ? `내 글은 네이버에서 직접 읽었습니다 (${got.measuredMine.charCount.toLocaleString()}자 · 이미지 ${got.measuredMine.imageCount}장). 앱에서 쓰지 않은 글도 진단합니다.`
                            : `내 글은 앱에 저장된 본문으로 비교했습니다 (${got.measuredMine.charCount.toLocaleString()}자 · 이미지 ${got.measuredMine.imageCount}장).`}
                        </p>
                        {got.diagnosis.fixes.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {got.diagnosis.fixes.map((f) => (
                              <li key={f.id} className="panel bd rounded-xl border px-3 py-2.5">
                                {/*
                                  비교값을 ml-auto 로 같은 줄 오른쪽에 붙였더니, 휴대폰에서
                                  줄이 넘칠 때 오른쪽 정렬 상태로 아래로 떨어져 들여쓰기처럼
                                  보였다. 항목마다 한 줄씩 왼쪽 정렬로 내린다.
                                */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[12.5px] font-bold">{f.label}</span>
                                  {f.severity === 'high' && <Badge tone="bad">먼저</Badge>}
                                </div>
                                <p className="muted mt-1 text-[11px] leading-snug">
                                  내 글 <b className="tnum">{f.mine}</b>
                                  <span className="mx-1 opacity-40">/</span>
                                  {f.theirs}
                                </p>
                                <p className="mt-1.5 text-[11.5px] leading-relaxed">{f.action}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                        {got.diagnosis.note && (
                          <p className="muted mt-2 text-[11px] leading-relaxed">{got.diagnosis.note}</p>
                        )}

                        {/*
                          "고칠 곳 3개" 만 보여주면 3개만 검사한 것처럼 보인다.
                          이미 맞춘 항목과 잴 수 없던 항목까지 밝힌다.
                        */}
                        {(got.diagnosis.passed?.length || got.diagnosis.skipped?.length) && (
                          <details className="muted mt-2.5 text-[11px] leading-relaxed">
                            <summary className="cursor-pointer font-semibold select-none">
                              검사 {got.diagnosis.fixes.length + (got.diagnosis.passed?.length ?? 0) + (got.diagnosis.skipped?.length ?? 0)}개 항목 중
                              고칠 곳 {got.diagnosis.fixes.length}개 · 이미 맞춘 것{' '}
                              {got.diagnosis.passed?.length ?? 0}개
                              {got.diagnosis.skipped?.length ? ` · 못 잰 것 ${got.diagnosis.skipped.length}개` : ''}
                            </summary>
                            {got.diagnosis.passed?.length > 0 && (
                              <div className="mt-2">
                                <p className="font-bold text-emerald-700 dark:text-emerald-300">이미 맞춘 것</p>
                                <ul className="mt-1 space-y-0.5">
                                  {got.diagnosis.passed.map((t) => (
                                    <li key={t}>· {t}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {got.diagnosis.skipped?.length > 0 && (
                              <div className="mt-2">
                                <p className="font-bold">못 잰 것</p>
                                <ul className="mt-1 space-y-0.5">
                                  {got.diagnosis.skipped.map((t) => (
                                    <li key={t}>· {t}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </details>
                        )}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {/*
                            앱에서 쓴 글이면 그 글을 열어 고쳐 쓴다.
                            네이버에만 있는 글은 앱에 본문이 없으므로 같은 키워드로 새로 쓰게 한다 —
                            처방은 키워드로 저장돼 있어 그 화면에서 그대로 실린다.
                          */}
                          <Link
                            href={
                              got.postId
                                ? `/write?id=${got.postId}`
                                : `/write?main=${encodeURIComponent(v.target.keyword)}`
                            }
                            className="bg-brand-600 rounded-xl px-3.5 py-2 text-[12px] font-bold text-white"
                          >
                            {got.postId ? '이 처방으로 고쳐 쓰기 →' : '이 처방으로 다시 쓰기 →'}
                          </Link>
                          <Link
                            href={`/serp?keyword=${encodeURIComponent(v.target.keyword)}`}
                            className="bd rounded-xl border px-3 py-2 text-[12px] font-semibold hover:bg-slate-500/8"
                          >
                            상위권 자세히 보기
                          </Link>
                        </div>
                        <p className="muted mt-2 text-[10.5px] leading-relaxed">
                          이 진단은 처방으로 저장됐습니다 — 글을 열면 「AI로 본문 쓰기」 지시문에 이미
                          들어가 있습니다.
                        </p>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* 네이버에서 직접 본 순위 기록 — 검색 API 없이도 추적이 굴러가고,
                  API 가 있어도 스마트블록 자리를 반영하므로 더 정확하다 */}
              <div className="bd mt-3 rounded-xl border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h4 className="text-[12px] font-bold">네이버에서 직접 본 순위 기록</h4>
                  <a
                    href={naverSearchUrl(v.target.keyword)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-600 dark:text-brand-100 text-[11px] font-semibold underline"
                  >
                    지금 검색해보기 →
                  </a>
                </div>
                <p className="muted mb-2.5 text-[11px] leading-relaxed">
                  검색 결과에서 내 글이 몇 번째인지 세어 넣으세요. <strong>안 보이면 비워두고 기록</strong>하면
                  “순위 밖”으로 남습니다. 이 값이 실제 화면을 그대로 반영하므로 API 조회보다 정확합니다.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="w-[92px]">
                    <span className="muted mb-1 block text-[10px] font-semibold">순위</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={300}
                      value={manualOf(v.target.id).rank}
                      onChange={(e) => setManualField(v.target.id, { rank: e.target.value })}
                      className={inputClass}
                      placeholder="예: 7"
                    />
                  </label>
                  <label className="w-[150px]">
                    <span className="muted mb-1 block text-[10px] font-semibold">날짜</span>
                    <input
                      type="date"
                      value={manualOf(v.target.id).date}
                      onChange={(e) => setManualField(v.target.id, { date: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="min-w-[160px] flex-1">
                    <span className="muted mb-1 block text-[10px] font-semibold">메모 (선택)</span>
                    <input
                      value={manualOf(v.target.id).note}
                      onChange={(e) => setManualField(v.target.id, { note: e.target.value })}
                      className={inputClass}
                      placeholder="예: 인기글 블록 2번째"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => saveManual(v.target.id)}
                    disabled={savingManual !== null}
                    className="bg-brand-600 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {savingManual === v.target.id ? '기록 중…' : '기록'}
                  </button>
                </div>
                {manualMsg?.id === v.target.id && (
                  <p
                    className={`mt-2 rounded border px-2.5 py-1.5 text-[11px] ${
                      manualMsg.ok
                        ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200'
                        : 'border-rose-500/30 bg-rose-500/8 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {manualMsg.text}
                  </p>
                )}
              </div>

              <div className="bd mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                <button
                  type="button"
                  onClick={() => refreshAndCheck(v.target.id)}
                  disabled={checking !== null}
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
                >
                  {checking === v.target.id ? '조회 중…' : 'API 로 조회'}
                </button>
                <a
                  href={naverSearchUrl(v.target.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  네이버 통합검색에서 확인
                </a>
                <a
                  href={naverBlogTabUrl(v.target.keyword)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  블로그 탭
                </a>
                <Link
                  href={`/serp?keyword=${encodeURIComponent(v.target.keyword)}`}
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                >
                  상위노출 분석
                </Link>
                {/*
                  진단은 언제든 할 수 있어야 한다. 예전에는 "2주 경과 + 30위 밖" 일 때만
                  카드가 떠서, 13위인 글은 버튼이 아예 보이지 않았다.
                */}
                <button
                  type="button"
                  onClick={() => runDiagnose(v.target.id)}
                  disabled={dxBusy === v.target.id}
                  className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
                >
                  {dxBusy === v.target.id ? '진단 중…' : '무엇을 고쳐야 하나 진단'}
                </button>
                {v.target.postId && (
                  <Link
                    href={`/write?id=${v.target.postId}`}
                    className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                  >
                    이 글 열기
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => remove(v.target.id)}
                  className="muted ml-auto rounded-xl px-2.5 py-1.5 text-[11px] font-semibold hover:text-rose-600"
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
