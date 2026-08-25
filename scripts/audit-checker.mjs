/**
 * **검수 점수가 진짜인지 재본다** (2026-08-24 회원 질문).
 *
 * "매일 새벽 정보성 글이 작성되고 패키지 보면 점수는 높은데 실제도 잘 점검되서 그렇게
 * 나오는건지도 확인해줘."
 *
 * 좋은 질문이다. 점수가 높은 데는 두 가지 이유가 있을 수 있다:
 *   ① 글이 실제로 기준을 맞췄다
 *   ② **검수가 무르다** — 항목이 사실상 항상 통과하거나, 걸려도 점수를 안 깎는다
 *
 * ②를 가려내는 방법은 **일부러 망가뜨려 보는 것**이다. 잘 나온 글을 하나 가져다가 항목
 * 하나씩 깨뜨렸을 때 점수가 떨어지지 않으면, 그 항목은 점수에 아무 일도 하지 않는 것이다.
 *
 * 이 파일은 테스트가 아니다 (npm test 에 들어가지 않는다). 물어볼 때 돌려 보는 검사다:
 *   node scripts/audit-checker.mjs
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { compileLib, repoRoot as root } from './complib.mjs'

// 검수기 하나만 필요하지만, 딸린 것들이 있어 테스트와 같은 목록을 그대로 쓴다
import { readFileSync } from 'node:fs'
const TARGETS = [...readFileSync(join(root, 'scripts/test.mjs'), 'utf8').matchAll(/'(lib\/[^']+\.ts)'/g)].map((m) => m[1])

const compiled = compileLib(TARGETS, 'nbm-audit-')
const run = spawnSync(process.execPath, [join(root, 'scripts/audit-run.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NBM_TEST_OUT: join(compiled.outDir, 'lib') },
})
process.exit(run.status ?? 1)
