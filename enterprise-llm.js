const PROVIDER = 'intbio-enterprise'

function asModel(value) {
  if (!value || typeof value.id !== 'string' || !value.id) return null
  const model = {
    id: value.id,
    name: typeof value.name === 'string' && value.name ? value.name : value.id,
    provider: typeof value.provider === 'string' && value.provider ? value.provider : PROVIDER,
    api: value.api || 'openai-completions',
    ...Number.isInteger(value.contextWindow) ? { contextWindow: value.contextWindow } : {},
    ...Number.isInteger(value.maxTokens) ? { maxTokens: value.maxTokens } : {}
  }
  if (typeof value.baseURL === 'string' && value.baseURL) model.baseURL = value.baseURL.replace(/\/$/, '')
  if (typeof value.apiKey === 'string' && value.apiKey) model.apiKey = value.apiKey
  return model
}

export function normalizeEnterpriseModels(payload) {
  const models = Array.isArray(payload) ? payload : payload?.models
  if (!Array.isArray(models)) return []
  return models.map(asModel).filter(Boolean).map(({ apiKey, ...model }) => model)
}

function messageText(message) {
  if (typeof message.content === 'string') return message.content
  return (message.content || []).filter(block => block?.type === 'text').map(block => block.text || '').join('')
}

function endpoint(baseURL, api) {
  if (!baseURL) throw Object.assign(new Error('enterprise model has no baseURL'), { code: 'INVALID_CONFIG' })
  const suffix = api === 'openai-responses' ? '/responses' : '/chat/completions'
  return baseURL.endsWith(suffix) ? baseURL : `${baseURL}${suffix}`
}

async function* sse(response, api, streamIdleTimeoutMs) {
  const decoder = new TextDecoder()
  let buffer = ''
  let emitted = false
  const parse = (data) => {
    if (!data || data === '[DONE]') return null
    let payload
    try { payload = JSON.parse(data) } catch { return null }
    if (payload.type === 'error' || payload.error) throw Object.assign(new Error(payload.error?.message || 'enterprise model response failed'), { code: 'SERVER' })
    const delta = api === 'openai-responses'
      ? payload.type === 'response.output_text.delta' ? payload.delta : undefined
      : payload.choices?.[0]?.delta?.content
    return typeof delta === 'string' && delta ? { type: 'text-delta', index: 0, text: delta } : null
  }
  try {
    const reader = response.body.getReader()
    while (true) {
      let timer
      const next = await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('enterprise model stream timed out without output'), { code: 'TIMEOUT' })), streamIdleTimeoutMs) })
      ]).finally(() => clearTimeout(timer))
      if (next.done) break
      const chunk = next.value
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const item = parse(line.slice(5).trim())
        if (item) { emitted = true; yield item }
      }
    }
  } catch (error) {
    if (!emitted) throw error
  }
  if (!emitted) throw Object.assign(new Error('enterprise model ended without output'), { code: 'EMPTY_RESPONSE' })
  yield { type: 'finish', reason: { kind: 'stop' } }
}

export class EnterpriseLlmAdapter {
  constructor(resolveModels, { streamIdleTimeoutMs = 120000, request } = {}) {
    this.resolveModels = resolveModels
    this.streamIdleTimeoutMs = streamIdleTimeoutMs
    this.request = request
  }

  models() {
    return (this.resolveModels() || []).map(asModel).filter(Boolean)
  }

  model(provider, id) {
    const found = this.models().find(item => (item.provider === provider || provider === PROVIDER) && item.id === id)
    if (!found) throw Object.assign(new Error(`enterprise model not found: ${provider}/${id}`), { code: 'UNKNOWN_MODEL' })
    return found
  }

  providerInfo(provider) { return { id: provider, name: 'Enterprise Models' } }

  providerRetryPolicy() { return undefined }

  listModels(provider) {
    return Promise.resolve(this.models().filter(item => item.provider === provider || provider === PROVIDER).map(item => ({ provider, id: item.id, name: item.name })))
  }

  resolveModel(provider, model) {
    const item = this.model(provider, model)
    return Promise.resolve({ provider, id: item.id, name: item.name, context: item.contextWindow ? { contextWindow: item.contextWindow } : undefined, defaultMaxTokens: item.maxTokens })
  }

  async prepareCall(provider, model) {
    const info = await this.resolveModel(provider, model)
    return { model: info, stream: options => this.stream(options) }
  }

  async *stream(options) {
    const item = this.model(options.provider, options.model)
    const responses = item.api === 'openai-responses'
      ? { input: options.messages.map(message => ({ role: message.role, content: [{ type: 'input_text', text: messageText(message) }] })), store: false }
      : { messages: options.messages.map(message => ({ role: message.role, content: messageText(message) })) }
    const requestPayload = { model: item.id, stream: true, ...responses }
    const response = this.request
      ? await this.request({ model: item, payload: requestPayload, signal: options.signal })
      : await fetch(endpoint(item.baseURL, item.api), {
        method: 'POST',
        headers: { accept: 'text/event-stream', 'content-type': 'application/json', authorization: `Bearer ${item.apiKey}` },
        body: JSON.stringify(requestPayload),
        signal: options.signal
      })
    if (!response.ok) throw Object.assign(new Error(`enterprise model request failed: HTTP ${response.status}`), { code: response.status === 401 ? 'INVALID_CREDENTIAL' : 'SERVER', status: response.status })
    yield* sse(response, item.api, this.streamIdleTimeoutMs)
  }
}

export { PROVIDER }
