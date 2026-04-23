import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc.js'
import type { ElectronApi } from '../../shared/ipc.js'
import type { AuthViewModel, LogEntry, McpToolDescriptor, ServerViewModel } from '../../shared/mcp-types.js'
import type { IpcResult } from '../../shared/ipc.js'

function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  return p.then((r) => {
    if (r && typeof r === 'object' && 'ok' in r) {
      if (r.ok) return r.data as T
      throw new Error((r as { error: string }).error)
    }
    return p as T
  })
}
function unwrapVoid(p: Promise<IpcResult<void>>): Promise<void> {
  return p.then((r) => {
    if (r && typeof r === 'object' && 'ok' in r) {
      if (r.ok) return
      throw new Error((r as { error: string }).error)
    }
  })
}

const api: ElectronApi = {
  getAuth: () => ipcRenderer.invoke(IPC.authGet) as Promise<AuthViewModel>,
  login: async (opts) => {
    const r = (await ipcRenderer.invoke(IPC.authLogin, opts)) as IpcResult<AuthViewModel>
    if (r && typeof r === 'object' && 'ok' in r && r.ok) return r.data
    throw new Error((r as { error: string }).error)
  },
  logout: async () => {
    const r = (await ipcRenderer.invoke(IPC.authLogout)) as IpcResult<AuthViewModel>
    if (r && typeof r === 'object' && 'ok' in r && r.ok) return r.data
    throw new Error((r as { error: string }).error)
  },
  listRegistry: () => ipcRenderer.invoke(IPC.registryList) as Promise<ServerViewModel[]>,
  upsertServer: (item) =>
    unwrap(ipcRenderer.invoke(IPC.registryUpsert, { item }) as Promise<IpcResult<ServerViewModel>>),
  deleteServer: (id) => unwrapVoid(ipcRenderer.invoke(IPC.registryDelete, { id }) as Promise<IpcResult<void>>),
  install: (id) => unwrap(ipcRenderer.invoke(IPC.runtimeInstall, id) as Promise<IpcResult<ServerViewModel>>),
  start: (id) => unwrap(ipcRenderer.invoke(IPC.runtimeStart, id) as Promise<IpcResult<ServerViewModel>>),
  stop: (id) => unwrap(ipcRenderer.invoke(IPC.runtimeStop, id) as Promise<IpcResult<ServerViewModel>>),
  restart: (id) => unwrap(ipcRenderer.invoke(IPC.runtimeRestart, id) as Promise<IpcResult<ServerViewModel>>),
  tunnel: (id) => unwrap(ipcRenderer.invoke(IPC.runtimeTunnel, id) as Promise<IpcResult<ServerViewModel>>),
  tunnelStop: (id) => unwrap(ipcRenderer.invoke(IPC.runtimeTunnelStop, id) as Promise<IpcResult<ServerViewModel>>),
  refreshTools: (id) =>
    unwrap(
      ipcRenderer.invoke(IPC.refreshTools, id) as Promise<IpcResult<{ tools: McpToolDescriptor[]; count: number }>>
    ),
  checkPort: (id) => unwrap(ipcRenderer.invoke(IPC.checkPort, id) as Promise<IpcResult<{ free: boolean; inUse: boolean; suggested?: number }>>),
  pickRandomPort: () => unwrap(ipcRenderer.invoke(IPC.pickPort) as Promise<IpcResult<{ port: number }>>),
  setPort: (id, config) => unwrap(ipcRenderer.invoke(IPC.setPort, { id, config }) as Promise<IpcResult<ServerViewModel>>),
  getLogs: (id, max) => ipcRenderer.invoke(IPC.getLogs, { id, max }) as Promise<LogEntry[]>,
  onState: (cb) => {
    const fn = (_: unknown, p: { view: ServerViewModel }) => cb(p)
    ipcRenderer.on(IPC.onState, fn)
    return () => {
      ipcRenderer.removeListener(IPC.onState, fn)
    }
  },
  onAuthChanged: (cb) => {
    const fn = (_: unknown, a: AuthViewModel) => cb(a)
    ipcRenderer.on(IPC.onAuth, fn)
    return () => {
      ipcRenderer.removeListener(IPC.onAuth, fn)
    }
  },
  onLogs: (cb) => {
    const fn = (_: unknown, e: { id: string; log: LogEntry; tail: LogEntry[] }) => cb(e)
    ipcRenderer.on(IPC.onLogs, fn)
    return () => {
      ipcRenderer.removeListener(IPC.onLogs, fn)
    }
  },
  openMcpDocs: () => {
    void ipcRenderer.invoke('mcpoke:ref:mcp')
  },
  openPokeNpm: () => {
    void ipcRenderer.invoke('mcpoke:ref:poke')
  },
  openMcpInspector: (url: string) => {
    void ipcRenderer.invoke('mcpoke:ref:inspector', url)
  },
  platform: process.platform,
  versions: { electron: process.versions.electron, node: process.versions.node, mcpoke: '0.1.0' }
}

void ipcRenderer.invoke('mcpoke:version').then((v) => {
  if (v && typeof v === 'object' && v !== null) {
    const x = v as { electron: string; node: string; mcpoke: string }
    api.versions = { ...api.versions, ...x }
  }
})

contextBridge.exposeInMainWorld('mcpoke', api)

declare global {
  interface Window {
    mcpoke: ElectronApi
  }
}
