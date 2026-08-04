'use client'

import { useEffect, useState } from 'react'
import { GRADE_LABEL, GRADE_LADDER, KIND_LABEL, type BlogGrade, type BlogProfile } from '@/lib/analysis/blogscore'
import {
  VERDICT_LABEL,
  VERDICT_TONE,
  verdictNote,
  type IndexCheck,
  type IndexSummary,
} from '@/lib/analysis/indexcheck'
import { Badge, Card, Empty, Field, Progress, inputClass } from '@/components/ui'

interface Result {
  profile: BlogProfile
  grade: { grade: BlogGrade; reason: string }
  indexedRate?: number
  exposureRate?: number
  firstPageRate?: number
  indexDetail?: IndexCheck[]
  indexSummary?: IndexSummary
  meaning: string
  exposureDetail?: { query: string; rank: number | null }[]
  recent: { title: string; date: string; category: string; link: string }[]
}

function gradeTone(g: BlogGrade) {
  if (g.startsWith('optimal')) return 'good'
  if (g.startsWith('semi')) return 'info'
  if (g === 'dropped' || g === 'partial') return 'bad'
  if (g === 'weak') return 'warn'
  return 'default'
}

function kindTone(k: BlogProfile['kind']) {
  return k === 'owner' ? 'bad' : k === 'mixed' ? 'warn' : k === 'topical' ? 'good' : 'default'
}

