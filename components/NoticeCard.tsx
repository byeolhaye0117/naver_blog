'use client'

import { useState } from 'react'
import { Badge, Card, btnPrimary, inputClass } from './ui'
import type { NoticeItem } from '@/lib/naver/notice'

/**
 * **네이버 공지·검색 로직 소식** — 매일 받아서 아직 안 본 것을 알린다.
 *
 * 회원 요청 (2026-08-20): "네이버 로직과 공지사항을 항상 최신화해서 그에 맞는 글을 쓸 수
 * 있도록 해줘."
 *
 * **자동으로 규칙을 바꾸지 않는다.** 제목만 보고 지시문을 고치면 읽지도 않은 문장으로
 * 글쓰기 규칙을 바꾸는 셈이다 (이 저장소에서 짐작으로 넣은 규칙이 실측에 두 번 뒤집혔다).
 * 그래서 화면이 하는 일은 둘이다 — ①안 본 공지를 띄운다 ②읽고 정한 규칙 한 줄을 받아
 * 지시문에 넣는다.
 */
export default function NoticeCard({ items }: { items: NoticeItem[] }) {
  const [list, setList] = useState(items)
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const relevant = list.filter((n) => n.relevant)
  const pending = relevant.filter((n) => !n.reviewedAt)
  const rules = list.filter((n) => n.rule?.trim())
  const shown = showAll ? list : relevant.slice(0, 12)

  async function save(url: string, patch: { reviewed?: boolean; rule?: string }) {
    setBusy(url)
    setError(null)
    try {
      const res = await fetch('/api/notice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...patch }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장하지 못했습니다.')
      setList(json.items as NoticeItem[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      title="네이버 공지 · 검색 로직 소식"
      subtitle="네이버 검색 공식 블로그와 블로그 공식 채널을 매일 받아옵니다. 읽고 정한 것만 글쓰기 규칙이 됩니다."
      right={
        <Badge tone={pending.length ? 'warn' : 'good'}>
          {pending.length ? `안 읽음 ${pending.length}건` : '전부 확인함'}
        </Badge>
      }
    >
      {list.length === 0 ? (
        <p className="muted text-[12.5px]">
          아직 받아온 공지가 없습니다. 매일 밤(07시 KST) 자동으로 받아옵니다.
        </p>
      ) : (
        <>
          {rules.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-emerald-900 dark:text-emerald-100">
              <b>글쓰기에 반영 중인 규칙 {rules.length}개</b> — AI로 쓸 때 지시문 맨 뒤에 들어갑니다.
              <ul className="mt-1.5 space-y-1">
                {rules.map((n) => (
                  <li key={n.url}>
                    · {n.rule} <span className="muted">({n.date} · {n.title.slice(0, 24)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
              {error}
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {shown.map((n) => (
              <li key={n.url} className="bd rounded-xl border px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="tnum muted text-[11px]">{n.date}</span>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 dark:text-brand-100 flex-1 text-[12.5px] font-semibold underline"
                  >
                    {n.title}
                  </a>
                  {n.reviewedAt ? (
                    <Badge tone="good">확인함</Badge>
                  ) : n.relevant ? (
                    <Badge tone="warn">읽어야 함</Badge>
                  ) : null}
                </div>
                <div className="muted mt-1 text-[11px]">
                  {n.source}
                  {n.tags.length > 0 && ` · ${n.tags.join(' · ')}`}
                </div>

                {n.relevant && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      className={`${inputClass} flex-1 min-w-[220px] text-[12px]`}
                      placeholder="읽고 나서, 글쓰기에 반영할 규칙 한 줄 (비워두면 반영 안 함)"
                      defaultValue={n.rule ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [n.url]: e.target.value }))}
                    />
                    <button
                      type="button"
                      disabled={busy === n.url}
                      onClick={() => save(n.url, { reviewed: true, rule: draft[n.url] ?? n.rule ?? '' })}
                      className={btnPrimary}
                    >
                      {busy === n.url ? '저장 중…' : n.reviewedAt ? '다시 저장' : '확인함'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {list.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="muted mt-2 text-[11.5px] font-semibold hover:underline"
            >
              걸러진 것까지 전부 보기 ({list.length}건)
            </button>
          )}

          <p className="muted mt-3 text-[11px] leading-relaxed">
            <b>자동으로 규칙을 바꾸지 않습니다.</b> 제목만 보고 지시문을 고치면 읽지도 않은 문장으로 글쓰기
            규칙을 바꾸는 셈입니다. 공지를 읽고 <b>한 줄로 적어 저장한 것만</b> 지시문에 들어갑니다.
            <br />
            「읽어야 함」은 제목에 스팸·로직·정책·가이드·AI 같은 말이 있는 것입니다. 이벤트·당첨 글은
            자동으로 걸러집니다 (전부 보기로 확인할 수 있습니다).
          </p>
        </>
      )}
    </Card>
  )
}
