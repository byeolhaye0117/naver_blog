'use client'

import { useEffect, useState } from 'react'
import {
  COMPETITION_LABEL,
  GRADE_LABEL,
  GRADE_LADDER,
  GRADE_SHARE,
  KIND_LABEL,
  type BlogGrade,
  type BlogGradeResult,
  type BlogProfile,
  type Competition,
} from '@/lib/analysis/blogscore'
import type { ActivityResult } from '@/lib/analysis/activity'
import {
  VERDICT_LABEL,
  VERDICT_TONE,
  verdictNote,
  type IndexCheck,
  type IndexSummary,
} from '@/lib/analysis/indexcheck'
import {
  AGENCY_LABEL,
  SPONSOR_LABEL,
  type AgencyJudgement,
  type SponsorLevel,
} from '@/lib/analysis/agency'
import { Badge, Card, Empty, Field, Progress, inputClass } from '@/components/ui'

interface Result {
  profile: BlogProfile
  grade: BlogGradeResult
  activity?: ActivityResult | null
  indexedRate?: number
  exposureRate?: number
  firstPageRate?: number
  indexDetail?: IndexCheck[]
  indexSummary?: IndexSummary
  meaning: string
  agency?: AgencyJudgement
  sponsorScans?: { title: string; url: string; level: SponsorLevel; found: string[]; note: string }[]
  exposureDetail?: {
    query: string
    rank: number | null
    total?: number | null
    trivial?: boolean
    competition?: Competition
  }[]
  /** 검색어에 경쟁이 없어서 노출률 계산에서 뺀 표본 수 */
  trivialSamples?: number
  trivialMax?: number
  recent: { title: string; date: string; category: string; link: string }[]
}

