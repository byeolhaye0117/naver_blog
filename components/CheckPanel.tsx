'use client'

import { useState } from 'react'
import type { CheckGroup, CheckResult } from '@/lib/types'
import { Badge, Progress, levelLabel, levelTone } from '@/components/ui'
import { altWords } from '@/lib/writing/banned'

/** 본문에서 그 표현을 찾아 커서를 놓은 결과 */
export interface RiskJump {
  /** 몇 번째를 잡았나 (1부터) */
  index: number
  total: number
}

const GROUP_ORDER: CheckGroup[] = [
  '키워드',
  '내용 균형',
  '분량·구조',
  '이미지·태그',
  '저품질 위험',
  'AI 티 제거',
]

const GROUP_NOTE: Record<CheckGroup, string> = {
  키워드: '횟수보다 패턴이 중요합니다. 6회를 자연스럽게 쓰면 통과하고 4회를 어색하게 쓰면 걸립니다.',
  // 「2,000~3,000자」는 업계 통설이고 우리 실측과 어긋난다 (분량은 순위와 반대로 갔다).
  // 그래서 이 묶음은 「맞추면 오른다」가 아니라 「너무 짧으면 쓸 내용이 없다」로 말한다.
  '분량·구조': '분량은 실측에서 순위와 반대로 갔습니다 (1위 2,197자 · 2위 1,422자). 규격을 맞추기보다 쓸 내용이 있는지를 보세요 — 소제목은 읽기 편하게 만듭니다.',
  '내용 균형':
    '상위 글 11편을 세본 결과입니다 — 1~3위는 정보 5.2종류·홍보 2.0종류, 4위 이하는 정보 3.6·홍보 3.8이었습니다. 시설·이벤트 안내만으로는 위로 못 갑니다.',
  '이미지·태그': '직접 촬영 원본만 씁니다. 재사용 이미지는 중복 판정 위험이 있습니다.',
  '저품질 위험': '표현을 안전하게 바꾸는 것이지 홍보를 약하게 만드는 게 아닙니다.',
  'AI 티 제거': '문장이 고르면 기계가 쓴 글로 읽힙니다.',
}

