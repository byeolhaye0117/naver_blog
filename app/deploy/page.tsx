import Link from 'next/link'
import { keyStatus } from '@/lib/naver/client'
import { aiStatus, canSearchWeb } from '@/lib/ai/llm'
import { PageHeader } from '@/components/AppShell'
import { Badge, Card } from '@/components/ui'
import CopyButton from '@/components/CopyButton'
import BackupBox from '@/components/BackupBox'
import { StorageStatusCard } from '@/components/StorageNotice'
import AiKeyCheck from '@/components/AiKeyCheck'

/**
 * 지금 어떤 AI 키로 돌고 있는지.
 *
 * 회원이 물었다 — "지금 어떤 키 쓰는지 알아봐." 나는 회원의 Vercel 환경변수를 읽을 수 없다.
 * 그래서 **앱이 스스로 말하게** 만든다. 키 값은 절대 찍지 않고, 어느 회사인지와
 * **자료 검색이 되는지**만 보여준다 — 검색이 되는 키(Anthropic·Gemini)에서만 정보글이
 * 자료를 찾아 인용하기 때문에, 이 한 줄이 「내 글에 출처가 붙는가」의 답이다.
 */
function AiKeyCard() {
  const ai = aiStatus()
  const search = canSearchWeb()
  return (
    <Card
      title="지금 쓰는 AI 키"
      subtitle="키 값은 보여주지 않습니다 — 어느 회사 키인지와 자료 검색이 되는지만 확인합니다"
      right={
        <Badge tone={!ai.ready ? 'bad' : search ? 'good' : 'warn'}>
          {!ai.ready ? '없음' : search ? '검색 가능' : '검색 안 됨'}
        </Badge>
      }
    >
      {!ai.ready ? (
        <p className="text-[12.5px] leading-relaxed">
          AI 키가 없습니다. 아래 <strong>Environment Variables</strong> 안내대로 넷 중 하나를 넣고 다시
          배포하면 「AI로 본문 쓰기」가 켜집니다.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] leading-relaxed">
            <strong>{ai.label}</strong> 키로 돌고 있습니다.
          </p>
          <p className="muted mt-2 text-[11.5px] leading-relaxed">
            {search ? (
              <>
                이 키는 <strong>자료 검색이 됩니다.</strong> 정보글을 쓸 때 기관·학회 자료를 직접 찾아
                「대한비만학회 자료에 따르면, …」처럼 <strong>출처를 문장 앞에 세워</strong> 인용합니다
                (찾은 것만 씁니다 — 못 찾으면 인용하지 않습니다).
              </>
            ) : (
              <>
                이 키는 <strong>자료 검색이 안 됩니다</strong> (OpenAI 호환·CLOVA 는 표준 검색 도구가
                없습니다). 그래서 정보글에서 연구·수치 인용을 하지 않고 상담 경험으로만 씁니다 — 확인할
                방법이 없는 상태에서 인용하면 지어내는 것이 되기 때문입니다. 출처가 붙은 정보글을
                원하시면 <Env name="ANTHROPIC_API_KEY" /> 또는 <Env name="GEMINI_API_KEY" /> 를 넣고 다시
                배포하세요.
              </>
            )}
          </p>
          <p className="muted mt-2 text-[11px] leading-relaxed">
            키가 여러 개면 <Env name="AI_PROVIDER" /> 에 적은 회사를 씁니다. 환경변수를 바꿨으면{' '}
            <strong>다시 배포</strong>해야 반영됩니다.
          </p>
        </>
      )}
      {/*
       * 위 안내는 「환경변수가 들어 있다」까지만 말한다. 오타·만료·잔액 없음은 전부 들어 있는
       * 상태이므로, 실제로 되는지는 눌러서 확인해야 한다.
       */}
      <AiKeyCheck />
    </Card>
  )
}

export const dynamic = 'force-dynamic'

/**
 * 배포 시작 링크.
 *
 * /new/clone (이른바 "Deploy 버튼") 은 쓰지 않는다. 그 링크는 저장소를 **복제해서**
 * 새 저장소를 만들기 때문에, 이후 이 저장소에 올리는 수정이 배포에 따라오지 않는다.
 * 대신 /new 로 보내 기존 저장소를 그대로 Import 하게 한다 — 그러면 push 마다 자동 배포된다.
 */
const DEPLOY_URL = 'https://vercel.com/new'
const REPO_NAME = 'naver_blog'

