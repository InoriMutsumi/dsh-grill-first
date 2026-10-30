# 插件验证约定

| 规则 | 由什么拦住 |
|---|---|
| 设置命名空间使用 Loader entry.options.id；不要用运行时 entry.id | src/index.ts 的最小结构类型不暴露 entry.id；test/settings.test.ts 使用不同的运行时 id 和配置 id 验证读写 |
| 界面改动交付时明确区分自动化测试、真实登录页面操作和截图证据 | npm test；真实页面浏览器验收；认证阻塞必须如实报告，禁止把 mock 或认证页作为成功验收 |
