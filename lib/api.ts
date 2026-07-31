import { NextResponse } from 'next/server'
import { NaverApiError } from '@/lib/naver/client'

/**
 * API 라우트 공통 오류 응답.
 *
 * 저장소가 클라우드일 때 mutate() 는 네트워크 오류로 throw 할 수 있다.
 * 그걸 그냥 500 으로 흘리면 화면에는 "저장됨"처럼 보일 위험이 있으니
 * 반드시 사용자가 읽을 수 있는 문장으로 돌려준다.
 */
export function apiError(e: unknown, fallback: string): NextResponse {
  const status = e instanceof NaverApiError ? e.status : 500
  const message = e instanceof Error ? e.message : fallback
  return NextResponse.json({ error: message }, { status })
}

/** 핸들러를 감싸 오류를 항상 JSON 으로 만든다 */
export function guard<A extends unknown[]>(
  fallback: string,
  fn: (...args: A) => Promise<NextResponse>
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args)
    } catch (e) {
      return apiError(e, fallback)
    }
  }
}
