import { NextResponse } from 'next/server'
import { parseBody } from '@/lib/writing/checker'
import { stripGuides } from '@/lib/writing/templates'
import { spellCheck } from '@/lib/naver/speller'

export const dynamic = 'force-dynamic'
// 덩어리마다 키를 새로 받고 재시도하므로 시간이 걸린다
export const maxDuration = 120

/**
 * 맞춤법·띄어쓰기 검사.
 *
 * 이미지·영상 표기와 소제목 마크업을 뺀 **산문만** 보낸다 — 「[이미지: 대표]」를 검사기에
 * 넣으면 없는 오류가 나온다.
 *
 * 공식 API 가 아니라 자주 막힌다 (lib/naver/speller.ts 주석). 막힌 사실을 숨기지 않고
 * 응답에 담아 화면에서 「못 읽음」으로 보여준다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { text?: string; ignore?: string[] }
    const raw = body.text ?? ''
    /*
     * **안내 줄(`> …`)을 먼저 뺀다.** 예전에는 안 뺐다. 골격 안내에는 「"많이 걱정되시죠"(X)」
     * 처럼 따옴표·괄호가 든 예문이 있어서, 그걸 검사기에 넣으면 없는 오류가 쏟아진다.
     * 회원 화면에 뜬 「무너진다&quot;」 같은 조각이 그런 경로로 들어왔다.
     */
    const prose = parseBody(stripGuides(raw)).prose.trim()
    if (prose.length < 20) {
      return NextResponse.json(
        { error: '검사할 본문이 너무 짧습니다. 글을 먼저 채워주세요.' },
        { status: 400 }
      )
    }

    /*
     * 검사기가 모르는 우리 낱말을 함께 보낸다 — 상호명·지역 키워드·검색 키워드.
     * 특히 키워드는 붙여 써야 검색에 걸리므로 「쌍용동PT → 쌍용동 PT」 같은 제안을 따르면
     * 안 된다 (lib/naver/speller.ts 의 dropOurWords 주석).
     */
    const ignore = Array.isArray(body.ignore) ? body.ignore.filter((w) => typeof w === 'string') : []
    const report = await spellCheck(prose, ignore)
    return NextResponse.json(report)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '맞춤법 검사 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
