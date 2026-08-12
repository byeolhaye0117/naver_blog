'use client'

import { useState } from 'react'
import { btnGhost } from './ui'

interface Result {
  ok: boolean
  label: string | null
  model: string | null
  models: number
  canSearch: boolean
  said: string | null
  detail: string
}

/**
 * 「지금 확인」 버튼 — 키가 **실제로 되는지** 눌러서 본다.
 *
 * 회원 상황 (2026-08-12): "ai 키 새로 넣었는데 잘 되는지 확인해줘". 여태 확인하는 길이
 * 글쓰기를 끝까지 돌려 보는 것뿐이었다. 그건 1분을 기다린 뒤 오류를 보는 것이지 확인이 아니다.
 *
 * 이 버튼은 모델에게 한 낱말만 물어본다. 성공하면 **모델이 실제로 뭐라고 답했는지**까지
 * 보여준다 — 「됩니다」라는 말만 띄우면 그 말을 믿을 근거가 없다.
 */
export default function AiKeyCheck() {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)

  async function run() {
    setBusy(true)
    setRes(null)
    try {
      const r = await fetch('/api/ai/check', { cache: 'no-store' })
      setRes((await r.json()) as Result)
    } catch (e) {
      setRes({
        ok: false,
        label: null,
        model: null,
        models: 0,
        canSearch: false,
        said: null,
        detail: `확인 요청 자체가 실패했습니다 — ${e instanceof Error ? e.message : String(e)}`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={run} disabled={busy} className={btnGhost}>
        {busy ? '모델에 물어보는 중…' : '키가 실제로 되는지 지금 확인'}
      </button>
      {res && (
        <div
          className={`mt-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${
            res.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-semibold">{res.ok ? '됩니다 ✅' : '안 됩니다 ❌'}</p>
          <p className="mt-1">{res.detail}</p>
          {res.said && <p className="mt-1">모델이 돌려준 말: 「{res.said}」</p>}
          {res.ok && (
            <p className="mt-1">
              쓰는 모델 {res.model}
              {res.models > 0 && ` · 이 키로 쓸 수 있는 모델 ${res.models}개`} · 자료 검색{' '}
              {res.canSearch ? '됨' : '안 됨'}
            </p>
          )}
          {!res.ok && (
            <p className="mt-1">
              키를 고친 뒤에는 <strong>Vercel 에서 다시 배포</strong>해야 반영됩니다. 환경변수만 바꾸고
              배포하지 않으면 옛 키로 계속 돕니다.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
