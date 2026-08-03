import { storageStatus } from '@/lib/store'
import { Badge } from '@/components/ui'

const MODE_LABEL = {
  cloud: '클라우드 저장',
  file: '이 컴퓨터에 저장',
  memory: '임시 저장 (위험)',
} as const

/**
 * 저장소 상태. 저장이 안 되고 있는 상황을 조용히 넘기지 않으려고 만든 배너다.
 * 정상이면 아무것도 그리지 않고, 문제가 있을 때만 나타난다.
 */
export default function StorageNotice() {
  const s = storageStatus()
  if (s.mode !== 'memory' && !s.error) return null

  const bad = s.mode === 'memory' || Boolean(s.error)
  return (
    <div
      className={`mb-4 rounded-xl border px-4 py-3 text-[12px] leading-relaxed ${
        bad
          ? 'border-rose-500/30 bg-rose-500/8 text-rose-800 dark:text-rose-200'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge tone={bad ? 'bad' : 'warn'}>{MODE_LABEL[s.mode]}</Badge>
        {s.error && <span className="font-semibold">저장에 문제가 있습니다</span>}
      </div>
      <p>{s.detail}</p>
      {s.error && <p className="mt-1 font-mono text-[11px] opacity-80">{s.error}</p>}
    </div>
  )
}

/** 가이드 화면에서 쓰는 항상 보이는 버전 */
export function StorageStatusCard() {
  const s = storageStatus()
  return (
    <div className="surface bd rounded-xl border p-3.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-bold">현재 저장 위치</h3>
        <Badge tone={s.mode === 'cloud' ? 'good' : s.mode === 'file' ? 'info' : 'bad'}>
          {MODE_LABEL[s.mode]}
        </Badge>
      </div>
      <p className="muted text-[12px] leading-relaxed">{s.detail}</p>
      {s.error && (
        <p className="mt-2 rounded border border-rose-500/30 bg-rose-500/8 px-2.5 py-2 font-mono text-[11px] text-rose-700 dark:text-rose-300">
          {s.error}
        </p>
      )}
    </div>
  )
}
