import Link from 'next/link'
import { keyStatus } from '@/lib/naver/client'
import { RISK_TERMS, COMMERCIAL_LIMITS } from '@/lib/writing/banned'
import { SPECS } from '@/lib/writing/checker'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card } from '@/components/ui'

export const dynamic = 'force-dynamic'

/** 지식 베이스 기준일 — 3개월 이상 지나면 최신 알고리즘 변화를 다시 확인해야 한다 */
const KB_DATE = '2026-07-23'

function monthsSince(d: string): number {
  const then = new Date(d)
  const now = new Date()
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
}

export default function GuidePage() {
  const keys = keyStatus()
  const stale = monthsSince(KB_DATE) >= 3

  return (
    <>
      <PageHeader
        title="가이드"
        desc="이 앱의 모든 검수 기준이 나오는 근거 문서입니다. 규칙에 없는 상황을 판단할 때 여기를 보세요."
      />

      <div className="space-y-4">
        {stale && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            <strong className="font-bold">기준일이 {KB_DATE} 입니다 (3개월 이상 경과).</strong> 네이버 랭킹
            기준은 바뀝니다. 노출이 떨어졌거나 알고리즘이 바뀐 것 같으면 최신 변화를 검색해 확인하고, 달라진
            점을 이 문서에 반영하세요. Claude에게 &quot;네이버 블로그 알고리즘 최신 변화 확인해줘&quot;라고
            요청하면 됩니다.
          </div>
        )}

        {/* ─── API 키 · 배포 (상세 절차는 /deploy 한 곳에만 둔다) ─── */}
        <Card
          id="api"
          title="API 키 · 휴대폰에서 쓰기"
          subtitle="키가 없어도 앱은 전부 동작합니다 — 다만 숫자가 샘플 값입니다."
        >
          <div className="flex flex-wrap gap-2">
            <Badge tone={keys.search ? 'good' : 'warn'}>
              검색 API {keys.search ? '연결됨' : '미설정'}
            </Badge>
            <Badge tone={keys.searchAd ? 'good' : 'warn'}>
              검색광고 API {keys.searchAd ? '연결됨' : '미설정'}
            </Badge>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed">
            네이버 API 키 발급 절차, 휴대폰에서 쓰기 위한 배포, 휴대폰·PC 기록을 합치는 저장소 연결은{' '}
            <Link href="/deploy" className="text-brand-600 dark:text-brand-100 font-semibold underline">
              휴대폰에서 쓰기 · 배포
            </Link>{' '}
            화면에 한 번만 정리해 두었습니다.
          </p>
          <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
            <strong className="font-bold">발행(업로드)은 왜 자동이 아닌가요?</strong> 네이버는 블로그
            글쓰기 공식 API를 제공하지 않습니다. 로그인 자동화로 우회하는 방법이 있지만 캡차·2단계 인증에
            막히고 계정 제재 위험이 있어, 이 앱은 대신{' '}
            <Link href="/posts" className="underline">
              발행 패키지
            </Link>
            를 만들어 줍니다 — 제목·본문·태그를 순서대로 복사해 붙이고, 이미지 배치표와 체크리스트대로
            올리면 됩니다.
          </div>
        </Card>

        {/* ─── 랭킹 로직 ─── */}
        <Card title="랭킹 알고리즘 3층 구조" subtitle="✓ 공식 발표 기준">
          <div className="space-y-3.5">
            {[
              {
                t: 'C-Rank — 출처 신뢰도',
                d: '문서가 아니라 블로그 자체를 평가합니다. 한 주제로 꾸준히 양질의 글을 쌓은 블로그의 글이 상위에 갑니다. 2025~26년 들어 주제 집중도가 핵심 평가요소로 강화됐습니다.',
                m: '한 주제로 꾸준히 쌓는 것이 공식 설명입니다. 다만 우리 판에서는 집중도가 문턱이 아니었습니다 — 아래 「상위 블로그는 잡블로그였습니다」를 보세요.',
              },
              {
                t: 'D.I.A. / D.I.A.+ — 문서 품질·의도 분석',
                d: '개별 문서의 경험·정보성·검색 의도 부합을 봅니다. 직접 경험이 들어간 글, 문서 맥락이 검색 의도와 맞는 글에 가산점. 영상 삽입 문서에도 가산점이 있습니다.',
                m: '검색한 사람이 알고 싶은 것에 실제로 답해야 합니다. 홍보만 있고 정보가 없으면 감점.',
              },
              {
                t: '에어서치 · 스마트블록',
                d: 'AI가 검색어를 의도 단위로 쪼개 블록별로 노출합니다("○○동 헬스장" → 가격·후기·시설 등). 통합검색 1페이지 개념이 약해지고, 구체적 의도를 가진 세부 키워드에 걸릴 기회가 늘었습니다.',
                m: '제목에 메인 키워드 + 세부 의도(새벽 운동·여성전용 등)를 함께 담으면 진입에 유리.',
              },
            ].map((x) => (
              <div key={x.t} className="surface bd rounded-xl border p-3.5">
                <h3 className="text-[13px] font-bold">{x.t}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed">{x.d}</p>
                <p className="text-brand-700 dark:text-brand-100 mt-2 text-[12px] leading-relaxed font-semibold">
                  → {x.m}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* ─── 측정 한계 ─── */}
        <Card
          id="measure"
          title="이 앱이 재는 순위 = 관련도순, 단 실제 상단과 같지는 않습니다"
          subtitle="숫자를 믿기 전에 이 차이를 알고 계셔야 합니다"
        >
          <div className="space-y-3 text-[12px] leading-relaxed">
            <p>
              순위 추적과 상위노출 분석은 네이버 블로그 검색을 <strong>관련도순</strong> 으로
              읽습니다. <strong>최신순이 아닙니다</strong> — 최신순은 발행만 하면 위에 있으니 재는
              의미가 없습니다.
            </p>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-amber-800 dark:text-amber-200">
              <strong className="font-bold">그런데 이 값은 실제 통합검색 상단과 같지 않습니다.</strong>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>블로그 검색은 <strong>평면 목록</strong>만 줍니다.</li>
                <li>
                  실제 화면은 검색 의도별 <strong>스마트블록</strong>으로 재배치되고, 라이프스타일 키워드
                  상당수가 그 블록으로 노출됩니다.
                </li>
                <li>
                  <strong>스마트블록의 자리는 자동으로 볼 수 없습니다.</strong> 그러니 앱의 순위는 추세를 보는
                  대리 지표이고, 진짜 자리는 직접 검색해서 확인해야 합니다.
                </li>
              </ul>
            </div>
            <p>
              그래서 순위 추적·상위노출 분석 화면에{' '}
              <strong>「네이버 통합검색에서 확인」·「블로그 탭」</strong> 링크를 붙여 뒀습니다. 앱 숫자로는
              추세(오르는지 밀리는지)를 보고, 실제 자리는 링크로 눈으로 확인하는 방식으로 쓰세요.
            </p>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-emerald-800 dark:text-emerald-200">
              <strong className="font-bold">그래서 이 앱의 기본 입력은 「직접 본 것을 넣기」입니다.</strong>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  <strong>순위 추적</strong> — 검색해서 본 순위를 직접 입력합니다. 스마트블록 자리까지
                  반영되니 API 값보다 정확합니다.
                </li>
                <li>
                  <strong>상위노출 분석</strong> — 자동입니다. 키워드만 넣으면 블로그 검색 관련도순
                  상위 글의 제목·발행일·블로거를 읽어와 분석합니다. 자동이 막힌 경우에만 화면을
                  붙여넣으면 됩니다.
                </li>
                <li>
                  <strong>발행량·경쟁률</strong> — 자동입니다. 월 검색량은 검색광고 API, 최근 30일
                  발행량은 블로그 섹션 검색에서 가져와 등급을 냅니다. 자동 조회가 막힌 줄만 직접
                  넣으면 됩니다.
                </li>
              </ul>
              <p className="mt-2">
                API 키가 없거나 <strong>검색 권한을 못 받는 계정</strong>이어도 세 기능 모두 그대로
                쓸 수 있습니다. 손이 한 번 더 가는 대신 숫자는 더 정확합니다.
              </p>
            </div>
            <p className="muted">
              앱 순위가 좋은데 실제로 안 보이면 → 스마트블록에서 밀린 것입니다. 세부 의도를 좁힌 키워드로
              바꿔보세요. 반대로 앱 순위는 낮은데 실제로 보이면 → 그 키워드의 스마트블록에 잘 맞은 것이니 같은
              각도를 더 밀어보세요.
            </p>
          </div>
        </Card>

        {/* ─── 제목 실측 ─── */}
        <Card
          id="title"
          title="제목 — 우리 판 상위 165편을 세어서 정했습니다"
          subtitle="1~3위 55편과 4~10위 110편의 제목을 비교했습니다. 통설이 아니라 우리 키워드의 실측값입니다 (2026-08-18)."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-3 font-semibold">요소</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">1~3위</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">4~10위</th>
                  <th className="py-1.5 font-semibold">그래서</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['숫자 있음', '58%', '48%', '개수·기간·회차·평수·금액 중 하나를 넣습니다'],
                  ['「찐·솔직·진짜」', '15%', '6%', '겪은 티를 한 낱말로 냅니다'],
                  ['「후기」', '36%', '28%', '후기글은 필수, 홍보글은 쓰지 않습니다'],
                  ['대괄호 [ ]', '22%', '15%', '지역명을 묶어도 됩니다 (선택)'],
                  ['이벤트·할인·혜택', '7%', '3%', '홍보 조각으로 씁니다'],
                  ['물음표', '9%', '12%', '「~할까요?」를 뒤에 붙이지 않습니다'],
                  ['「가격·비용·얼마」', '0%', '3%', '되도록 쓰지 않습니다 (1~3위에 0편)'],
                  ['길이(중간값)', '39자', '38자', '길이는 순위와 무관했습니다'],
                ].map((row) => (
                  <tr key={row[0]} className="bd border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{row[0]}</td>
                    <td className="tnum py-1.5 pr-3 text-right font-bold">{row[1]}</td>
                    <td className="tnum muted py-1.5 pr-3 text-right">{row[2]}</td>
                    <td className="py-1.5">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200">
            <strong className="font-bold">순서: 메인 키워드(앞 7자) → 금액(앞 20자 안) → 궁금증.</strong>
            <p className="mt-1.5">
              금액이 든 상위 제목 7편 중 <strong>0~19자에 둔 4편에 1~3위가 2편</strong> 있었고,{' '}
              <strong>20자 뒤에 둔 3편에는 1~3위가 없었습니다.</strong> 표본이 작아 단정하지는 않지만, 모바일이
              35자쯤에서 뒤를 자르는 것과도 맞습니다. 그래서 앱은 금액이 20자 뒤에 있으면 앞으로 당기라고
              권하고, 35자 뒤에 있으면 <strong>주의</strong>로 알려줍니다.
            </p>
            <p className="mt-1.5">
              상위권 실제 제목 — 「배방 헬스장 <strong>월 3만 원</strong> 등록 전 꼭 확인하세요」(2위) ·
              「아산헬스장 짐플레이스 헬스 <strong>12만원부터</strong> PT 1회 4만원까지」(1위)
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
            <strong className="font-bold">궁금증은 「선택 기준」이나 「비교」로 만듭니다.</strong> 물음표를 하나
            붙이는 방식은 상위권에 오히려 적었습니다. 상위권이 실제로 쓰는 형태는 이렇습니다 — 「두정역 근처
            헬스장 알아볼 때 <strong>거리보다 중요했던 4가지</strong>」(1위) · 「성정동헬스 운동 초보라면{' '}
            <strong>유산소부터? 웨이트부터?</strong>」(2위) · 「실패 없이 고르는 <strong>5가지 핵심 기준</strong>」(1위)
          </div>

          <p className="muted mt-3 text-[11.5px] leading-relaxed">
            <strong>한 문장으로 읽혀야 합니다.</strong> 요구를 쉼표·물음표로 이어 붙이면 45자가 되고 금액이
            잘리는 자리로 밀립니다 — 「○○ 지금 받아야 하는 이유, 시간 없는 분도 될까요? 45,000원 안내」가 그
            예이고, 이 규칙은 그 제목을 보고 만들었습니다. 정보글은 예외로 <strong>질문형을 씁니다</strong>{' '}
            (전국 정보 키워드 상위 8편 중 6편이 질문형이었습니다).
          </p>
        </Card>

        {/* ─── head 키워드 돌파 ─── */}
        <Card
          id="shut"
          title="쌍용동 헬스장·두정동 헬스장에 들어가려면"
          subtitle="회원 요청으로 두 자리를 직접 재봤습니다 (2026-08-20). 우회 없이 그 키워드를 노리는 방법입니다."
        >
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200">
            <strong className="font-bold">굳은 자리가 아닙니다 — 1페이지가 주당 11편씩 갈립니다.</strong>
            <p className="mt-1.5">
              10일치 조사 기록으로 날짜별 1페이지를 비교했습니다. <strong>쌍용동 헬스장</strong>은 9일 동안 새로
              들어온 글이 <strong>14편</strong>, 첫날 10편 중 <strong>5편</strong>만 마지막 날에 남았습니다.{' '}
              <strong>두정동 헬스장</strong>도 새 진입 <strong>14편</strong>, 첫날 10편 중 <strong>3편</strong>만
              남았습니다. 자리는 계속 납니다.
            </p>
            <p className="mt-1.5">
              앞서 이 화면은 두 키워드를 「굳은 자리」로 적고 우회를 권했습니다. <strong>그 판단이 틀렸습니다.</strong>{' '}
              등급이 재던 것은 「갓 쓴 글이 <em>바로</em> 올라오나」였는데, 그 말을 「못 들어간다」로 적은 것이
              잘못이었습니다.
            </p>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed">
            <strong>다만 바로 올라오지는 않습니다.</strong> 1페이지에 들어와 있는 글의 나이는 중간값{' '}
            <strong>36일</strong>이고, 빠른 쪽이 <strong>9~12일</strong>입니다(쌍용동 3위 11일 · 두정동 5위 9일).
            우리 글은 8/10 발행 → 3일차에 59위 → 그 뒤 8일간 53~64위입니다. <strong>아직 이른 것이 맞고,
            동시에 정체 중인 것도 맞습니다.</strong>
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-3 font-semibold">지표</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">1페이지 50편</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">우리 글</th>
                  <th className="py-1.5 font-semibold">문턱인가</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['글자수(중간값)', '1,561자', '1,865자', '아니오 — 하위 10%가 1,129자'],
                  ['이미지', '중간 20장', '6장', '아니오 — 1페이지에 3·4·9장 글이 있음'],
                  ['정보 낱말', '중간 7 (90% 13)', '11', '아니오 — 범위 안'],
                  ['블로그 누적', '중간 30,819명', '269,750명', '아니오 — 769명 블로그도 1페이지'],
                  ['키워드 반복', '중간 2회 (90% 5회)', '7회', '순위 근거 없음 (양방향 실측)'],
                  ['제목에 상호명', '74% (37/50)', '없음', '판의 형태 — 아래 참고'],
                  ['제목에 후기·추천', '58% (29/50)', '없음', '판의 형태 — 아래 참고'],
                ].map((row) => (
                  <tr key={row[0]} className="bd border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{row[0]}</td>
                    <td className="tnum py-1.5 pr-3 text-right">{row[1]}</td>
                    <td className="tnum py-1.5 pr-3 text-right font-bold">{row[2]}</td>
                    <td className="py-1.5">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
            <strong className="font-bold">이 판에 있는 글은 두 형태뿐입니다</strong> (지역 헬스장·PT 키워드 5개 ×
            1페이지 10편 = 50편).
            <p className="mt-1.5">
              <strong>① 업체 후기·소개 (44편)</strong> — 제목에 상호명 74%, 후기·추천 58%. 「천안 쌍용동 헬스장
              미녀와야수짐 ! 샤워실 개인 부스에…」·「두정동 연중무휴 24시헬스장 함마짐 PT 찐후기」처럼 <strong>업체
              이름 + 겪은 것</strong>입니다.
            </p>
            <p className="mt-1.5">
              <strong>② 운영자가 알려주는 정보글 (6편)</strong> — 상호명도 후기도 없는 글은 전부 이 형태였고 나이가
              3~23일로 최근 진입입니다. 「성정동헬스 운동 초보라면 유산소부터? 웨이트부터? <strong>9년차 헬스장
              운영자가 알려드립니다</strong>」·「천안헬스 <strong>9년차 관장이 알려주는</strong> 성정동헬스장 제대로
              다니는 법」 — 경쟁 업체 관장이 이 방법으로 성정동 1페이지에 5편을 올려놨습니다.
            </p>
            <p className="mt-1.5">
              우리 글(「쌍용동 헬스장 초보도 지금 등록해도 될까? 8월 3개월 9.9만원」)은 <strong>둘 다 아닙니다</strong>{' '}
              — 상호명도, 후기도, 「관장이 알려준다」도 없는 가격 제안형입니다. 59위에서 멈춘 것을 설명할 수 있는
              유일한 차이입니다.
            </p>
          </div>

          <p className="muted mt-3 text-[11.5px] leading-relaxed">
            <strong>그래서 할 일은 셋입니다.</strong> ① 제목·본문을 이 판의 형태로 씁니다 — 홍보글이면{' '}
            <strong>정식 상호명을 제목에 넣고</strong> 시설·가격·겪은 것을 앞세우고, 정보글이면{' '}
            <strong>「○년차 관장이 알려드립니다」</strong>를 씁니다(둘 다 우리가 실제로 쓸 수 있는 말입니다).
            ② 같은 키워드로 계속 씁니다 — 자리는 주당 11편 나고, 들어간 글의 절반은 36일 이상 된 글입니다.
            ③ 발행 후 최소 5~6주는 순위를 지켜봅니다. <strong>「몇 편이면 들어간다」는 재보지 않았으니 말하지
            않습니다.</strong>
          </p>
        </Card>

        {/* ─── 상위 블로그와 블로그 단위 비교 ─── */}
        <Card
          id="peers"
          title="상위 블로그는 잡블로그였습니다"
          subtitle="상위 5편의 블로그 13곳을 블로그 단위로 재서 우리와 비교했습니다 (2026-08-20). 쌍용동 헬스장·두정동 헬스장·쌍용동 PT."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-3 font-semibold">항목</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">상위 13곳 중간값</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">우리</th>
                  <th className="py-1.5 font-semibold">읽는 법</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['헬스·운동 글 비중', '10%', '87%', '집중도가 문턱이 아닙니다'],
                  ['이웃', '481', '4,231', '우리가 8.8배'],
                  ['누적 방문자', '36,446', '269,750', '우리가 7.4배'],
                  ['블로그 나이', '1.7년', '4.8년', '오래된 게 유리하지 않습니다'],
                  ['전체 글 수', '101편', '278편', '우리가 많습니다'],
                  ['글당 댓글', '3.3', '9.2', '우리가 많습니다'],
                  ['글당 공감', '12.4', '36.6', '우리가 많습니다'],
                  ['오늘 방문자', '43명', '6명', '우리가 1/7 — 뒤진 항목'],
                  ['주당 발행', '3.1편', '1.3편', '우리가 절반 — 뒤진 항목'],
                  ['후기·체험 글', '13곳 중 12곳', '0편', '빈칸'],
                ].map((row) => (
                  <tr key={row[0]} className="bd border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{row[0]}</td>
                    <td className="tnum py-1.5 pr-3 text-right">{row[1]}</td>
                    <td className="tnum py-1.5 pr-3 text-right font-bold">{row[2]}</td>
                    <td className="py-1.5">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-rose-900 dark:text-rose-200">
            <strong className="font-bold">이 화면이 적어둔 조언 하나가 뒤집혔습니다.</strong>
            <p className="mt-1.5">
              위 랭킹 설명에 「헬스·운동 범위를 벗어난 글을 섞지 않는다」고 적어뒀습니다. 그런데 1페이지를 잡고 있는
              블로그들의 최근 30편을 보니 헬스·운동 글이 <strong>3~33%</strong>뿐이고 나머지는 맛집·일상·체험이었습니다.
              중간값 <strong>10%</strong>입니다. 우리는 <strong>87%</strong>고, 순위는 우리가 밀립니다.
            </p>
            <p className="mt-1.5">
              그래서 <strong>주제 집중도는 이 판에서 문턱이 아닙니다.</strong> 지금 87%를 굳이 낮출 이유도 없지만,
              헬스 밖 글을 섞는 것을 두려워할 이유도 없습니다. (C-Rank 자체를 부정하는 것이 아니라, 이 키워드들에서
              그것이 갈림길이 아니었다는 뜻입니다.)
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200">
            <strong className="font-bold">우리가 실제로 뒤진 것은 셋입니다.</strong>
            <p className="mt-1.5">
              ① <strong>오늘 방문자 6명</strong> (상위 중간 43명) — 이건 결과이지 원인이 아닙니다.
              ② <strong>주당 1.3편</strong> (상위 중간 3.1편) — 간격 중간값도 2일 대 1일입니다.
              ③ <strong>후기·체험 글 0편</strong> — 상위 13곳 중 12곳이 쓰는 유형인데 우리 최근 30편에 없습니다.
            </p>
            <p className="mt-1.5">
              다만 <strong>발행 빈도가 순위를 만든다고는 적지 않습니다</strong> — 1~2위 그룹(중간 4.5편/주)과 3~5위
              그룹(3.1편)이 겹쳤고, 쌍용동 헬스장 1위 블로그는 주 0.6편입니다. 「주 3편 쓰면 오른다」가 아니라
              「이 판의 절반이 그렇게 쓴다」가 우리가 아는 전부입니다.
            </p>
          </div>

          <p className="muted mt-3 text-[11.5px] leading-relaxed">
            <strong>개설일은 밖에서 볼 수 없습니다</strong> — 가장 오래된 글 날짜를 하한으로 씁니다. 그 값으로도
            결론은 분명합니다: 두정동 헬스장 <strong>1위 블로그의 첫 글은 2026-06-01</strong>(2.5개월)이고 주 6.5편을
            씁니다. 반대로 쌍용동 헬스장 1위는 3.6년 · 주 0.6편 · 이웃 121명입니다. <strong>블로그 스펙으로 자리가
            정해지지 않습니다.</strong>
            <br />
            직접 재보시려면 <Link href="/blog" className="text-brand-600 dark:text-brand-100 font-semibold underline">블로그 진단</Link>{' '}
            화면의 「상위 5편의 블로그와 비교」에 키워드를 넣으세요. 표본은 그때 다시 잽니다.
          </p>
        </Card>

        {/* ─── 정보글 개편 ─── */}
        <Card
          id="info-purity"
          title="정보글에는 업체를 하나도 드러내지 않습니다"
          subtitle="회원이 주신 영상(머니코치 최준호)을 분석하고 1페이지 67편으로 대조해 2026-08-20에 개편했습니다."
        >
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-rose-900 dark:text-rose-200">
            <strong className="font-bold">근거는 네이버 공식 공지입니다.</strong>
            <p className="mt-1.5">
              「홍보성 게시물은 …특정 상품이나 서비스를 구매 사용하도록 권하거나 <strong>연락을 유도하는</strong> 등의
              활동이 해당됩니다.」 즉 순위 이전에 <strong>분류</strong>의 문제입니다. 정보글에 연락처 한 줄이 들어가면
              그 글은 정보글로 안 세어질 수 있습니다.
            </p>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-1.5 pr-3 font-semibold">정보글에 넣지 않는 것</th>
                  <th className="py-1.5 pr-3 font-semibold">예</th>
                  <th className="py-1.5 text-right font-semibold">1페이지 정보글 38편</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['전화번호·명함', '「전화 주세요」', '5%'],
                  ['플레이스·위치', '「찾아오시는 길」·지도', '11%'],
                  ['상호명', '「저희 ○○점에서는」', '—'],
                  ['홍보 링크', '홈페이지·카톡·예약 링크', '26%'],
                  ['혜택 낱말', '이벤트·무료·할인·견적', '3%'],
                  ['방문·연락 유도', '「문의 주세요」', '8%'],
                ].map((row) => (
                  <tr key={row[0]} className="bd border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{row[0]}</td>
                    <td className="muted py-1.5 pr-3">{row[1]}</td>
                    <td className="tnum py-1.5 text-right">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed">
            1페이지 정보형 38편 중 <strong>25편(66%)</strong>이 위 여섯 가지가 하나도 없는 순수 정보글이었습니다.
            그래서 정보글에서 <strong>인사·상호명·예약 링크·상담 유도·마지막 센터 소개 구간을 전부 뺐습니다.</strong>{' '}
            지시문에 상호명과 링크를 <strong>주지도 않습니다</strong> — 값을 주면 쓰게 되기 때문입니다.
          </p>

          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            <strong className="font-bold">이 개편은 회원님이 전에 요청하신 두 가지를 덮습니다.</strong>
            <p className="mt-1.5">
              ① 「정보성 8 : 홍보성 2 느낌으로 글 마지막에는 홍보가 들어갈 수 있게」(8/07) → 이제 <strong>정보 10 : 홍보 0</strong>{' '}
              입니다. ② 「화자는 센타로 해서 상호명도 함께 소개될 수 있게」(8/10) → 이제 <strong>상호명을 쓰지 않습니다.</strong>{' '}
              되돌리려면 말씀만 주세요. 「마지막 홍보 구간」 칸을 채우면 지금도 쓸 수는 있지만, 검수가 분류 위험을 알립니다.
            </p>
          </div>

          <p className="muted mt-3 text-[11.5px] leading-relaxed">
            <strong>영상에서 한 가지는 안 따랐습니다.</strong> 영상은 홍보글도 홍보 요소를 2개 이하로 줄이라고 합니다.
            그런데 1페이지 업체형 글 46편의 홍보 요소는 <strong>중간값 3개</strong>였고 2개 이하는 37%뿐이었습니다(4~5개인
            글도 13편). 우리 실측과 어긋나서 홍보글은 그대로 뒀습니다.
            <br />
            검수는 <strong>주의까지만</strong> 합니다 — 1페이지에 링크를 달고도 올라온 정보글이 26% 있었습니다. 못 오른
            글은 표본에 없으니 「링크가 있으면 못 오른다」는 증명되지 않았고, 확실한 것은 분류 위험입니다.
          </p>
        </Card>

        {/* ─── 발행 후 타임라인 ─── */}
        <Card
          id="timeline"
          title="발행 후 언제 순위가 잡히나"
          subtitle="같은 '순위 밖'도 발행 3일차와 3주차는 뜻이 전혀 다릅니다. 순위 추적 화면이 이 구간을 함께 알려줍니다."
        >
          <div className="space-y-3">
            {[
              {
                t: '0~3일 · 색인 구간',
                d: '검색에 등록되는 단계입니다. 네이버 블로그는 발행하면 자동으로 색인되므로 서치어드바이저에 요청할 필요가 없습니다 (실측: 같은 날 올린 글이 이미 통합검색에 있었습니다). 색인됐는지는 제목을 그대로 검색해 확인하세요. 이 구간에 순위가 없는 것은 정상입니다.',
                mark: '✓',
              },
              {
                t: '24~48시간 · 초기 반응 수집',
                d: '조회·체류·공감 같은 초기 반응이 반영되는 구간입니다. 지인 공유 같은 자연 유입은 괜찮지만 품앗이·매크로는 조작 트래픽으로 판정됩니다.',
                mark: '≈',
              },
              {
                t: '~3주 · 자리 잡는 구간',
                d: '순위가 오르내리다 안정됩니다. 이 구간에 뒤늦게 올라오는 경우도 있습니다. 다만 며칠 만에 자리가 잡힌다거나 정확히 몇 주가 걸린다는 공개 수치는 없습니다 — 이 3주는 판단 기준선이지 네이버가 밝힌 값이 아닙니다.',
                mark: '?',
              },
              {
                t: '3주 이후에도 순위 밖',
                d: '진입 실패로 보는 편이 낫습니다. 세부 의도를 붙여 키워드를 좁히거나(예: "+ 새벽", "+ 초보"), 정보량을 늘려 다시 쓰세요. 글을 계속 붙들고 있는 것보다 다음 글이 낫습니다.',
                mark: '?',
              },
            ].map((x) => (
              <div key={x.t} className="surface bd rounded-xl border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13px] font-bold">{x.t}</h3>
                  <Badge tone={x.mark === '✓' ? 'good' : x.mark === '≈' ? 'info' : 'warn'}>
                    {x.mark === '✓' ? '공식 확인' : x.mark === '≈' ? '실무 통설' : '근거 불충분'}
                  </Badge>
                </div>
                <p className="muted mt-1.5 text-[12px] leading-relaxed">{x.d}</p>
              </div>
            ))}

            <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
              <strong className="font-bold">블로그 지수가 낮은데도 새 글이 바로 상위에 뜨는 이유</strong>
              <p className="mt-1.5">
                2025년에 C-Rank·D.I.A.+ 평가가 스마트블록에 완전히 통합됐습니다. D.I.A.+는{' '}
                <strong>문서 하나</strong>의 검색 의도 적합성을 보기 때문에, 특정 스마트블록에서는 블로그
                지수보다 그 글 자체의 의도 적합성이 더 세게 작동합니다. 지수가 낮은 블로그도 세부 의도가 딱
                맞는 글 하나로 뚫을 수 있다는 뜻이고, 반대로 지수가 높아도 의도가 어긋난 글은 밀립니다.
              </p>
              <p className="mt-2">
                → 실무적 결론: <strong>큰 키워드로 지수 싸움을 하기보다, 세부 의도를 좁힌 키워드로 문서 단위
                승부를 보는 편이 빠릅니다.</strong> 키워드 조사 화면의 지역 키워드 조합 생성기가 이걸 위한
                기능입니다.
              </p>
            </div>
          </div>
        </Card>

        {/* ─── 가산 요소 ─── */}
        <Card title="지수 향상 조건 (가산 요소)">
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">요소</th>
                  <th className="py-2 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['체류시간', '지수 가산 중 가장 빠른 요소. 발행 후 24시간~7일 사이 누적이 중요'],
                  ['주제 일관성', '한 주제로 쌓인 글 → C-Rank 상승. 협찬 글도 주제와 안 맞으면 역효과'],
                  ['발행 주기', '주 2~3회 꾸준히. 몰아서 대량 발행은 역효과'],
                  ['초기 반응', '발행 후 24시간 내 자연스러운 조회·공감·댓글 (품앗이·매크로는 금지)'],
                  ['정보 밀도', '검색 의도에 답하는 실질 정보. 상위글 평균 2,000~3,000자'],
                  ['원본 콘텐츠', '직접 촬영 이미지 5장 이상, 영상 30초~3분 1개'],
                  ['색인 확인', '네이버 블로그는 자동 색인 — 요청 불필요. 제목 그대로 검색해 나오는지로 확인'],
                ].map(([a, b]) => (
                  <tr key={a} className="bd border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{a}</td>
                    <td className="py-2 leading-relaxed">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─── 저품질 트리거 ─── */}
        <Card title="저품질 · 미노출 트리거 (감점 요소)" subtitle="키워드 규칙보다 이쪽이 더 중요합니다">
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">트리거</th>
                  <th className="py-2 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['키워드 반복', '제목·본문 과도 반복(10회 이상 페널티 통설). 등간격 배치도 패턴 신호'],
                  [
                    '유사문서',
                    '문장 단위 중복 판정. 같은 블로그 내 비슷한 키워드·내용 반복, 타 블로그와 겹치는 글, 이미지 재사용',
                  ],
                  [
                    '상업성 과다',
                    '홍보만 있는 글 연속 발행, 상업성 외부 링크 다수, 가격·전화번호 도배 → 이탈률 상승 → 어뷰징 의심',
                  ],
                  ['조작 트래픽', '매크로 공감·댓글·스크랩, 품앗이, 불량 IP'],
                  ['금지 업종·표현', '의료·금융 등 규제 표현, 과장·허위 (아래 위험 표현 표 참고)'],
                  ['대량·복붙 발행', '짧은 시간 다수 발행, 템플릿 복붙 글'],
                ].map(([a, b]) => (
                  <tr key={a} className="bd border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{a}</td>
                    <td className="py-2 leading-relaxed">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-relaxed">
            <strong className="font-bold">미노출 자가진단</strong> — 발행한 글 제목을 그대로 검색해서 안
            나오면 검색누락입니다. 여러 글이 동시에 안 나오거나 순위가 일제히 밀리면 블로그 단위 감점을
            의심하세요. 그때는 발행을 늦추고 정보성 글 위주로 회복 운영합니다.
          </div>
        </Card>

        {/* ─── 수치 기준 ─── */}
        <Card
          title="글 유형별 수치 기준"
          subtitle="글 작성 화면의 검수가 이 표를 그대로 검사합니다"
        >
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="muted bd border-b text-left">
                  <th className="py-2 pr-3 font-semibold">항목</th>
                  <th className="py-2 pr-3 font-semibold">홍보글</th>
                  <th className="py-2 pr-3 font-semibold">정보글</th>
                  <th className="py-2 font-semibold">후기글</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {[
                  [
                    '메인 키워드 횟수',
                    `${SPECS.promo.mainMin}~${SPECS.promo.mainMax}회`,
                    `${SPECS.info.mainMin}~${SPECS.info.mainMax}회`,
                    `${SPECS.review.mainMin}~${SPECS.review.mainMax}회`,
                  ],
                  ['키워드 밀도', `${SPECS.promo.densityMax}% 이내`, `${SPECS.info.densityMax}% 이내`, `${SPECS.review.densityMax}% 이내`],
                  [
                    '본문 글자수',
                    `${SPECS.promo.charMin.toLocaleString()}~${SPECS.promo.charMax.toLocaleString()}자`,
                    `${SPECS.info.charMin.toLocaleString()}~${SPECS.info.charMax.toLocaleString()}자`,
                    `${SPECS.review.charMin.toLocaleString()}~${SPECS.review.charMax.toLocaleString()}자`,
                  ],
                  ['정식 상호명', `${SPECS.promo.legalNameMin}회 이상`, '—', '—'],
                  ['지역 키워드', '메인이 지역', '본문 1~2회 + 태그', '메인이 지역'],
                  ['제목', '28~40자 · 금액 앞 20자', '28~40자 · 질문형', '28~40자 + "후기" 명시'],
                  ['소제목', '4~5개', '4~5개', '4~5개'],
                  ['이미지', '5~10장', '5~10장', '5~10장'],
                  ['해시태그', '8~12개', '8~12개', '8~12개'],
                  ['외부 링크', '1~2개', '0~1개 권장', '1~2개'],
                ].map((row) => (
                  <tr key={row[0]} className="bd border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{row[0]}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row[1]}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row[2]}</td>
                    <td className="py-2 whitespace-nowrap">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-3 text-[11px] leading-relaxed">
            키워드 선정은 월 검색량 500~5,000 구간이 진입 적정입니다. 이미지는 가로 800~1,200px · 500KB 이내,
            영상은 30초~3분.
          </p>
        </Card>

        {/*
          **정보글 인용 모양을 여기 박아둔다.**

          회원이 캡처와 함께 지적했다 — "내가 원하는 건 「대한비만학회 무슨무슨 결과에 따르면…」
          인데, 그냥 내용을 쓰고 괄호로 출처를 쓰고 있어. 나는 이런 걸 원한 게 아니야."
          지시문과 검수기는 고쳤지만, **회원이 눈으로 확인할 자리**가 없으면 다음에 또 같은 것을
          캡처해서 물어야 한다. 그래서 규칙을 화면에 적는다.
        */}
        <Card
          title="정보글 인용 모양 — 출처를 문장 앞에"
          subtitle="검수의 「출처를 문장 앞에 세웠는가」 항목이 이 모양을 검사합니다"
        >
          <div className="space-y-2.5 text-[12px] leading-relaxed">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2.5">
              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">이렇게 쓰지 않습니다</p>
              <p className="mt-1">
                단맛 나는 음식은 혈당을 빠르게 올리고 다시 빠르게 떨어뜨리는데, 혈당이 떨어지면 공복감을
                느끼고 과식으로 이어지기 쉽다고 <b>합니다 (대한비만학회 일반인 홈페이지)</b>.
              </p>
              <p className="muted mt-1.5 text-[11px]">
                읽는 사람은 누가 한 말인지 모른 채 그 문장을 지나갑니다. 「~라고 합니다」까지 붙으면
                출처를 적었는데도 소문처럼 읽힙니다.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">이렇게 씁니다</p>
              <p className="mt-1">
                <b>대한비만학회가 일반인용 자료에서 밝힌 내용을 보면</b>, 단맛 나는 음식은 혈당을 빠르게
                올렸다가 다시 빠르게 <b>떨어뜨립니다</b>.
              </p>
              <p className="muted mt-1.5 text-[11px]">
                기관 이름을 먼저 세우고, 앞에서 밝혔으니 문장은 단정으로 끝냅니다.
              </p>
            </div>
            <ul className="muted space-y-1.5 text-[11.5px] leading-relaxed">
              <li>
                • 인용은 <b>2~3곳까지</b>. 국내 기관·학회(대한비만학회·질병관리청·보건복지부·식품의약품안전처)와
                국제 기관(세계보건기구·미국스포츠의학회)만 씁니다. 개인 블로그·카페·쇼핑몰은 근거로 쓰지 않습니다.
              </li>
              <li>• 출처 이름은 <b>한국어로</b> 적고 약어는 괄호에 넣습니다 — 「세계보건기구(WHO)」.</li>
              <li>
                • <b>괄호를 금지하는 것은 아닙니다.</b> 앞에 세운 다음 확인용 주소를 문단 끝에 한 줄로 더
                적는 것은 괜찮습니다.
              </li>
              <li>
                • 못 찾았으면 <b>인용하지 않습니다.</b> 그 대목은 상담에서 본 것으로 씁니다 — 「제가 상담하면서
                보면」. 빈손으로 오는 것이 지어내는 것보다 낫습니다.
              </li>
            </ul>
          </div>
        </Card>

        {/* ─── 운영 전략 ─── */}
        <Card title="블로그 운영 전략" subtitle="글 단위가 아니라 블로그 단위로 관리해야 합니다">
          <ul className="space-y-3 text-[12px] leading-relaxed">
            <li>
              <strong className="font-bold">정보글 : 홍보글 ≈ 2 : 1</strong> — 홍보글만 연속 발행하면 상업성
              과다 신호가 됩니다. 사이에 정보성 글(운동법·초보 가이드·건강습관)을 끼워 C-Rank를 키우세요.
              정보글이 키운 신뢰도를 홍보글이 수확하는 구조입니다.
            </li>
            <li>
              <strong className="font-bold">같은 메인 키워드 반복 주의</strong> — 같은 지점 글이라도 매번
              같은 지역 키워드만 쓰면 블로그 내 유사문서·자기잠식이 생깁니다. 지점의 지역 키워드 목록을
              로테이션하세요.
            </li>
            <li>
              <strong className="font-bold">동일 지점 글은 2~3주 간격</strong> — 서로 다른 지점 글도 같은 날
              연속 발행보다 하루 이상 간격을 권합니다.
            </li>
            <li>
              <strong className="font-bold">발행 직후 24시간</strong> — 지인 공유 같은 자연 유입은 좋지만
              품앗이·매크로류는 절대 금지입니다(조작 트래픽 판정).
            </li>
            <li>
              <strong className="font-bold">유사성 방지 3축</strong> — 도입 유형 / 주력 앵글 / 문장 표현을 매
              글 다르게 조합합니다. 소제목은 매번 새로 짓고, 필수 메시지도 문장은 새로 씁니다.
            </li>
          </ul>
        </Card>

        {/* ─── 위험 표현 ─── */}
        <Card
          title="위험 표현 치환 가이드"
          subtitle="글 작성 화면에서 자동으로 검사하는 항목입니다. 철자를 바꿔 숨기지 마세요 — 변칙 표기는 그 자체가 어뷰징 신호입니다."
        >
          <div className="space-y-3">
            {['A. 최상급·단정', 'B. 효과 보장', 'C. 의료·치료성', 'E. 절대 금지'].map((cat) => {
              const terms = RISK_TERMS.filter((t) => t.category === cat)
              if (!terms.length) return null
              return (
                <div key={cat} className="surface bd rounded-xl border p-3.5">
                  <h3 className="text-[13px] font-bold">{cat}</h3>
                  <ul className="mt-2 space-y-2">
                    {terms.map((t, i) => (
                      <li key={i} className="text-[12px] leading-relaxed">
                        <code className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                          {t.pattern.replace(/\\\\s\*/g, ' ').replace(/\\\\s/g, ' ').replace(/\|/g, ' / ')}
                        </code>
                        <span className="muted mt-1 block">→ {t.fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}

            <div className="surface bd rounded-xl border p-3.5">
              <h3 className="text-[13px] font-bold">D. 상업 단어 빈도 (도배 방지)</h3>
              <p className="muted mt-1 text-[12px] leading-relaxed">
                단어 하나하나는 문제가 없지만 반복되면 광고성 문서 신호가 됩니다.
              </p>
              <ul className="mt-2 space-y-1.5">
                {COMMERCIAL_LIMITS.filter((c) => c.note).map((c) => (
                  <li key={c.term} className="text-[12px] leading-relaxed">
                    <strong className="font-semibold">
                      {c.term} — {c.max}회 이내
                    </strong>
                    <span className="muted"> · {c.note}</span>
                  </li>
                ))}
              </ul>
              <p className="muted mt-2.5 text-[12px] leading-relaxed">
                가격 숫자 나열은 쓰지 않습니다. 이벤트 혜택은 조건·기간 중심으로 쓰고 구체 금액은 상담
                안내로 넘기세요. 전화번호는 글 전체에 1회 — CTA 구간에만.
              </p>
            </div>
          </div>
        </Card>

        {/* ─── Claude 스킬 연동 ─── */}
        <Card
          title="Claude 스킬과 함께 쓰기"
          subtitle="이 앱은 검수·관리 도구이고, 글 본문을 실제로 써주는 것은 Claude 스킬입니다"
        >
          <div className="space-y-2.5 text-[12px] leading-relaxed">
            <p>
              이 앱에서 키워드를 고르고 상위노출 분석으로 처방을 받은 다음, Claude에게 아래처럼 요청하면
              스킬이 본문을 써줍니다. 결과를 이 앱의 글 작성 화면에 붙여넣으면 실시간 검수가 돌아갑니다.
            </p>
            <ul className="space-y-2">
              {[
                ['gym-blog-writer', '홍보글', '"쌍용점 홍보글 써줘, 메인 키워드는 쌍용동 24시헬스장, 이벤트는 …"'],
                ['gym-info-writer', '정보글', '"다이어트 정체기 극복 정보글 써줘, 지역 키워드는 성정동 헬스장"'],
                [
                  'gym-review-writer',
                  '후기글',
                  '"용곡점 방문후기 써줘, 내돈내산, 메인 키워드는 용곡동 여성전용, 이벤트는 3개월 등록 시 1개월 추가"',
                ],
              ].map(([skill, kind, example]) => (
                <li key={skill} className="surface bd rounded-xl border p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-[11px] font-bold">{skill}</code>
                    <Badge tone="info">{kind}</Badge>
                  </div>
                  <p className="muted mt-1.5 text-[11px] leading-relaxed">{example}</p>
                </li>
              ))}
            </ul>
            <p>
              발행 관리 화면의 <strong className="font-semibold">발행 기록 복사</strong> 버튼으로 뽑은 한 줄을
              다음 글 요청 때 함께 붙여넣으면, 스킬이 소재·앵글·소제목이 겹치지 않게 잡아줍니다.
            </p>
          </div>
        </Card>

        <p className="muted px-1 text-[11px] leading-relaxed">
          지식 베이스 기준일 {KB_DATE}. ✓ 표시는 네이버 공식 발표, 그 외는 실무 검증 통설입니다. 네이버는
          &quot;저품질 블로그&quot;라는 개념을 공식적으로 부인하지만, 의심 콘텐츠를 자체 시스템에서
          후순위로 걸러냅니다.
        </p>
      </div>
    </>
  )
}