export default function CheckPanel({
  result,
  onFindRisk,
}: {
  result: CheckResult
  /**
   * 위험 표현을 본문에서 찾아 그 자리를 손본다 (회원 요청: "이런 거는 수정 버튼 있어서
   * 바로 수정할 수 있게 해줘").
   *
   * 세 가지를 한다.
   *   find    — 그 표현을 잡아 커서를 놓는다. 긴 본문에서 세 번째 「무료」를 눈으로 찾는
   *             것이 실제로 번거로운 일이었다.
   *   replace — **바꿔 쓴다** (회원 요청: "지우는 게 아니라 단어를 수정하는 쪽으로").
   *             「무료」를 지우면 무료라는 사실이 사라지지만 「비용 없는」으로 바꾸면 뜻은
   *             남고 도배 횟수만 줄어든다. 후보는 banned.ts 의 ALT_WORDS 에 있다.
   *   delete  — 지운다. 「무료 방문 상담」 → 「방문 상담」처럼 지워도 읽히는 자리가 있다.
   *
   * **한 번에 다 고치지는 않는다.** 「혜택을 준비했어요」에서 「혜택」만 지우면 「을
   * 준비했어요」가 된다 — 어느 쪽인지는 문장을 봐야 알기 때문에, 찾아서 보여준 다음에
   * 회원이 고른다. 손본 자리에 커서를 놓아 결과가 바로 보이게 한다.
   *
   * 넘기지 않으면 버튼이 안 나온다 — 글 목록처럼 본문을 고칠 수 없는 화면을 위해서다.
   */
  onFindRisk?: (
    term: string,
    nth: number,
    action?: { kind: 'find' } | { kind: 'delete' } | { kind: 'replace'; with: string }
  ) => RiskJump | null
}) {
  const tone = result.score >= 85 ? 'good' : result.score >= 65 ? 'warn' : 'bad'
  const fails = result.items.filter((i) => i.level === 'fail')
  /**
   * 표현별로 지금 몇 번째를 잡고 있나.
   *   없음   — 아직 안 눌렀다
   *   'none' — 본문에 그 글자가 없다 (변칙 표기로 걸린 항목)
   *   'gone' — 다 지웠다
   */
  const [jumps, setJumps] = useState<Record<string, RiskJump | 'none' | 'gone'>>({})
  const isJump = (v: RiskJump | 'none' | 'gone' | undefined): v is RiskJump =>
    typeof v === 'object' && v !== null

  return (
    <div className="space-y-4">
      <div className="panel rounded-xl px-4 py-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="muted text-xs font-semibold">검수 점수</div>
            <div
              className={`tnum text-3xl font-bold ${
                tone === 'good'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : tone === 'warn'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {result.score}
              <span className="muted ml-0.5 text-base font-semibold">점</span>
            </div>
          </div>
          <div className="muted tnum text-right text-[11px] leading-relaxed">
            통과 {result.items.filter((i) => i.level === 'pass').length}
            <br />
            주의 {result.items.filter((i) => i.level === 'warn').length}
            <br />
            수정필요 {fails.length}
          </div>
        </div>
        <div className="mt-3">
          <Progress value={result.score} tone={tone} />
        </div>
        <p className="muted mt-2.5 text-[11px] leading-relaxed">
          {result.score >= 85
            ? '발행해도 좋은 상태입니다. 아래 주의 항목만 훑어보세요.'
            : fails.length
              ? `먼저 고칠 것: ${fails.slice(0, 2).map((f) => f.label).join(', ')}`
              : '수정필요 항목은 없습니다. 주의 항목을 줄이면 점수가 올라갑니다.'}
        </p>

        {/*
          이 점수의 근거가 얼마나 되는지 먼저 밝힌다.
          26개 항목 중 관찰로 확인된 게 몇 개인지 말하지 않으면, 85점이 근거 있는 85점처럼
          보인다. 관찰이 쌓이면 이 줄의 숫자가 저절로 올라간다.
        */}
        {result.evidenceNote && (
          <details className="bd mt-2.5 border-t pt-2.5">
            <summary className="muted cursor-pointer text-[11px] font-semibold select-none">
              이 기준은 어디서 왔나
            </summary>
            <p className="muted mt-1.5 text-[11px] leading-relaxed">{result.evidenceNote}</p>
            <p className="muted mt-1.5 text-[11px] leading-relaxed">
              관찰은 매일 자동으로 다시 잽니다. 항목마다 붙은 「관찰 N회」가 그 근거이고, 방향이
              갈리거나 거꾸로 나온 항목은 점수 비중이 내려갑니다. 목표 수치 자체는 자동으로 바꾸지
              않습니다 — 상위 글이 그렇다는 것과 그래야 오른다는 것은 다릅니다.
            </p>
          </details>
        )}
      </div>

      {result.risks.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3.5">
          <h3 className="text-[13px] font-bold text-rose-700 dark:text-rose-300">
            위험 표현 {result.risks.length}건
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-rose-700/80 dark:text-rose-300/80">
            철자를 바꿔 숨기지 마세요. 변칙 표기는 그 자체가 어뷰징 신호라 위험이 더 커집니다. 주장 자체를
            사실로 바꾸는 것이 유일한 안전한 방법입니다.
          </p>
          <ul className="mt-3 space-y-3">
            {result.risks.map((r, i) => (
              <li key={i} className="bd border-t pt-2.5 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.level === 'fail' ? 'bad' : 'warn'}>{r.level === 'fail' ? '즉시 수정' : '주의'}</Badge>
                  <span className="muted text-[10px] font-semibold">{r.category}</span>
                  <code className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                    {r.term}
                  </code>
                  {r.count > 1 && <span className="muted tnum text-[10px]">{r.count}회</span>}
                </div>
                <p className="muted mt-1.5 text-[11px] leading-snug italic">{r.context}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed">{r.fix}</p>
                {onFindRisk && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = jumps[r.term]
                        /*
                         * 도배 항목은 **뒤에서부터** 잡는다. 허용 횟수를 넘긴 것이 문제이니
                         * 마지막에 쓴 것부터 지우는 편이 앞 문단을 덜 건드린다.
                         */
                        const first = r.category.startsWith('D.') ? -1 : 0
                        const nth = isJump(cur) ? cur.index : first
                        setJumps((p) => ({ ...p, [r.term]: onFindRisk(r.term, nth, { kind: 'find' }) ?? 'none' }))
                      }}
                      className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] font-bold text-rose-700 dark:text-rose-300"
                    >
                      본문에서 찾기
                      {(() => {
                        const j = jumps[r.term]
                        return isJump(j) ? ` (${j.index}/${j.total})` : ''
                      })()}
                    </button>
                    {/*
                      **지우기는 찾은 뒤에만 나온다.** 어느 자리를 지울지 회원이 눈으로
                      확인한 다음이어야 한다 — 도배 항목은 지워도 읽히는 자리(「무료 방문
                      상담」)와 문장이 깨지는 자리(「혜택을 준비했어요」)가 섞여 있다.
                    */}
                    {(() => {
                      const j = jumps[r.term]
                      if (!isJump(j)) return null
                      const act = (action: { kind: 'delete' } | { kind: 'replace'; with: string }) =>
                        setJumps((p) => ({ ...p, [r.term]: onFindRisk(r.term, j.index - 1, action) ?? 'gone' }))
                      const alts = altWords(r.term)
                      return (
                        <>
                          {/*
                            **바꿔 쓰는 쪽을 먼저 보여준다.** 회원 요청: "이거를 지우는 게
                            아니라 단어를 수정하는 쪽으로 고치면 좋겠어." 「무료」를 지우면
                            무료라는 사실이 사라지지만 「비용 없는」으로 바꾸면 뜻은 남고
                            도배 횟수만 줄어든다.
                          */}
                          {alts.map((alt) => (
                            <button
                              key={alt}
                              type="button"
                              onClick={() => act({ kind: 'replace', with: alt })}
                              className="rounded-lg border border-emerald-500/60 bg-emerald-600 px-2.5 py-1.5 text-[11.5px] font-bold text-white"
                            >
                              「{alt}」으로 바꾸기
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => act({ kind: 'delete' })}
                            className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] font-bold text-rose-700 dark:text-rose-300"
                          >
                            이 자리 지우기
                          </button>
                        </>
                      )
                    })()}
                    <span className="muted text-[10.5px] leading-snug">
                      {jumps[r.term] === 'none'
                        ? '본문에서 못 찾았습니다 — 글자 사이에 기호가 끼어 있는 표기입니다.'
                        : jumps[r.term] === 'gone'
                          ? '다 지웠습니다. 문장이 어색해지지 않았는지 한 번 읽어보세요.'
                          : isJump(jumps[r.term])
                            ? altWords(r.term).length
                              ? '커서를 그 자리에 놓았습니다. 바꿀 말을 고르면 그 자리만 바뀝니다 — 조사가 어색해지지 않았는지 한 번 읽어보세요. 「찾기」를 다시 누르면 다음 자리로 갑니다.'
                              : '커서를 그 자리에 놓았습니다. 이 말은 바꿔 쓸 말이 따로 없어서, 위 안내대로 문장을 고치는 편이 낫습니다.'
                            : '누르면 본문에서 그 표현을 잡아 커서를 놓습니다.'}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const items = result.items.filter((i) => i.group === group)
        if (!items.length) return null
        const worst = items.some((i) => i.level === 'fail')
          ? 'bad'
          : items.some((i) => i.level === 'warn')
            ? 'warn'
            : 'good'
        return (
          <div key={group} className="panel rounded-xl">
            <div className="bd flex items-center justify-between border-b px-4 py-2.5">
              <h3 className="text-[13px] font-bold">{group}</h3>
              <Badge tone={worst}>
                {worst === 'good' ? '전부 통과' : worst === 'warn' ? '주의 있음' : '수정 필요'}
              </Badge>
            </div>
            <p className="muted bd border-b px-4 py-2 text-[11px] leading-snug">{GROUP_NOTE[group]}</p>
            <ul className="divide-y divide-[var(--border)]">
              {items.map((i) => (
                <li key={i.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-semibold">{i.label}</span>
                    <Badge tone={levelTone(i.level)}>{levelLabel(i.level)}</Badge>
                  </div>
                  <div className="muted tnum mt-1 text-[11px]">
                    현재 <span className="font-semibold">{i.value}</span> · 기준 {i.target}
                  </div>
                  {i.hint && i.level !== 'pass' && (
                    <p className="mt-1.5 text-[11px] leading-relaxed">{i.hint}</p>
                  )}
                  {/*
                    이 기준이 어디서 왔는지 — 관찰소 근거.
                    근거가 갈리거나 거꾸로인 항목은 점수 비중이 이미 내려가 있고, 그 사실을
                    숨기지 않고 적는다. 「왜 이 기준이냐」에 답하지 못하는 검수는 신뢰를 잃는다.
                  */}
                  {i.evidence && (
                    <p
                      className={`mt-1.5 text-[10.5px] leading-relaxed ${
                        i.evidenceVerdict === 'against' ||
                        i.evidenceVerdict === 'mixed' ||
                        i.evidenceVerdict === 'flat'
                          ? 'text-amber-700 dark:text-amber-300'
                          : i.evidenceVerdict === 'supported'
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'muted'
                      }`}
                    >
                      {i.evidence}
                      {typeof i.baseWeight === 'number' && i.weight !== i.baseWeight && (
                        <span className="tnum font-semibold">
                          {' '}
                          (비중 {i.baseWeight} → {i.weight})
                        </span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
