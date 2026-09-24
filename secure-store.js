import { promises as fs } from 'node:fs'
import path from 'node:path'

const STORE_FILE = 'dsh-enterprise-auth.bin'

export function createMemorySecureStore(initial = null) {
  let value = initial
  return {
    async get() { return value },
    async set(next) { value = next },
    async delete() { value = null },
  }
}

export function createSecureStore({ electron } = {}) {
  let adapterPromise
  let fallback = null
  const resolveAdapter = async () => {
    if (!adapterPromise) {
      adapterPromise = (async () => {
        const runtime = electron || await import('electron').catch(() => null)
        const safeStorage = runtime?.safeStorage
        const app = runtime?.app
        if (!safeStorage || !app || !safeStorage.isEncryptionAvailable()) return null
        return { safeStorage, file: path.join(app.getPath('userData'), STORE_FILE) }
      })()
    }
    return adapterPromise
  }
  return {
    async get() {
      const adapter = await resolveAdapter()
      if (!adapter) return fallback
      try {
        const encrypted = await fs.readFile(adapter.file)
        return adapter.safeStorage.decryptString(encrypted)
      } catch { return null }
    },
    async set(value) {
      const adapter = await resolveAdapter()
      if (!adapter) { fallback = value; return }
      await fs.mkdir(path.dirname(adapter.file), { recursive: true })
      await fs.writeFile(adapter.file, adapter.safeStorage.encryptString(value), { mode: 0o600 })
    },
    async delete() {
      const adapter = await resolveAdapter()
      if (!adapter) { fallback = null; return }
      await fs.rm(adapter.file, { force: true })
    },
  }
}
