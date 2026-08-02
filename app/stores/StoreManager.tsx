'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Store } from '@/lib/types'
import { areasFromPlace, type PlaceInfo } from '@/lib/naver/place'
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
      const res = await fetch('/api/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      const found: PlaceInfo[] = json.places ?? []
      setPlaces(found)
      if (!found.length) {
        setPlaceMsg(
          '못 찾았습니다. 네이버에서 실제로 검색되는 이름으로 바꿔보세요 — 등록된 플레이스 이름이 정식 상호명과 다른 경우가 많습니다.'
        )
      }
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
      localKeywords: merged,
    })
    setPlaces(null)
    setPlaceMsg(
      `"${p.name}" 정보를 채웠습니다. 비어 있던 칸만 채웠으니, 이미 적어둔 값은 그대로입니다 — 아래에서 확인하고 저장하세요.`
    )
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
          <div className="bd rounded-lg border border-dashed p-3">
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
                placeholder={editing.legalName || editing.name || 'MTO 피트니스 쌍용점'}
                aria-label="플레이스에서 찾을 상호명"
              />
              <button
                type="button"
                onClick={() => findPlaces(placeQuery || editing.legalName || editing.name)}
                disabled={placeLoading}
                className="bg-brand-600 shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
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
                    className="bd panel block w-full rounded-lg border p-2.5 text-left hover:bg-slate-500/8"
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

          <Field label="블로그 URL" hint="순위 추적에서 내 글을 찾는 기준으로 쓸 수 있습니다">
            <input
              value={editing.blogUrl ?? ''}
              onChange={(e) => set('blogUrl', e.target.value || undefined)}
              className={inputClass}
              placeholder="https://blog.naver.com/…"
            />
          </Field>

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
              className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setIsNew(false)
              }}
              className="bd rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-slate-500/8"
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
        onClick={() => {
          setEditing(emptyStore())
          setIsNew(true)
        }}
        className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white"
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
                onClick={() => {
                  setEditing(s)
                  setIsNew(false)
                }}
                className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                className="muted rounded-lg px-2.5 py-1.5 text-[11px] font-semibold hover:text-rose-600"
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
              className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
            >
              홍보글 쓰기
            </Link>
            <Link
              href={`/write?store=${s.id}&type=info`}
              className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
            >
              정보글 쓰기
            </Link>
            <Link
              href={`/write?store=${s.id}&type=review`}
              className="bd rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-500/8"
            >
              후기글 쓰기
            </Link>
          </div>
        </Card>
      ))}
    </div>
  )
}