export default function BlogInspector({ initialId }: { initialId: string }) {
  const [id, setId] = useState(initialId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Result | null>(null)

  async function run(target = id) {
    if (!target.trim()) {
      setError('블로그 아이디나 주소를 넣어주세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: target }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '진단에 실패했습니다.')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : '진단 중 오류가 발생했습니다.')
      setData(null)
    } finally {
      setBusy(false)
    }
  }

  // 상위노출 분석에서 「이 블로그 진단」으로 넘어온 경우 바로 돌린다
  useEffect(() => {
    if (initialId) void run(initialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId])

  const p = data?.profile

  return (
    <div className="space-y-4">
      <Card
        title="블로그 아이디 또는 주소"
        subtitle="상위에 있는 블로그가 업체 본인인지, 체험단·대행으로 올라온 글인지 판정합니다."
      >
        <Field label="아이디 · 주소" hint="예: jiyun0361 · blog.naver.com/jiyun0361 · 글 주소를 그대로 붙여도 됩니다">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            aria-label="블로그 아이디"
            className={inputClass}
            placeholder="blog.naver.com/아이디"
          />
        </Field>
        <button
          type="button"
          onClick={() => run()}
          disabled={busy}
          className="bg-brand-600 mt-3 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? '읽는 중… (20~40초)' : '진단하기'}
        </button>
        {error && (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </Card>

      {p && (
        <>
          <Card title={`${p.blogName || p.blogId}`} subtitle={`최근 ${p.sampled}편으로 판정했습니다`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={kindTone(p.kind)}>{KIND_LABEL[p.kind]}</Badge>
              <span className="muted text-[11.5px]">우리 업종 글 {p.gymShare}%</span>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed">{p.kindReason}</p>
            <div className="surface mt-3 rounded-xl p-3.5">
              <p className="text-[12px] font-bold">우리에게 뜻하는 것</p>
              <p className="mt-1 text-[12.5px] leading-relaxed">{data.meaning}</p>
            </div>
          </Card>

          <Card
            title={`등급 추정 · ${GRADE_LABEL[data.grade.grade]}`}
            subtitle="「최적·준최·저품질」은 네이버가 만든 등급이 아니라 업계에서 쓰는 말입니다. 여기 값도 표본으로 흉내낸 추정이니, 아래 근거를 함께 보세요."
            right={<Badge tone={gradeTone(data.grade.grade)}>{GRADE_LABEL[data.grade.grade]}</Badge>}
          >
            <p className="text-[13px] leading-relaxed">{data.grade.reason}</p>

            {/* 어느 칸인지 눈으로 보이게 — 숫자만 보면 위아래 폭을 알 수 없다 */}
            <div className="mt-3 flex flex-wrap gap-1">
              {GRADE_LADDER.map((g) => (
                <span
                  key={g}
                  className={`rounded-full px-2 py-1 text-[10.5px] font-bold ${
                    g === data.grade.grade
                      ? 'bg-brand-600 text-white'
                      : 'muted surface'
                  }`}
                >
                  {GRADE_LABEL[g]}
                </span>
              ))}
            </div>
            {typeof data.exposureRate === 'number' && (
              <p className="muted mt-2 text-[11px] leading-relaxed">
                30위 안 <b>{data.exposureRate}%</b> · 1페이지 <b>{data.firstPageRate ?? 0}%</b> 로 계산했습니다.
                표본이 {data.exposureDetail?.length ?? 0}개라 한 칸 차이는 표본에 따라 흔들릴 수 있습니다 —
                아래 표본 목록을 함께 보세요.
              </p>
            )}
            {data.indexDetail && data.indexDetail.length > 0 && (
              <div data-index="card" className="surface mt-3 rounded-xl p-3.5">
                <p className="text-[12px] font-bold">색인 검사 — 제목을 그대로 검색해 어디에 나오는지</p>
                {data.indexSummary && (
                  <p className="mt-1.5 text-[12px] leading-relaxed">{data.indexSummary.headline}</p>
                )}
                <p className="muted mt-1.5 text-[11px] leading-relaxed">
                  <b>블로그탭</b>에도 없으면 검색에서 빠진 것입니다 — 업계에서 말하는 「저품질」의 실체이고
                  순위가 낮은 것과는 다른 문제입니다. <b>블로그탭에는 있는데 통합검색에만 없는 것</b>은
                  글 문제가 아닙니다 — 그 키워드 위쪽을 광고·플레이스가 차지한 것이니 키워드를 바꿔야 합니다.
                </p>
                <p className="muted mt-1 text-[11px] leading-relaxed">
                  블로그탭 {data.indexSummary?.blogTabRate ?? '—'}% · 통합검색{' '}
                  {data.indexSummary?.unifiedRate ?? '—'}% (표본 {data.indexDetail.length}편)
                </p>
                <ul className="mt-2 space-y-2">
                  {data.indexDetail.map((d) => (
                    <li key={d.title} className="panel bd rounded-xl border px-2.5 py-2">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-[12px] leading-snug">{d.title}</span>
                        <Badge tone={VERDICT_TONE[d.verdict]}>{VERDICT_LABEL[d.verdict]}</Badge>
                      </div>
                      {/* 어느 쪽을 못 읽었는지까지 밝힌다 — 「없음」과 「못 읽음」은 다르다 */}
                      <div className="muted mt-1 text-[11px]">
                        블로그탭 {d.blogTab === null ? '못 잼' : d.blogTab ? '나옴' : '안 나옴'} · 통합검색{' '}
                        {d.unified === null ? '못 잼' : d.unified ? '나옴' : '안 나옴'}
                      </div>
                      {d.verdict !== 'normal' && (
                        <p className="muted mt-1 text-[11px] leading-relaxed">{verdictNote(d.verdict)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card
            title={`추정 힘 ${p.score}점`}
            subtitle="네이버가 매기는 블로그 지수는 공개되지 않습니다. 이 점수는 밖에서 관찰할 수 있는 것만으로 만든 추정값이니, 숫자보다 아래 항목을 보세요."
          >
            <Progress value={p.score} />
            <ul className="mt-3 space-y-2">
              {p.scoreParts.map((s) => (
                <li key={s.label} className="panel bd rounded-xl border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-bold">{s.label}</span>
                    <span className="tnum muted ml-auto text-[11.5px]">
                      {s.value} / {s.max}
                    </span>
                  </div>
                  <p className="muted mt-1 text-[11px] leading-relaxed">{s.note}</p>
                </li>
              ))}
            </ul>
            {!p.scoreParts.some((s) => s.label === '노출력') && (
              <p className="muted mt-2.5 text-[11px] leading-relaxed">
                노출력은 재지 못했습니다 — 최근 글로 검색해 봤지만 결과를 읽지 못했습니다. 그래서 그 항목을
                빼고 나머지로만 환산했습니다 (없는 값을 0점으로 넣으면 점수가 거짓이 됩니다).
              </p>
            )}
            <p className="muted mt-2 text-[11px] leading-relaxed">
              이웃 수·방문자 수·체류시간은 밖에서 볼 수 없어 아예 넣지 않았습니다.
            </p>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="발행 습관">
              <ul className="space-y-1.5 text-[12.5px]">
                <li>
                  최근 30일 <b className="tnum">{p.last30}편</b> · 7일{' '}
                  <b className="tnum">{p.last7}편</b>
                </li>
                <li>
                  글 사이 평균 간격 <b className="tnum">{p.avgGapDays}일</b>
                </li>
                <li>
                  마지막 글 <b className="tnum">{p.daysSinceLast}일 전</b>
                </li>
                <li className="muted text-[11.5px]">
                  섞여 있는 업종: {p.tradeGroups.length ? p.tradeGroups.join(' · ') : '판별 안 됨'}
                </li>
              </ul>
            </Card>

            <Card title="카테고리 구성" subtitle={`가장 큰 업종이 ${p.topTradeShare}%`}>
              <ul className="space-y-1.5">
                {p.categories.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="tnum muted">{c.count}편</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {data.exposureDetail && data.exposureDetail.length > 0 && (
            <Card
              title="노출력 표본"
              subtitle="최근 글의 제목 앞부분을 검색어로 써서, 그 글이 30위 안에 있는지 확인한 결과입니다. 경쟁이 센 검색어를 노린 글은 안 걸리는 게 정상이니 검색어를 함께 보세요."
            >
              <ul className="space-y-1.5">
                {data.exposureDetail.map((e) => (
                  <li key={e.query} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{e.query}</span>
                    <Badge tone={e.rank === null ? 'default' : e.rank <= 10 ? 'good' : 'warn'}>
                      {e.rank === null ? '30위 밖' : `${e.rank}위`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="최근 글" subtitle="무엇을 쓰는 블로그인지 직접 보는 게 가장 확실합니다">
            <ul className="space-y-2">
              {data.recent.map((r) => (
                <li key={r.link} className="panel bd rounded-xl border px-3 py-2">
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[12.5px] leading-snug font-semibold hover:underline"
                  >
                    {r.title}
                  </a>
                  <p className="muted mt-0.5 text-[11px]">
                    {r.date}
                    {r.category && ` · ${r.category}`}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {!p && !busy && (
        <Card>
          <Empty>
            상위노출 분석에서 만난 블로그 아이디를 넣어보세요. 업체 본인 블로그인지, 여러 업종을 돌며 리뷰를
            쓰는 블로그(체험단·대행)인지 판정합니다.
          </Empty>
        </Card>
      )}
    </div>
  )
}
