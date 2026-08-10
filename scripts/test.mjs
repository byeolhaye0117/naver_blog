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
  'lib/writing/next-action.ts',
  'lib/ai/llm.ts',
  'lib/ai/prompt.ts',
  'lib/writing/export.ts',
  'lib/naver/searchad.ts',
  'lib/naver/datalab.ts',
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
