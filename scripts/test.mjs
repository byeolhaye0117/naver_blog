/**
 * 검수 로직 테스트 러너 (`npm test`).
 *
 * 테스트 프레임워크를 추가로 설치하지 않으려고, lib/ 를 tsc 로 임시 폴더에 CommonJS 로
 * 컴파일한 다음 checks.mjs 에서 불러온다 (complib.mjs). 그래서 새 의존성이 하나도 없다.
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { compileLib, repoRoot as root } from './complib.mjs'

const TARGETS = [
  'lib/types.ts',
  'lib/id.ts',
  'lib/naver/client.ts',
  'lib/naver/search.ts',
  'lib/naver/blogsection.ts',
  'lib/naver/place.ts',
  'lib/analysis/keyword.ts',
  'lib/analysis/synergy.ts',
  'lib/analysis/prescription.ts',
  'lib/ai/httperror.ts',
  'lib/analysis/cutline.ts',
  'lib/analysis/tokens.ts',
  'lib/analysis/indexcheck.ts',
  'lib/analysis/similarity.ts',
  'lib/analysis/shortlist.ts',
  'lib/analysis/factors.ts',
  'lib/analysis/agency.ts',
  'lib/analysis/content.ts',
  'lib/analysis/reviews.ts',
  'lib/writing/plainwords.ts',
  'lib/analysis/study.ts',
  'lib/analysis/intent.ts',
  'lib/analysis/title.ts',
  'lib/analysis/revise.ts',
  'lib/naver/reaction.ts',
  'lib/naver/speller.ts',
  'lib/naver/blogrss.ts',
  'lib/naver/unified.ts',
  'lib/naver/autocomplete.ts',
  'lib/analysis/blogscore.ts',
  'lib/analysis/diagnose.ts',
  'lib/naver/blogpost.ts',
  'lib/analysis/serp.ts',
  'lib/analysis/paste.ts',
  'lib/analysis/rank.ts',
  'lib/writing/banned.ts',
  'lib/writing/checker.ts',
  'lib/writing/evidence.ts',
  'lib/writing/templates.ts',
  'lib/writing/rotation.ts',
  // 요청 반영 검사 (2026-08-19)
  'lib/writing/request.ts',
  'lib/writing/next-action.ts',
  'lib/ai/llm.ts',
  'lib/ai/prompt.ts',
  'lib/writing/export.ts',
  'lib/naver/searchad.ts',
  'lib/naver/datalab.ts',
  'lib/naver/blogstat.ts',
  'lib/analysis/activity.ts',
  // 저장소 — mutate 오용 가드를 테스트한다 (2026-08-13)
  // 키워드 자리 판단 — 앱과 스크립트가 같은 함수를 쓴다 (2026-08-18)
  'lib/analysis/openings.ts',
  // 재는 루프 — 버튼과 크론이 같은 함수를 쓴다 (2026-08-19). 네이버 호출은 주입받는다
  'lib/analysis/openings-scan.ts',
  // 자리 회전 — 「굳은 자리」가 실제로는 주당 11편 갈리고 있었다 (2026-08-20)
  'lib/analysis/turnover.ts',
  // 상위 블로그와 블로그 단위 비교 — 발행 간격·글 유형·주제 집중도 (2026-08-20)
  'lib/analysis/peers.ts',
  // 경쟁 센 자리용 글쓰기 — 잰 발행량을 지시문·검수로 잇는다 (2026-08-20)
  'lib/writing/arena.ts',
  // 네이버 공지 최신화 — 분류·병합은 순수 함수 (2026-08-20)
  'lib/naver/notice.ts',
  // 매일 정보글 초안 — 「오늘 것이 있나」·「무엇을 쓸 차례인가」 (2026-08-21)
  'lib/writing/autodraft.ts',
  'lib/store.ts',
  'lib/seed/stores.ts',
]

let compiled
try {
  compiled = compileLib(TARGETS, 'nbm-test-')
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}

const run = spawnSync(process.execPath, [join(root, 'scripts/checks.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NBM_TEST_OUT: join(compiled.outDir, 'lib') },
})

compiled.cleanup()
process.exit(run.status ?? 1)
