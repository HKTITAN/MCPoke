import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PokeTunnel } from 'poke'
import { app, BrowserWindow } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { PRESET_SERVERS } from '../data/presets.js'
import { getCache, loadPersistence, savePersistence, type McpokePersisted } from './persistence.js'
import { getLogs, pushLog } from './logBuffer.js'
import { getAuthViewModel } from './authService.js'
import { assertPortInRange, findFreePort, isPortFree } from '../../lib/portUtils.js'
import { IPC } from '../../../shared/ipc.js'
import type {
  McpToolDescriptor,
  PortConfig,
  PortMode,
  PortStatus,
  ServerRegistryItem,
  ServerViewModel,
  TunnelState,
  RuntimeState,
  InstalledState
} from '../../../shared/mcp-types.js'
import { isPlatformOk, type PlatformSupport, DEFAULT_PLATFORM } from '../../../shared/mcp-types.js'
import { setTimeout as delay } from 'node:timers/promises'

type Live = {
  client: Client | null
  stdio: StdioClientTransport | null
  httpTr: StreamableHTTPClientTransport | null
  httpChild: ChildProcess | null
  tunnel: PokeTunnel | null
  tools: McpToolDescriptor[]
  toolsCount: number
  connection: 'disconnected' | 'connecting' | 'ready' | 'error'
  runtime: RuntimeState
  lastError?: string
  port: PortConfig
  assignedPort?: number
  processPid?: number
  startedAt?: number
}

const lives = new Map<string, Live>()

let persistReady: Promise<void> = Promise.resolve()

async function markPersist() {
  await loadPersistence()
}

function broadcastView(view: ServerViewModel) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.onState, { view })
  }
}

function ensureLive(id: string): Live {
  let e = lives.get(id)
  if (!e) {
    e = {
      client: null,
      stdio: null,
      httpTr: null,
      httpChild: null,
      tunnel: null,
      tools: [],
      toolsCount: 0,
      connection: 'disconnected',
      runtime: 'idle',
      port: { mode: 'random', status: 'none' }
    }
    lives.set(id, e)
  }
  return e
}

function resolveItems(): ServerRegistryItem[] {
  const c = getCache()
  const byId = new Map<string, ServerRegistryItem>()
  for (const p of PRESET_SERVERS) byId.set(p.id, p)
  for (const u of c.customServers) byId.set(u.id, u)
  return Array.from(byId.values())
}

function toView(item: ServerRegistryItem): ServerViewModel {
  const c = getCache()
  const live = ensureLive(item.id)
  const inst = c.installed[item.id] ?? { installed: false }
  const port = c.portById[item.id] ?? live.port
  if (c.portById[item.id]) live.port = c.portById[item.id]!

  const runState: InstalledState = { ...inst, installed: inst.installed }
  const rs = live.runtime
  const lastErr = live.lastError
  const tunnel: TunnelState = (() => {
    const t = live.tunnel
    if (!t) return { active: false, toolsCount: live.toolsCount }
    const info = t.info
    return {
      active: t.connected,
      tunnelUrl: info?.tunnelUrl,
      localUrl: info?.localUrl,
      connectionId: info?.connectionId,
      lastTunneledAt: info ? Date.now() : undefined,
      toolsCount: live.toolsCount
    }
  })()
  return {
    item,
    installed: runState,
    running: {
      state: rs,
      lastError: lastErr,
      pid: live.processPid,
      startedAt: live.startedAt
    },
    port: { ...port, assigned: live.assignedPort ?? port.assigned, status: port.status },
    tunnel,
    tools: live.tools,
    toolsCount: live.toolsCount,
    lastError: lastErr,
    connection: live.connection
  }
}

function listViews(): ServerViewModel[] {
  return resolveItems().map(toView)
}

function syncPlatform(item: ServerRegistryItem): { ok: boolean; platform: PlatformSupport } {
  const p = item.platform ?? DEFAULT_PLATFORM
  if (!isPlatformOk(p, process.platform)) {
    return { ok: false, platform: p }
  }
  return { ok: true, platform: p }
}

function serverCwd(id: string) {
  return join(app.getPath('userData'), 'servers', id)
}

function localHttpUrl(port: number, mcpPath?: string) {
  const p = mcpPath && mcpPath.length ? mcpPath : '/mcp'
  const pathPart = p.startsWith('/') ? p : `/${p}`
  return `http://127.0.0.1:${port}${pathPart}`
}

