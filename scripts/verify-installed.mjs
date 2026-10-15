/**
 * 校验"已安装到 DSH profile 的那份产物"与本地构建产物完全一致，且没有损坏。
 *
 * 为什么需要：DSH 重启后加载的是 profile 里那一份拷贝，而不是工作目录里的源码。
 * 本地文件依赖换内容时必须换路径（本机实测踩过 `ambiguous-install`），所以装完必须比对。
 *
 * 用法：node scripts/verify-installed.mjs [已安装目录]
 *   默认：C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-grill-first
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const LOCAL = path.resolve(import.meta.dirname, '..')
const INSTALLED = process.argv[2] ?? 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\dsh-grill-first'

let failed = 0
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]' : '[FAIL]'} ${label}${detail ? ` -> ${detail}` : ''}`)
}

/** 递归列出相对路径。 */
async function walk(dir, prefix = '') {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)))
    else out.push(rel)
  }
  return out
}

/** 文件内容的 sha256。 */
async function hash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

console.log(`已安装目录：${INSTALLED}\n`)
check('已安装目录存在', existsSync(INSTALLED))
if (!existsSync(INSTALLED)) process.exit(1)

// 1) package.json 的入口与补丁路径指向真实存在的文件
const pkg = JSON.parse(await readFile(path.join(INSTALLED, 'package.json'), 'utf8'))
check('package.json 名称/版本一致', pkg.name === 'dsh-grill-first' && pkg.version === '0.1.0', `${pkg.name}@${pkg.version}`)
check('icon 字段存在且文件存在', pkg.icon === './icon.png' && existsSync(path.join(INSTALLED, 'icon.png')))
const mainFile = path.join(INSTALLED, pkg.main ?? '')
check('main 指向的文件存在', existsSync(mainFile), pkg.main)
const patchFile = path.join(INSTALLED, pkg.dsh?.bundle?.patch ?? '')
check('bundle patch 文件存在', existsSync(patchFile), pkg.dsh?.bundle?.patch)
const patchBody = await readFile(patchFile, 'utf8')
check('patch 里声明了正确的插件 id/name', patchBody.includes('dsh-grill-first'))

// 2) dist 与本地构建产物逐文件比对（内容必须一致）
const localDist = await walk(path.join(LOCAL, 'dist'))
const installedDist = await walk(path.join(INSTALLED, 'dist'))
check('dist 文件数一致', localDist.length === installedDist.length, `本地 ${localDist.length} / 已安装 ${installedDist.length}`)
const mismatched = []
for (const rel of localDist) {
  const a = path.join(LOCAL, 'dist', rel)
  const b = path.join(INSTALLED, 'dist', rel)
  if (!existsSync(b)) {
    mismatched.push(`${rel}(缺失)`)
    continue
  }
  if ((await hash(a)) !== (await hash(b))) mismatched.push(`${rel}(内容不同)`)
}
check('dist 每个文件都与本地一致', mismatched.length === 0, mismatched.slice(0, 5).join(', '))

// 3) 顶层随包文件比对
for (const rel of ['package.json', 'cordis.patch.yml', 'icon.png', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
  const a = path.join(LOCAL, rel)
  const b = path.join(INSTALLED, rel)
  if (!existsSync(a)) continue
  check(`${rel} 与本地一致`, existsSync(b) && (await hash(a)) === (await hash(b)))
}

// 4) 每个 .js 过一遍语法检查（防止打包截断）
const jsFiles = installedDist.filter((rel) => rel.endsWith('.js'))
let syntaxBad = 0
for (const rel of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', path.join(INSTALLED, 'dist', rel)], { stdio: 'pipe' })
  } catch (error) {
    syntaxBad += 1
    console.log(`      语法错误：${rel} ${String(error.stderr ?? error).slice(0, 120)}`)
  }
}
check(`${jsFiles.length} 个已安装 .js 通过语法检查`, syntaxBad === 0)

// 5) 体积兜底：确认不是 0 字节
const sizes = await Promise.all(jsFiles.map((rel) => stat(path.join(INSTALLED, 'dist', rel))))
check('没有 0 字节文件', sizes.every((s) => s.size > 0))

console.log(failed === 0 ? '\n结论：已安装产物与本地一致、可加载。' : `\n结论：有 ${failed} 项未通过。`)
process.exit(failed === 0 ? 0 : 1)
