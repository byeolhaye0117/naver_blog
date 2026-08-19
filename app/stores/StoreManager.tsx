'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Store } from '@/lib/types'
import { areasFromStore } from '@/lib/analysis/keyword'
import { areasFromPlace, extractPlaceId, type PlaceInfo } from '@/lib/naver/place'
import {
  analyzeReviews,
  parsePastedReviews,
  placeReviewUrl,
  type PlaceReview,
} from '@/lib/analysis/reviews'
import { Badge, Card, Field, inputClass } from '@/components/ui'

function emptyStore(): Store {
  return {
    id: '',
    name: '',
    legalName: '',
    womenOnly: false,
    open24: true,
    localKeywords: [],
    location: '',
    features: [],
    strengths: [],
    phone: '',
  }
}

export default function StoreManager({ stores }: { stores: Store[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Store | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  // 네이버 플레이스에서 가져오기
  const [placeQuery, setPlaceQuery] = useState('')
  const [places, setPlaces] = useState<PlaceInfo[] | null>(null)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeMsg, setPlaceMsg] = useState<string | null>(null)
  /** 플레이스 정보를 채웠는데 아직 저장하지 않은 상태 — 저장 없이 나가면 사라진다 */
  const [placeApplied, setPlaceApplied] = useState(false)

  async function search(query: string): Promise<PlaceInfo[]> {
    const res = await fetch('/api/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    const json = await res.json()
    return json.places ?? []
  }

  /**
   * 상호명으로 찾고, 못 찾으면 동네+업종으로 한 번 더 찾는다.
   *
   * 플레이스에 등록된 이름이 정식 상호명과 다른 경우가 흔하다
   * (예: "여성전용 착한헬스 성정점" → 실제 등록명 "성정동 착한 헬스장").
   * 그때 "못 찾았습니다" 로 끝내면 회원이 직접 이름을 알아내야 하니,
   * 그 동네 업체 목록을 대신 보여주고 고르게 한다.
   */
  async function findPlaces(q: string) {
    const query = q.trim()
    if (!query) {
      setPlaceMsg('찾을 상호명을 넣어주세요.')
      return
    }
    setPlaceLoading(true)
    setPlaceMsg(null)
    setPlaces(null)
    try {
      let found = await search(query)
      let note: string | null = null

      if (!found.length && editing) {
        const area = areasFromStore(editing)[0]
        if (area) {
          const wide = `${area} 헬스장`
          found = await search(wide)
          if (found.length) {
            note = `"${query}" 로는 안 나와서 "${wide}" 로 다시 찾았습니다 — 플레이스 등록명이 정식 상호명과 다른 경우가 많습니다. 아래에서 내 지점을 고르세요.`
          }
        }
      }

      setPlaces(found)
      setPlaceMsg(
        found.length
          ? note
          : '못 찾았습니다. 네이버에서 내 업체가 실제로 검색되는 이름을 그대로 넣어보세요.'
      )
    } catch {
      setPlaceMsg('조회에 실패했습니다. 잠시 뒤 다시 시도하거나 아래에 직접 입력하세요.')
    } finally {
      setPlaceLoading(false)
    }
  }

  /** 고른 플레이스 정보를 편집 중인 지점에 채운다 — 비어 있는 칸만 채우고 기존 값은 지키지 않는다 */
  function applyPlace(p: PlaceInfo) {
    if (!editing) return
    const areas = areasFromPlace(p)
    const merged = Array.from(
      new Set([...editing.localKeywords, ...areas.map((a) => `${a} ${p.category || '헬스장'}`)])
    )
    setEditing({
      ...editing,
      legalName: editing.legalName.trim() || p.name,
      location: editing.location.trim() || [p.commonAddress, p.roadAddress].filter(Boolean).join(' '),
      phone: editing.phone.trim() || p.phone || '',
      reserveUrl: editing.reserveUrl?.trim() || p.bookingUrl || undefined,
      // 플레이스 노출 순위에서 내 지점을 정확히 찾기 위해 id 를 남긴다
      placeId: p.id,
      localKeywords: merged,
    })
    setPlaces(null)
    setPlaceApplied(true)
    setPlaceMsg(
      `"${p.name}" 정보를 채웠습니다. 비어 있던 칸만 채웠으니 이미 적어둔 값은 그대로입니다.`
    )
  }

  /** 편집 시작 — 플레이스 조회 상태를 초기화하고 상호명을 미리 채워 둔다 */
  function startEdit(store: Store, brandNew: boolean) {
    setEditing(store)
    setIsNew(brandNew)
    setPlaceQuery(store.legalName || store.name || '')
    setPlaces(null)
    setPlaceMsg(null)
    setPlaceApplied(false)
  }

  async function save() {
    if (!editing) return
    if (!editing.name.trim() || !editing.legalName.trim()) {
      alert('지점 이름과 정식 상호명은 필수입니다. 상호명을 모르면 지어내지 말고 확인 후 입력하세요.')
      return
    }
    setSaving(true)
    await fetch('/api/stores', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    setSaving(false)
    setEditing(null)
    setIsNew(false)
    setPlaceApplied(false)
    router.refresh()
  }

  async function remove(store: Store) {
    if (!confirm(`"${store.name}" 지점 정보를 삭제할까요?`)) return
    await fetch(`/api/stores?id=${store.id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (editing) {
    const set = <K extends keyof Store>(k: K, v: Store[K]) => setEditing({ ...editing, [k]: v })
    const lines = (arr: string[]) => arr.join('\n')
    const parseLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

    return (
      <Card title={isNew ? '지점 추가' : `${editing.name} 수정`}>
        <div className="space-y-3.5">
          {/* 손으로 다 적지 않아도 되게 — 통합검색에 들어 있는 플레이스 정보를 읽어온다 */}
          <div className="surface rounded-xl p-3.5">
            <p className="text-[12px] font-semibold">네이버 플레이스에서 가져오기</p>
            <p className="muted mt-1 text-[11px] leading-relaxed">
              상호명으로 검색해 <b>주소·전화·예약링크·지역 키워드</b>를 채웁니다. 이미 적어둔 칸은
              건드리지 않고 <b>비어 있는 칸만</b> 채웁니다.
            </p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findPlaces(placeQuery)}
                className={inputClass}
                placeholder="네이버에서 검색되는 업체 이름"
                aria-label="플레이스에서 찾을 상호명"
              />
              <button
                type="button"
                onClick={() => findPlaces(placeQuery || editing.legalName || editing.name)}
                disabled={placeLoading}
                className="bg-brand-600 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {placeLoading ? '찾는 중…' : '찾기'}
              </button>
            </div>

            {places && places.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                <p className="muted text-[11px] font-semibold">
                  {places.length}곳 찾았습니다 — 내 지점을 고르세요
                </p>
                {places.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPlace(p)}
                    className="bd panel block w-full rounded-xl border p-2.5 text-left hover:bg-slate-500/8"
                  >
                    <span className="text-[12px] font-semibold">{p.name}</span>
                    {p.category && (
                      <span className="muted ml-1.5 text-[11px]">{p.category}</span>
                    )}
                    <span className="muted mt-0.5 block text-[11px]">
                      {p.commonAddress} {p.roadAddress}
                    </span>
                    {p.phone && <span className="muted block text-[11px]">{p.phone}</span>}
                  </button>
                ))}
              </div>
            )}

            {placeMsg && <p className="muted mt-2 text-[11px] leading-relaxed">{placeMsg}</p>}

            {placeApplied && (
              <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
                  <strong>아직 저장되지 않았습니다.</strong> 이대로 나가면 사라집니다.
                </p>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="bg-brand-600 mt-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? '저장 중…' : '지금 저장'}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Field label="지점 이름 (표시용)" hint="예: 쌍용점">
              <input value={editing.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </Field>
            <Field label="정식 상호명" hint="글에서 3회 이상 노출 검사 기준. 모르면 지어내지 말고 확인하세요.">
              <input value={editing.legalName} onChange={(e) => set('legalName', e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={editing.womenOnly}
                onChange={(e) => set('womenOnly', e.target.checked)}
                className="size-4"
              />
              여성전용 지점
            </label>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={editing.open24}
                onChange={(e) => set('open24', e.target.checked)}
                className="size-4"
              />
              24시간 운영
            </label>
          </div>

          <Field
            label="지역 키워드 (한 줄에 하나)"
            hint="메인 키워드 로테이션 대상입니다. 같은 키워드만 반복하면 블로그 내 자기잠식이 생깁니다."
          >
            <textarea
              value={lines(editing.localKeywords)}
              onChange={(e) => set('localKeywords', parseLines(e.target.value))}
              rows={5}
              className={inputClass}
            />
          </Field>

          <Field label="위치">
            <textarea value={editing.location} onChange={(e) => set('location', e.target.value)} rows={2} className={inputClass} />
          </Field>

          <Field label="시설 특징 (한 줄에 하나)">
            <textarea
              value={lines(editing.features)}
              onChange={(e) => set('features', parseLines(e.target.value))}
              rows={5}
              className={inputClass}
            />
          </Field>

          {/*
            트레이너 칸 (2026-08-19 추가). 이 칸이 비어 있으면 「트레이너가 안 맞을까봐」 같은
            요청에 글이 답을 못 한다 — 지어내면 안 되는 사실이라 빈손으로 넘어간다.
          */}
          <Field
            label="트레이너 (한 줄에 하나)"
            hint="이름과 직함을 적으세요 — 예) 조용석 PT 팀장. 플레이스에 트레이너별 무료체험 항목이 있으면 그 이름 그대로 쓰면 됩니다. 비워 두면 글에서 트레이너 얘기를 아예 하지 않습니다(지어내지 않습니다)."
          >
            <textarea
              value={lines(editing.trainers ?? [])}
              onChange={(e) => set('trainers', parseLines(e.target.value))}
              rows={4}
              className={inputClass}
            />
          </Field>

          <Field label="고유 강점 (한 줄에 하나)" hint="'좋다'가 아니라 구체적 사실·수치로 적으세요">
            <textarea
              value={lines(editing.strengths)}
              onChange={(e) => set('strengths', parseLines(e.target.value))}
              rows={5}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Field label="전화번호" hint="글 전체에 1회만 — CTA 구간에">
              <input value={editing.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
            </Field>
            <Field label="예약 링크 (없으면 비워두기)" hint="없으면 전화만 안내합니다">
              <input
                value={editing.reserveUrl ?? ''}
                onChange={(e) => set('reserveUrl', e.target.value || undefined)}
                className={inputClass}
              />
            </Field>
          </div>

          {/*
            플레이스 id 를 **손으로 넣을 칸이 없었다.** 위의 「플레이스에서 가져오기」가
            성공할 때만 채워졌는데, 그 조회는 서버 IP 가 막히면 빈 결과가 온다 (place.ts).
            그래서 주소를 붙여넣어도 되게 만든다 — 회원이 "플레이스 아이디 어디서 확인해?"
            라고 물은 것이 이 칸이 없다는 뜻이었다.
          */}
          <PlaceIdField key={editing.id || 'new'} value={editing.placeId} onChange={(v) => set('placeId', v)} />

          <Field label="블로그 URL" hint="순위 추적에서 내 글을 찾는 기준으로 쓸 수 있습니다">
            <input
              value={editing.blogUrl ?? ''}
              onChange={(e) => set('blogUrl', e.target.value || undefined)}
              className={inputClass}
              placeholder="https://blog.naver.com/…"
            />
          </Field>

          <ReviewField
            reviews={editing.placeReviews ?? []}
            placeId={editing.placeId}
            onChange={(rs) => set('placeReviews', rs.length ? rs : undefined)}
          />

          <Field label="메모">
            <textarea
              value={editing.memo ?? ''}
              onChange={(e) => set('memo', e.target.value || undefined)}
              rows={2}
              className={inputClass}
            />
          </Field>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-brand-600 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setIsNew(false)
              }}
              className="bd rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-500/8"
            >
              취소
            </button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => startEdit(emptyStore(), true)}
        className="bg-brand-600 rounded-xl px-4 py-2 text-sm font-semibold text-white"
      >
        지점 추가
      </button>

      {stores.map((s) => (
        <Card
          key={s.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {s.name}
              {s.womenOnly && <Badge tone="brand">여성전용</Badge>}
              {s.open24 && <Badge tone="info">24시간</Badge>}
            </span>
          }
          subtitle={s.legalName}
          right={
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => startEdit(s, false)}
                aria-label={`${s.name} 수정`}
                className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`${s.name} 삭제`}
                className="muted rounded-xl px-2.5 py-1.5 text-[11px] font-semibold hover:text-rose-600"
              >
                삭제
              </button>
            </div>
          }
        >
          <dl className="space-y-3 text-[12px]">
            <div>
              <dt className="muted font-semibold">지역 키워드</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {s.localKeywords.map((k) => (
                  <Link
                    key={k}
                    href={`/serp?keyword=${encodeURIComponent(k)}`}
                    className="bd rounded-full border px-2 py-0.5 text-[11px] hover:bg-slate-500/8"
                  >
                    {k}
                  </Link>
                ))}
              </dd>
            </div>
            <div>
              <dt className="muted font-semibold">위치</dt>
              <dd className="mt-0.5 leading-relaxed">{s.location || '—'}</dd>
            </div>
            {s.features.length > 0 && (
              <div>
                <dt className="muted font-semibold">시설 특징</dt>
                <dd className="mt-0.5">
                  <ul className="list-inside list-disc space-y-0.5 leading-relaxed">
                    {s.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {s.strengths.length > 0 && (
              <div>
                <dt className="muted font-semibold">고유 강점</dt>
                <dd className="mt-0.5">
                  <ul className="list-inside list-disc space-y-0.5 leading-relaxed">
                    {s.strengths.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            <div>
              <dt className="muted font-semibold">상담 예약</dt>
              <dd className="mt-0.5">
                {s.phone || '—'}
                {s.reserveUrl ? ` · ${s.reserveUrl}` : ' (예약 링크 없음 — 전화만 안내)'}
              </dd>
            </div>
            {s.memo && (
              <div>
                <dt className="muted font-semibold">메모</dt>
                <dd className="mt-0.5 leading-relaxed">{s.memo}</dd>
              </div>
            )}
          </dl>

          <div className="bd mt-3.5 flex flex-wrap gap-1.5 border-t pt-3.5">
            <Link
              href={`/write?store=${s.id}&type=promo`}
              className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
            >
              홍보글 쓰기
            </Link>
            <Link
              href={`/write?store=${s.id}&type=info`}
              className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
            >
              정보글 쓰기
            </Link>
            <Link
              href={`/write?store=${s.id}&type=review`}
              className="bd rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
            >
              후기글 쓰기
            </Link>
          </div>
        </Card>
      ))}
    </div>
  )
}

/**
 * 플레이스 리뷰 붙여넣기.
 *
 * 회원 요청 — "홍보성 글에 플레이스 관련 헬스 및 피티 리뷰를 분석해서 신뢰성을 줄 수 있게.
 * **실제 리뷰인 거지.** 링크도 첨부해서."
 *
 * 자동으로 못 가져온다 (플레이스가 서버 IP 를 429·캡차로 막는다 — lib/naver/place.ts).
 * 그래서 SERP 에서 이미 쓰는 방식대로 붙여넣기로 받는다. 파싱은 완벽하지 않은 것을 전제로,
 * 뽑아낸 줄을 그대로 보여주고 지울 수 있게 한다.
 */
function ReviewField({
  reviews,
  placeId,
  onChange,
}: {
  reviews: PlaceReview[]
  placeId?: string
  onChange: (r: PlaceReview[]) => void
}) {
  const [raw, setRaw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const analysis = analyzeReviews(reviews)
  const url = placeReviewUrl(placeId)

  function add() {
    const { reviews: parsed, dropped } = parsePastedReviews(raw)
    if (!parsed.length) {
      setMsg('리뷰로 볼 만한 줄을 못 찾았습니다. 리뷰 본문이 포함됐는지 확인해 주세요.')
      return
    }
    // 이미 있는 것과 합치고 중복은 뺀다 (여러 번 나눠 붙여넣을 수 있게)
    const seen = new Set(reviews.map((r) => r.text.replace(/\s+/g, '')))
    const fresh = parsed.filter((r) => !seen.has(r.text.replace(/\s+/g, '')))
    onChange([...reviews, ...fresh])
    setRaw('')
    setMsg(`${fresh.length}개 추가 (버린 줄 ${dropped}개${fresh.length < parsed.length ? ` · 중복 ${parsed.length - fresh.length}개` : ''}). 저장을 눌러야 반영됩니다.`)
  }

  return (
    <Field
      label="플레이스 리뷰 (실제 리뷰만)"
      hint="홍보글 신뢰 구간이 여기 있는 문장만 인용합니다. 비어 있으면 글에서 리뷰를 언급하지 않습니다"
    >
      <div className="space-y-2.5">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
          <b>없는 리뷰를 쓰면 표시광고법 위반</b>(거짓·과장 광고)입니다. 그래서 앱이 본문의 리뷰
          인용을 여기 있는 문장과 대조하고, 없으면 <b>즉시수정</b>으로 잡습니다. 플레이스 리뷰
          화면을 <b>전체 선택·복사</b>해서 그대로 붙여넣으세요 — 닉네임·날짜 줄은 알아서 버립니다.
        </div>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={4}
          className={inputClass}
          placeholder={
            url
              ? `${url} 화면을 열어 전체 선택·복사해서 붙여넣기`
              : '플레이스 리뷰 화면을 전체 선택·복사해서 붙여넣기 (플레이스 id 를 넣으면 링크를 만들어 드립니다)'
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={add}
            disabled={!raw.trim()}
            className="bd rounded-xl border px-3 py-1.5 text-[12px] font-semibold hover:bg-slate-500/8 disabled:opacity-50"
          >
            리뷰 뽑아내기
          </button>
          {reviews.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([])
                setMsg('전부 지웠습니다. 저장을 눌러야 반영됩니다.')
              }}
              className="muted px-1 text-[11.5px] font-semibold hover:underline"
            >
              전부 지우기
            </button>
          )}
          {msg && <span className="muted text-[11px]">{msg}</span>}
        </div>

        {reviews.length > 0 && (
          <>
            <p className="text-[12px] font-semibold">
              모은 리뷰 {reviews.length}편{' '}
              <span className="muted font-normal">
                (인용 가능 {analysis.count}편 · 짧은 한마디 {analysis.tagCount}편)
              </span>
            </p>

            {analysis.themes.length > 0 && (
              <div className="bd rounded-xl border px-3 py-2.5">
                <p className="muted mb-1.5 text-[11px] font-semibold">
                  리뷰에서 반복된 것 — 글에서 이 순서로 씁니다
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.themes.slice(0, 6).map((t) => (
                    <span
                      key={t.label}
                      className="bd rounded-xl border px-2 py-0.5 text-[11.5px]"
                      title={`걸린 말: ${t.words.join('·')}`}
                    >
                      {t.label} <b className="tnum">{t.count}</b>
                      <span className="muted"> · {Math.round(t.share * 100)}%</span>
                    </span>
                  ))}
                </div>
                <p className="muted mt-2 text-[11px] leading-relaxed">
                  우리가 고른 강점이 아니라 <b>손님들이 고른 강점</b>입니다. 가장 많이 나온 것을
                  신뢰 구간의 중심으로 씁니다.
                </p>
              </div>
            )}

            <div className="bd max-h-52 overflow-y-auto rounded-xl border">
              <ul className="divide-y divide-slate-500/15">
                {reviews.map((r, i) => (
                  <li key={`${i}-${r.text.slice(0, 12)}`} className="flex items-start gap-2 px-3 py-1.5">
                    <span className="muted mt-0.5 shrink-0 text-[10px] font-bold">
                      {r.kind === 'tag' ? '한마디' : '리뷰'}
                    </span>
                    <span className="flex-1 text-[11.5px] leading-relaxed">{r.text}</span>
                    <button
                      type="button"
                      onClick={() => onChange(reviews.filter((_, j) => j !== i))}
                      className="muted shrink-0 text-[11px] font-semibold hover:underline"
                      aria-label="이 줄 지우기"
                    >
                      지우기
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {analysis.quotes.length > 0 && (
              <p className="muted text-[11px] leading-relaxed">
                글에 인용될 문장: {analysis.quotes.map((q) => `"${q}"`).join(' · ')}
              </p>
            )}
            {!url && (
              <p className="muted text-[11px]">
                <b>플레이스 id 를 넣으면</b> 리뷰 링크(m.place.naver.com/…/review/visitor)를 글에
                함께 넣어 확인시킬 수 있습니다.
              </p>
            )}
          </>
        )}
      </div>
    </Field>
  )
}

/**
 * 플레이스 id 입력.
 *
 * **주소를 통째로 붙여넣어도 되게** 한다. 회원이 확인하는 곳은 주소창이고, 거기서 숫자만
 * 골라 옮기라고 하면 한 번 더 틀릴 일을 만든다. 뽑아낸 숫자와 그걸로 만든 리뷰 링크를
 * 바로 보여줘서 맞는 업체인지 눈으로 확인하게 한다.
 */
function PlaceIdField({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  /*
   * 화면에는 **붙여넣은 그대로** 두고, 저장은 뽑아낸 숫자로 한다. 주소를 붙여넣었을 때
   * 입력칸이 갑자기 숫자로 바뀌면 「내가 넣은 게 지워졌나」로 읽히므로, 무엇이 뽑혔는지는
   * 아래에 따로 보여준다.
   */
  const [draft, setDraft] = useState(value ?? '')
  const id = extractPlaceId(draft)
  const url = placeReviewUrl(id ?? undefined)
  const short = /naver\.me/i.test(draft)

  function edit(next: string) {
    setDraft(next)
    onChange(extractPlaceId(next) ?? undefined)
  }

  return (
    <Field
      label="플레이스 id"
      hint="네이버 지도에서 내 업체를 열면 주소에 들어 있는 숫자입니다. 주소를 그대로 붙여넣어도 됩니다"
    >
      <div className="space-y-2">
        <input
          value={draft}
          onChange={(e) => edit(e.target.value)}
          className={inputClass}
          placeholder="1234567890 또는 https://m.place.naver.com/place/1234567890/home"
        />

        {id ? (
          <p className="muted text-[11px] leading-relaxed">
            id <b className="tnum">{id}</b> · 리뷰 링크 <span className="break-all">{url}</span> — 눌러서 내
            업체가 맞는지 확인하세요.{' '}
            <button type="button" onClick={() => edit('')} className="font-semibold hover:underline">
              지우기
            </button>
          </p>
        ) : draft.trim() ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            {short ? (
              <>
                단축주소(naver.me)에는 숫자가 없습니다. 그 링크를 <b>한 번 열고</b> 주소창에 나오는
                주소를 다시 붙여넣으세요.
              </>
            ) : (
              <>여기서 숫자를 못 찾았습니다. 주소를 그대로 붙여넣거나 숫자만 넣어주세요.</>
            )}
          </p>
        ) : null}

        <details className="text-[11.5px]">
          <summary className="muted cursor-pointer font-semibold">어디서 확인하나요?</summary>
          <ol className="muted mt-1.5 list-decimal space-y-1 pl-4 leading-relaxed">
            <li>
              <b>가장 쉬운 방법</b> — 위 「네이버 플레이스에서 가져오기」로 내 업체를 찾으면 id 가
              자동으로 들어옵니다.
            </li>
            <li>
              <b>PC</b> — 네이버 지도(map.naver.com)에서 상호를 검색해 내 업체를 클릭하면 주소가{' '}
              <code>
                map.naver.com/p/entry/place/<b>1234567890</b>
              </code>{' '}
              이 됩니다. 그 숫자입니다.
            </li>
            <li>
              <b>모바일</b> — 업체를 열고 공유 → 링크 복사. 주소가{' '}
              <code>
                m.place.naver.com/place/<b>1234567890</b>/home
              </code>{' '}
              형태입니다. 단축주소로 복사되면 한 번 열어서 주소창을 보세요.
            </li>
            <li>
              <b>스마트플레이스</b> — 사업주 콘솔(smartplace.naver.com)에서 업체를 고르면 주소의{' '}
              <code>
                id=<b>1234567890</b>
              </code>{' '}
              가 같은 값입니다 (<code>bookingBusinessId</code> 는 예약용이라 다른 번호입니다).
            </li>
          </ol>
        </details>
      </div>
    </Field>
  )
}
