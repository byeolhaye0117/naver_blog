'use client'

import { useState } from 'react'

export default function CopyButton({
  text,
  label = '복사',
  className = '',
  block = false,
}: {
  text: string
  label?: string
  className?: string
  block?: boolean
}) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 구형 브라우저 / http 접속 환경 폴백
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setDone(true)
    setTimeout(() => setDone(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        done ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white hover:opacity-90 active:opacity-80'
      } ${block ? 'w-full' : ''} ${className}`}
    >
      {done ? '복사됨' : label}
    </button>
  )
}
