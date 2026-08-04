/**
 * 검수 로직 테스트 러너 (`npm test`).
 *
 * 테스트 프레임워크를 추가로 설치하지 않으려고, lib/ 를 tsc 로 임시 폴더에 CommonJS 로
 * 컴파일한 다음 checks.mjs 에서 불러온다. 그래서 새 의존성이 하나도 없다.
 *
 * lib/ 안의 런타임 import 는 모두 상대경로여야 한다(`@/` 별칭은 tsc 출력에서 해석되지 않음).
 * 타입만 가져오는 `import type ... from '@/lib/types'` 는 컴파일에서 지워지므로 괜찮다.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = mkdtempSync(join(tmpdir(), 'nbm-test-'))

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
  'lib/analysis/cutline.ts',
  'lib/analysis/diagnose.ts',
  'lib/naver/blogpost.ts',
  'lib/analysis/serp.ts',
  'lib/analysis/paste.ts',
  'lib/analysis/rank.ts',
  'lib/writing/banned.ts',
  'lib/writing/checker.ts',
  'lib/writing/templates.ts',
  'lib/writing/rotation.ts',
  'lib/writing/next-action.ts',
  'lib/ai/llm.ts',
  'lib/ai/prompt.ts',
  'lib/writing/export.ts',
  'lib/naver/searchad.ts',
  'lib/naver/datalab.ts',
]

const tsconfig = join(out, 'tsconfig.json')
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'CommonJS',
      moduleResolution: 'node',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      // tsconfig 가 임시 폴더에 있으므로 타입 위치를 절대경로로 알려준다
      typeRoots: [join(root, 'node_modules/@types')],
      types: ['node'],
      outDir: out,
      rootDir: root,
      baseUrl: root,
      paths: { '@/*': ['./*'] },
    },
    files: TARGETS.map((t) => join(root, t)),
  })
)

const tsc = spawnSync('npx', ['tsc', '-p', tsconfig], { cwd: root, encoding: 'utf8' })
if (tsc.status !== 0) {
  console.error('컴파일 실패:\n' + (tsc.stdout || '') + (tsc.stderr || ''))
  rmSync(out, { recursive: true, force: true })
  process.exit(1)
}

const run = spawnSync(process.execPath, [join(root, 'scripts/checks.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NBM_TEST_OUT: join(out, 'lib') },
})

rmSync(out, { recursive: true, force: true })
process.exit(run.status ?? 1)
