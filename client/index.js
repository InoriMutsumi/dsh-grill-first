/* Plain JS: React is supplied by the DSH module loader; no bundled second React. */
window.__ModuleLoader__.load({
  id: 'dsh-grill-first',
  factory(require) {
    const React = require('react')
    const { createElement: h, useState, useEffect, useRef } = React
    const channel = '/dsh-grill-first-settings'
    // 所有选择器只作用于此设置页；颜色跟随宿主继承色，不假定私有主题 token。
    const styles = `
      .gf-settings { --gf-line: var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 13%, transparent)); --gf-soft: var(--dsw-alias-bg-layer-1, color-mix(in srgb, currentColor 4%, transparent)); --gf-muted: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent)); width:100%; max-width:880px; margin:0 auto; padding:24px 20px 48px; color:inherit; font-size:14px; line-height:1.6; }
      .gf-settings, .gf-settings * { box-sizing:border-box; }
      .gf-settings h2,.gf-settings h3,.gf-settings p { margin:0; }
      .gf-settings h2 { font-size:26px; font-weight:700; letter-spacing:-.6px; }
      .gf-settings h3 { font-size:17px; font-weight:650; }
      .gf-settings .gf-subtitle,.gf-settings .gf-hint { color:var(--gf-muted); font-size:12px; }
      .gf-settings .gf-subtitle { margin-top:6px; font-size:13px; }
      .gf-settings .gf-card { border:1px solid var(--gf-line); border-radius:20px; margin-top:24px; padding:24px; background:var(--gf-soft); }
      .gf-settings .gf-heading,.gf-settings .gf-toolbar,.gf-settings .gf-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .gf-settings .gf-heading { justify-content:space-between; margin-bottom:20px; }
      .gf-settings .gf-toolbar { margin:18px 0; }
      .gf-settings .gf-field { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:13px 0; border-bottom:1px solid var(--gf-line); }
      .gf-settings .gf-field:last-child { border-bottom:0; }
      .gf-settings .gf-field-title { font-weight:500; }
      .gf-settings .gf-stacked { display:flex; flex-direction:column; gap:8px; margin-top:18px; }
      .gf-settings fieldset { min-width:0; border:0; padding:0; margin:0; }
      .gf-settings button,.gf-settings input,.gf-settings textarea,.gf-settings select { font:inherit; color:inherit; }
      .gf-settings .gf-button { appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--gf-line); border-radius:11px; background:transparent; padding:7px 13px; min-height:36px; cursor:pointer; font-size:12px; font-weight:550; transition:background .15s,border-color .15s; }
      .gf-settings .gf-button:hover:not(:disabled) { background:color-mix(in srgb,currentColor 9%,transparent); border-color:color-mix(in srgb,currentColor 28%,transparent); }
      .gf-settings .gf-primary { background:color-mix(in srgb,currentColor 12%,transparent); border-color:color-mix(in srgb,currentColor 24%,transparent); }
      .gf-settings .gf-quiet { border-color:transparent; }
      .gf-settings .gf-danger { color:var(--dsw-alias-state-error-primary, light-dark(#ab3131,#ffaaaa)); }
      .gf-settings :disabled { opacity:.48; cursor:not-allowed; }
      .gf-settings :is(button,input,textarea,select):focus-visible { outline:2px solid currentColor; outline-offset:3px; }
      .gf-settings .gf-input { appearance:none; min-width:0; max-width:100%; border:1px solid var(--gf-line); border-radius:11px; padding:9px 12px; background:transparent; outline-offset:3px; }
      .gf-settings select.gf-input { padding-right:32px; background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%); background-position:calc(100% - 16px) 50%,calc(100% - 12px) 50%; background-size:4px 4px; background-repeat:no-repeat; }
      .gf-settings select option { background:Canvas; color:CanvasText; }
      .gf-settings input[type=number] { width:84px; text-align:center; }
      .gf-settings textarea { width:100%; resize:vertical; min-height:100px; }
      .gf-settings .gf-switch { appearance:none; flex-shrink:0; width:38px; height:22px; border:1px solid var(--gf-line); border-radius:999px; background:color-mix(in srgb,currentColor 10%,transparent); position:relative; cursor:pointer; margin:0; }
      .gf-settings .gf-switch:before { content:''; position:absolute; width:14px; height:14px; left:3px; top:3px; border-radius:50%; background:currentColor; opacity:.5; transition:transform .15s; }
      .gf-settings .gf-switch:checked { background:color-mix(in srgb,currentColor 23%,transparent); }
      .gf-settings .gf-switch:checked:before { transform:translateX(16px); opacity:1; }
      .gf-settings .gf-segment { display:inline-flex; gap:4px; padding:4px; border:1px solid var(--gf-line); border-radius:14px; }
      .gf-settings .gf-segment .gf-button { border-color:transparent; min-width:86px; }
      .gf-settings .gf-segment [aria-pressed=true] { background:color-mix(in srgb,currentColor 12%,transparent); }
      .gf-settings .gf-search { flex:1; min-width:160px; }
      .gf-settings .gf-list { list-style:none; padding:0; margin:0; display:grid; gap:12px; }
      .gf-settings .gf-preference { border:1px solid var(--gf-line); border-radius:15px; padding:18px; background:var(--gf-soft); }
      .gf-settings .gf-preference[data-disabled=true] { border-style:dashed; }
      .gf-settings .gf-text { white-space:pre-wrap; overflow-wrap:anywhere; margin:12px 0 14px; }
      .gf-settings .gf-badge { display:inline-flex; border-radius:7px; padding:2px 7px; font-size:11px; background:color-mix(in srgb,currentColor 7%,transparent); overflow-wrap:anywhere; max-width:100%; }
      .gf-settings .gf-empty { padding:34px 18px; text-align:center; border:1px dashed var(--gf-line); border-radius:15px; }
      .gf-settings .gf-empty-mark { font-size:26px; margin-bottom:8px; opacity:.55; }
      .gf-settings .gf-empty .gf-hint { margin-top:6px; }
      .gf-settings .gf-editor { margin-top:16px; border:1px solid color-mix(in srgb,currentColor 25%,transparent); border-radius:16px; padding:20px; }
      .gf-settings .gf-editor legend { padding:0 6px; font-weight:600; }
      .gf-settings .gf-footer { display:flex; justify-content:flex-end; gap:8px; padding-top:20px; }
      .gf-settings .gf-feedback { margin-top:12px; border-radius:12px; padding:12px 14px; background:var(--gf-soft); font-size:12px; }
      .gf-settings .gf-status { min-height:22px; margin-top:8px; color:var(--gf-muted); font-size:12px; }
      @media(max-width:560px) { .gf-settings { padding:16px 10px 32px; } .gf-settings .gf-card { padding:16px; border-radius:16px; } .gf-settings .gf-field { gap:12px; } .gf-settings .gf-field select { max-width:55%; } .gf-settings .gf-search { flex-basis:100%; } }
      @media(prefers-reduced-motion:reduce) { .gf-settings * { transition:none!important; } }
    `
    const fields = [
      ['enabled', '启用需求澄清', 'boolean'],
      ['intensity', '澄清强度', [['gentle', '快速'], ['standard', '标准'], ['grill', '深入']]],
      ['gateMode', '门禁模式', [['off', '关闭'], ['warn', '提醒'], ['strict', '严格'], ['ask', '询问']]],
      ['maxRounds', '最多提问轮数', 10], ['maxQuestionsPerRound', '每轮最多问题数', 6],
      ['memoryEnabled', '启用偏好记忆', 'boolean'],
      ['memoryScope', '项目记忆存储范围', [['project', '项目'], ['global', '全局']]],
      ['researchMode', '调研模式', [['off', '关闭'], ['auto', '自动'], ['always', '始终']]],
      ['researchDepth', '调研深度', [['quick', '快速'], ['deep', '深入']]],
    ]
    async function rpc(connection, endpoint, payload, signal) {
      const result = await connection.rpc.call(channel, endpoint, payload, signal)
      if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code })
      return result.value
    }
    function SettingsPage({ connection }) {
      const [snapshot, setSnapshot] = useState(null)
      const [config, setConfig] = useState({})
      const [scope, setScope] = useState('global')
      const [workspaceId, setWorkspaceId] = useState('')
      const [preferences, setPreferences] = useState(null)
      const [editor, setEditor] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState('')
      const [refresh, setRefresh] = useState(0)
      const [query, setQuery] = useState('')
      const [deleteId, setDeleteId] = useState(null)
      const [selected, setSelected] = useState([])
      const [batchDelete, setBatchDelete] = useState(false)
      useEffect(() => { setSelected([]); setBatchDelete(false) }, [scope, workspaceId, refresh, query])
      const epoch = useRef(0)
      const mounted = useRef(true)
      const saving = useRef(false)
      const editorInput = useRef(null)
      const editorOpen = editor !== null
      const editorId = editor?.id
      useEffect(() => {
        if (!editorOpen) return
        editorInput.current?.focus({ preventScroll: true })
        editorInput.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      }, [editorOpen, editorId])
      useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++ } }, [])
      useEffect(() => {
        const abort = new AbortController()
        rpc(connection, 'read', {}, abort.signal).then(value => {
          if (abort.signal.aborted) return
          setSnapshot(value); setConfig(value.config)
          setWorkspaceId(old => value.workspaces.some(w => w.id === old) ? old : value.workspaces[0]?.id ?? '')
        }).catch(e => { if (!abort.signal.aborted) setError(e) })
        return () => abort.abort()
      }, [connection, refresh])
      useEffect(() => {
        const abort = new AbortController()
        const token = ++epoch.current
        setPreferences(null); setEditor(null); setDeleteId(null); setQuery('')
        if (scope === 'project' && !workspaceId) return () => abort.abort()
        rpc(connection, 'preferences', scope === 'global' ? { scope } : { scope, workspaceId }, abort.signal).then(value => {
          if (!abort.signal.aborted && token === epoch.current) setPreferences(value)
        }).catch(e => { if (!abort.signal.aborted && token === epoch.current) setError(e) })
        return () => abort.abort()
      }, [connection, scope, workspaceId, refresh])
      async function run(action) {
        if (saving.current) return
        saving.current = true; setBusy(true); setError(null); setNotice('')
        try { await action(); if (mounted.current) setNotice('已保存') }
        catch (e) { if (mounted.current) setError(e) }
        finally { saving.current = false; if (mounted.current) setBusy(false) }
      }
      function mutate(mutation) {
        if (!preferences) return
        const token = epoch.current
        return run(async () => {
          const payload = { scope, mutation: { ...mutation, revision: preferences.revision } }
          if (scope === 'project') payload.workspaceId = workspaceId
          const result = await rpc(connection, 'mutate', payload)
          if (mounted.current && token === epoch.current) { setPreferences(result); setEditor(null); setDeleteId(null) }
        })
      }
      function mutateSelected(action) {
        if (!preferences || editor) return
        const ids = new Set(selected)
        const targets = visible.filter(p => ids.has(p.id))
        const token = epoch.current
        return run(async () => {
          let current = preferences
          let completed = 0
          try {
            for (const item of targets) {
              const mutation = action === 'delete' ? { action, id: item.id } : { action: 'toggle', id: item.id, enabled: action === 'enable' }
              const payload = { scope, mutation: { ...mutation, revision: current.revision } }
              if (scope === 'project') payload.workspaceId = workspaceId
              current = await rpc(connection, 'mutate', payload)
              completed++
              if (!mounted.current || token !== epoch.current) return
              setPreferences(current)
              setSelected(ids => ids.filter(id => id !== item.id))
            }
          } catch (e) {
            throw Object.assign(new Error(`批量操作已完成 ${completed}/${targets.length} 条，剩余操作已停止：${e.message}`), { code: e.code })
          } finally {
            if (mounted.current) setBatchDelete(false)
          }
        })
      }
      const preferenceEditor = editor && h('form', { className: 'gf-editor', onSubmit: e => { e.preventDefault(); mutate({ action: editor.id ? 'update' : 'add', ...(editor.id ? { id: editor.id } : {}), text: editor.text, tags: editor.tags.split(',').map(s => s.trim()).filter(Boolean) }) } },
        h('fieldset', { disabled: busy }, h('legend', null, editor.id ? '编辑偏好' : '添加偏好'),
          h('label', { style: { display: 'block' } }, '偏好内容', h('textarea', { ref: editorInput, className: 'gf-input', required: true, maxLength: 2000, rows: 4, value: editor.text, onChange: e => setEditor(v => ({ ...v, text: e.target.value })) })),
          h('label', { className: 'gf-stacked' }, '标签（英文逗号分隔）', h('input', { className: 'gf-input', placeholder: '例如：写作, 代码', value: editor.tags, onChange: e => setEditor(v => ({ ...v, tags: e.target.value })) })),
          h('div', { className: 'gf-footer' }, h('button', { type: 'button', className: 'gf-button', disabled: busy, onClick: () => setEditor(null) }, '取消'), h('button', { className: 'gf-button gf-primary', type: 'submit' }, '保存偏好'))))
      const button = (label, click, disabled = false, variant = '') => h('button', { type: 'button', className: `gf-button ${variant}`, onClick: click, disabled: busy || disabled }, label)
      const fieldStyle = { display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0' }
      const search = query.trim().toLocaleLowerCase()
      const visible = (preferences?.preferences ?? []).filter(p => [p.text, p.source, ...p.tags].join(' ').toLocaleLowerCase().includes(search)).sort((a, b) => b.updated - a.updated)
      const selectedCount = visible.filter(p => selected.includes(p.id)).length
      const allSelected = visible.length > 0 && selectedCount === visible.length
      const empty = (title, detail) => h('div', { className: 'gf-empty' }, h('div', { className: 'gf-empty-mark', 'aria-hidden': true }, '◇'), h('p', null, title), h('p', { className: 'gf-hint' }, detail))
      return h('section', { className: 'gf-settings', 'aria-label': '需求澄清', 'aria-busy': busy },
        h('style', null, styles),
        h('h2', null, '需求澄清'),
        h('p', { className: 'gf-subtitle' }, '设置将应用于此插件实例。偏好管理由宿主所有者直接操作。'),
        error && h('div', { className: 'gf-feedback', role: 'alert' }, h('strong', null, error.code === 'REVISION_CONFLICT' ? '保存冲突：' : '操作失败：'), error.message,
          button('重新载入', () => { setError(null); setEditor(null); setRefresh(v => v + 1) })),
        h('div', { className: 'gf-status', role: 'status', 'aria-live': 'polite' }, busy ? '正在保存…' : notice),
        !snapshot ? empty(error ? '设置暂不可用' : '正在读取设置…', '读取完成后即可调整澄清方式。') : h('form', { className: 'gf-card', onSubmit: e => {
          e.preventDefault(); run(async () => {
            await rpc(connection, 'save', { patch: config, revision: snapshot.revision })
            const value = await rpc(connection, 'read', {})
            if (mounted.current) { setSnapshot(value); setConfig(value.config) }
          })
        } },
          h('div', { className: 'gf-heading' }, h('div', null, h('h3', null, '澄清方式'), h('p', { className: 'gf-hint' }, '调整提问节奏、记忆与调研习惯'))),
          h('fieldset', { disabled: busy }, fields.map(([key, label, kind]) => h('label', { key, className: 'gf-field' },
            h('span', null, label), Array.isArray(kind)
              ? h('select', { className: 'gf-input', value: config[key] ?? '', required: true, onChange: e => setConfig(v => ({ ...v, [key]: e.target.value })) }, kind.map(([value, title]) => h('option', { key: value, value }, title)))
              : h('input', { className: kind === 'boolean' ? 'gf-switch' : 'gf-input', role: kind === 'boolean' ? 'switch' : undefined, type: kind === 'boolean' ? 'checkbox' : 'number', ...(kind === 'boolean' ? { checked: Boolean(config[key]) } : { min: 1, max: kind, step: 1, required: true, value: config[key] ?? '' }), onChange: e => setConfig(v => ({ ...v, [key]: kind === 'boolean' ? e.target.checked : Number(e.target.value) })) })
          )), h('label', { className: 'gf-stacked' }, '跳过词（每行一个）', h('textarea', { className: 'gf-input',
            rows: 4, required: true, value: (config.bypassKeywords ?? []).join('\n'),
            onChange: e => setConfig(v => ({ ...v, bypassKeywords: e.target.value.split('\n') })),
          })), h('div', { className: 'gf-footer' }, h('button', { className: 'gf-button gf-primary', type: 'submit' }, '保存设置')))),
        h('div', { className: 'gf-card' },
        h('div', { className: 'gf-heading' }, h('div', null, h('h3', null, '偏好管理'), h('p', { className: 'gf-hint' }, '把常用要求留在这里，让每次协作更合心意。')), button('＋ 添加偏好', () => { setDeleteId(null); setEditor({ text: '', tags: '', id: null }) }, Boolean(editor) || !preferences, 'gf-primary')),
        preferenceEditor,
        h('div', { className: 'gf-segment', role: 'group', 'aria-label': '偏好范围' }, [['global', '全局偏好'], ['project', '项目偏好']].map(([value, label]) => h('button', { key: value, type: 'button', className: 'gf-button', 'aria-pressed': scope === value, disabled: busy, onClick: () => { setError(null); setNotice(''); setScope(value) } }, label))),
        h('p', { className: 'gf-subtitle' }, scope === 'global' ? '适用于所有项目的通用习惯。' : '仅在所选工作区中使用的项目约定。'),
        scope === 'project' && h('label', { style: fieldStyle }, '已登记工作区', h('select', { className: 'gf-input', value: workspaceId, disabled: busy, onChange: e => { setError(null); setWorkspaceId(e.target.value) } }, h('option', { value: '' }, '请选择工作区'), (snapshot?.workspaces ?? []).map(w => h('option', { key: w.id, value: w.id }, w.title || w.id)))),
        h('div', { className: 'gf-toolbar' }, h('input', { className: 'gf-input gf-search', type: 'search', 'aria-label': '搜索偏好内容、标签或来源', placeholder: '搜索偏好、标签或来源…', value: query, disabled: busy, onChange: e => { setSelected([]); setBatchDelete(false); setQuery(e.target.value) } }), h('span', { className: 'gf-hint', role: 'status' }, preferences ? `${visible.length} / ${preferences.preferences.length} 条` : '')),
        h('div', { className: 'gf-toolbar' },
          h('label', null, h('input', { type: 'checkbox', checked: allSelected, disabled: busy || Boolean(editor) || !visible.length, onChange: e => { setSelected(e.target.checked ? visible.map(p => p.id) : []); setBatchDelete(false) } }), ' 全选当前结果'),
          h('span', { className: 'gf-hint' }, `已选 ${selectedCount} 条 · 更新时间从新到旧`),
          button('批量启用', () => mutateSelected('enable'), !selectedCount || Boolean(editor)),
          button('批量停用', () => mutateSelected('disable'), !selectedCount || Boolean(editor)),
          button('批量删除', () => setBatchDelete(true), !selectedCount || Boolean(editor), 'gf-danger')),
        batchDelete && h('div', { className: 'gf-feedback', role: 'group', 'aria-label': '确认批量删除' },
          h('p', null, `确定删除当前结果中选中的 ${selectedCount} 条偏好？此操作不能撤销。`),
          button('确认批量删除', () => mutateSelected('delete'), !selectedCount || Boolean(editor), 'gf-danger'),
          button('取消删除', () => setBatchDelete(false))),
        scope === 'project' && !workspaceId ? empty('尚未选择工作区', '请先在宿主中登记工作区，再在上方选择。') : !preferences ? empty(error ? '偏好暂不可用' : '正在读取偏好…', '偏好会保存在所选范围内。') : visible.length === 0 ? empty(search ? '没有匹配的偏好' : '还没有偏好', search ? '换个关键词，或清空搜索查看全部。' : '点击“添加偏好”，记下你的第一条习惯。') : h('ul', { className: 'gf-list' }, visible.map(p => h('li', { key: p.id, className: 'gf-preference', 'data-disabled': !p.enabled },
          h('div', { className: 'gf-actions' }, h('input', { type: 'checkbox', 'aria-label': `选择偏好：${p.text}`, checked: selected.includes(p.id), disabled: busy || Boolean(editor), onChange: e => { const checked = e.target.checked; setSelected(ids => checked ? [...new Set([...ids, p.id])] : ids.filter(id => id !== p.id)); setBatchDelete(false) } }), h('span', { className: 'gf-hint' }, new Date(p.updated).toLocaleString()), h('span', { className: 'gf-badge' }, p.enabled ? '已启用' : '已停用'), h('span', { className: 'gf-hint' }, `来源：${p.source}`)),
          h('div', { className: 'gf-text' }, p.text),
          p.tags.length > 0 && h('div', { className: 'gf-actions', style: { marginBottom: 12 } }, p.tags.map((tag, i) => h('span', { className: 'gf-badge', key: `${tag}-${i}` }, tag))),
          h('div', { className: 'gf-actions' },
            button('编辑', () => { setDeleteId(null); setEditor({ id: p.id, text: p.text, tags: p.tags.join(', ') }) }, Boolean(editor), 'gf-quiet'),
            button(p.enabled ? '停用' : '启用', () => mutate({ action: 'toggle', id: p.id, enabled: !p.enabled }), Boolean(editor), 'gf-quiet'),
            button('删除', () => setDeleteId(p.id), Boolean(editor), 'gf-quiet gf-danger')),
          deleteId === p.id && h('div', { className: 'gf-feedback', role: 'group', 'aria-label': '确认删除偏好' }, h('p', null, '确定删除这条偏好？此操作不能撤销。'), h('div', { className: 'gf-actions' }, button('确认删除', () => mutate({ action: 'delete', id: p.id }), false, 'gf-danger'), button('保留', () => setDeleteId(null))))))),
        null)
      )
    }
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'grill-first', label: '需求澄清', order: 30,
        inject: () => ({ connection: ctx.connection }),
      }, SettingsPage))
    }
    return { inject: ['slots', 'connection'], apply }
  },
})
