'use client'

import { useState } from 'react'
import { TOPIC_SEEDS, type TopicCandidate } from '@/lib/writing/topic-explore'
import { Badge, btnGhost } from '@/components/ui'

interface Note {
  found: number
  shown: number
  overflow: number
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
 * 고른 것은 위쪽 「③ 쓸 주제 고르기」에 그대로 들어간다 — 별도 저장 버튼을 또 만들지
 * 않는다. 저장 버튼이 두 개면 어느 것을 눌러야 하는지 회원이 판단해야 한다.
 */
export default function TopicExplorer({ onPick }: { onPick: (topic: string) => void }) {
  const [seedId, setSeedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [list, setList] = useState<TopicCandidate[] | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  async function explore(id: string) {
    setSeedId(id)
    setLoading(true)
    setError(null)
    setList(null)
    try {
      const res = await fetch('/api/autodraft/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedId: id }),
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
    <div className="panel mt-2 rounded-xl px-3.5 py-3">
      <p className="text-[12.5px] font-bold">주제 탐색 — 실제로 검색되는 것에서 고르기</p>
      <p className="muted mt-0.5 mb-2 text-[11px] leading-relaxed">
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
            onClick={() => explore(s.id)}
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
          {list.length === 0 ? (
            <p className="muted text-[12px] leading-relaxed">
              정보글로 쓸 만한 후보를 찾지 못했습니다. 다른 갈래를 눌러 보시거나, 위 칸에 직접 적어 넣으셔도 됩니다.
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
                      onClick={() => {
                        onPick(c.topic)
                        setPicked((p) => [...p, c.topic])
                      }}
                      className={`${btnGhost} shrink-0 !px-2.5 !py-1.5 !text-[11px]`}
                    >
                      {on ? '담음' : '주제로 담기'}
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
              {note.local > 0 && ` 업체를 찾는 말 ${note.local.toLocaleString()}개도 뺐습니다 — 정보글 주제로 쓰면 홍보글이 됩니다.`}
              {note.thin > 0 && ` 「엉덩이」처럼 짧아서 글이 안 되는 말 ${note.thin.toLocaleString()}개도 뺐습니다.`}
              {note.overflow > 0 && ` 남은 ${note.overflow.toLocaleString()}개는 순서가 뒤라 접었습니다.`}
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
