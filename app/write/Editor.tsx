'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Post, PostStatus, PostType, Prescription, Sponsorship, Store } from '@/lib/types'
import { POST_STATUS_LABEL, POST_TYPE_LABEL, SPONSORSHIP_LABEL } from '@/lib/types'
import { checkPost } from '@/lib/writing/checker'
import { buildTemplate, hasGuides, stripGuides } from '@/lib/writing/templates'
import { PUBLISH_THRESHOLD } from '@/lib/writing/checker'
import { explainNonJson } from '@/lib/ai/httperror'

/** AI 가 돌려주는 초안 — 고쳐 쓰기 요청에 그대로 되돌려 보낸다 */
type Draft = { title: string; body: string; tags?: string[] }

import { adviseRotation, ANGLES, INFO_FORMATS, INTRO_TYPES, REVIEW_INTRO_TYPES, TOPIC_GROUPS } from '@/lib/writing/rotation'
import { buildCopyPackage, postLogLine } from '@/lib/writing/export'
import { isPrescriptionStale, prescriptionAgeDays } from '@/lib/analysis/prescription'
import type { PooledFactor } from '@/lib/analysis/factors'
import type { IntentSuggestion } from '@/lib/analysis/intent'
import { Badge, Card, Field, inputClass } from '@/components/ui'
import { IconSpark } from '@/components/icons'
import CheckPanel from '@/components/CheckPanel'
import SimilarityCard from '@/components/SimilarityCard'
import MineOverlapCard from '@/components/MineOverlapCard'
import SpellCard from '@/components/SpellCard'
import CopyButton from '@/components/CopyButton'

/**
 * 글쓰기 버튼에 박는 화자 — **누르기 전에 보이게 하려고 만들었다.**
 *
 * 유형을 잘못 두고 「AI로 본문 쓰기」를 누르면, 요청한 것과 다른 화자의 글이 나오는데
 * 그게 결과물을 다 읽고 나서야 드러났다. 버튼에 화자를 박으면 그 전에 눈에 걸린다.
 */
