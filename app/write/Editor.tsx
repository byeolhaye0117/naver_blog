'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Post, PostStatus, PostType, Sponsorship, Store } from '@/lib/types'
import { POST_STATUS_LABEL, POST_TYPE_LABEL, SPONSORSHIP_LABEL } from '@/lib/types'
import { checkPost } from '@/lib/writing/checker'
import { buildTemplate, hasGuides, stripGuides } from '@/lib/writing/templates'
import { adviseRotation, ANGLES, INFO_FORMATS, INTRO_TYPES, REVIEW_INTRO_TYPES, TOPIC_GROUPS } from '@/lib/writing/rotation'
import { buildCopyPackage, postLogLine } from '@/lib/writing/export'
import { Badge, Card, Field, inputClass } from '@/components/ui'
import CheckPanel from '@/components/CheckPanel'
import CopyButton from '@/components/CopyButton'

const TYPE_HINT: Record<PostType, string> = {
  promo: '센터가 1인칭으로 쓰는 홍보글. 목표는 방문 상담 예약입니다. 메인 키워드 5~7회, 정식 상호명 3회.',
  info: '검색 유입을 끌어오는 정보글. 정보 키워드가 주인공, 지역 키워드는 조연입니다. C-Rank를 키우는 글입니다.',
  review: '화자는 센터가 아니라 방문객입니다. 제목에 "후기"를 명시하고, 협찬이면 표기가 법적 의무입니다.',
}

type View = 'write' | 'check' | 'copy'

