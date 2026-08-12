import { NextResponse } from 'next/server'
import { checkKey } from '@/lib/ai/llm'

export const dynamic = 'force-dynamic'
/** 모델을 실제로 부르므로 기본 10초로는 부족하다 */
export const maxDuration = 60

/**
 * AI 키 확인 — **모델을 한 번 불러서** 살아 있는지 본다.
 *
 * 회원 상황 (2026-08-12): "ai 키 새로 넣었는데 잘 되는지 확인해줘". 여태 확인하는 길이
 * 「글쓰기를 끝까지 돌려 보고 실패하는지 보기」뿐이었다. 1분을 기다린 뒤 오류를 보는 건
 * 확인이 아니다.
 *
 * 환경변수가 들어 있는지만 보는 검사(`aiStatus`)로는 답이 안 된다 — 오타·만료·잔액 없음·
 * 권한 없음은 전부 「키가 들어 있는」 상태다. 그래서 짧은 답 한 번을 실제로 받아 본다.
 */
export async function GET() {
  const r = await checkKey()
  return NextResponse.json(r, { status: r.ok ? 200 : 503 })
}