async function withAuth<T>(fn: () => Promise<T>): Promise<T> {
  const a = getAuthViewModel()
  if (a.state !== 'authenticated') {
    throw new Error('Log in to Poke first to use tunnel')
  }
  return fn()
}

export async function initRuntime(): Promise<void> {
  persistReady = markPersist()
  await persistReady
}

function recordRuntime(id: string, s: RuntimeState) {
  const l = ensureLive(id)
  l.runtime = s
  broadcast()
}

function broadcast() {
  for (const v of listViews()) broadcastView(v)
}

function attachPokeEvents(id: string, t: PokeTunnel) {
  t.on('connected', () => {
    pushLog(id, { level: 'info', source: 'poke', message: 'Tunnel connected', stream: 'tunnel' })
    recordRuntime(id, 'tunneling')
    broadcast()
  })
  t.on('disconnected', () => {
    pushLog(id, { level: 'info', source: 'poke', message: 'Tunnel disconnected', stream: 'tunnel' })
  })
  t.on('error', (err) => {
    const l = ensureLive(id)
    l.lastError = err.message
    pushLog(id, { level: 'error', source: 'poke', message: err.message, stream: 'tunnel' })
    recordRuntime(id, 'error')
    broadcast()
  })
  t.on('toolsSynced', (r) => {
    const l = ensureLive(id)
    l.toolsCount = r.toolCount
    pushLog(id, { level: 'info', source: 'poke', message: `Tools synced: ${r.toolCount}`, stream: 'tunnel' })
    broadcast()
  })
  t.on('oauthRequired', (info) => {
    pushLog(id, { level: 'warn', source: 'poke', message: `OAuth required: ${info.authUrl}`, stream: 'tunnel' })
  })
}

export async function installServer(id: string): Promise<ServerViewModel> {
  await persistReady
  const item = resolveItems().find((x) => x.id === id)
  if (!item) throw new Error('Server not in registry')
  const pl = syncPlatform(item)
  if (!pl.ok) {
    item.platform = pl.platform
    throw new Error('Not available on this OS')
  }
  recordRuntime(id, 'installing')
  const cwd = serverCwd(id)
  await mkdir(cwd, { recursive: true })
  const spec = item.config.packageSpec
  if (spec) {
    pushLog(id, { source: 'install', message: `npm install ${spec}`, stream: 'system' })
    await new Promise<void>((res, rej) => {
      const p = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const c = spawn(p, ['install', spec, '--no-fund', '--no-audit'], { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
      c.stdout?.on('data', (b) => pushLog(id, { source: 'npm', message: b.toString(), stream: 'stdout' }))
      c.stderr?.on('data', (b) => pushLog(id, { source: 'npm', level: 'warn', message: b.toString(), stream: 'stderr' }))
      c.on('error', rej)
      c.on('close', (code) => (code === 0 ? res() : rej(new Error(`npm install failed (${code})`))))
    })
  } else {
    pushLog(id, { source: 'install', message: 'No packageSpec — mark as installed (custom)', stream: 'system' })
  }
  const c = getCache()
  c.installed[id] = { installed: true, path: cwd, lastInstallAt: Date.now() }
  await savePersistence({ installed: c.installed } as Partial<McpokePersisted>)
  recordRuntime(id, 'installed')
  const v = toView(item)
  broadcastView(v)
  return v
}

async function tryConnectHttp(
  id: string,
  url: string
): Promise<{ client: Client; tr: StreamableHTTPClientTransport }> {
  const live = ensureLive(id)
  live.connection = 'connecting'
  const deadline = Date.now() + 30_000
  let lastErr: Error | undefined
  while (Date.now() < deadline) {
    const tr = new StreamableHTTPClientTransport(new URL(url))
    const client = new Client({ name: 'mcpoke', version: '0.1.0' })
    try {
      await client.connect(tr)
      live.connection = 'ready'
      return { client, tr }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      try {
        await client.close()
      } catch {
        /* */
      }
    }
    await delay(300)
  }
  live.connection = 'error'
  throw lastErr ?? new Error(`Connect timeout: ${url}`)
}

async function loadToolsFromClient(id: string, cl: Client) {
  const l = ensureLive(id)
  const res = await cl.listTools()
  l.tools = (res.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }))
  l.toolsCount = l.tools.length
  broadcast()
}

