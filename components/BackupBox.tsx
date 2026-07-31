'use client'

import { useRef, useState } from 'react'

/**
 * 백업 / 이전.
 *
 * 내 컴퓨터에서 쓰던 기록(data/db.json)을 배포한 앱으로 옮기는 데 쓴다.
 * 로컬에서 "내보내기" → 배포 주소에서 "가져오기".
 */
export default function BackupBox() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('가져오면 지금 저장된 기록을 덮어씁니다. 계속할까요?')) {
      e.target.value = ''
      return
    }

    setBusy(true)
    setMsg(null)
    try {
      const raw = JSON.parse(await file.text())
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(raw),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '가져오기에 실패했습니다.')
      const c = json.counts
      setMsg({
        text: `가져왔습니다 — 지점 ${c.stores}, 글 ${c.posts}, 추적 ${c.rankTargets}, 순위기록 ${c.rankSnapshots}건. 화면을 새로고침하세요.`,
        ok: true,
      })
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : '가져오기에 실패했습니다.',
        ok: false,
      })
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="bd rounded-lg border p-3.5">
      <h3 className="text-[13px] font-bold">백업 · 기기 간 이전</h3>
      <p className="muted mt-1 text-[12px] leading-relaxed">
        내 컴퓨터에서 쓰던 기록을 배포한 앱으로 옮기려면, 컴퓨터에서 <strong>내보내기</strong> 한 파일을
        휴대폰에서 접속한 주소에서 <strong>가져오기</strong> 하세요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/api/data"
          className="bd rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-500/8"
        >
          내보내기 (JSON 다운로드)
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="bd rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-500/8 disabled:opacity-50"
        >
          {busy ? '가져오는 중…' : '가져오기 (덮어씀)'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />
      </div>
      {msg && (
        <p
          className={`mt-2.5 rounded border px-2.5 py-2 text-[11px] leading-relaxed ${
            msg.ok
              ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/8 text-rose-700 dark:text-rose-300'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
