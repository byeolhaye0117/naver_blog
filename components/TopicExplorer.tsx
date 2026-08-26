'use client'

import { useState } from 'react'
import { TOPIC_SEEDS, type TopicCandidate } from '@/lib/writing/topic-explore'
import { Badge, btnGhost } from '@/components/ui'

interface Note {
  found: number
  shown: number
  /** 정보글로 쓸 만한 후보 전체 수 · 지금 몇 번째를 보고 있나 */
  total: number
  from: number
  to: number
  pages: number
  page: number
  /** 의료·제품처럼 우리가 손대면 안 되는 것 */
  offlimit: number
  /** 업체를 찾는 말 (지역·가격) */
  local: number
  /** 주제가 되기엔 짧은 것 */
  thin: number
  measured: number
  tried: number
  adKeys: boolean
  autocomplete: { asked: number; answered: number }
}

/**
 * **주제 탐색기** — 무엇을 쓸지 지어내지 않고 재서 고른다 (2026-08-23 회원 요청).
 *
 * "주제도 단순히 새벽운동 어떻게 하나 이런게 아니라 실제로 다이어트나 체중증량을 원하는
 * 주제들을 리서치해서 그에 맞는 주제를 탐색하는 탐색기를 만들어서 그거중에 내가 선택해서
 * 하고 싶어."
 *
 * 씨앗(「다이어트」·「체중 증량」)만 우리가 넣고, 후보는 **네이버 자동완성 + 검색광고
 * 연관검색어**에서 온다. 경쟁은 그 검색어의 최근 30일 발행량으로 잰다.
 *
 * 고른 것은 부르는 쪽이 받는다 — 별도 저장 버튼을 또 만들지 않는다. 저장 버튼이 두 개면
 * 어느 것을 눌러야 하는지 회원이 판단해야 한다.
 *
 * ── 두 곳에서 쓴다 (2026-08-24 회원 요청) ────────────────────
 * "정보글 작성할때도 주제 탐색기 사용할 수 있게 해줘."
 *   · 자동 작성 설정 — **여러 개 담는다** (앞으로 돌려가며 쓸 목록)
 *   · 글 작성 화면 — **하나 고른다** (이번 글에서 다룰 주제)
 * 쓰임이 달라 버튼 글자만 바꿔 받는다. 재는 방법과 거르는 규칙은 한 벌이어야 한다 —
 * 두 벌이 되면 한쪽만 고치는 날이 온다 (이 저장소에서 여러 번 겪었다).
 */