export async function startServer(id: string): Promise<ServerViewModel> {
  await persistReady
  const item = resolveItems().find((x) => x.id === id)
  if (!item) throw new Error('Unknown server')
  const c = getCache()
  const ext = item.config.transport === 'http' && item.config.useExternalStart
  if (!c.installed[id]?.installed && !ext) {
    throw new Error('Install this server first')
  }
  if (ext && !c.installed[id]?.installed) {
    c.installed[id] = { installed: true, lastInstallAt: Date.now() }
    await savePersistence({ installed: c.installed } as Partial<McpokePersisted>)
  }
  const l = ensureLive(id)
  if (l.client && l.connection === 'ready') {
    return toView(item)
  }
  if (l.client) {
    try {
      await l.client.close()
    } catch {
      /* ignore */
    }
    l.client = null
    l.stdio = null
    l.httpTr = null
  }
  recordRuntime(id, 'starting')
  l.lastError = undefined

  if (item.config.transport === 'stdio') {
    const cwd = item.config.cwd ?? serverCwd(id)
    await mkdir(cwd, { recursive: true })
    const t = new StdioClientTransport({
      command: item.config.command,
      args: item.config.args,
      cwd,
      env: { ...getDefaultEnvironment(), ...item.config.env },
      stderr: 'pipe'
    })
    t.stderr?.on('data', (b) => {
      pushLog(id, { level: 'info', source: 'mcp-stderr', message: b.toString(), stream: 'stderr' })
    })
    const cl = new Client({ name: 'mcpoke', version: '0.1.0' })
    await cl.connect(t)
    l.client = cl
    l.stdio = t
    l.processPid = t.pid ?? undefined
    l.startedAt = Date.now()
    l.connection = 'ready'
    await loadToolsFromClient(id, cl)
    recordRuntime(id, 'running')
    const v = toView(item)
    broadcastView(v)
    return v
  }

  const pconf = c.portById[id] ?? l.port
  let portNum: number
  if (pconf.mode === 'manual' && pconf.value) {
    assertPortInRange(pconf.value)
    portNum = pconf.value
    if (!item.config.useExternalStart) {
      if (!(await isPortFree(pconf.value))) {
        c.portById[id] = { ...pconf, status: 'conflict' as PortStatus, assigned: pconf.value }
        await savePersistence({ portById: c.portById })
        throw new Error(
          `Port ${pconf.value} is not free to bind. Stop the other process, pick a free port, or use "external" and run your own server.`
        )
      }
    }
  } else {
    portNum = await findFreePort()
  }
  l.assignedPort = portNum
  c.portById[id] = { mode: pconf.mode as PortMode, value: pconf.value, status: 'assigned' as PortStatus, assigned: portNum }
  await savePersistence({ portById: c.portById } as Partial<McpokePersisted>)
  const url = localHttpUrl(portNum, item.config.mcpPath)
  if (item.config.useExternalStart) {
    pushLog(id, { source: 'http', message: `Connecting to ${url} (external process)`, stream: 'system' })
  } else {
    await mkdir(serverCwd(id), { recursive: true })
    const childEnv = { ...process.env, ...item.config.env, PORT: String(portNum), NODE_ENV: 'development' }
    const p = item.config.command
    const args = [...item.config.args]
    l.httpChild = spawn(p, args, {
      cwd: item.config.cwd ?? serverCwd(id),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    })
    l.httpChild.stdout?.on('data', (b) => pushLog(id, { source: 'server', message: b.toString(), stream: 'stdout' }))
    l.httpChild.stderr?.on('data', (b) => pushLog(id, { source: 'server', level: 'warn', message: b.toString(), stream: 'stderr' }))
    l.processPid = l.httpChild.pid
    l.startedAt = Date.now()
    l.httpChild.on('error', (err) => {
      l.lastError = err.message
      recordRuntime(id, 'error')
    })
    l.httpChild.on('close', (code) => {
      pushLog(id, { source: 'server', level: 'warn', message: `exited with ${code ?? 'null'}`, stream: 'system' })
      l.connection = 'disconnected'
      l.runtime = 'idle'
    })
  }
  const { client, tr } = await tryConnectHttp(id, url)
  l.client = client
  l.httpTr = tr
  await loadToolsFromClient(id, client)
  recordRuntime(id, 'running')
  const v = toView(item)
  broadcastView(v)
  return v
}

export async function stopServer(id: string): Promise<ServerViewModel> {
  await persistReady
  const item = resolveItems().find((x) => x.id === id)
  if (!item) throw new Error('Unknown server')
  const l = ensureLive(id)
  recordRuntime(id, 'stopping')
  if (l.tunnel) {
    try {
      await l.tunnel.stop()
    } catch {
      /* */
    }
    l.tunnel = null
  }
  if (l.client) {
    try {
      await l.client.close()
    } catch {
      /* */
    }
  }
  l.client = null
  l.stdio = null
  l.httpTr = null
  if (l.httpChild) {
    l.httpChild.kill('SIGTERM')
    l.httpChild = null
  }
  l.tools = []
  l.toolsCount = 0
  l.connection = 'disconnected'
  l.processPid = undefined
  l.startedAt = undefined
  l.runtime = 'idle'
  const v = toView(item)
  broadcastView(v)
  return v
}

