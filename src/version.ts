/**
 * 插件版本号（从包根目录的 package.json 读）。
 *
 * 为什么要单独读文件而不是写死常量：DSH 加载的是 profile 里那份**安装拷贝**，
 * 改完源码后不重启就还是旧代码在跑（实测：配置改动热生效，包代码改动必须重启）。
 * 把版本号放进 `grill_start` 的返回里，就能一眼判断"运行中的到底是哪一版"。
 */
import { createRequire } from 'node:module'

/** 读不到的兜底版本号。 */
const FALLBACK = '0.0.0'

/** 当前插件版本，读取失败时返回 `0.0.0`。 */
export const PLUGIN_VERSION: string = (() => {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../package.json') as { version?: unknown }
    return typeof pkg.version === 'string' && pkg.version.trim() !== '' ? pkg.version : FALLBACK
  } catch {
    return FALLBACK
  }
})()
