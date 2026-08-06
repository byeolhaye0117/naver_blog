/**
 * JSON 이 아닌 API 응답의 원인을 사람이 읽을 수 있게 바꾼다.
 *
 * **왜 필요한가.** `/api/write` 는 오류까지 전부 JSON 으로 낸다 (라우트 전체가 try 로
 * 감싸여 있다). 그래서 **JSON 이 아닌 응답은 우리 코드가 아니라 플랫폼이 끊은 것**이다.
 *
 * 회원이 두 번 연달아 「응답을 읽지 못했습니다」만 보고 원인을 알 수 없었다. 상태코드만
 * 찍어도 부족하다 — Vercel 은 `x-vercel-error` 헤더에 이유를 이름으로 남기므로 그걸 읽고,
 * 없으면 상태코드와 응답 본문 앞부분을 **추측 없이 그대로** 보여준다.
 */

/** 우리가 실제로 만날 수 있는 플랫폼 오류와, 회원이 할 수 있는 다음 행동 */
const KNOWN: Record<string, string> = {
  FUNCTION_INVOCATION_TIMEOUT:
    '서버가 제 시간에 끝내지 못했습니다 (함수 실행 시간 초과). 글 한 편에 1분 안팎이 걸리는데 배포 환경의 제한을 넘겼습니다. Vercel Settings → Functions 에서 Max Duration 을 올리거나, 「골격만 넣기」로 직접 쓰셔도 됩니다.',
  FUNCTION_INVOCATION_FAILED:
    '서버 함수가 실행 중 죽었습니다. Vercel 의 Logs 탭에서 /api/write 줄을 보면 원인이 찍혀 있습니다.',
  FUNCTION_PAYLOAD_TOO_LARGE:
    '보낸 요청이 너무 큽니다. 처방 「글에 반영」을 끄고 다시 시도해 보세요.',
  FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE: '글이 너무 길어 응답 한도를 넘었습니다. 다시 시도해 주세요.',
  DEPLOYMENT_NOT_FOUND: '배포를 찾지 못했습니다. 재배포가 끝난 뒤 새로고침해 주세요.',
  DEPLOYMENT_PAUSED: '배포가 멈춰 있습니다. Vercel 에서 배포 상태를 확인해 주세요.',
  NOT_FOUND: '주소를 찾지 못했습니다 (배포에 이 API 가 없습니다). 재배포가 끝났는지 확인해 주세요.',
  INTERNAL_FUNCTION_INVOCATION_TIMEOUT:
    '서버가 제 시간에 끝내지 못했습니다 (플랫폼 내부 시간 초과). 다시 시도해 주세요.',
}

export interface ResponseLike {
  status: number
  headers: { get(name: string): string | null }
}

export function explainNonJson(res: ResponseLike, raw: string): string {
  const code = res.headers.get('x-vercel-error') ?? ''
  if (KNOWN[code]) return `${KNOWN[code]} (${code})`

  // 헤더가 없으면 추측하지 않는다 — 사실만 보여주고 다음 판단은 사람이 한다
  const snippet = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
  if (res.status === 504) {
    return `서버가 제 시간에 답하지 못했습니다 (504). ${snippet || '응답이 비어 있었습니다.'}`
  }
  return `서버 응답을 읽지 못했습니다 — 상태 ${res.status}${code ? ` · ${code}` : ''}${
    snippet ? ` · 응답 앞부분: "${snippet}"` : ' · 응답이 비어 있었습니다'
  }`
}
