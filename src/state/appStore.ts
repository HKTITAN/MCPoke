import { create } from 'zustand'
import type { AuthViewModel, LogEntry, ServerViewModel } from '../../shared/mcp-types.js'

type Tab = 'registry' | 'auth' | 'running' | 'logs' | 'settings'

type AppState = {
  tab: Tab
  setTab: (t: Tab) => void
  auth: AuthViewModel | null
  setAuth: (a: AuthViewModel) => void
  servers: ServerViewModel[]
  setServers: (s: ServerViewModel[]) => void
  mergeView: (v: ServerViewModel) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  logs: LogEntry[]
  setLogs: (e: LogEntry[]) => void
  appendLogEvent: (e: { id: string; log: LogEntry; tail: LogEntry[] }) => void
  commandOpen: boolean
  setCommandOpen: (o: boolean) => void
  loadRegistry: () => Promise<void>
  init: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  tab: 'registry',
  setTab: (t) => set({ tab: t }),
  auth: null,
  setAuth: (a) => set({ auth: a }),
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
  appendLogEvent: (e) => {
    const selected = get().selectedId
    if (selected && e.id === selected) set({ logs: e.tail })
  },
  commandOpen: false,
  setCommandOpen: (o) => set({ commandOpen: o }),
  loadRegistry: async () => {
    const s = await window.mcpoke.listRegistry()
    set({ servers: s })
  },
  init: () => {
    const api = window.mcpoke
    void api.getAuth().then((a) => set({ auth: a }))
    void get().loadRegistry()
    api.onState((m) => get().mergeView(m.view))
    api.onLogs((e) => get().appendLogEvent(e))
    api.onAuthChanged((a) => set({ auth: a }))
  }
}))

export function getSelectedView(): ServerViewModel | null {
  const s = useAppStore.getState()
  if (!s.selectedId) return null
  return s.servers.find((x) => x.item.id === s.selectedId) ?? null
}
