import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const home = process.env.DSH_HOME || path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const settingsPath = path.join(home, 'settings.yaml')
const credentialsPath = path.join(home, '.credentials.yaml')

async function readYaml(file) { return yaml.load(await fs.readFile(file, 'utf8')) ?? {} }
async function writeYaml(file, value) { await fs.writeFile(file, yaml.dump(value, { noRefs: true, lineWidth: 120 }), 'utf8') }

export async function migrateEnterpriseModel({ root = home, dryRun = false } = {}) {
  const settings = await readYaml(path.join(root, 'settings.yaml'))
  const credentials = await readYaml(path.join(root, '.credentials.yaml'))
  const provider = settings['llm-pi-ai']?.providers?.intbio
  if (provider === undefined && credentials.refs?.INTBIO_API_KEY === undefined) return { changed: false, reason: 'intbio configuration not found' }
  const backup = `${root}${path.sep}enterprise-backup-${stamp}`
  if (!dryRun) {
    await fs.mkdir(backup, { recursive: true })
    await fs.copyFile(path.join(root, 'settings.yaml'), path.join(backup, 'settings.yaml'))
    await fs.copyFile(path.join(root, '.credentials.yaml'), path.join(backup, '.credentials.yaml'))
  }
  if (settings['llm-pi-ai']?.providers) delete settings['llm-pi-ai'].providers.intbio
  if (settings['agent-default-model']?.provider === 'intbio') delete settings['agent-default-model']
  if (credentials.refs) delete credentials.refs.INTBIO_API_KEY
  if (!dryRun) {
    await writeYaml(path.join(root, 'settings.yaml'), settings)
    await writeYaml(path.join(root, '.credentials.yaml'), credentials)
  }
  return { changed: true, backup, removedProvider: provider !== undefined, removedCredentialRef: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await migrateEnterpriseModel({ dryRun: process.argv.includes('--dry-run') })
  console.log(JSON.stringify({ ...result, root: home }))
}
