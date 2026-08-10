'use client'

import { useState } from 'react'

/**
 * 서식을 함께 복사하는 버튼.
 *
 * 네이버는 블로그 글쓰기 API 를 주지 않으니 서식을 넘길 통로는 클립보드뿐이다. 글자만
 * 복사하면(`writeText`) 소제목이 본문과 똑같은 줄로 붙는다. `text/html` 을 같이 담으면
 * 굵고 큰 글씨로 붙는다.
 *
 * 폴백이 두 단인 이유:
 *   1) `ClipboardItem` 이 없는 브라우저 — 화면 밖 div 를 선택해 execCommand('copy').
 *      선택 기반 복사는 서식이 **함께** 담긴다 (그래서 textarea 폴백을 쓰지 않는다).
 *   2) 그것도 막히면 글자만이라도 복사한다. 아무것도 안 되는 것보다 낫다.
 */
export default function CopyRichButton({
  html,
  text,
  label = '서식 포함 복사',
  className = '',
}: {
  html: string
  text: string
  label?: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'done' | 'plain'>('idle')

  async function copy() {
    let rich = false
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
        rich = true
      }
    } catch {
      rich = false
    }

    if (!rich) rich = copyBySelection(html)

    if (!rich) {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        /* 여기까지 막히면 화면의 본문을 손으로 긁어야 한다 */
      }
    }

    setState(rich ? 'done' : 'plain')
    setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
        state === 'done'
          ? 'bg-emerald-600 text-white'
          : state === 'plain'
            ? 'bg-amber-600 text-white'
            : 'bg-brand-600 text-white hover:opacity-90 active:opacity-80'
      } ${className}`}
    >
      {state === 'done' ? '복사됨 (서식 포함)' : state === 'plain' ? '글자만 복사됨' : label}
    </button>
  )
}

function copyBySelection(html: string): boolean {
  try {
    const holder = document.createElement('div')
    holder.innerHTML = html
    holder.setAttribute('contenteditable', 'true')
    holder.style.position = 'fixed'
    holder.style.left = '-9999px'
    holder.style.top = '0'
    document.body.appendChild(holder)

    const range = document.createRange()
    range.selectNodeContents(holder)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    const ok = document.execCommand('copy')
    sel?.removeAllRanges()
    document.body.removeChild(holder)
    return ok
  } catch {
    return false
  }
}