const ENV_TEMPLATE = `# ── 네이버 개발자센터 (검색 API · 데이터랩) ──
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# ── 네이버 검색광고 (월간 검색량) ──
NAVER_AD_API_KEY=
NAVER_AD_SECRET=
NAVER_AD_CUSTOMER_ID=

# ── 클라우드 저장소 (휴대폰·PC 기록 공유) ──
# Vercel 에서 Upstash 를 연결하면 자동으로 들어옵니다.
# 직접 넣을 때만 아래 두 줄을 채우세요.
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
`

function Step({
  n,
  title,
  desc,
  children,
  badge,
}: {
  n: string
  title: string
  desc?: string
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="surface bd rounded-xl border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-brand-500/15 text-brand-700 dark:text-brand-100 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
          {n}
        </span>
        <h3 className="text-[13px] font-bold">{title}</h3>
        {badge}
      </div>
      {desc && <p className="muted mt-1.5 text-[12px] leading-relaxed">{desc}</p>}
      <div className="mt-2.5 text-[12px] leading-relaxed">{children}</div>
    </div>
  )
}

function Ol({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="muted tnum shrink-0 font-semibold">{i + 1}.</span>
          <span>{x}</span>
        </li>
      ))}
    </ol>
  )
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-brand-600 dark:text-brand-100 font-semibold underline"
    >
      {children}
    </a>
  )
}

function Env({ name }: { name: string }) {
  return (
    <code className="bd rounded border px-1.5 py-0.5 text-[11px] font-semibold break-all">{name}</code>
  )
}

