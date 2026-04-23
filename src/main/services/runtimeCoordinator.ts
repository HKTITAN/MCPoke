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
  DeploymentState,
  EndpointViewModel,
  McpToolDescriptor,
  PortConfig,
  PortMode,
  PortStatus,
  PokeStatusViewModel,
  ServerRegistryItem,
  ServerSurfaceState,
  ServerViewModel,
  TunnelState,
  RuntimeState,
  InstalledState,
  DeploymentViewModel
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
  lastSyncAt?: number
  pokeSyncState: DeploymentState
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
      pokeSyncState: 'pending',
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
  const endpoint = buildEndpoint(item, live, port, tunnel)
  const surfaceState = deriveSurfaceState(item, live, endpoint, tunnel)
  const poke = derivePokeStatus(live)
  const deployment = deriveDeployment(surfaceState, endpoint, poke, live.connection === 'ready', live.runtime, live.lastError)
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
    endpoint,
    surfaceState,
    tunnel,
    deployment,
    poke,
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

function buildEndpoint(item: ServerRegistryItem, live: Live, port: PortConfig, tunnel: TunnelState): EndpointViewModel {
  const transport = item.config.transport
  if (item.config.remoteUrl) {
    return {
      transport,
      origin: 'remote',
      remoteUrl: item.config.remoteUrl,
      pokeUrl: tunnel.tunnelUrl
    }
  }

  if (transport === 'sse') {
    return {
      transport,
      origin: 'remote',
      remoteUrl: item.config.remoteUrl,
      pokeUrl: tunnel.tunnelUrl
    }
  }

  const assigned = live.assignedPort ?? port.assigned ?? port.value
  const localUrl = transport === 'http' && assigned ? localHttpUrl(assigned, item.config.mcpPath) : undefined
  return {
    transport,
    origin: 'local',
    localUrl,
    pokeUrl: tunnel.tunnelUrl
  }
}

function deriveSurfaceState(
  item: ServerRegistryItem,
  live: Live,
  endpoint: EndpointViewModel,
  tunnel: TunnelState
): ServerSurfaceState {
  if (endpoint.origin === 'remote') {
    return item.config.transport === 'sse' ? 'remote_sse' : 'remote_http'
  }
  if (live.runtime === 'tunneling') return 'tunneling'
  if (tunnel.active) return 'tunneled'
  if (live.connection === 'ready') {
    return item.config.transport === 'http' ? 'needs_tunnel' : 'local_started'
  }
  if (live.runtime === 'starting' || live.runtime === 'running' || live.runtime === 'installing' || live.runtime === 'installed') {
    return 'local_started'
  }
  return 'local_started'
}

function derivePokeStatus(live: Live): PokeStatusViewModel {
  const authState = getAuthViewModel().state
  const syncState: DeploymentState = authState === 'expired' ? 'error' : live.pokeSyncState
  return {
    authState,
    connected: !!live.tunnel?.connected,
    syncState,
    lastSyncAt: live.lastSyncAt
  }
}

function deriveDeployment(
  surfaceState: ServerSurfaceState,
  endpoint: EndpointViewModel,
  poke: PokeStatusViewModel,
  connected: boolean,
  runtime: RuntimeState,
  lastError?: string
): DeploymentViewModel {
  let state: DeploymentState = 'pending'
  if (lastError || runtime === 'error' || poke.syncState === 'error') {
    state = 'error'
  } else if (surfaceState === 'tunneled' && (runtime === 'deployed' || poke.syncState === 'synced')) {
    state = 'deployed'
  } else if (surfaceState === 'tunneling' || poke.syncState === 'syncing') {
    state = 'syncing'
  } else if (surfaceState === 'tunneled') {
    state = 'synced'
  } else if (endpoint.origin === 'remote' && connected) {
    state = 'deployed'
  }

  const ready = state === 'deployed'
  return {
    state,
    ready,
    instructions: buildInstructionCards(surfaceState, endpoint, poke, connected, state),
    lastSyncAt: poke.lastSyncAt
  }
}

