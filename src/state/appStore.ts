import { create } from 'zustand'
import type { AuthViewModel, LogEntry, McpokeSettings, McpRegistryEntry, ServerViewModel } from '../../shared/mcp-types.js'
import type { AuthErrorEvent } from '../../shared/ipc.js'

type Tab = 'registry' | 'browse' | 'auth' | 'running' | 'logs' | 'settings'

const GLOBAL_LOG_MAX = 2000

type AppState = {
  tab: Tab
  setTab: (t: Tab) => void
  auth: AuthViewModel | null
  authError: AuthErrorEvent | null
  loginCode: { userCode: string; loginUrl: string } | null
  setAuth: (a: AuthViewModel) => void
  setAuthError: (e: AuthErrorEvent | null) => void
  setLoginCode: (c: { userCode: string; loginUrl: string } | null) => void
  servers: ServerViewModel[]
  setServers: (s: ServerViewModel[]) => void
  mergeView: (v: ServerViewModel) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  /** Logs for the currently selected server */
  logs: LogEntry[]
  setLogs: (e: LogEntry[]) => void
  /** Global ring buffer — all servers, all activity */
  globalLogs: LogEntry[]
  appendLogEvent: (e: { id: string; log: LogEntry; tail: LogEntry[] }) => void
  commandOpen: boolean
  setCommandOpen: (o: boolean) => void
  loadRegistry: () => Promise<void>
  /** Official MCP registry marketplace */
  marketplace: McpRegistryEntry[]
  marketplaceLoading: boolean
  marketplaceError: string | null
  loadMarketplace: (search?: string) => Promise<void>
  init: () => void
  settings: McpokeSettings | null
  setSettings: (settings: McpokeSettings) => void
  updateSettings: (settings: Partial<McpokeSettings>) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  tab: 'registry',
  setTab: (t) => set({ tab: t }),
  auth: null,
  authError: null,
  loginCode: null,
  setAuth: (a) => set({ auth: a, authError: a.error ?? null }),
  setAuthError: (e) => set({ authError: e }),
  setLoginCode: (c) => set({ loginCode: c }),
  servers: [],
  setServers: (s) => set({ servers: s }),
  mergeView: (v) =>
    set((st) => ({
      servers: st.servers.map((x) => (x.item.id === v.item.id ? v : x))
    })),
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
  logs: [],
  setLogs: (e) => set({ logs: e }),
  globalLogs: [],
  appendLogEvent: (e) => {
    set((st) => {
      const entry = { ...e.log, serverId: e.id }
      const next = [...st.globalLogs, entry]
      if (next.length > GLOBAL_LOG_MAX) next.splice(0, next.length - GLOBAL_LOG_MAX)
      const patch: Partial<AppState> = { globalLogs: next }
      if (st.selectedId === e.id) patch.logs = e.tail
      return patch
    })
  },
  commandOpen: false,
  setCommandOpen: (o) => set({ commandOpen: o }),
  loadRegistry: async () => {
    const s = await window.mcpoke.listRegistry()
    set({ servers: s })
  },
  marketplace: [],
  marketplaceLoading: false,
  marketplaceError: null,
  loadMarketplace: async (search) => {
    set({ marketplaceLoading: true, marketplaceError: null })
    try {
      const entries = await window.mcpoke.fetchMarketplace(search)
      set({ marketplace: entries, marketplaceLoading: false })
    } catch (e) {
      set({ marketplaceError: e instanceof Error ? e.message : String(e), marketplaceLoading: false })
    }
  },
  settings: null,
  setSettings: (settings) => set({ settings }),
  updateSettings: async (settings) => {
    const next = await window.mcpoke.setSettings(settings)
    set({ settings: next })
  },
  init: () => {
    const api = window.mcpoke
    void api.getAuth().then((a) => set({ auth: a }))
    void api.getSettings().then((settings) => set({ settings }))
    void get().loadRegistry()
    api.onState((m) => get().mergeView(m.view))
    api.onLogs((e) => get().appendLogEvent(e))
    api.onAuthChanged((a) => { set({ auth: a, authError: a.error ?? null }); set({ loginCode: null }) })
    api.onLoginCode((c) => set({ loginCode: c }))
    api.onAuthError((error) => set({ authError: error }))
  }
}))

export function getSelectedView(): ServerViewModel | null {
  const s = useAppStore.getState()
  if (!s.selectedId) return null
  return s.servers.find((x) => x.item.id === s.selectedId) ?? null
}
