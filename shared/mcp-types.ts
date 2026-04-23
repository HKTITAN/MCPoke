/**
 * Domain types for MCPoke — shared by main, preload, and renderer.
 */

export type AuthSessionState = 'unauthenticated' | 'authenticated' | 'expired'

export type ServerSourceType = 'preset' | 'custom'

export type RuntimeState =
  | 'idle'
  | 'installing'
  | 'installed'
  | 'starting'
  | 'running'
  | 'tunneling'
  | 'tunneled'
  | 'deployed'
  | 'stopping'
  | 'error'

export type PortMode = 'manual' | 'random' | 'fixed'

export type PortStatus = 'none' | 'assigned' | 'in_use' | 'conflict'

export type ServerTransport = 'stdio' | 'http' | 'sse'

export type LogStreamType = 'stdout' | 'stderr' | 'system' | 'tunnel' | 'poke'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  source: string
  message: string
  stream: LogStreamType
}

export interface PlatformSupport {
  win32: boolean
  darwin: boolean
  linux: boolean
  notes?: string
}

export interface ServerConfig {
  transport: ServerTransport
  /** Remote endpoint URL for remote HTTP/SSE servers */
  remoteUrl?: string
  /** npm spec or local path for install step */
  packageSpec?: string
  /** command to start (stdio) or local http listener */
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  /** e.g. /mcp — combined with port for local URL on http */
  mcpPath?: string
  /** for http transport: whether start command is required or external */
  useExternalStart?: boolean
}

export interface ServerRegistryItem {
  id: string
  name: string
  description: string
  source: ServerSourceType
  config: ServerConfig
  platform: PlatformSupport
  /** Last persisted sync */
  lastSync: number
  /** Pinned for UI */
  pinned?: boolean
}

export interface InstalledState {
  installed: boolean
  path?: string
  version?: string
  lastInstallAt?: number
  lastInstallError?: string
}

export interface RunningState {
  state: RuntimeState
  startedAt?: number
  /** Local OS process (stdio or spawned HTTP) */
  pid?: number
  lastError?: string
}

export interface PortConfig {
  mode: PortMode
  value?: number
  status: PortStatus
  assigned?: number
}

export interface TunnelState {
  active: boolean
  tunnelUrl?: string
  localUrl?: string
  connectionId?: string
  lastTunneledAt?: number
  lastError?: string
  toolsCount?: number
}

export type ServerSurfaceState =
  | 'remote_http'
  | 'remote_sse'
  | 'local_started'
  | 'tunneling'
  | 'tunneled'
  | 'needs_tunnel'

export type DeploymentState = 'pending' | 'syncing' | 'synced' | 'deployed' | 'error'

export interface EndpointViewModel {
  transport: ServerTransport
  origin: 'remote' | 'local'
  localUrl?: string
  remoteUrl?: string
  pokeUrl?: string
}

export interface PokeStatusViewModel {
  authState: AuthSessionState
  connected: boolean
  syncState: DeploymentState
  lastSyncAt?: number
}

export interface DeploymentViewModel {
  state: DeploymentState
  ready: boolean
  instructions: string[]
  lastSyncAt?: number
}

export interface McpToolDescriptor {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface ServerViewModel {
  item: ServerRegistryItem
  installed: InstalledState
  running: RunningState
  port: PortConfig
  endpoint: EndpointViewModel
  surfaceState: ServerSurfaceState
  tunnel: TunnelState
  deployment: DeploymentViewModel
  poke: PokeStatusViewModel
  tools: McpToolDescriptor[]
  toolsCount: number
  lastError?: string
  connection: 'disconnected' | 'connecting' | 'ready' | 'error'
}

export interface AuthViewModel {
  state: AuthSessionState
  tokenPreview?: string
  identityLabel?: string
  loginHint?: string
}

export const DEFAULT_PLATFORM: PlatformSupport = {
  win32: true,
  darwin: true,
  linux: true
}

export function isPlatformOk(p: PlatformSupport, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') return p.win32
  if (platform === 'darwin') return p.darwin
  if (platform === 'linux') return p.linux
  return false
}