const SPEAKER_LABEL: Record<PostType, string> = {
  promo: '센터',
  info: '아는 사람',
  review: '방문객',
}

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
  initialSubs,
  initialLocal,
  initialType,
  initialStoreId,
  prescription,
  evidence,
  autoOpened = false,
}: {
  stores: Store[]
  posts: Post[]
  existing?: Post
  initialMain?: string
  /** 키워드 화면의 「시너지 세트」에서 넘어온 서브 키워드 (최대 2개) */
  initialSubs?: string[]
  initialLocal?: string
  initialType?: PostType
  initialStoreId?: string
  /** 이 메인 키워드로 분석해 둔 상위노출 처방 (있으면 AI 지시문에 함께 보낸다) */
  prescription?: Prescription
  /**
   * 관찰소에 쌓인 근거. 검수 항목마다 「관찰 N회: 유리 x · 거꾸로 y」가 붙고,
   * 근거가 갈리거나 거꾸로인 항목은 점수 비중이 내려간다 (lib/writing/evidence.ts).
   */
  evidence?: PooledFactor[]
  /** 「글 작성」만 눌러 들어와 쓰던 초안을 자동으로 열어준 경우 */
  autoOpened?: boolean
}) {
  const router = useRouter()

  const [id, setId] = useState(existing?.id ?? '')
  /*
   * 기본값을 정보글 → **홍보글**로 바꿨다 (2026-08-07).
   *
   * 회원이 홍보글을 뽑았다고 생각했는데 후기글 구조가 나온 일이 있었다. 유형이 무엇이든
   * 화면에서 안 보이면 같은 일이 또 난다 — 기본값을 가장 많이 쓰는 유형으로 두고,
   * 아래 「AI로 … 쓰기」 버튼에 유형과 화자를 함께 박아 누르기 전에 보이게 했다.
   */
  const [type, setType] = useState<PostType>(existing?.type ?? initialType ?? 'promo')
  const [status, setStatus] = useState<PostStatus>(existing?.status ?? 'draft')
  const [storeId, setStoreId] = useState(existing?.storeId ?? initialStoreId ?? stores[0]?.id ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [mainKeyword, setMainKeyword] = useState(existing?.mainKeyword ?? initialMain ?? '')

  /**
   * 「이 키워드는 어떤 글이 유리한가」 제안.
   * 결정은 회원이 한다 — 앱은 근거를 보여주고 바꿀 버튼만 준다.
   */
  const [intent, setIntent] = useState<IntentSuggestion | null>(null)
  const [intentBusy, setIntentBusy] = useState(false)
  /*
   * 함께 찾는 키워드는 **하나만** 받는다.
   *
   * 예전에는 두 칸이었는데, 회원이 하나만 쓰기로 정했다. 밀도로도 그게 낫다 —
   * 메인 5회 + 서브 1개×2회면 합산 1.8%(1,915자)로, 두 개일 때(2.3%)보다 여유가 있다.
   *
   * 다만 **예전에 두 개를 넣어둔 글은 두 번째를 지우지 않는다.** 값이 있을 때만 칸을
   * 하나 더 보여줘서, 회원이 직접 비울지 말지 정하게 한다 (모르는 사이에 사라지지 않게).
   */
  const [sub1, setSub1] = useState(existing?.subKeywords[0] ?? initialSubs?.[0] ?? '')
  const [legacySub, setLegacySub] = useState(existing?.subKeywords[1] ?? '')
  const [localKeyword, setLocalKeyword] = useState(existing?.localKeyword ?? initialLocal ?? '')
  const [tagText, setTagText] = useState((existing?.tags ?? []).join(', '))
  const [introType, setIntroType] = useState(existing?.introType ?? '')
  const [angle, setAngle] = useState(existing?.angle ?? '')
  const [format, setFormat] = useState(existing?.format ?? '')
  const [topicGroup, setTopicGroup] = useState(existing?.topicGroup ?? '')
  const [sponsorship, setSponsorship] = useState<Sponsorship>(existing?.sponsorship ?? 'unset')
  const [publishedUrl, setPublishedUrl] = useState(existing?.publishedUrl ?? '')
  const [publishedAt, setPublishedAt] = useState(existing?.publishedAt ?? '')
  /**
   * 고쳐서 다시 올린 날 — 실험 기록.
   * 최신성이 관찰에서 가장 센 신호였으니(6회 중 5회 유리) 옛 글을 고치면 어떻게 되는지
   * 재본다. 네이버가 수정일을 반영하는지는 확인된 바 없다 (lib/analysis/revise.ts).
   */
  const [revisedAt, setRevisedAt] = useState(existing?.revisedAt ?? '')
  const [eventText, setEventText] = useState(existing?.eventText ?? '')

  const [view, setView] = useState<View>('write')
  const [saving, setSaving] = useState(false)
  /** 처방을 이 글에 반영할지 — 오래된 처방은 회원이 끌 수 있어야 한다 */
  const [useRx, setUseRx] = useState(true)
  /** AI 글쓰기 진행 상태·결과 안내 */
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  /**
   * 고쳐 쓰기에 필요한 것 — 초안 생성이 85점 미만이면 채워진다.
   *
   * 예전에는 한 요청에서 쓰고 고치기를 다 했다. 2,000자 글 하나에 40~90초라 합치면
   * 1~3분이고, Vercel 함수 한도를 넘기면 응답이 아예 오지 않았다. 그래서 두 번으로
   * 나눴고, 두 번째는 회원이 눌러서 시작한다.
   */
  const [fixIssues, setFixIssues] = useState<string[] | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  /*
   * 메인 키워드가 정해지면 유리한 유형을 물어본다.
   * 조회 1번(통합검색)뿐이고, 결과가 늦게 와도 글쓰기를 막지 않는다.
   */
  useEffect(() => {
    const kw = mainKeyword.trim()
    if (!kw) {
      setIntent(null)
      return
    }
    let alive = true
    setIntentBusy(true)
    fetch('/api/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (alive && !j.error) setIntent(j)
      })
      .catch(() => {})
      .finally(() => alive && setIntentBusy(false))
    return () => {
      alive = false
    }
  }, [mainKeyword])

  const rxAge = prescription ? prescriptionAgeDays(prescription.date) : 0
  const rxStale = prescription ? isPrescriptionStale(prescription.date) : false

  const store = stores.find((s) => s.id === storeId)
  const subKeywords = [sub1, legacySub].filter(Boolean)
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
        evidence,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, title, body, mainKeyword, sub1, legacySub, localKeyword, tagText, storeId, sponsorship]
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
    revisedAt: revisedAt || undefined,
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

  /** AI 로 본문까지 쓰게 한다 — 생성 후 앱 검수기가 매긴 점수를 함께 받는다 */
  async function writeWithAi() {
    if (!store) {
      setAiMsg('지점을 먼저 골라주세요.')
      return
    }
    if (!mainKeyword.trim()) {
      setAiMsg('메인 키워드를 먼저 넣어주세요.')
      return
    }
    if (body.trim() && !confirm('현재 제목·본문을 새로 쓴 글로 덮어씁니다. 계속할까요?')) return

    await callWrite({})
  }

  /**
   * `/api/write` 호출 한 번.
   *
   * `draft`·`issues` 를 함께 보내면 서버가 **고쳐 쓰기만** 한다. 응답이 JSON 이 아닌
   * 경우(게이트웨이 시간초과 페이지 등)를 따로 잡아 쓸 수 있는 안내로 바꾼다 —
   * 예전에는 그 상황에서 정체불명의 오류 문구만 떴다.
   */
  async function callWrite(extra: { draft?: Draft; issues?: string[] }) {
    if (!store) return
    const fixing = Boolean(extra.draft)
    setAiBusy(true)
    setAiMsg(fixing ? '검수에서 걸린 항목을 고치는 중입니다… 1분쯤 걸립니다.' : '글을 쓰는 중입니다… 1분쯤 걸립니다.')
    try {
      /*
       * 브라우저가 무한정 매달려 있지 않게 스스로 끊는다. 한 번 호출이 1분 안팎이라
       * 넉넉히 4분을 준다 — 플랫폼이 먼저 끊으면 위의 explainNonJson 이 이름을 찍어준다.
       */
      const ctl = new AbortController()
      const bell = setTimeout(() => ctl.abort(), 240_000)
      const res = await fetch('/api/write', {
        signal: ctl.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          storeId: store.id,
          mainKeyword,
          subKeywords,
          localKeyword: localKeyword || store.localKeywords[0],
          eventText,
          sponsorship,
          // 상위노출 분석에서 나온 처방 — 이게 빠지면 분석이 글에 반영되지 않는다
          prescription: useRx ? prescription?.items : undefined,
          ...extra,
        }),
      }).finally(() => clearTimeout(bell))
      const raw = await res.text()
      let json: {
        draft?: Draft
        revised?: boolean
        improved?: number
        needsRevise?: boolean
        fixIssues?: string[]
        provider?: string
        error?: string
        check?: { score?: number; issues?: unknown[] }
      }
      try {
        json = JSON.parse(raw)
      } catch {
        /*
         * JSON 이 아니면 **우리 코드가 아니라 플랫폼이 끊은 것**이다 — 라우트는 오류도
         * 전부 JSON 으로 내보낸다. 그래서 무엇이 끊었는지 이름을 찍어준다.
         * 예전에는 「응답을 읽지 못했습니다」만 떠서 원인을 알 수 없었다.
         */
        throw new Error(explainNonJson(res, raw))
      }
      if (!res.ok || !json.draft) throw new Error(json.error ?? '글 생성에 실패했습니다.')
      setTitle(json.draft.title)
      setBody(json.draft.body)
      if (Array.isArray(json.draft.tags) && json.draft.tags.length) {
        setTagText(json.draft.tags.join(', '))
      }
      const score = json.check?.score ?? 0
      const left = (json.check?.issues ?? []).length
      // 고칠 거리가 남아 있으면 버튼을 띄운다 (두 번째 호출은 회원이 시작한다)
      setFixIssues(score < PUBLISH_THRESHOLD && json.fixIssues?.length ? json.fixIssues : null)
      setAiMsg(
        `${score}점으로 나왔습니다` +
          (fixing ? (json.revised ? ` (고쳐서 ${json.improved}점 올랐습니다)` : ' (고쳐 써도 나아지지 않아 원래 글을 두었습니다)') : '') +
          '. ' +
          (left ? `아직 ${left}개 항목이 남았습니다.` : '검수 항목을 모두 통과했습니다.') +
          (json.provider ? ` · ${json.provider}` : '')
      )
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      setAiMsg(
        aborted
          ? '4분을 기다렸는데 답이 오지 않아 끊었습니다. 「골격만 넣기」로 직접 쓰거나, 잠시 뒤 다시 시도해 주세요.'
          : e instanceof Error
            ? e.message
            : '글 생성 중 오류가 발생했습니다.'
      )
    } finally {
      setAiBusy(false)
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

  /*
   * 화자 검사(checker 의 voice 항목)가 걸렸는지. 본문이 있을 때만 본다 —
   * 빈 화면에 경고를 띄우면 소음이 된다.
   */
  const voiceMismatch = useMemo(() => {
    if (!body.trim()) return null
    const v = result.items.find((i) => i.id === 'voice')
    return v && v.level !== 'pass' ? (v.hint ?? v.value) : null
  }, [body, result])

  const tone = result.score >= 85 ? 'good' : result.score >= 65 ? 'warn' : 'bad'

  return (
    <div>
      {autoOpened && (
        <div className="card mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] px-4 py-3">
          <span className="text-[12.5px] leading-relaxed">
            쓰던 초안을 열었습니다 —{' '}
            <b className="font-bold">{title || '(제목 없음)'}</b>
            <span className="muted"> · {POST_TYPE_LABEL[type]} · {result.score}점</span>
          </span>
          <a
            href="/write?new=1"
            className="bd surface ml-auto rounded-full border px-3 py-1.5 text-[12px] font-bold hover:bg-slate-500/8"
          >
            새 글로 시작
          </a>
        </div>
      )}

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

                  {/*
                    「이 키워드는 어떤 글이 유리한가」 — 앱은 근거를 펼쳐 보이고 제안만 한다.
                    실측에서 같은 업종인데 검색어에 따라 정반대였다 (쌍용동 PT 경험 +0.78 /
                    천안 헬스장 -0.81). 그래도 관찰이 6회뿐이라 결정은 회원이 한다.
                  */}
                  {intent && (
                    <div
                      data-intent="card"
                      className="bg-brand-500/8 border-brand-500/30 rounded-xl border px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-bold">
                          이 키워드에 유리해 보이는 유형: {POST_TYPE_LABEL[intent.suggest]}
                        </span>
                        {intent.suggest !== type && (
                          <button
                            type="button"
                            onClick={() => setType(intent.suggest)}
                            className="bg-brand-600 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                          >
                            {POST_TYPE_LABEL[intent.suggest]}으로 바꾸기
                          </button>
                        )}
                      </div>
                      {intent.reasons.length > 0 && (
                        <ul className="muted mt-1.5 space-y-0.5 text-[11px] leading-relaxed">
                          {intent.reasons.map((r, i) => (
                            <li key={i}>· {r}</li>
                          ))}
                        </ul>
                      )}
                      <p className="muted mt-1.5 text-[11px] leading-relaxed">{intent.note}</p>
                    </div>
                  )}
                  {intentBusy && <p className="muted text-[11px]">이 키워드에 유리한 유형을 보는 중…</p>}

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
                    <Field
                      label={type === 'info' ? '정보 보조 키워드' : '함께 찾는 키워드'}
                      hint={type === 'promo' ? '본문 2회. 자연스럽게 안 들어가면 비워도 됩니다.' : undefined}
                    >
                      <input value={sub1} onChange={(e) => setSub1(e.target.value)} className={inputClass} />
                    </Field>
                    {/* 예전에 두 개를 넣어둔 글에서만 보인다 — 비우면 칸도 사라진다 */}
                    {legacySub && (
                      <Field label="예전 서브 키워드" hint="지금은 하나만 씁니다. 비우면 이 칸이 사라집니다.">
                        <input
                          value={legacySub}
                          onChange={(e) => setLegacySub(e.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    )}
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={writeWithAi}
                      disabled={aiBusy}
                      className="bg-brand-600 hover:bg-brand-700 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_18px_-10px_var(--color-brand-600)] transition disabled:opacity-50"
                    >
                      <span className="block size-[14px]">
                        <IconSpark />
                      </span>
                      {aiBusy ? '쓰는 중…' : `AI로 ${POST_TYPE_LABEL[type]} 쓰기 (화자: ${SPEAKER_LABEL[type]})`}
                    </button>
                    {/* 두 번째 호출 — 초안이 85점 미만일 때만 보인다 */}
                    {fixIssues && (
                      <button
                        type="button"
                        onClick={() => callWrite({ draft: { title, body, tags }, issues: fixIssues })}
                        disabled={aiBusy}
                        className="bd rounded-full border px-3 py-2 text-xs font-bold hover:bg-slate-500/8 disabled:opacity-50"
                      >
                        {aiBusy ? '고치는 중…' : `검수 항목 고쳐 쓰기 (${fixIssues.length}개)`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={insertTemplate}
                      className="bd rounded-full border px-3 py-2 text-xs font-bold hover:bg-slate-500/8"
                    >
                      골격만 넣기
                    </button>
                  </div>
                }
              >
                {aiMsg && (
                  <p
                    className={`mb-3 rounded-[14px] px-3.5 py-2.5 text-[12px] leading-relaxed ${
                      aiBusy
                        ? 'surface muted'
                        : 'bg-brand-500/10 text-brand-700 dark:text-brand-100'
                    }`}
                  >
                    {aiMsg}
                  </p>
                )}

                {/*
                  **화자가 어긋났으면 여기서 먼저 말한다.**

                  회원이 홍보글을 뽑았다고 생각했는데 후기글 구조·말투로 나온 일이 있었다.
                  검수기는 그걸 잡고 있었지만(voice 항목) 검수 탭을 열어야 보였고, 회원은
                  본문을 다 읽고 나서 알았다. 유형이 틀렸든 모델이 어긋났든, 결과물 바로
                  위에서 눈에 걸려야 한다.
                */}
                {voiceMismatch && (
                  <div className="mb-3 rounded-[14px] border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-[12px] leading-relaxed">
                    <p className="font-bold text-red-700 dark:text-red-200">
                      화자가 어긋났습니다 — 지금 유형은 「{POST_TYPE_LABEL[type]}」(화자: {SPEAKER_LABEL[type]})입니다
                    </p>
                    <p className="muted mt-1">{voiceMismatch}</p>
                    <p className="muted mt-1.5">
                      {type === 'review'
                        ? '센터가 1인칭으로 쓰는 글을 원하셨다면 위에서 글 유형을 「홍보글」로 바꾸고 다시 쓰세요.'
                        : '방문객 시점으로 쓰려면 글 유형을 「후기글」로 바꾸세요. 유형이 맞다면 「검수 항목 고쳐 쓰기」로 화자를 되돌릴 수 있습니다.'}
                    </p>
                  </div>
                )}

                {/*
                  상위노출 분석에서 나온 처방을 여기서 보여주고 AI 지시문에 함께 보낸다.
                  예전에는 분석 화면에만 있어서 회원이 외워 옮겨 적어야 했다 — 즉 분석
                  결과가 글에 반영되는 경로가 하나도 없었다.
                */}
                {prescription && (
                  <div
                    data-rx="card"
                    className={`mb-3 rounded-[14px] border px-3.5 py-3 ${
                      useRx
                        ? 'border-brand-500/30 bg-brand-500/8'
                        : 'bd surface opacity-70'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-bold">
                        「{prescription.keyword}」 상위노출 처방 {prescription.items.length}개
                      </span>
                      {rxStale ? (
                        <Badge tone="warn">{rxAge}일 전 분석 — 다시 보는 게 좋습니다</Badge>
                      ) : (
                        <Badge tone="good">{rxAge === 0 ? '오늘' : `${rxAge}일 전`} 분석</Badge>
                      )}
                      <label className="ml-auto flex items-center gap-1.5 text-[11.5px] font-bold">
                        <input
                          type="checkbox"
                          checked={useRx}
                          onChange={(e) => setUseRx(e.target.checked)}
                          className="size-4"
                          aria-label="처방을 글에 반영"
                        />
                        글에 반영
                      </label>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {prescription.items.map((it, i) => (
                        <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed">
                          <span className="muted shrink-0">·</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="muted mt-2 text-[11px] leading-relaxed">
                      상위 {prescription.sampled}개 글을 분석한 결과입니다.{' '}
                      {useRx
                        ? '「AI로 본문 쓰기」를 누르면 이 내용을 지시문에 함께 넣습니다.'
                        : '체크를 켜면 AI 지시문에 함께 넣습니다.'}{' '}
                      <a
                        href={`/serp?keyword=${encodeURIComponent(prescription.keyword)}`}
                        className="text-brand-600 dark:text-brand-100 font-semibold underline"
                      >
                        다시 분석
                      </a>
                    </p>
                  </div>
                )}
                <Field
                  label="제목"
                  hint={`28~40자 · 메인 키워드를 앞 7자 안에 · 세부 의도(새벽·여성전용·초보 등)를 함께 담으면 스마트블록 유리 — 현재 ${title.length}자`}
                >
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    aria-label="제목"
                    className={inputClass}
                  />
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
                    aria-label="본문"
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

                  {/*
                    고쳐서 다시 올린 날 — 실험 기록.
                    최신성이 관찰에서 가장 센 신호였으니(6회 중 5회 유리·거꾸로 0) 옛 글을
                    고치면 어떻게 되는지 재본다. 네이버가 수정일을 반영하는지는 확인된 바 없다.
                  */}
                  <div className="bd mt-3.5 border-t pt-3.5">
                    <Field
                      label="고쳐서 다시 올린 날 (실험)"
                      hint="네이버에서 본문을 고쳐 저장한 날을 넣으면, 순위 추적 화면에서 수정 앞뒤 순위를 비교해 줍니다"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={revisedAt.slice(0, 10)}
                          onChange={(e) => setRevisedAt(e.target.value)}
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setRevisedAt(new Date().toISOString().slice(0, 10))}
                          className="bd shrink-0 rounded-xl border px-3 py-2 text-[12px] font-semibold hover:bg-slate-500/8"
                        >
                          오늘 고쳤음
                        </button>
                        {revisedAt && (
                          <button
                            type="button"
                            onClick={() => setRevisedAt('')}
                            className="muted shrink-0 px-1 text-[11.5px] font-semibold hover:underline"
                          >
                            지우기
                          </button>
                        )}
                      </div>
                    </Field>
                    <p className="muted mt-1.5 text-[11px] leading-relaxed">
                      최신성은 관찰 6회에서 <b>거꾸로 나온 적이 한 번도 없는</b> 신호입니다. 그래서 옛
                      글을 고쳐 다시 올리는 게 통하는지 재봅니다 —{' '}
                      <b>네이버가 수정일을 순위에 반영하는지는 공개돼 있지 않습니다.</b> 고치기 전에
                      순위를 한 번 재두면 비교가 정확해집니다.
                    </p>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>

        {/* 오른쪽 — 검수 (데스크톱 고정) */}
        <div className={`${view === 'check' ? '' : 'hidden lg:block'} mt-4 lg:mt-0`}>
          <div className="space-y-4 lg:sticky lg:top-16">
            <CheckPanel result={result} />
            {/* 검수기는 내 글만 본다. 남의 글과 겹치는지는 네이버를 읽어야 알 수 있다 */}
            <SimilarityCard keyword={mainKeyword} text={stripGuides(body)} />
            {/*
              내 글끼리 겹침 — 버튼 없이 즉시 잰다 (내 글은 이미 여기 있다).
              지점만 바꿔 같은 글을 올리는 것을 아무도 안 잡고 있었다.
            */}
            <MineOverlapCard
              text={stripGuides(body)}
              posts={posts}
              stores={stores}
              storeId={storeId}
              postId={id || undefined}
            />
            <SpellCard text={body} />
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
