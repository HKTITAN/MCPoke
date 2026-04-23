import type {
  AuthErrorCode,
  AuthViewModel,
  LogEntry,
  McpRegistryEntry,
  ServerRegistryItem,
  ServerViewModel,
  PortConfig,
  McpToolDescriptor
} from './mcp-types.js'

/** IPC channel names and contracts for the preload bridge */
export const IPC = {
  authGet: 'mcpoke:auth:get' as const,
  authLogin: 'mcpoke:auth:login' as const,
  authLogout: 'mcpoke:auth:logout' as const,

  registryList: 'mcpoke:registry:list' as const,
  registryUpsert: 'mcpoke:registry:upsert' as const,
  registryDelete: 'mcpoke:registry:delete' as const,

  marketplaceFetch: 'mcpoke:marketplace:fetch' as const,

  runtimeList: 'mcpoke:runtime:list' as const,
  runtimeInstall: 'mcpoke:runtime:install' as const,
  runtimeStart: 'mcpoke:runtime:start' as const,
  runtimeStop: 'mcpoke:runtime:stop' as const,
  runtimeRestart: 'mcpoke:runtime:restart' as const,
  runtimeTunnel: 'mcpoke:runtime:tunnel' as const,
  runtimeTunnelStop: 'mcpoke:runtime:tunnelStop' as const,
  refreshTools: 'mcpoke:runtime:tools' as const,
  checkPort: 'mcpoke:port:check' as const,
  pickPort: 'mcpoke:port:pick' as const,
  setPort: 'mcpoke:port:set' as const,
  getLogs: 'mcpoke:logs:get' as const,

  onLogs: 'mcpoke:logs:push' as const,
  onState: 'mcpoke:state:push' as const,
  onAuth: 'mcpoke:auth:update' as const,
  onLoginCode: 'mcpoke:auth:code' as const,
  onAuthError: 'mcpoke:auth:error' as const,
} as const

export type IpcErrorPayload = { ok: false; error: string; code?: string }
export type IpcSuccess<T> = { ok: true; data: T }
export type IpcResult<T> = IpcSuccess<T> | IpcErrorPayload

export type AuthLoginRequest = { openBrowser: boolean } | void
export type AuthErrorEvent = { code: AuthErrorCode; message: string; retryable: boolean }

export type RegistryUpsert = { item: ServerRegistryItem }
export type RegistryDelete = { id: string }
export type ServerId = { id: string }
export type PortSet = { id: string; config: PortConfig }
export type LogsQuery = { id: string; max?: number }

export type RegistryListRes = { servers: ServerViewModel[] }
export type StatePush = { view: ServerViewModel }
export type LogsPush = { id: string; log: LogEntry; tail: LogEntry[] }
export type ToolsRes = IpcResult<{ tools: McpToolDescriptor[]; count: number }>
export type AuthRes = IpcResult<AuthViewModel>

export interface ElectronApi {
  getAuth: () => Promise<AuthViewModel>
  login: (opts?: AuthLoginRequest) => Promise<AuthViewModel>
  logout: () => Promise<AuthViewModel>
  listRegistry: () => Promise<ServerViewModel[]>
  upsertServer: (item: ServerRegistryItem) => Promise<ServerViewModel>
  deleteServer: (id: string) => Promise<void>
  fetchMarketplace: (search?: string) => Promise<McpRegistryEntry[]>
  install: (id: string) => Promise<ServerViewModel>
  start: (id: string) => Promise<ServerViewModel>
  stop: (id: string) => Promise<ServerViewModel>
  restart: (id: string) => Promise<ServerViewModel>
  tunnel: (id: string) => Promise<ServerViewModel>
  tunnelStop: (id: string) => Promise<ServerViewModel>
  refreshTools: (id: string) => Promise<{ tools: McpToolDescriptor[]; count: number }>
  checkPort: (id: string) => Promise<{ free: boolean; inUse: boolean; suggested?: number }>
  pickRandomPort: () => Promise<{ port: number }>
  setPort: (id: string, config: PortConfig) => Promise<ServerViewModel>
  getLogs: (id: string, max?: number) => Promise<LogEntry[]>
  onState: (cb: (m: { view: ServerViewModel }) => void) => () => void
  onAuthChanged: (cb: (a: AuthViewModel) => void) => () => void
  onLoginCode: (cb: (code: { userCode: string; loginUrl: string }) => void) => () => void
  onAuthError: (cb: (error: AuthErrorEvent) => void) => () => void
  onLogs: (cb: (e: { id: string; log: LogEntry; tail: LogEntry[] }) => void) => () => void
  openMcpDocs: () => void
  openPokeNpm: () => void
  openMcpInspector: (url: string) => void
  platform: NodeJS.Platform
  versions: { electron: string; node: string; mcpoke: string }
}