export default function DeployPage() {
  const keys = keyStatus()

  return (
    <>
      <PageHeader
        title="휴대폰에서 쓰기 · 배포"
        desc="한 번만 해두면 이후에는 PC를 켜지 않아도 휴대폰에서 전 기능을 쓸 수 있습니다. 순서대로 따라가세요."
      />

      <div className="space-y-4">
        <Card
          title="가장 빠른 길"
          subtitle="아무것도 입력하지 않고 먼저 배포해도 됩니다. 키와 저장소는 배포한 뒤에 붙이면 되고, 그 절차는 아래 1~3단계에 있습니다."
        >
          <a
            href={DEPLOY_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="bg-brand-600 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Vercel 에서 배포 시작 →
          </a>
          <p className="muted mt-2.5 text-[12px] leading-relaxed">
            GitHub 로 로그인하고 저장소 목록에서{' '}
            <code className="bd rounded border px-1 py-0.5 text-[11px]">{REPO_NAME}</code> 를{' '}
            <strong>Import</strong> → 환경변수는 비워둔 채 <strong>Deploy</strong>. 1~2분 뒤{' '}
            <code className="bd rounded border px-1 py-0.5 text-[11px]">…vercel.app</code> 주소가 나옵니다.
            그 주소를 휴대폰에서 열고 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.
          </p>
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            <strong className="font-bold">“Create a Git repository” 화면이 나오면 멈추세요.</strong> 그건 이
            저장소를 <strong>복제해서 새 저장소를 만드는</strong> 흐름(Deploy 버튼 / clone 링크)입니다. 그대로
            만들면 이후 이 저장소에 올라가는 수정이 배포에 따라오지 않습니다. 화면 아래{' '}
            <strong>“Import a different Git Repository”</strong> 를 눌러 기존{' '}
            <code className="bd rounded border px-1 py-0.5 text-[11px]">{REPO_NAME}</code> 를 고르세요.
          </div>
        </Card>

        <Card title="지금 상태">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone={keys.search ? 'good' : 'warn'}>
                검색 API {keys.search ? '연결됨' : '미설정'}
              </Badge>
              <Badge tone={keys.searchAd ? 'good' : 'warn'}>
                검색광고 API {keys.searchAd ? '연결됨' : '미설정'}
              </Badge>
            </div>
            <StorageStatusCard />
          </div>
        </Card>

        <AiKeyCard />

        {/* ─────────── 1단계: 네이버 API 키 ─────────── */}
        <Card
          title="1단계 · 네이버 API 키 발급"
          subtitle="둘 다 무료입니다. 키가 없어도 앱은 돌아가지만 숫자가 샘플 값이라, 실제 검색량·순위를 보려면 필요합니다."
        >
          <div className="space-y-3">
            <Step
              n="A"
              title="검색 API · 데이터랩 — 네이버 개발자센터"
              desc="순위 자동 조회와 검색 추이에 씁니다. 발행량은 키 없이 자동으로 가져오니 이 키가 없어도 경쟁률 등급은 나옵니다. 하루 25,000회까지 무료입니다."
              badge={<Badge tone={keys.search ? 'good' : 'default'}>{keys.search ? '완료' : '필요'}</Badge>}
            >
              <Ol
                items={[
                  <>
                    <Ext href="https://developers.naver.com/apps/#/register">
                      developers.naver.com 애플리케이션 등록
                    </Ext>{' '}
                    에 접속해 네이버 아이디로 로그인합니다.
                  </>,
                  <>
                    <strong>애플리케이션 이름</strong>을 아무렇게나 적습니다 (예: <em>블로그매니저</em>). 이
                    이름은 아무 데도 노출되지 않습니다.
                  </>,
                  <>
                    <strong>사용 API</strong> 에서 <strong>“검색”</strong> 을 반드시 추가해야 합니다. 권한이
                    없으면 키가 맞아도 호출이 거부됩니다 (실제 응답:{' '}
                    <code className="bd rounded border px-1 py-0.5 text-[11px]">
                      401 Scope Status Invalid, errorCode 024
                    </code>
                    ). 검색 추이 화면까지 쓰려면 <strong>“데이터랩”</strong> 도 함께 추가하세요.
                  </>,
                  <>
                    <strong>등록 화면 드롭다운에 “검색”이 안 보이는 경우가 있습니다.</strong> 그러면 일단 아무
                    항목이나 골라 등록을 마치고, 그다음{' '}
                    <Ext href="https://developers.naver.com/apps/#/list">내 애플리케이션</Ext> → 해당 앱 →{' '}
                    <strong>API 설정</strong> → <strong>사용 API</strong> 에서 <strong>검색</strong> 을
                    추가하세요. 등록 후에 추가하는 이 경로가 더 확실합니다.
                  </>,
                  <>
                    <strong>비로그인 오픈 API 서비스 환경</strong> 에서 <strong>“WEB 설정”</strong> 을 고르고
                    웹 서비스 URL 을 넣습니다. 지금은{' '}
                    <code className="bd rounded border px-1 py-0.5 text-[11px]">http://localhost:3000</code>{' '}
                    하나만 넣어두고, 3단계에서 배포 주소가 나오면 그때 돌아와 추가하면 됩니다.
                  </>,
                  <>
                    등록을 마치면 <strong>내 애플리케이션</strong> 화면에{' '}
                    <strong>Client ID</strong> 와 <strong>Client Secret</strong> 이 보입니다. Secret 은
                    “보기” 를 눌러야 나옵니다.
                  </>,
                  <>
                    이 두 값이 <Env name="NAVER_CLIENT_ID" /> / <Env name="NAVER_CLIENT_SECRET" /> 입니다.
                  </>,
                ]}
              />
            </Step>

            <Step
              n="B"
              title="검색광고 API — 월간 검색량"
              desc="키워드의 월간 검색량과 경쟁정도에 씁니다. 광고를 집행하지 않아도 발급되고 조회도 무료입니다."
              badge={
                <Badge tone={keys.searchAd ? 'good' : 'default'}>{keys.searchAd ? '완료' : '필요'}</Badge>
              }
            >
              <Ol
                items={[
                  <>
                    <Ext href="https://searchad.naver.com">searchad.naver.com</Ext> 에서 가입합니다. 기존
                    네이버 아이디로 가입할 수 있고, <strong>사업자가 아니어도 개인으로 가입</strong> 됩니다.
                  </>,
                  <>
                    로그인하면 광고 시스템 화면이 나옵니다. 광고를 만들 필요는 없습니다 — 바로 우측 상단의{' '}
                    <strong>“도구”</strong> 메뉴를 엽니다.
                  </>,
                  <>
                    <strong>“API 사용 관리”</strong> (또는 “API 관리”) 를 누릅니다.
                  </>,
                  <>
                    <strong>“네이버 검색광고 API 라이선스”</strong> 영역에서{' '}
                    <strong>액세스라이선스 발급</strong> 을 누릅니다. 발급되면 두 값이 나옵니다:
                    <strong> 액세스라이선스</strong> 와 <strong>비밀키</strong>. 비밀키는 발급 시점에만 온전히
                    보이는 경우가 있으니 그 자리에서 복사해 두세요.
                  </>,
                  <>
                    같은 화면(또는 우측 상단 내 정보)에 <strong>고객 ID</strong> 라는 숫자가 있습니다. 이게
                    세 번째 값입니다.
                  </>,
                  <>
                    순서대로 <Env name="NAVER_AD_API_KEY" /> (액세스라이선스) ·{' '}
                    <Env name="NAVER_AD_SECRET" /> (비밀키) · <Env name="NAVER_AD_CUSTOMER_ID" /> (고객 ID)
                    입니다.
                  </>,
                ]}
              />
              <p className="muted mt-2.5 text-[11px] leading-relaxed">
                네이버가 화면 구성을 종종 바꿉니다. 메뉴 이름이 위와 다르면 “도구” 안에서 <strong>API</strong>
                가 들어간 항목을 찾으면 됩니다.
              </p>
            </Step>

            <Step
              n="C"
              title="내 컴퓨터에서 먼저 확인 (선택)"
              desc="배포 전에 키가 맞는지 여기서 확인해두면, 나중에 문제가 생겼을 때 원인을 좁히기 쉽습니다."
              badge={<CopyButton text={ENV_TEMPLATE} label=".env 내용 복사" />}
            >
              <p>
                프로젝트 폴더에 <code className="bd rounded border px-1 py-0.5 text-[11px]">.env.local</code>{' '}
                파일을 만들고 아래 내용을 붙여 값을 채운 뒤, 서버를 다시 시작하세요. 이 파일은 git 에 올라가지
                않도록 이미 제외돼 있습니다.
              </p>
              <pre className="bd scroll-x mt-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed">
                {ENV_TEMPLATE}
              </pre>
            </Step>
          </div>
        </Card>

        {/* ─────────── 2단계: Vercel 배포 ─────────── */}
        <Card
          title="2단계 · Vercel 에 올리기"
          subtitle="무료입니다. GitHub 저장소를 연결하면 알아서 빌드해서 주소를 하나 줍니다. 그 주소를 휴대폰에서 열면 끝입니다."
        >
          <div className="space-y-3">
            <Step n="1" title="Vercel 가입 후 기존 저장소 Import">
              <Ol
                items={[
                  <>
                    <Ext href="https://vercel.com/signup">vercel.com</Ext> 에서{' '}
                    <strong>Continue with GitHub</strong> 로 가입합니다. GitHub 계정으로 로그인하는 게 가장
                    간단합니다.
                  </>,
                  <>
                    대시보드에서 <strong>Add New…</strong> → <strong>Project</strong> 를 누릅니다.
                  </>,
                  <>
                    저장소 목록에서 <code className="bd rounded border px-1 py-0.5 text-[11px]">{REPO_NAME}</code>{' '}
                    를 찾아 <strong>Import</strong> 합니다. 목록에 안 보이면{' '}
                    <strong>Adjust GitHub App Permissions</strong> 로 이 저장소에 접근 권한을 주세요.
                  </>,
                  <>
                    <strong>복제(clone)가 아니라 Import 여야 합니다.</strong> “Private Repository Name” 을
                    입력하라는 화면이 나오면 복제 흐름이니, 아래{' '}
                    <strong>“Import a different Git Repository”</strong> 로 빠져나오세요.
                  </>,
                  <>
                    Framework 는 <strong>Next.js</strong> 로 자동 인식됩니다. 빌드 설정은 손대지 않습니다.
                  </>,
                ]}
              />
            </Step>

            <Step
              n="2"
              title="배포할 브랜치"
              desc="Vercel 은 기본적으로 main 브랜치를 배포합니다. 코드가 이미 main 에 있으니 손댈 것이 없습니다."
            >
              <p>
                나중에 다른 브랜치를 배포하고 싶어지면 Vercel 프로젝트의{' '}
                <strong>Settings → Git → Production Branch</strong> 에서 바꿀 수 있습니다.
              </p>
            </Step>

            <Step
              n="3"
              title="환경변수 넣고 Deploy"
              desc="1단계에서 받은 키를 여기에 붙입니다. 지금 비워두고 나중에 넣어도 됩니다."
            >
              <Ol
                items={[
                  <>
                    Import 화면의 <strong>Environment Variables</strong> 를 펼쳐 이름과 값을 하나씩 넣습니다.
                    이미 배포했다면 <strong>Settings → Environment Variables</strong> 에서 추가하면 됩니다.
                  </>,
                  <>
                    넣을 이름: <Env name="NAVER_CLIENT_ID" /> <Env name="NAVER_CLIENT_SECRET" />{' '}
                    <Env name="NAVER_AD_API_KEY" /> <Env name="NAVER_AD_SECRET" />{' '}
                    <Env name="NAVER_AD_CUSTOMER_ID" />
                  </>,
                  <>
                    <strong>AI 글쓰기(본문 자동 작성)를 쓰려면</strong> 이미 가지고 계신 AI 키 하나를
                    넣으면 됩니다. 넷 중 아무거나 되고, 이름만 맞춰 넣으면 앱이 알아서 그 회사 방식으로
                    부릅니다 — <Env name="ANTHROPIC_API_KEY" /> (Claude, 키가 sk-ant- 로 시작) ·{' '}
                    <Env name="OPENAI_API_KEY" /> (ChatGPT, sk- 또는 sk-proj-) ·{' '}
                    <Env name="GEMINI_API_KEY" /> (Google, AIza-) · <Env name="CLOVA_API_KEY" /> (네이버
                    클라우드 CLOVA Studio). 모델은 목록을 조회해 알아서 고르고, 특정 모델을 쓰려면{' '}
                    <Env name="AI_MODEL" /> 에 이름을 넣으세요. 키가 여러 개면{' '}
                    <Env name="AI_PROVIDER" /> 에 anthropic·openai·gemini·clova 중 하나를 적어 고를 수
                    있습니다. Groq·Together 같은 OpenAI 호환 서비스는{' '}
                    <Env name="OPENAI_BASE_URL" /> 까지 함께 넣으면 됩니다. 키가 없어도 앱의 다른 기능은
                    그대로 동작하고, 글 작성 화면의 「AI로 본문 쓰기」만 안내 문구를 띄웁니다.
                  </>,
                  <>
                    <strong>Deploy</strong> 를 누르고 1~2분 기다리면{' '}
                    <code className="bd rounded border px-1 py-0.5 text-[11px]">…vercel.app</code> 주소가
                    나옵니다. <strong>이 주소를 휴대폰에서 열면 됩니다.</strong> 홈 화면에 추가해두면 앱처럼
                    쓸 수 있습니다.
                  </>,
                  <>
                    환경변수를 <strong>나중에 추가·수정했다면 반드시 다시 배포</strong>하세요 (Deployments →
                    맨 위 항목의 ⋯ → Redeploy). 기존 배포에는 새 값이 적용되지 않습니다.
                  </>,
                  <>
                    마지막으로 1단계 A 로 돌아가 네이버 개발자센터의 웹 서비스 URL 에 이 배포 주소를
                    추가해두세요.
                  </>,
                ]}
              />
            </Step>
          </div>
        </Card>

        {/* ─────────── 3단계: 저장소 ─────────── */}
        <Card
          title="3단계 · 휴대폰·PC 기록 합치기 (저장소 연결)"
          subtitle="이걸 하지 않으면 배포한 앱은 작성한 글을 보관하지 못합니다. Vercel 은 파일 쓰기가 막혀 있어서, 기록을 남기려면 저장소가 따로 필요합니다."
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
              <strong className="font-bold">이 단계를 건너뛰면</strong> 배포한 앱에서 글을 저장해도 서버가
              쉬었다 깨어날 때 사라집니다. 대시보드에 빨간 경고가 뜨니 바로 알 수 있습니다. 조사·검수·가이드는
              저장이 필요 없어 그대로 잘 됩니다.
            </div>

            <Step
              n="1"
              title="Vercel 에서 Upstash Redis 연결 (가장 쉬움)"
              desc="무료 플랜으로 충분합니다. 연결하면 환경변수가 자동으로 들어가서 따로 붙여넣을 게 없습니다."
            >
              <Ol
                items={[
                  <>
                    Vercel 프로젝트 화면에서 <strong>Storage</strong> 탭을 엽니다.
                  </>,
                  <>
                    <strong>Create Database</strong> (또는 Marketplace) 에서 <strong>Upstash</strong> 의{' '}
                    <strong>Redis</strong> 를 고르고 무료 플랜으로 만듭니다.
                  </>,
                  <>
                    만든 다음 이 프로젝트에 <strong>Connect</strong> 합니다. <Env name="KV_REST_API_URL" /> ·{' '}
                    <Env name="KV_REST_API_TOKEN" /> 이 자동으로 추가됩니다 — 이 앱이 그 이름을 그대로
                    읽습니다.
                  </>,
                  <>
                    <strong>Redeploy</strong> 한 뒤 이 화면 맨 위 “지금 상태”가{' '}
                    <Badge tone="good">클라우드 저장</Badge> 으로 바뀌면 성공입니다.
                  </>,
                ]}
              />
            </Step>

            <Step
              n="2"
              title="또는 Upstash 에 직접 가입"
              desc="Vercel 마켓플레이스 화면이 달라 헤맬 때 쓰는 우회로입니다."
            >
              <Ol
                items={[
                  <>
                    <Ext href="https://console.upstash.com">console.upstash.com</Ext> 에서 가입하고{' '}
                    <strong>Create Database</strong> → Redis 를 만듭니다 (지역은 아무거나).
                  </>,
                  <>
                    데이터베이스 상세 화면의 <strong>REST API</strong> 항목에서{' '}
                    <strong>UPSTASH_REDIS_REST_URL</strong> 과 <strong>UPSTASH_REDIS_REST_TOKEN</strong> 을
                    복사합니다.
                  </>,
                  <>
                    Vercel <strong>Settings → Environment Variables</strong> 에{' '}
                    <Env name="UPSTASH_REDIS_REST_URL" /> · <Env name="UPSTASH_REDIS_REST_TOKEN" /> 이름
                    그대로 넣고 Redeploy 합니다.
                  </>,
                ]}
              />
            </Step>

            <BackupBox />
          </div>
        </Card>

        <Card title="문제가 생기면">
          <ul className="space-y-2.5 text-[12px] leading-relaxed">
            <li>
              <strong>숫자가 계속 샘플이라고 나옵니다</strong> — 환경변수를 넣은 뒤 Redeploy 를 안 했을
              가능성이 큽니다. 이름의 오타(<Env name="NAVER_CLIENT_ID" /> 등)도 확인하세요.
            </li>
            <li>
              <strong>검색량만 샘플입니다</strong> — 검색광고 API 쪽 세 값 중 하나가 빠졌거나 고객 ID 가
              다릅니다. 검색 API 와 검색광고 API 는 완전히 다른 자격증명입니다.
            </li>
            <li>
              <strong>
                “401 Scope Status Invalid” 또는 “errorCode 024” 가 보입니다
              </strong>{' '}
              — 키는 맞지만 애플리케이션에 <strong>검색 권한이 없는</strong> 상태입니다.{' '}
              <Ext href="https://developers.naver.com/apps/#/list">내 애플리케이션</Ext> → 해당 앱 →{' '}
              <strong>API 설정</strong> → <strong>사용 API</strong> 에 <strong>검색</strong> 을 추가하세요.
              추가 후 Vercel Redeploy 는 필요하지 않습니다 — 권한은 네이버 쪽 설정이라 바로 반영됩니다.
              <br />
              <strong>“신규로 등록할 수 없는 API가 선택되었습니다”</strong> 가 나오면 그 계정에서는 검색
              API 를 새로 받을 수 없는 것이니 더 시도하지 마세요. 대신 세 기능 모두 <strong>직접 입력</strong>
              으로 쓸 수 있게 해 뒀습니다 — 순위 추적은 본 순위를 입력, 상위노출 분석은 검색 결과를
              붙여넣기, 경쟁률은 자동입니다(발행량은 키 없이 조회합니다). 실제 화면 기준이라 API 보다
              정확합니다.
            </li>
            <li>
              <strong>저장한 글이 사라집니다</strong> — 3단계 저장소 연결이 안 된 상태입니다. 이 화면 맨 위
              “지금 상태”를 확인하세요.
            </li>
            <li>
              <strong>배포 주소에 옛 코드가 보입니다</strong> — Vercel 이 다른 브랜치를 배포하고 있습니다.
              2단계 2번을 확인하세요.
            </li>
            <li>
              <strong>휴대폰과 PC 기록이 다릅니다</strong> — 한쪽은 배포 주소, 다른 쪽은 localhost 를 보고
              있습니다. localhost 는 내 컴퓨터 저장소를 쓰므로 원래 별개입니다. 합치려면 위 백업 상자에서
              내보내기 → 가져오기 하세요.
            </li>
          </ul>
        </Card>

        <p className="muted px-1 text-[11px] leading-relaxed">
          검수 기준과 네이버 랭킹 로직은{' '}
          <Link href="/guide" className="underline">
            가이드
          </Link>{' '}
          에 정리되어 있습니다.
        </p>
      </div>
    </>
  )
}