export async function restartServer(id: string): Promise<ServerViewModel> {
  await stopServer(id)
  return startServer(id)
}

export async function startTunnel(id: string): Promise<ServerViewModel> {
  await withAuth(async () => {
    const item = resolveItems().find((x) => x.id === id)
    if (!item) throw new Error('Unknown server')
    if (item.config.transport !== 'http') {
      throw new Error('Poke tunnel targets an HTTP(S) local URL. This server is stdio-only; run an HTTP MCP on a port or add a custom HTTP server with the same tool surface.')
    }
    const l = ensureLive(id)
    if (!l.client || l.connection !== 'ready') {
      throw new Error('Start the server first (must be running)')
    }
    const port = l.assignedPort
    if (!port) {
      const c = getCache()
      const a = c.portById[id]?.assigned
      if (!a) throw new Error('No assigned port for HTTP')
      l.assignedPort = a
    }
    const localUrl = localHttpUrl(l.assignedPort!, item.config.mcpPath)
    const tun = new PokeTunnel({ url: localUrl, name: item.name })
    l.tunnel = tun
    attachPokeEvents(id, tun)
    await tun.start()
  })
  const item2 = resolveItems().find((x) => x.id === id)!
  const v = toView(item2)
  broadcastView(v)
  return v
}

export async function stopTunnel(id: string): Promise<ServerViewModel> {
  const l = ensureLive(id)
  if (l.tunnel) {
    await l.tunnel.stop()
    l.tunnel = null
  }
  recordRuntime(id, l.client ? 'running' : 'idle')
  const item2 = resolveItems().find((x) => x.id === id)!
  const v = toView(item2)
  broadcastView(v)
  return v
}

export async function refreshToolsOnServer(id: string): Promise<{ tools: McpToolDescriptor[]; count: number }> {
  const item = resolveItems().find((x) => x.id === id)
  if (!item) throw new Error('Unknown server')
  const l = ensureLive(id)
  if (!l.client) throw new Error('Server is not running')
  await loadToolsFromClient(id, l.client)
  broadcastView(toView(item))
  return { tools: l.tools, count: l.toolsCount }
}

export function getRegistryList(): ServerViewModel[] {
  return listViews()
}

export function getLogsFor(id: string) {
  return getLogs(id)
}

export async function setPortFor(id: string, config: PortConfig): Promise<ServerViewModel> {
  await persistReady
  const c = getCache()
  c.portById[id] = config
  await savePersistence({ portById: c.portById } as Partial<McpokePersisted>)
  const l = ensureLive(id)
  l.port = config
  const item = resolveItems().find((i) => i.id === id)
  if (!item) throw new Error('not found')
  const v = toView(item)
  broadcastView(v)
  return v
}

export async function checkPortFor(id: string): Promise<{ free: boolean; inUse: boolean; suggested?: number }> {
  const c = getCache()
  const p = c.portById[id]?.value
  if (!p) return { free: true, inUse: false, suggested: await findFreePort() }
  return { free: await isPortFree(p), inUse: !(await isPortFree(p)) }
}

export async function pickRandomPort(): Promise<{ port: number }> {
  return { port: await findFreePort() }
}

export async function upsertRegistryItem(x: ServerRegistryItem): Promise<ServerViewModel> {
  await persistReady
  const c = getCache()
  if (x.source !== 'custom') {
    throw new Error('Only custom servers are editable in-app')
  }
  const idx = c.customServers.findIndex((s) => s.id === x.id)
  if (idx === -1) c.customServers.push(x)
  else c.customServers[idx] = x
  await savePersistence({ customServers: c.customServers })
  const v = toView(x)
  broadcastView(v)
  return v
}

export async function deleteRegistryItem(id: string): Promise<void> {
  await persistReady
  if (PRESET_SERVERS.some((p) => p.id === id)) {
    throw new Error('Cannot delete preset')
  }
  const c = getCache()
  c.customServers = c.customServers.filter((s) => s.id !== id)
  await savePersistence({ customServers: c.customServers })
  await stopServer(id).catch(() => null)
  lives.delete(id)
  broadcast()
}

// Fix pushLog: use wrapper that notifies