function gradeTone(g: BlogGrade) {
  if (g.startsWith('optimal')) return 'good'
  if (g === 'dropped') return 'bad'
  if (g === 'normal') return 'warn'
  if (g.startsWith('semi')) return 'info'
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

          {/*
            「돈 주고 맡긴 블로그인가」.
            본인이 밝힌 표기가 가장 확실한 근거다. 표기가 없으면 없다고만 말하고
            추측하지 않는다 — 남이 대가를 받았다고 단정하는 것은 사실 주장이다.
          */}
          {data.agency && (
            <Card
              title="돈 주고 맡긴 글인가"
              subtitle="밖에서 볼 수 있는 흔적만 모았습니다. 사실 확인은 당사자만 할 수 있습니다."
              right={
                <Badge
                  tone={
                    data.agency.level === 'confirmedByMark'
                      ? 'warn'
                      : data.agency.level === 'campaignLike'
                        ? 'info'
                        : data.agency.level === 'ownerLike'
                          ? 'good'
                          : 'default'
                  }
                >
                  {AGENCY_LABEL[data.agency.level]}
                </Badge>
              }
            >
              <ul className="space-y-1.5">
                {data.agency.signals.map((sig) => (
                  <li key={sig.label} className="panel bd rounded-xl border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-bold">{sig.label}</span>
                      <span className="muted ml-auto text-[10.5px] font-semibold">
                        {sig.toward === 'campaign'
                          ? '체험단 쪽'
                          : sig.toward === 'owner'
                            ? '업체 본인 쪽'
                            : '중립'}
                      </span>
                    </div>
                    <p className="muted mt-1 text-[11px] leading-relaxed">{sig.detail}</p>
                  </li>
                ))}
              </ul>

              <div className="surface mt-3 rounded-xl p-3.5">
                <p className="text-[12px] font-bold">우리에게 뜻하는 것</p>
                <p className="mt-1 text-[12.5px] leading-relaxed">{data.agency.meaning}</p>
              </div>

              {data.sponsorScans && data.sponsorScans.length > 0 && (
                <details className="mt-3">
                  <summary className="muted cursor-pointer text-[11.5px] font-semibold select-none">
                    읽어본 글 {data.sponsorScans.length}편 — 무엇을 봤는지
                  </summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {data.sponsorScans.map((sc) => (
                      <li key={sc.url} className="panel bd rounded-lg border px-2.5 py-1.5">
                        <div className="flex items-start gap-2">
                          <a
                            href={sc.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="min-w-0 flex-1 text-[11.5px] leading-snug hover:underline"
                          >
                            {sc.title}
                          </a>
                          <Badge tone={sc.level === 'noMark' ? 'default' : 'info'}>
                            {SPONSOR_LABEL[sc.level]}
                          </Badge>
                        </div>
                        <p className="muted mt-1 text-[11px] leading-relaxed">{sc.note}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* 이 문장은 어떤 경우에도 함께 나간다 */}
              <p className="muted mt-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[11.5px] leading-relaxed">
                {data.agency.caveat}
              </p>
            </Card>
          )}

          <Card
            title={
              typeof data.grade.score === 'number'
                ? `등급 추정 · ${GRADE_LABEL[data.grade.grade]} · ${data.grade.score}/100`
                : `등급 추정 · ${GRADE_LABEL[data.grade.grade]}`
            }
            subtitle="「최적·준최·저품질」은 네이버가 만든 등급이 아니라 업계에서 쓰는 말입니다. 이름과 순서는 업계 표기(숫자가 클수록 강함)에 맞췄고, 값은 표본으로 낸 추정이니 아래 근거를 함께 보세요."
            right={<Badge tone={gradeTone(data.grade.grade)}>{GRADE_LABEL[data.grade.grade]}</Badge>}
          >
            <p className="text-[13px] leading-relaxed">{data.grade.reason}</p>

            {typeof data.grade.score === 'number' && <Progress value={data.grade.score} />}

            {/* 무엇으로 그 점수가 됐는지 항목별로 — 숫자만 보여주면 믿거나 못 믿거나 뿐이다 */}
            {data.grade.axes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {data.grade.axes.map((a) => (
                  <li key={a.label} className="panel bd rounded-xl border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-bold">{a.label}</span>
                      <span className="tnum muted ml-auto text-[11.5px]">
                        {a.value} / {a.max}
                      </span>
                    </div>
                    <p className="muted mt-1 text-[11px] leading-relaxed">{a.note}</p>
                  </li>
                ))}
              </ul>
            )}

            {/* 어느 칸인지 눈으로 보이게 — 숫자만 보면 위아래 폭을 알 수 없다 */}
            <div className="mt-3 flex flex-wrap gap-1">
              {GRADE_LADDER.map((g) => (
                <span
                  key={g}
                  title={GRADE_SHARE[g] ? `전체 블로그의 약 ${GRADE_SHARE[g]}%` : undefined}
                  className={`rounded-full px-2 py-1 text-[10.5px] font-bold ${
                    g === data.grade.grade
                      ? 'bg-brand-600 text-white'
                      : g === data.grade.cappedAt
                        ? 'border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'muted surface'
                  }`}
                >
                  {GRADE_LABEL[g]}
                </span>
              ))}
            </div>
            <p className="muted mt-1.5 text-[11px] leading-relaxed">
              업계 표기 그대로 <b>오른쪽으로 갈수록 약합니다</b> (최적 3 이 가장 강하고 준최 1 이 가장 약합니다).
              시중 통계로는 <b>준최 2 가 전체의 61%</b>, 최적 계열이 6% 뿐이라 준최 2 칸이 가장 넓습니다.
              {data.grade.cappedAt && (
                <>
                  {' '}노란 칸(<b>{GRADE_LABEL[data.grade.cappedAt]}</b>)은 <b>표본·색인 때문에 잠근 상한</b>입니다 —
                  표본이 쌓이면 그 위로 올라갈 수 있습니다.
                </>
              )}
            </p>
            {typeof data.exposureRate === 'number' && (
              <p className="muted mt-2 text-[11px] leading-relaxed">
                30위 안 <b>{data.exposureRate}%</b> · 1페이지 <b>{data.firstPageRate ?? 0}%</b> 로 계산했습니다.
                표본이 {data.exposureDetail?.length ?? 0}개라 한 칸 차이는 표본에 따라 흔들릴 수 있습니다 —
                아래 표본 목록을 함께 보세요.
                {Boolean(data.trivialSamples) && (
                  <>
                    {' '}그중 <b>{data.trivialSamples}편은 계산에서 뺐습니다</b> — 검색어의 최근 글이{' '}
                    {data.trivialMax ?? 30}편 미만이라, 거기서 위에 걸리는 것은 블로그 힘과 무관합니다.
                  </>
                )}
              </p>
            )}

            {/*
              **시중 도구와 다르게 나오는 이유를 먼저 말한다.**

              회원이 우리 진단(「최적 3」)과 다른 사이트(「준최·44점」)를 나란히 놓고 물었다.
              둘 다 네이버 공식 등급이 아니고, **재는 대상이 아예 다르다.** 그걸 모르면 어느
              쪽이 맞는지를 두고 헤매게 된다 — 답은 「같은 것을 재지 않았다」다.
            */}
            <details className="mt-3 text-[11.5px]">
              <summary className="muted cursor-pointer font-semibold">
                다른 사이트와 등급이 다르게 나오는 이유
              </summary>
              <div className="muted mt-2 space-y-2 leading-relaxed">
                <p>
                  <b>네이버는 블로그 등급을 발표하지 않습니다.</b> 「최적·준최·저품질」은 업계에서
                  쓰는 말이고, 어느 도구든 자기 방식으로 추정한 값입니다. 그래서 서로 다르게 나오는
                  것이 정상입니다 — 어느 쪽이 맞는지가 아니라 <b>무엇을 쟀는지</b>를 봐야 합니다.
                </p>
                <p>
                  <b>이름과 순서는 업계 표기에 맞췄습니다</b> (2026-08-11 수정). 예전에는 이 앱이
                  「최적 1」을 최상단으로 썼는데, 업계 표기는 <b>숫자가 클수록 강합니다</b>
                  (준최 2 &lt; 준최 7 &lt; 최적 1 &lt; 최적 3). 같은 말이 정반대를 뜻해서 두 화면을
                  나란히 비교할 수 없었습니다 — 지금은 방향이 같습니다.
                </p>
                <p>
                  <b>시중 도구 대부분은 활동 지표로 점수를 냅니다</b> — 방문자·이웃·공감·댓글·발행 수·
                  운영 기간. 블로그가 얼마나 크고 부지런한지를 봅니다. <b>이제 그 축도 이 앱에서
                  같이 잽니다</b> — 아래 「활동 지표」 칸이 저쪽 점수와 비교할 자리입니다.
                </p>
                <p>
                  <b>이 앱의 등급은 실제 검색 노출로 냅니다</b> — 최근 글 제목을 검색해서 색인이
                  됐는지, 30위·1페이지에 걸리는지. 활동 지표는 <b>등급에 섞지 않습니다.</b> 우리 판에서
                  재봤을 때 상위 5편이 블로그 등급 순서로 줄을 서지 않았기 때문입니다 — 등급이 가장
                  높은 블로그가 5위였습니다.
                </p>
                <p>
                  그래서 <b>방문자는 많은데 검색 노출이 약한 블로그</b>는 저쪽이 높게, 이쪽 등급이 낮게
                  나옵니다. 반대로 <b>규모는 작아도 쓰는 글이 잘 걸리는 블로그</b>는 이쪽 등급이 높게
                  나옵니다. 두 숫자를 나란히 보시면 어느 쪽 이야기인지 바로 갈립니다.
                </p>
              </div>
            </details>
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

          {/*
            **활동 지표 — 시중 도구와 같은 축.**

            회원이 「우리도 저기서만 볼 수 있는 걸 분석하면 되지 않냐」고 했고, 찔러보니
            방문자·이웃·글 수·댓글·공감이 로그인 없이 다 나왔다. 그래서 저쪽 점수와
            **비교할 자리**를 만들었다. 등급과 합치지 않고 나란히 둔다.
          */}
          {data.activity && (
            <Card
              title={`활동 지표 ${data.activity.score}점 · ${data.activity.size}`}
              subtitle="라블로그·블덱스 같은 시중 도구가 점수를 내는 축입니다. 여기 값과 저쪽 값을 비교하세요 — 위쪽 등급은 검색 노출로만 냅니다."
              right={
                <Badge tone={data.activity.score >= 70 ? 'good' : data.activity.score >= 45 ? 'info' : 'warn'}>
                  {data.activity.size}
                </Badge>
              }
            >
              <Progress value={data.activity.score} />
              <ul className="mt-3 space-y-2">
                {data.activity.axes.map((a) => (
                  <li key={a.label} className="panel bd rounded-xl border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-bold">{a.label}</span>
                      {/* 관찰값과 점수를 갈라 놓는다 — 앞은 사실, 뒤는 우리 해석이다 */}
                      <span className="text-[12px]">{a.observed}</span>
                      <span className="tnum muted ml-auto text-[11.5px]">
                        {a.value} / {a.max}
                      </span>
                    </div>
                    <p className="muted mt-1 text-[11px] leading-relaxed">{a.note}</p>
                  </li>
                ))}
              </ul>
              <p className="muted mt-2.5 text-[11px] leading-relaxed">
                <b>굵은 숫자는 관찰값이고 점수는 우리 해석입니다.</b> 네이버도 시중 도구도 구간 기준을
                공개하지 않으므로, 위 경계는 이 앱이 임의로 나눈 것입니다. 저쪽 점수와 몇 점 차이가 나는
                것은 구간을 다르게 잡았기 때문이고, 관찰값(방문자·이웃·글 수)은 같은 숫자여야 합니다.
              </p>
              {Boolean(data.activity.facts.unsearchable) && (
                <p className="muted mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[11.5px] leading-relaxed">
                  최근 글 가운데 <b>{data.activity.facts.unsearchable}편이 「검색 허용 안 함」</b>으로
                  올라가 있습니다. 그 글은 검색에 안 나오는 게 정상이라 색인 검사에서 뺐습니다 —
                  누락과는 다른 문제입니다.
                </p>
              )}
              <p className="muted mt-1.5 text-[11px] leading-relaxed">
                밖에서 볼 수 없어 넣지 않은 것: {data.activity.blind.join(' · ')}. 이건 「네이버 블로그
                통계」 안에 있어서 <b>블로그 주인이 로그인해야</b> 열립니다 (시중 도구가 데스크톱 프로그램을
                쓰는 이유입니다).
              </p>
            </Card>
          )}

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
              이 점수는 <b>RSS 로 보이는 것만</b>으로 만든 옛 항목입니다. 방문자·이웃·공감은 위쪽
              「활동 지표」 칸에서 실제 값으로 잽니다.
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
              subtitle="최근 글의 제목 앞부분을 검색어로 써서 그 글이 30위 안에 있는지 봤습니다. 검색어마다 경쟁이 다르므로 「경쟁 N편」을 함께 보세요 — 경쟁이 거의 없는 검색어는 계산에서 뺐습니다."
            >
              <ul className="space-y-1.5">
                {data.exposureDetail.map((e) => (
                  <li key={e.query} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{e.query}</span>
                    {/*
                      **검색어의 경쟁을 함께 보여준다.** 0편짜리 검색어에서 1위 하는 것은 힘의
                      증거가 아니다 — 그걸 모르면 「1위네」로 읽는다.
                    */}
                    <span className="muted tnum text-[11px]">
                      {e.total === null || e.total === undefined
                        ? '경쟁 못 잼'
                        : e.total >= 1000
                          ? '경쟁 1,000편+'
                          : `경쟁 ${e.total.toLocaleString()}편`}
                      {e.competition && e.competition !== 'none' && e.competition !== 'unknown' && (
                        <> · {COMPETITION_LABEL[e.competition]}</>
                      )}
                    </span>
                    {e.trivial && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
                        계산 제외
                      </span>
                    )}
                    <Badge tone={e.rank === null ? 'default' : e.rank <= 10 ? 'good' : 'warn'}>
                      {e.rank === null ? '30위 밖' : `${e.rank}위`}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="muted mt-2.5 text-[11px] leading-relaxed">
                <b>「경쟁 N편」은 그 검색어로 쓰인 글 수입니다.</b> 상호명·가게 이름이 제목 앞에 오면
                그 검색어는 사실상 그 글 하나여서(실측: 어떤 표본은 <b>0편</b>) 30위 안에 걸리는 게
                당연합니다. 그런 표본은 <b>노출률 계산에서 뺐습니다</b> — 넣으면 등급이 실제보다 후하게
                나옵니다.
              </p>
              <p className="muted mt-1.5 text-[11px] leading-relaxed">
                남은 표본도 <b>경쟁 강도에 따라 무게를 달리 셈합니다</b> — 1,000편 이상(경쟁 강함)에서
                걸린 것은 그대로, 300편 안팎(보통)은 0.75, 30~300편(약함)은 0.45 로 셉니다. 쉬운 검색어에서만
                걸리는 블로그는 이 계산으로 최적 칸에 들어갈 수 없습니다.
              </p>
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