function buildInstructionCards(
  surfaceState: ServerSurfaceState,
  endpoint: EndpointViewModel,
  poke: PokeStatusViewModel,
  connected: boolean,
  deploymentState: DeploymentState
): string[] {
  if (deploymentState === 'error') {
    return ['check last error', 'recover connection', 're-run sync', 'ready for connection']
  }
  if (surfaceState === 'remote_http') {
    return ['remote HTTP endpoint configured', 'verify endpoint health', 'wait for sync', 'ready for connection']
  }
  if (surfaceState === 'remote_sse') {
    return ['remote SSE endpoint configured', 'verify stream connectivity', 'wait for sync', 'ready for connection']
  }
  if (surfaceState === 'tunneling') {
    return ['start local server', 'tunnel via Poke SDK', 'wait for sync', 'ready for connection']
  }
  if (surfaceState === 'tunneled') {
    return ['local server running', 'tunnel active via Poke SDK', 'sync tools to Poke', 'ready for connection']
  }
  if (surfaceState === 'needs_tunnel') {
    return ['start local server', 'tunnel via Poke SDK', 'wait for sync', 'ready for connection']
  }
  if (endpoint.transport === 'stdio') {
    return ['local server running', 'inspect tools and logs', 'use HTTP/SSE endpoint for remote deploy', 'ready for local connection']
  }
  if (!connected && poke.authState !== 'authenticated') {
    return ['login with Poke', 'start local server', 'tunnel via Poke SDK', 'ready for connection']
  }
  return ['start local server', 'wait for connection', 'sync deployment state', 'ready for connection']
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
    const l = ensureLive(id)
    l.pokeSyncState = 'syncing'
    pushLog(id, { level: 'info', source: 'poke', message: 'Tunnel connected', stream: 'tunnel' })
    recordRuntime(id, 'tunneled')
    broadcast()
  })
  t.on('disconnected', () => {
    const l = ensureLive(id)
    l.pokeSyncState = 'pending'
    pushLog(id, { level: 'info', source: 'poke', message: 'Tunnel disconnected', stream: 'tunnel' })
    if (l.connection === 'ready') {
      l.runtime = 'running'
    }
    broadcast()
  })
  t.on('error', (err) => {
    const l = ensureLive(id)
    l.lastError = err.message
    l.pokeSyncState = 'error'
    pushLog(id, { level: 'error', source: 'poke', message: err.message, stream: 'tunnel' })
    recordRuntime(id, 'error')
    broadcast()
  })
  t.on('toolsSynced', (r) => {
    const l = ensureLive(id)
    l.toolsCount = r.toolCount
    l.pokeSyncState = 'synced'
    l.lastSyncAt = Date.now()
    pushLog(id, { level: 'info', source: 'poke', message: `Tools synced: ${r.toolCount}`, stream: 'tunnel' })
    recordRuntime(id, 'deployed')
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
  const isRemote = !!item.config.remoteUrl
  const ext = (item.config.transport === 'http' || item.config.transport === 'sse') && (item.config.useExternalStart || isRemote)
  if (isRemote && item.config.remoteUrl) {
    recordRuntime(id, 'starting')
    const l = ensureLive(id)
    l.lastError = undefined
    if (item.config.transport === 'sse') {
      l.client = null
      l.httpTr = null
      l.connection = 'disconnected'
      pushLog(id, {
        source: 'remote',
        stream: 'system',
        message: `Remote SSE endpoint tracked: ${item.config.remoteUrl}`
      })
    } else {
      const { client, tr } = await tryConnectHttp(id, item.config.remoteUrl)
      l.client = client
      l.httpTr = tr
      await loadToolsFromClient(id, client)
    }
    l.pokeSyncState = 'synced'
    l.lastSyncAt = Date.now()
    recordRuntime(id, 'deployed')
    const v = toView(item)
    broadcastView(v)
    return v
  }

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
    if (!item.config.command) {
      throw new Error('Missing command for stdio server start')
    }
    const cwd = item.config.cwd ?? serverCwd(id)
    await mkdir(cwd, { recursive: true })
    const t = new StdioClientTransport({
      command: item.config.command,
      args: item.config.args ?? [],
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

  if (item.config.transport === 'sse') {
    throw new Error('SSE servers in MCPoke are remote-only. Configure a remote endpoint URL.')
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
    if (!item.config.command) {
      throw new Error('Missing command for local HTTP server start')
    }
    await mkdir(serverCwd(id), { recursive: true })
    const childEnv = { ...process.env, ...item.config.env, PORT: String(portNum), NODE_ENV: 'development' }
    const p = item.config.command
    const args = [...(item.config.args ?? [])]
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
      recordRuntime(id, 'idle')
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
    if (item.config.transport !== 'http' && item.config.transport !== 'sse') {
      throw new Error(
        'Poke tunnel targets an HTTP/SSE URL. This server is stdio-only; run an HTTP MCP on a port or add a remote HTTP/SSE endpoint.'
      )
    }
    if (item.config.remoteUrl) {
      throw new Error('This server already uses a remote endpoint. Tunnel is only required for local HTTP servers.')
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
    l.pokeSyncState = 'pending'
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
  if (config.mode === 'manual' && config.value) {
    const free = await isPortFree(config.value)
    config = { ...config, status: free ? 'assigned' : 'conflict', assigned: free ? config.value : undefined }
  } else if (config.mode === 'random') {
    config = { ...config, status: 'none', assigned: undefined }
  }
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
  const free = await isPortFree(p)
  const item = resolveItems().find((x) => x.id === id)
  if (item) {
    c.portById[id] = {
      ...(c.portById[id] ?? { mode: 'manual' as PortMode }),
      value: p,
      status: free ? 'assigned' : 'conflict',
      assigned: free ? p : undefined
    }
    await savePersistence({ portById: c.portById } as Partial<McpokePersisted>)
    const l = ensureLive(id)
    l.port = c.portById[id]!
    broadcastView(toView(item))
  }
  return { free, inUse: !free }
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
