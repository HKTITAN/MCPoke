import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { McpokeSettings, PortConfig, ServerRegistryItem } from '../../../shared/mcp-types.js'
import { app } from 'electron'

const FILE = 'mcpoke.json'

export interface McpokePersisted {
  version: 1
  customServers: ServerRegistryItem[]
  portById: Record<string, PortConfig>
  installed: Record<string, { installed: boolean; path?: string; lastInstallAt?: number }>
  settings: McpokeSettings
}

const empty: McpokePersisted = {
  version: 1,
  customServers: [],
  portById: {},
  installed: {},
  settings: { theme: 'dark', permissionMode: 'sandbox', notificationsEnabled: true, autoStartNativeRuntime: false }
}

let cache: McpokePersisted = empty
let loaded = false

function path() {
  return join(app.getPath('userData'), FILE)
}

export async function loadPersistence(): Promise<McpokePersisted> {
  if (loaded) return cache
  try {
    const raw = await fs.readFile(path(), 'utf-8')
    const data = JSON.parse(raw) as McpokePersisted
    if (data?.version === 1) {
      cache = { ...empty, ...data, customServers: data.customServers ?? [] }
    }
  } catch {
    cache = { ...empty }
  }
  loaded = true
  return cache
}

export async function savePersistence(partial: Partial<McpokePersisted>): Promise<void> {
  cache = { ...cache, ...partial, customServers: partial.customServers ?? cache.customServers }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(path(), JSON.stringify(cache, null, 2), 'utf-8')
}

export function getCache(): McpokePersisted {
  return cache
}

export function getSettings(): McpokeSettings {
  return cache.settings
}

export async function saveSettings(settings: Partial<McpokeSettings>): Promise<McpokeSettings> {
  const merged: McpokeSettings = { ...cache.settings, ...settings }
  await savePersistence({ settings: merged })
  return merged
}
