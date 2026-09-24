const STATUS_PATH = '/dsh-enterprise-auth/status'
const LOGIN_PATH = '/dsh-enterprise-auth/login'
const LOGOUT_PATH = '/dsh-enterprise-auth/logout'
const TOKEN_PATH = '/dsh-enterprise-auth/token'
const MANAGEMENT_API = process.env.DSH_MANAGEMENT_API || 'http://10.56.0.242:8080'
const IDENTITY_API = process.env.DSH_IDENTITY_API || 'http://10.56.0.190:7263'
const MODEL_REFRESH_INTERVAL_MS = 15_000
import { EnterpriseLlmAdapter, PROVIDER } from './enterprise-llm.js'
import { createSecureStore } from './secure-store.js'

function json(res, status, payload) {
  res.statusCode = status
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function suggestedUsername() {
  return process.env.USERNAME || process.env.USER || ''
}

function normalizeDesktopUser(user) {
  const displayName = String(user?.displayName ?? user?.display_name ?? user?.sAMAccountName ?? user?.account ?? '').trim()
  return displayName ? { ...user, displayName } : user
}

function modelCatalogSignature(models) {
  return JSON.stringify((models || []).map(model => [model.id, model.name || model.id]).sort((left, right) => left[0].localeCompare(right[0])))
}

function readJson(req) {
  if (typeof req.on !== 'function') return Promise.resolve({})
  return new Promise((resolve, reject) => {
    let value = ''
    req.on('data', chunk => { value += chunk })
    req.on('end', () => { try { resolve(value ? JSON.parse(value) : {}) } catch (error) { reject(error) } })
    req.on('error', reject)
  })
}

export const name = 'dsh-enterprise-auth'

export function apply(ctx) {
  let session = null
  let enterpriseModels = []
  let llmRegistration = null
  let modelRefreshTimer = null
  const secureStore = createSecureStore()
  let restorePromise
  ctx.inject(['webServer', 'llm'], (host) => {
    const llm = host.llm
    const adapter = new EnterpriseLlmAdapter(() => enterpriseModels, {
      request: ({ model, payload, signal }) => {
        if (!session?.accessToken) throw new Error('not_authenticated')
        return fetch(`${MANAGEMENT_API}/api/desktop/models/${encodeURIComponent(model.id)}/chat`, {
          method: 'POST',
          headers: { accept: 'text/event-stream', 'content-type': 'application/json', authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify(payload),
          signal,
        })
      },
    })
    const updateLlmRegistration = (catalogChanged = false) => {
      if (session?.accessToken && enterpriseModels.length > 0) {
        if (!llmRegistration) {
          llmRegistration = llm.registerAdapter([PROVIDER], adapter)
        } else if (catalogChanged && typeof llmRegistration.replace === 'function') {
          llmRegistration.replace([PROVIDER])
        }
        return
      }
      if (llmRegistration) { llmRegistration(); llmRegistration = null }
    }
    const loadModels = async () => {
      if (!session?.accessToken) { enterpriseModels = []; updateLlmRegistration(); return }
      const response = await fetch(`${MANAGEMENT_API}/api/desktop/models`, { headers: { authorization: `Bearer ${session.accessToken}` } })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `model catalog unavailable (${response.status})`)
      const nextModels = Array.isArray(payload.models) ? payload.models : []
      const catalogChanged = modelCatalogSignature(enterpriseModels) !== modelCatalogSignature(nextModels)
      enterpriseModels = nextModels
      updateLlmRegistration(catalogChanged)
    }
    const stopModelRefresh = () => {
      if (modelRefreshTimer) clearInterval(modelRefreshTimer)
      modelRefreshTimer = null
    }
    const startModelRefresh = () => {
      stopModelRefresh()
      modelRefreshTimer = setInterval(() => loadModels().catch(() => {}), MODEL_REFRESH_INTERVAL_MS)
      modelRefreshTimer.unref?.()
    }
    const restoreSession = async () => {
      if (restorePromise) return restorePromise
      restorePromise = (async () => {
        const stored = await secureStore.get()
        if (!stored) return
        try { session = JSON.parse(stored) } catch { await secureStore.delete(); session = null; return }
        const response = await fetch(`${MANAGEMENT_API}/api/desktop/auth/me`, { headers: { authorization: `Bearer ${session.accessToken}` } })
        if (!response.ok) { await secureStore.delete(); session = null; return }
        const user = await response.json()
        session.user = normalizeDesktopUser({ ...session.user, ...user })
        await loadModels()
        startModelRefresh()
      })().catch(() => { stopModelRefresh(); session = null; enterpriseModels = []; updateLlmRegistration() })
      return restorePromise
    }
    const disposers = []
    disposers.push(host.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: async (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
    await restoreSession()
    json(res, 200, session ? { authenticated: true, user: session.user } : { authenticated: false, suggestedUsername: suggestedUsername() })
  } }))
    disposers.push(host.webServer.register({ kind: 'exact', path: LOGIN_PATH, handler: (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    return readJson(req).then(credentials => fetch(`${IDENTITY_API}/api/Login/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: credentials.username, password: credentials.password }) }))
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
        if (String(payload.status).toLowerCase() !== 'success' || !payload.token) throw new Error('账号或密码错误')
        return payload
      })
      .then(async payload => {
        session = {
          accessToken: payload.token,
          user: normalizeDesktopUser({
            account: payload.userName,
            sAMAccountName: payload.userName,
            display_name: payload.cnName,
            employee_no: payload.workId,
            department: payload.department,
            role: payload.role,
          }),
        }
        await secureStore.set(JSON.stringify(session))
        await loadModels()
        startModelRefresh()
        json(res, 200, { authenticated: true, user: session.user })
      })
      .catch(error => json(res, 502, { error: error instanceof Error ? error.message : 'authentication backend unavailable' }))
  } }))
    disposers.push(host.webServer.register({ kind: 'exact', path: LOGOUT_PATH, handler: async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    stopModelRefresh()
    session = null
    enterpriseModels = []
    updateLlmRegistration()
    await secureStore.delete()
    json(res, 200, { authenticated: false })
  } }))
    disposers.push(host.webServer.register({ kind: 'exact', path: TOKEN_PATH, handler: async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
      await restoreSession()
      if (!session?.accessToken) return json(res, 401, { error: 'not_authenticated' })
      json(res, 200, { access_token: session.accessToken, token_type: 'Bearer' })
    } }))
    disposers.push(host.webServer.register({ kind: 'exact', path: '/dsh-enterprise-auth/models', handler: async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
      await restoreSession()
      if (!session?.accessToken) return json(res, 401, { error: 'not_authenticated' })
      try {
        const response = await fetch(`${MANAGEMENT_API}/api/desktop/models`, { headers: { authorization: `Bearer ${session.accessToken}` } })
        const payload = await response.json()
        return json(res, response.status, payload)
      } catch { return json(res, 502, { error: 'enterprise backend unavailable' }) }
    } }))
    return () => { stopModelRefresh(); disposers.forEach(dispose => dispose()) }
  })
}
