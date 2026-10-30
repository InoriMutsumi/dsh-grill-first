import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// 执行真实客户端组件，替换 React 渲染器与传输；不宣称真实浏览器验收。
function harness(failAt = 0) {
  const state: any[] = []
  let cursor = 0
  let component: any
  let revision = 'r0'
  let rows = [1, 3, 2].map(n => ({ id: String(n), text: `偏好${n}`, tags: [], source: 'user', enabled: true, updated: n }))
  const calls: any[] = []
  const React = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v: any) => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
    useRef: (initial: any) => { const i = cursor++; return state[i] ??= { current: initial } },
    useEffect: () => {},
  }
  const connection = { rpc: { call: async (_channel: string, endpoint: string, payload: any) => {
    expect(endpoint).toBe('mutate')
    expect(payload.mutation.revision).toBe(revision)
    calls.push(payload)
    if (failAt === calls.length) return { ok: false, error: { message: '模拟冲突', code: 'REVISION_CONFLICT' } }
    rows = rows.filter(p => payload.mutation.action !== 'delete' || p.id !== payload.mutation.id).map(p => p.id === payload.mutation.id ? { ...p, enabled: payload.mutation.enabled } : p)
    revision = `r${calls.length}`
    return { ok: true, value: { revision, preferences: rows } }
  } } }
  vm.runInNewContext(readFileSync(new URL('../client/index.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load: ({ factory }: any) => {
    factory(() => React).apply({ connection, slots: { inject: (_: any, cb: any) => cb(), register: (_: any, C: any) => { component = C } } })
  } } }, AbortController })
  const render = () => { cursor = 0; return component({ connection }) }
  render()
  state[4] = { revision, preferences: rows }
  function nodes(node: any): any[] { return node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : [] }
  const all = () => nodes(render())
  const button = (label: string) => all().find(n => n.type === 'button' && n.children.includes(label))
  return { state, calls, all, button }
}

describe('客户端偏好排序与批量操作', () => {
  it('按更新时间倒序；全选后逐条使用最新 revision 停用', async () => {
    const h = harness()
    expect(h.all().filter(n => n.props.className === 'gf-text').map(n => n.children[0])).toEqual(['偏好3', '偏好2', '偏好1'])
    h.all().find(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props['aria-label']).props.onChange({ target: { checked: true } })
    await h.button('批量停用').props.onClick()
    expect(h.calls.map(c => c.mutation.id)).toEqual(['3', '2', '1'])
    expect(h.state[4].preferences.every((p: any) => !p.enabled)).toBe(true)
  })
  it('搜索后只选当前结果，删除先确认', async () => {
    const h = harness()
    h.all().find(n => n.props.type === 'search').props.onChange({ target: { value: '偏好2' } })
    h.all().find(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props['aria-label']).props.onChange({ target: { checked: true } })
    h.button('批量删除').props.onClick()
    expect(h.calls).toHaveLength(0)
    await h.button('确认批量删除').props.onClick()
    expect(h.calls.map(c => c.mutation.id)).toEqual(['2'])
    expect(h.state[4].preferences).toHaveLength(2)
  })
  it('中途失败停止并保留剩余选择及已完成结果', async () => {
    const h = harness(2)
    h.all().find(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props['aria-label']).props.onChange({ target: { checked: true } })
    await h.button('批量停用').props.onClick()
    expect(h.calls).toHaveLength(2)
    expect(h.all().find(n => n.props.role === 'alert').children.join(' ')).toContain('1/3')
    expect(h.all().filter(n => n.props['aria-label']?.startsWith('选择偏好') && n.props.checked)).toHaveLength(2)
  })
})