export default function Editor({
  stores,
  posts,
  existing,
  initialMain,
  initialType,
  initialStoreId,
}: {
  stores: Store[]
  posts: Post[]
  existing?: Post
  initialMain?: string
  initialType?: PostType
  initialStoreId?: string
}) {
  const router = useRouter()

  const [id, setId] = useState(existing?.id ?? '')
  const [type, setType] = useState<PostType>(existing?.type ?? initialType ?? 'info')
  const [status, setStatus] = useState<PostStatus>(existing?.status ?? 'draft')
  const [storeId, setStoreId] = useState(existing?.storeId ?? initialStoreId ?? stores[0]?.id ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [mainKeyword, setMainKeyword] = useState(existing?.mainKeyword ?? initialMain ?? '')
  const [sub1, setSub1] = useState(existing?.subKeywords[0] ?? '')
  const [sub2, setSub2] = useState(existing?.subKeywords[1] ?? '')
  const [localKeyword, setLocalKeyword] = useState(existing?.localKeyword ?? '')
  const [tagText, setTagText] = useState((existing?.tags ?? []).join(', '))
  const [introType, setIntroType] = useState(existing?.introType ?? '')
  const [angle, setAngle] = useState(existing?.angle ?? '')
  const [format, setFormat] = useState(existing?.format ?? '')
  const [topicGroup, setTopicGroup] = useState(existing?.topicGroup ?? '')
  const [sponsorship, setSponsorship] = useState<Sponsorship>(existing?.sponsorship ?? 'unset')
  const [publishedUrl, setPublishedUrl] = useState(existing?.publishedUrl ?? '')
  const [publishedAt, setPublishedAt] = useState(existing?.publishedAt ?? '')
  const [eventText, setEventText] = useState(existing?.eventText ?? '')

  const [view, setView] = useState<View>('write')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const store = stores.find((s) => s.id === storeId)
  const subKeywords = [sub1, sub2].filter(Boolean)
  const tags = tagText
    .split(/[,\n#]/)
    .map((t) => t.trim())
    .filter(Boolean)

  const result = useMemo(
    () =>
      checkPost({
        type,
        title,
        body,
        mainKeyword,
        subKeywords,
        localKeyword: type === 'info' ? localKeyword : undefined,
        tags,
        legalName: store?.legalName,
        womenOnly: store?.womenOnly,
        sponsorship: type === 'review' ? sponsorship : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, title, body, mainKeyword, sub1, sub2, localKeyword, tagText, storeId, sponsorship]
  )

  const advice = useMemo(
    () => adviseRotation(posts.filter((p) => p.id !== id), storeId, type, store),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, storeId, type, id]
  )

  const draftPost: Post = {
    id: id || 'draft',
    type,
    status,
    storeId,
    title,
    body,
    mainKeyword,
    subKeywords,
    localKeyword: type === 'info' ? localKeyword : undefined,
    tags,
    introType: introType || undefined,
    angle: angle || undefined,
    format: format || undefined,
    topicGroup: topicGroup || undefined,
    sponsorship: type === 'review' ? sponsorship : undefined,
    // 유형을 바꿔도 적어둔 이벤트 정보는 잃지 않게 그대로 저장한다 (정보글에서는 쓰이지 않음)
    eventText: eventText.trim() || undefined,
    publishedUrl: publishedUrl || undefined,
    publishedAt: publishedAt || undefined,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const copyPkg = useMemo(() => buildCopyPackage(draftPost, store), [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    body,
    title,
    tagText,
    type,
    storeId,
    localKeyword,
    mainKeyword,
    sponsorship,
    eventText,
  ])

  async function save() {
    setSaving(true)
    setSaved(null)
    try {
      const payload = { ...draftPost }
      delete (payload as Partial<Post>).id
      const res = id
        ? await fetch(`/api/posts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.')
      if (!id && json.post?.id) {
        setId(json.post.id)
        router.replace(`/write?id=${json.post.id}`)
      }
      if (json.post?.publishedAt) setPublishedAt(json.post.publishedAt)
      setSaved('저장되었습니다.')
      router.refresh()
    } catch (e) {
      setSaved(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
      setTimeout(() => setSaved(null), 2500)
    }
  }

  function insertTemplate() {
    if (body.trim() && !confirm('현재 본문을 골격으로 덮어씁니다. 계속할까요?')) return
    setBody(
      buildTemplate(type, {
        store,
        mainKeyword,
        subKeywords,
        localKeyword: localKeyword || store?.localKeywords[0],
        eventText,
      })
    )
    if (type === 'info' && !localKeyword && store) setLocalKeyword(store.localKeywords[0] ?? '')
  }

  function autoTags() {
    const base = [mainKeyword, ...subKeywords, localKeyword].filter(Boolean)
    const extra = store
      ? store.localKeywords.filter((k) => !base.includes(k)).slice(0, 4)
      : []
    const generic =
      type === 'review'
        ? ['헬스장후기', '운동기록']
        : type === 'info'
          ? ['운동정보', '다이어트']
          : ['헬스장추천', '운동']
    const sponsorTag = type === 'review' && sponsorship === 'sponsored' ? ['협찬후기'] : []
    const all = Array.from(new Set([...base, ...extra, ...generic, ...sponsorTag])).slice(0, 12)
    setTagText(all.join(', '))
  }

  const tone = result.score >= 85 ? 'good' : result.score >= 65 ? 'warn' : 'bad'

  return (
    <div>
      {/* 툴바 — 점수와 저장은 어느 화면에서든 보인다 */}
      {/* 상단 헤더(휴대폰 약 61px) 바로 아래에 붙어 따라온다 */}
      <div className="panel bd sticky top-[61px] z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 lg:top-2">
        <Badge tone={tone}>
          <span className="tnum">{result.score}점</span>
        </Badge>
        <span className="muted tnum text-[11px]">
          {result.stats.charCount.toLocaleString()}자 · 소제목 {result.stats.headings.length} · 이미지{' '}
          {result.stats.imageCount} · 메인KW {result.stats.mainKeywordCount}회
        </span>
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="muted text-[11px]">{saved}</span>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-brand-600 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? '저장 중…' : id ? '저장' : '새 글 저장'}
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['write', '작성'],
            ['check', '검수'],
            ['copy', '발행 패키지'],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${
              view === v ? 'bg-brand-600 text-white' : 'panel bd border'
            } ${v === 'check' ? 'lg:hidden' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-4">
        {/* 왼쪽 — 작성 또는 발행 패키지 */}
        <div className={`space-y-4 ${view === 'check' ? 'hidden lg:block' : ''}`}>
          {view === 'copy' ? (
            <CopyPane pkg={copyPkg} post={draftPost} store={store} logLine={postLogLine(draftPost, store)} />
          ) : (
            <>
              <Card title="글 정보">
                <div className="space-y-3.5">
                  <Field label="글 유형" hint={TYPE_HINT[type]} group>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['promo', 'info', 'review'] as PostType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setType(t)}
                          className={`rounded-xl py-2 text-[13px] font-semibold transition ${
                            type === t ? 'bg-brand-600 text-white' : 'bd panel border'
                          }`}
                        >
                          {POST_TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label="지점" hint={store?.womenOnly ? '여성전용 지점 — 남성 대상 표현을 검사합니다' : undefined}>
                      <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass}>
                        <option value="">(지점 미지정)</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.legalName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="상태">
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as PostStatus)}
                        className={inputClass}
                      >
                        {(['draft', 'reviewed', 'published'] as PostStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {POST_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field
                    label={type === 'info' ? '정보 메인 키워드' : '메인 키워드'}
                    hint={
                      type === 'info'
                        ? '독자가 실제로 검색창에 치는 말. 예: 다이어트 정체기 극복, 헬스 초보 운동 순서'
                        : '지역 키워드. 같은 지점 글마다 로테이션하세요 (자기잠식 방지)'
                    }
                  >
                    <input value={mainKeyword} onChange={(e) => setMainKeyword(e.target.value)} className={inputClass} />
                  </Field>

                  {advice.mainKeywordCandidates.length > 0 && type !== 'info' && (
                    <div>
                      <p className="muted mb-1.5 text-[11px] font-semibold">최근 안 쓴 키워드 (권장)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {advice.mainKeywordCandidates.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setMainKeyword(k)}
                            className="bd rounded-full border px-2.5 py-1 text-[11px] font-medium hover:bg-slate-500/8"
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label={type === 'info' ? '정보 보조 키워드' : '함께 찾는 키워드 ①'}>
                      <input value={sub1} onChange={(e) => setSub1(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label={type === 'info' ? '(선택) 추가 보조 키워드' : '함께 찾는 키워드 ②'}>
                      <input value={sub2} onChange={(e) => setSub2(e.target.value)} className={inputClass} />
                    </Field>
                  </div>

                  {type === 'info' && (
                    <Field
                      label="지역 키워드 (조연)"
                      hint="본문 1~2회 + 해시태그. 정보 흐름을 끊으면 빼고 해시태그로만 처리하세요."
                    >
                      <select value={localKeyword} onChange={(e) => setLocalKeyword(e.target.value)} className={inputClass}>
                        <option value="">(선택)</option>
                        {(store?.localKeywords ?? []).map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {type === 'review' && (
                    <Field label="대가성(협찬) 여부" hint="협찬이면 본문·태그 표기가 법적 의무입니다" group>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['own', 'sponsored', 'unset'] as Sponsorship[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSponsorship(s)}
                            className={`rounded-xl py-2 text-[12px] font-semibold transition ${
                              sponsorship === s ? 'bg-brand-600 text-white' : 'bd panel border'
                            }`}
                          >
                            {SPONSORSHIP_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </Field>
                  )}

                  {/* 정보글은 홍보로 넘어가면 목적(C-Rank 축적)이 깨지므로 이벤트 칸을 두지 않는다 */}
                  {type !== 'info' && (
                    <Field
                      label={
                        type === 'review'
                          ? '이벤트 정보 (혜택 구간에 반영)'
                          : '이벤트 정보 (골격 생성에 반영)'
                      }
                      hint={
                        type === 'review'
                          ? '후기글에서는 방문객 시점 — "제가 등록할 때 이런 혜택이 있었어요" 로 들어갑니다. 실제 조건만 적으세요.'
                          : '없는 마감일·인원을 만들어내지 않습니다. 실제 조건만 적으세요.'
                      }
                    >
                      <textarea
                        value={eventText}
                        onChange={(e) => setEventText(e.target.value)}
                        rows={2}
                        className={inputClass}
                        placeholder={
                          type === 'review'
                            ? '3개월 등록 시 1개월 추가, 제가 갔을 때 이번 달까지였어요'
                            : '3개월 등록 이벤트, 선착순 50분, 이번 달까지'
                        }
                      />
                      {type === 'review' && eventText.trim() && sponsorship === 'unset' && (
                        <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
                          이벤트를 안내하는 후기는 업체와의 관계가 드러납니다. 위에서{' '}
                          <strong>대가성 여부</strong>를 먼저 지정하세요 — 협찬이면 표기가 법적
                          의무입니다.
                        </p>
                      )}
                    </Field>
                  )}
                </div>
              </Card>

              <Card
                title="유사성 방지 3축"
                subtitle="지점명만 바꾼 비슷한 글이 쌓이면 블로그 전체가 함께 감점됩니다. 매 글 다르게 조합하세요."
              >
                {advice.warnings.length > 0 && (
                  <ul className="mb-3.5 space-y-1.5">
                    {advice.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-3.5">
                  {type === 'info' ? (
                    <>
                      <Field label="글 형식" hint={advice.format ? `권장: ${advice.format}` : undefined}>
                        <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputClass}>
                          <option value="">(미지정)</option>
                          {INFO_FORMATS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="소재군" hint={advice.topicGroup ? `권장: ${advice.topicGroup}` : undefined}>
                        <select value={topicGroup} onChange={(e) => setTopicGroup(e.target.value)} className={inputClass}>
                          <option value="">(미지정)</option>
                          {TOPIC_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="도입 유형" hint={advice.introType ? `권장: ${advice.introType}` : undefined}>
                        <select value={introType} onChange={(e) => setIntroType(e.target.value)} className={inputClass}>
                          <option value="">(미지정)</option>
                          {(type === 'review' ? REVIEW_INTRO_TYPES : INTRO_TYPES).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="주력 앵글" hint={advice.angle ? `권장: ${advice.angle}` : '글당 1개만 주력으로'}>
                        <select value={angle} onChange={(e) => setAngle(e.target.value)} className={inputClass}>
                          <option value="">(미지정)</option>
                          {ANGLES.filter((a) => store?.womenOnly || !a.startsWith('안심')).map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}
                </div>

                {advice.recentSummaries.length > 0 && (
                  <details className="mt-3.5">
                    <summary className="muted cursor-pointer text-[11px] font-semibold select-none">
                      이 지점 최근 글 기록 {advice.recentSummaries.length}건
                    </summary>
                    <ul className="muted mt-2 space-y-1 text-[11px]">
                      {advice.recentSummaries.map((s, i) => (
                        <li key={i} className="tnum">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>

              <Card
                title="제목 · 본문"
                right={
                  <button
                    type="button"
                    onClick={insertTemplate}
                    className="bd rounded-xl border px-3 py-1.5 text-xs font-semibold hover:bg-slate-500/8"
                  >
                    골격 넣기
                  </button>
                }
              >
                <Field
                  label="제목"
                  hint={`28~40자 · 메인 키워드를 앞 7자 안에 · 세부 의도(새벽·여성전용·초보 등)를 함께 담으면 스마트블록 유리 — 현재 ${title.length}자`}
                >
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                </Field>

                <div className="mt-3.5">
                  <div className="mb-1.5 flex items-end justify-between">
                    <span className="text-[13px] font-semibold">본문</span>
                    <span className="muted tnum text-[11px]">{result.stats.charCount.toLocaleString()}자</span>
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={22}
                    spellCheck={false}
                    className={`${inputClass} font-mono leading-relaxed`}
                    placeholder={
                      '[이미지: 대표이미지 설명]\n후킹 문단…\n\n[이미지: 설명]\n## 소제목\n본문…'
                    }
                  />
                  <p className="muted mt-1.5 text-[11px] leading-relaxed">
                    <code>[이미지: 설명]</code> 은 이미지 자리, <code>## 소제목</code> 은 소제목,{' '}
                    <code>&gt; </code> 로 시작하는 줄은 작성 안내입니다. 안내 줄은 발행 패키지에서 자동으로
                    빠집니다.
                  </p>
                  {hasGuides(body) && (
                    <button
                      type="button"
                      onClick={() => setBody(stripGuides(body))}
                      className="bd mt-2 rounded-xl border px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
                    >
                      안내 줄 모두 지우기
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-end justify-between">
                    <span className="text-[13px] font-semibold">해시태그</span>
                    <button
                      type="button"
                      onClick={autoTags}
                      className="text-brand-600 dark:text-brand-100 text-[11px] font-semibold hover:underline"
                    >
                      자동 구성
                    </button>
                  </div>
                  <textarea
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    rows={2}
                    className={inputClass}
                    placeholder="쌍용동 헬스장, 쌍용동PT, 천안헬스장"
                  />
                  <p className="muted mt-1.5 text-[11px]">
                    쉼표로 구분 · 8~12개 · 메인 키워드와 보조 키워드는 반드시 포함 — 현재 {tags.length}개
                  </p>
                </div>
              </Card>

              {status === 'published' && (
                <Card title="발행 기록">
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label="발행일">
                      <input
                        type="date"
                        value={publishedAt.slice(0, 10)}
                        onChange={(e) => setPublishedAt(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="발행 URL" hint="순위 추적에 등록할 때 씁니다">
                      <input
                        value={publishedUrl}
                        onChange={(e) => setPublishedUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://blog.naver.com/…"
                      />
                    </Field>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>

        {/* 오른쪽 — 검수 (데스크톱 고정) */}
        <div className={`${view === 'check' ? '' : 'hidden lg:block'} mt-4 lg:mt-0`}>
          <div className="lg:sticky lg:top-16">
            <CheckPanel result={result} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CopyPane({
  pkg,
  post,
  store,
  logLine,
}: {
  pkg: ReturnType<typeof buildCopyPackage>
  post: Post
  store?: Store
  logLine: string
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 px-4 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
        네이버는 블로그 글쓰기 공식 API를 제공하지 않습니다. 그래서 발행은 네이버 에디터에 직접 붙여넣는
        방식이고, 아래는 그 순서대로 필요한 것들입니다. 위에서부터 차례로 복사해 쓰세요.
      </div>

      <Card
        title="1. 제목"
        right={<CopyButton text={pkg.title} />}
        subtitle={`${pkg.title.length}자`}
      >
        <p className="bd rounded-xl border px-3 py-2.5 text-[13px] font-semibold">{pkg.title || '(제목 없음)'}</p>
      </Card>

      <Card
        title="2. 본문"
        subtitle="작성 안내 줄과 이미지 지시문은 빠진 상태입니다. 소제목은 에디터에서 소제목 서식을 적용하세요."
        right={<CopyButton text={pkg.body} />}
      >
        <pre className="bd scroll-x max-h-80 overflow-y-auto rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap">
          {pkg.body || '(본문 없음)'}
        </pre>
      </Card>

      <Card
        title="3. 이미지 배치"
        subtitle="파일명·대체텍스트에 지역 키워드를 넣으면 지역 신호가 강해집니다"
      >
        {pkg.imagePlan.length === 0 ? (
          <p className="muted text-sm">
            본문에 <code>[이미지: 설명]</code> 을 넣으면 배치표가 만들어집니다.
          </p>
        ) : (
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">순서</th>
                  <th className="py-2 pr-3 font-semibold">위치</th>
                  <th className="py-2 pr-3 font-semibold">내용</th>
                  <th className="py-2 pr-3 font-semibold">파일명</th>
                  <th className="py-2 font-semibold">대체텍스트</th>
                </tr>
              </thead>
              <tbody>
                {pkg.imagePlan.map((im) => (
                  <tr key={im.order} className="bd border-b last:border-0 align-top">
                    <td className="tnum py-2 pr-3 font-bold">{im.order}</td>
                    <td className="py-2 pr-3">{im.slot}</td>
                    <td className="py-2 pr-3">{im.description}</td>
                    <td className="py-2 pr-3">
                      <code className="text-[11px]">{im.fileName}</code>
                    </td>
                    <td className="py-2">{im.altText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="4. 해시태그" right={<CopyButton text={pkg.tags} />} subtitle={`${post.tags.length}개`}>
        <p className="bd rounded-xl border px-3 py-2.5 text-[12px] break-words">{pkg.tags || '(태그 없음)'}</p>
      </Card>

      <Card title="5. 발행 체크리스트" subtitle="이 순서를 지키는 것이 노출의 절반입니다">
        <ul className="space-y-2.5">
          {pkg.checklist.map((c, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="muted tnum bd mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
                {i + 1}
              </span>
              <span>
                <span className="block text-[13px] font-semibold">{c.label}</span>
                {c.detail && <span className="muted block text-[11px] leading-snug">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="6. 발행 기록 한 줄"
        subtitle="Claude 스킬(gym-blog-writer 등)로 다음 글을 쓸 때 붙여넣으면 소재·앵글이 겹치지 않게 잡아줍니다"
        right={<CopyButton text={logLine} />}
      >
        <p className="bd rounded-xl border px-3 py-2.5 text-[11px] break-words">{logLine}</p>
        {store && (
          <p className="muted mt-2 text-[11px]">
            지점: {store.legalName} · {store.phone}
            {store.reserveUrl ? ` · ${store.reserveUrl}` : ' · 예약 링크 없음(전화만 안내)'}
          </p>
        )}
      </Card>
    </div>
  )
}
