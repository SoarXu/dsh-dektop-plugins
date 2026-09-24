window.__ModuleLoader__.load({
  id: 'dsh-enterprise-auth',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const { Button, IconUserOutline16, Input, Modal } = require('@deepseek-ai/dsh-client-ui-primitives')
    const STATUS_PATH = '/dsh-enterprise-auth/status'

    async function request(path, method = 'GET', body) {
      const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
      return payload
    }

    function Account({ wide }) {
      const [state, setState] = React.useState({ authenticated: false })
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [open, setOpen] = React.useState(false)
      const [username, setUsername] = React.useState('')
      const [password, setPassword] = React.useState('')
      React.useEffect(() => {
        let active = true
        request(STATUS_PATH).then(value => {
          if (!active) return
          setState(value)
          setUsername(current => current || value.suggestedUsername || '')
        }).catch(() => {})
        return () => { active = false }
      }, [])
      const login = async (event) => {
        event?.preventDefault()
        setBusy(true)
        setError('')
        try { setState(await request('/dsh-enterprise-auth/login', 'POST', { username, password })); setPassword(''); setOpen(false) }
        catch { setError('账号或密码错误') }
        finally { setBusy(false) }
      }
      const logout = async () => {
        setBusy(true)
        setError('')
        try { setState(await request('/dsh-enterprise-auth/logout', 'POST')) }
        catch { setError('退出失败') }
        finally { setBusy(false) }
      }
      const displayName = state.user?.displayName || state.user?.sAMAccountName || '用户'
      const closeLogin = () => {
        if (busy) return
        setOpen(false)
        setPassword('')
        setError('')
      }
      const userIcon = React.createElement(IconUserOutline16, { size: 16 })
      const compact = state.authenticated
        ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: wide ? '8px 12px' : '8px', width: '100%', boxSizing: 'border-box' } },
          React.createElement('div', { title: displayName, style: { display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 8, minWidth: 0, flex: 1, color: error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-primary)' } },
            userIcon,
            wide && React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, lineHeight: '22px' } }, displayName)
          ),
          wide && React.createElement(Button, { size: 'sm', variant: 'ghost', disabled: busy, onClick: logout, title: '退出登录' }, busy ? '退出中...' : '退出')
        )
        : React.createElement('div', { style: { padding: wide ? '8px 12px' : '8px', width: '100%', boxSizing: 'border-box' } },
          React.createElement(Button, {
            variant: 'outline',
            icon: userIcon,
            disabled: busy,
            onClick: () => { setError(''); setOpen(true) },
            title: '登录',
            'aria-label': '登录',
            style: { width: wide ? '100%' : 36, padding: wide ? undefined : 0 }
          }, wide ? '登录' : null)
        )
      return React.createElement(React.Fragment, null,
        compact,
        React.createElement(Modal, {
          open,
          onClose: closeLogin,
          title: '登录',
          closeLabel: '关闭登录窗口',
          footer: React.createElement(React.Fragment, null,
            React.createElement(Button, { variant: 'outline', disabled: busy, onClick: closeLogin }, '取消'),
            React.createElement(Button, { variant: 'primary', type: 'submit', form: 'enterprise-login-form', disabled: busy || !username.trim() || !password }, busy ? '登录中...' : '登录')
          )
        },
        React.createElement('form', { id: 'enterprise-login-form', onSubmit: login, style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          React.createElement(Input, { value: username, onChange: event => setUsername(event.target.value), placeholder: '账号', 'aria-label': '账号', autoComplete: 'username', disabled: busy, autoFocus: true }),
          React.createElement(Input, { value: password, onChange: event => setPassword(event.target.value), placeholder: '密码', 'aria-label': '密码', type: 'password', autoComplete: 'current-password', disabled: busy }),
          error && React.createElement('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, lineHeight: '18px' } }, error)
        ))
      )
    }

    module.exports = {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'dsh-enterprise-auth', order: 100 }, Account
        ))
      }
    }
    return module.exports
  }
})
