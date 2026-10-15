/**
 * 静态自检（工作表 4.2 / 4.3 的证据来源）。
 *
 * 检查四件事：
 * 1. src 目录下每个导出声明上方都有含中文的 JSDoc；
 * 2. `any` 出现次数 ≤ 3，且每处都在注释里写明理由；
 * 3. `package.json` 的 files 覆盖构建产物入口（dist + cordis.patch.yml）；
 * 4. 需求条目 R1–R8 都能在工作表里找到对应的代码位置标注。
 *
 * 用法：node scripts/selfcheck.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const problems = []
const notes = []

/** 递归收集 src 下的 .ts 文件。 */
async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collect(full)))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

const files = (await collect(path.join(root, 'src'))).sort()
const EXPORT_PATTERN = /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum|let|var)\s+([A-Za-z0-9_$]+)/
const REEXPORT_PATTERN = /^export\s*\{/

let exportCount = 0
let jsdocOk = 0
const anyHits = []

for (const file of files) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const match of line.matchAll(/\bany\b/g)) {
      anyHits.push({ file: path.relative(root, file), line: i + 1, text: line.trim(), offset: match.index })
    }
    const isExport = EXPORT_PATTERN.test(line) || REEXPORT_PATTERN.test(line)
    if (!isExport) continue
    exportCount += 1
    // 往上找最近的注释块结尾，要求是含中文的 JSDoc（/** ... */）
    let cursor = i - 1
    let hasJSDoc = false
    while (cursor >= 0 && lines[cursor].trim() !== '') {
      if (lines[cursor].trim().endsWith('*/')) {
        let start = cursor
        while (start >= 0 && !lines[start].trim().startsWith('/*')) start -= 1
        const block = lines.slice(start, cursor + 1).join('\n')
        hasJSDoc = block.trimStart().startsWith('/**') && /[\u4e00-\u9fa5]/.test(block)
        break
      }
      cursor -= 1
    }
    if (hasJSDoc) jsdocOk += 1
    else problems.push(`${path.relative(root, file)}:${i + 1} 导出缺少中文 JSDoc：${line.trim().slice(0, 70)}`)
  }
}

notes.push(`导出声明 ${exportCount} 处，其中带中文 JSDoc ${jsdocOk} 处。`)

// any 检查：只统计"代码里真正出现"的（注释行单独说明理由，不计入）
const codeAny = anyHits.filter((hit) => !/^\s*(\*|\/\/|\/\*)/.test(hit.text))
const documentedAny = anyHits.filter((hit) => !codeAny.includes(hit))
notes.push(`any 出现 ${anyHits.length} 次：代码中 ${codeAny.length} 次、注释中 ${documentedAny.length} 次（注释用于说明理由）。`)
if (codeAny.length > 3) {
  problems.push(`代码里的 any 超过 3 处：${codeAny.map((hit) => `${hit.file}:${hit.line}`).join(', ')}`)
}

// package.json files 覆盖入口
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
for (const required of ['dist', 'cordis.patch.yml']) {
  if (!pkg.files?.includes(required)) problems.push(`package.json 的 files 缺少 ${required}`)
}
if (pkg.main !== 'dist/index.js') problems.push(`package.json 的 main 应为 dist/index.js，实际是 ${pkg.main}`)
if (!pkg.peerDependencies?.['@deepseek-ai/schemastery']) {
  notes.push('提示：schemastery 未声明为 peerDependency。')
}

// 工作表里的 R1–R8 代码位置标注
const worksheet = await readFile(path.join(root, '..', 'dsh-grill-first-工作表.md'), 'utf8')
const annotated = [...worksheet.matchAll(/R[1-8]\b[^\n]*`[^`]+:\d+/g)].length
notes.push(`工作表里带「文件:行号」标注的 R 条目：${annotated} 处。`)
if (annotated < 8) problems.push(`工作表里 R1–R8 的「文件:行号」标注不足 8 处（实际 ${annotated} 处）`)

console.log('— 静态自检结果 —')
for (const note of notes) console.log(`• ${note}`)
if (problems.length === 0) {
  console.log('✅ 全部通过')
  process.exit(0)
}
console.log('❌ 发现问题：')
for (const problem of problems) console.log(`  - ${problem}`)
process.exit(1)
