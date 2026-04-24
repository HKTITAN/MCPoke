/**
 * Domain types for MCPoke — shared by main, preload, and renderer.
 */

export type AuthSessionState = 'unauthenticated' | 'pending_device_code' | 'authenticated' | 'expired' | 'error'

export type AuthErrorCode =
  | 'network_error'
  | 'cancelled'
  | 'invalid_credentials'
  | 'timeout'
  | 'unknown'

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
  serverId?: string
  serverName?: string
}

export interface PlatformSupport {
  win32: boolean
  darwin: boolean
  linux: boolean
  notes?: string
}

export interface ServerConfig {
  transport: ServerTransport
  /** Built-in MCPoke runtime implementation */
  builtin?: 'mcpoke-native'
  /** Optional remote endpoint URL used for remote start/tunnel targets */
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
  /** Optional typed auth configuration */
  auth?: ServerAuthConfig
  /** Optional inferred auth requirement hints */
  authRequirement?: AuthRequirementHint
}

export type PermissionMode = 'full' | 'limited' | 'sandbox'

export interface McpokeSettings {
  theme: 'dark'
  permissionMode: PermissionMode
  notificationsEnabled: boolean
  autoStartNativeRuntime: boolean
}

export type ServerAuthMode = 'none' | 'api_key' | 'bearer' | 'oauth' | 'custom'

export interface AuthKV {
  key: string
  value: string
}

export interface ApiKeyAuthConfig {
  envName: string
  value: string
}

export interface BearerAuthConfig {
  envName: string
  token: string
}

export interface OAuthAuthConfig {
  authUrl?: string
  tokenUrl?: string
  clientId?: string
  scope?: string
  audience?: string
  notes?: string
}

export interface ServerAuthConfig {
  mode: ServerAuthMode
  apiKey?: ApiKeyAuthConfig
  bearer?: BearerAuthConfig
  oauth?: OAuthAuthConfig
  customEnv?: AuthKV[]
}

export interface AuthRequirementHint {
  level: 'required' | 'optional' | 'unknown'
  mode: Exclude<ServerAuthMode, 'none'>
  envNames: string[]
  description?: string
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
  /** Full name from token */
  name?: string
  /** Email from token */
  email?: string
  /** Subject / user ID from token */
  sub?: string
  /** Token expiry as ms timestamp */
  expiresAt?: number
  /** Set during device login flow */
  loginCode?: { userCode: string; loginUrl: string }
  /** Optional normalized auth error details */
  error?: { code: AuthErrorCode; message: string; retryable: boolean }
  /** Where Poke credentials are expected for this platform */
  credentialsPathHint?: string
}

/** Official MCP registry server entry */
export interface McpRegistryPackage {
  registryType: 'npm' | 'pypi' | 'oci' | 'nuget' | 'mcpb'
  identifier: string
  version?: string
  transport?: { type: 'stdio' | 'streamable-http' | 'sse' }
  runtimeHint?: string
  runtimeArguments?: string[]
  packageArguments?: Array<{ description?: string; isRequired?: boolean; value?: string }>
  environmentVariables?: Array<{ name: string; description?: string; isRequired?: boolean; isSecret?: boolean }>
}

export interface McpRegistryEntry {
  id: string
  title?: string
  description: string
  version?: string
  repository?: { url: string; source?: string; id?: string; subfolder?: string }
  websiteUrl?: string
  packages: McpRegistryPackage[]
  remotes?: Array<{ type: string; url: string; headers?: unknown[] }>
  icons?: Array<{ src: string; mimeType?: string; theme?: string }>
  /** True when published by the modelcontextprotocol org */
  isFirstParty?: boolean
  publishedAt?: string
  updatedAt?: string
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
