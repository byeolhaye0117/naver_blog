/**
 * lib/ 를 CommonJS 로 임시 컴파일해서 `.mjs` 스크립트에서 require 할 수 있게 만든다.
 *
 * 테스트 러너(test.mjs)와 상위노출 조사(study.mjs)가 같은 방식을 쓴다 — 둘 다
 * 「앱이 실제로 쓰는 함수」로 재야 하기 때문이다. 검수는 A 로 세고 조사는 B 로 세면
 * 기준이 조용히 어긋난다.
 *
 * 새 의존성은 하나도 없다 (tsc 는 이미 devDependency).
 *
 * lib/ 안의 런타임 import 는 모두 상대경로여야 한다(`@/` 별칭은 tsc 출력에서 해석되지
 * 않음). 타입만 가져오는 `import type ... from '@/lib/types'` 는 컴파일에서 지워진다.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * @param {string[]} targets 저장소 기준 상대경로 (예: 'lib/analysis/content.ts')
 * @param {string} [label] 임시 폴더 이름 접두사
 * @returns {{ outDir: string, cleanup: () => void }} outDir 안에 `lib/...js` 가 생긴다
 */
export function compileLib(targets, label = 'nbm-lib-') {
  const out = mkdtempSync(join(tmpdir(), label))
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
        typeRoots: [join(repoRoot, 'node_modules/@types')],
        types: ['node'],
        outDir: out,
        rootDir: repoRoot,
        baseUrl: repoRoot,
        paths: { '@/*': ['./*'] },
      },
      files: targets.map((t) => join(repoRoot, t)),
    })
  )

  const tsc = spawnSync('npx', ['tsc', '-p', tsconfig], { cwd: repoRoot, encoding: 'utf8' })
  if (tsc.status !== 0) {
    rmSync(out, { recursive: true, force: true })
    throw new Error('컴파일 실패:\n' + (tsc.stdout || '') + (tsc.stderr || ''))
  }

  return { outDir: out, cleanup: () => rmSync(out, { recursive: true, force: true }) }
}