export default function TopicExplorer({
  picked,
  onPick,
  pickLabel = '주제로 담기',
  pickedLabel = '담음',
}: {
  /** 이미 고른 주제 — 「담음」으로 표시해 두 번 누르지 않게 한다 */
  picked: string[]
  onPick: (topic: string) => void
  /** 버튼 글자 — 자동 작성은 「주제로 담기」, 글 작성은 「이 주제로」 */
  pickLabel?: string
  pickedLabel?: string
}) {
  const [seedId, setSeedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [list, setList] = useState<TopicCandidate[] | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  /**
   * 몇 번째 묶음을 보고 있나.
   *
   * 회원: "주제가 매번 같은게 나와 새로고침 버튼 만들어서 다른것들이 나오게 해줘."
   * 검색광고는 같은 씨앗에 같은 순서로 답하므로, 다시 눌러도 상위 12개가 그대로였다.
   */
  const [page, setPage] = useState(0)

  async function explore(id: string, next = 0) {
    setSeedId(id)
    setPage(next)
    setLoading(true)
    setError(null)
    setList(null)
    try {
      const res = await fetch('/api/autodraft/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedId: id, page: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? '주제를 찾지 못했습니다.')
      setList(data.candidates ?? [])
      setNote(data.note ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '주제를 찾지 못했습니다.')
    }
    setLoading(false)
  }

  return (
    <div className="mt-2.5">
      <p className="muted mb-2 text-[11px] leading-relaxed">
        갈래를 하나 고르면 네이버 <b>검색창 자동완성</b>과 <b>검색광고 연관검색어</b>에서 실제 검색되는 문구를
        가져오고, 그 검색어로 최근 30일에 블로그 글이 몇 편 올라왔는지까지 재서 <b>발행량이 적은 순</b>으로
        보여줍니다. 갈래 이름만 저희가 넣고, 주제는 전부 네이버에서 온 것입니다.
      </p>
      {/*
        **여기서는 「경쟁 센 자리」 같은 등급을 붙이지 않는다** (2026-08-24). 그 경계값
        (300편/100편)은 지역 헬스 키워드로 잰 것이라 전국 정보 키워드에 쓰면 열두 줄이 전부
        「경쟁 센 자리」가 된다 — 모든 줄이 같은 말이면 아무 정보도 아니다. 숫자를 그대로 보여준다.
      */}
      <p className="muted mb-2 text-[11px] leading-relaxed">
        발행량 숫자는 그대로 보여드립니다 — 「경쟁 센 자리」 같은 등급은 붙이지 않았습니다. 그 기준은 동네
        키워드로 잰 것이라 전국 단위 검색어에는 그대로 맞지 않습니다.
      </p>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {TOPIC_SEEDS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={loading}
            onClick={() => explore(s.id, 0)}
            className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition disabled:opacity-50 ${
              seedId === s.id ? 'bg-brand-600 border-brand-600 text-white' : 'bd hover:bg-slate-500/8'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="muted text-[12px]">네이버에서 찾아오는 중입니다… 10~20초 걸립니다.</p>}
      {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}

      {list && !loading && (
        <>
          {/*
            **다른 주제 보기** — 상위 12개만 보여주고 있었는데 남는 후보가 400개가 넘었다.
            끝에서 처음으로 돌아온다 (「더 없습니다」로 막히면 그 자리에서 멈춘다).
          */}
          {note && note.total > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="muted text-[11.5px] font-semibold">
                {note.total.toLocaleString()}개 중 {note.from}~{note.to}번째
                {note.pages > 1 && ` (${note.page + 1}/${note.pages})`}
              </span>
              {note.pages > 1 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => explore(seedId, note.page + 1)}
                  className={`${btnGhost} !px-3 !py-1.5 !text-[11.5px]`}
                >
                  다른 주제 보기 ↻
                </button>
              )}
            </div>
          )}

          {list.length === 0 ? (
            <p className="muted text-[12px] leading-relaxed">
              정보글로 쓸 만한 후보를 찾지 못했습니다. 다른 갈래를 눌러 보세요.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {list.map((c) => {
                const on = picked.includes(c.topic)
                return (
                  <li key={c.topic} className="bd flex items-start gap-2 rounded-xl border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold">{c.topic}</span>
                        {/* 어디서 온 후보인지 밝힌다 — 검색량을 아는 것과 모르는 것은 다르다 */}
                        <Badge tone={c.from === 'searchad' ? 'info' : 'default'}>
                          {c.from === 'searchad' ? '연관검색어' : '자동완성'}
                        </Badge>
                      </div>
                      <p className="muted mt-0.5 text-[11px] leading-relaxed">{c.why}</p>
                    </div>
                    <button
                      type="button"
                      disabled={on}
                      onClick={() => onPick(c.topic)}
                      className={`${btnGhost} shrink-0 !px-2.5 !py-1.5 !text-[11px]`}
                    >
                      {on ? pickedLabel : pickLabel}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/*
            **무엇을 걸렀고 무엇을 못 쟀는지 밝힌다.** 「후보 18개」만 보여주면 그게 전부인 줄
            알게 된다 — 조용히 잘라내면 「다 봤다」로 읽힌다.
          */}
          {note && (
            <p className="muted mt-2 text-[11px] leading-relaxed">
              네이버에서 {note.found.toLocaleString()}개를 받아 {note.shown}개를 보여드립니다.
              {note.offlimit > 0 && (
                <>
                  {' '}
                  약·주사·질병처럼 <b>헬스장이 쓰면 안 되는 말 {note.offlimit.toLocaleString()}개</b>는 검색량이 커도
                  뺐습니다 (광고심의에 걸리고 블로그 주제도 흔들립니다).
                </>
              )}
              {/*
                **「남의 동네」를 따로 말한다** (2026-08-26 회원 지적: "이게 과연 주제로서 쓸만한
                운동이 맞아? 그냥 키워드인거 아니야?"). 「매탄동운동」·「군자역운동」처럼 다른
                동네에서 헬스장을 찾는 말이 주제라고 올라와 있었다. 「업체를 찾는 말」이라고만
                적으면 그게 무슨 뜻인지 알 수 없다.
              */}
              {note.local > 0 &&
                ` 업체를 찾는 말 ${note.local.toLocaleString()}개도 뺐습니다 — 「매탄동운동」처럼 남의 동네에서 헬스장을 찾는 말이라, 정보글 주제로 쓰면 홍보글이 되거나 우리와 상관없는 글이 됩니다.`}
              {note.thin > 0 && ` 「엉덩이」처럼 짧아서 글이 안 되는 말 ${note.thin.toLocaleString()}개도 뺐습니다.`}
              {note.total > note.shown &&
                ` 정보글로 쓸 만한 것은 ${note.total.toLocaleString()}개이고, 한 번에 ${note.shown}개씩 보여드립니다 — 「다른 주제 보기」로 넘기시면 됩니다.`}
              {` 발행량(경쟁)은 검색량 큰 ${note.tried}개만 쟀고 ${note.measured}개가 답했습니다`}
              {note.measured === 0 && ' — 네이버가 연달아 조회를 막은 것 같습니다. 잠시 뒤 다시 눌러보세요'}.
              {!note.adKeys && ' 검색광고 API 키가 없어 검색량은 샘플 값입니다.'}
              {note.autocomplete.answered < note.autocomplete.asked &&
                ` 자동완성은 ${note.autocomplete.asked}번 중 ${note.autocomplete.answered}번만 응답했습니다.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
