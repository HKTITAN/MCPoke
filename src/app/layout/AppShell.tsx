import { useEffect } from 'react'
import { useAppStore } from '../../state/appStore'
import { RegistryTable } from '../../features/registry/RegistryTable'
import { ServerInspector } from '../../features/inspector/ServerInspector'
import { LogsPanel } from '../../features/logs/LogsPanel'
import { CommandPalette } from '../../features/command/CommandPalette'

const tabs = [
  { id: 'registry' as const, label: 'Registry' },
  { id: 'auth' as const, label: 'Auth' },
  { id: 'running' as const, label: 'Running' },
  { id: 'logs' as const, label: 'Logs' },
  { id: 'settings' as const, label: 'Settings' }
]

export function AppShell() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const init = useAppStore((s) => s.init)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const auth = useAppStore((s) => s.auth)
  const loadRegistry = useAppStore((s) => s.loadRegistry)
  const servers = useAppStore((s) => s.servers)

  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 border-b border-(--color-border) bg-(--color-surface) flex items-center gap-2 px-2 py-0.5">
        <div className="text-[12px] font-semibold tracking-tight text-(--color-fg)">MCPoke</div>
        <div className="h-3 w-px bg-(--color-border) mx-0.5" />
        <nav className="flex gap-0.5">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'mcpoke-btn text-(--color-fg) border-(--color-accent)/40'
                  : 'mcpoke-btn-ghost'
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="text-[10px] text-(--color-muted) flex items-center gap-2 max-w-md truncate" title={auth?.identityLabel}>
          {auth?.state === 'authenticated' && (
            <span>
              {auth.identityLabel} <span className="text-(--color-muted)">{auth.tokenPreview}</span>
            </span>
          )}
          {auth?.state === 'unauthenticated' && <span>Not signed in</span>}
          {auth?.state === 'expired' && <span className="text-(--color-warn)">Session expired</span>}
        </div>
        <button type="button" className="mcpoke-btn" onClick={() => setCommandOpen(true)}>
          ⌘K
        </button>
      </header>
      <div className="flex-1 min-h-0 flex">
        {tab === 'registry' && (
          <>
            <RegistryTable />
            <ServerInspector />
          </>
        )}
        {tab === 'auth' && (
          <div className="flex-1 p-3">
            <AuthPane />
          </div>
        )}
        {tab === 'running' && (
          <div className="flex-1 p-2 mcpoke-scroll text-[12px]">
            {servers
              .filter((s) =>
                s.running.state === 'running' ||
                s.running.state === 'tunneling' ||
                s.running.state === 'tunneled' ||
                s.running.state === 'deployed' ||
                s.running.state === 'starting'
              )
              .map((s) => (
                <div key={s.item.id} className="mcpoke-row mcpoke-panel border-b border-(--color-border)">
                  <span className="font-mono w-6">{s.running.state}</span>
                  <span className="flex-1 font-medium">{s.item.name}</span>
                  <span className="text-(--color-muted)">pid {s.running.pid ?? '—'}</span>
                </div>
              ))}
            {servers.filter((s) => ['running', 'tunneling', 'tunneled', 'deployed'].includes(s.running.state)).length === 0 && (
              <div className="text-(--color-muted)">No active run/tunnel. Start a server from Registry.</div>
            )}
          </div>
        )}
        {tab === 'logs' && (
          <div className="flex-1 min-h-0 p-0 border-t border-(--color-border)">
            <LogsPanel />
          </div>
        )}
        {tab === 'settings' && (
          <div className="flex-1 p-3 text-[12px] space-y-2 text-(--color-fg)">
            <h2 className="text-sm font-medium">Settings & references</h2>
            <p className="text-(--color-muted) text-[12px]">
              MCPoke connects local Model Context Protocol servers, inspects tools, streams logs, and can tunnel HTTP MCP endpoints to Poke with the
              <code className="mx-0.5 font-mono text-[11px]">poke</code> package (see <kbd>npm: poke</kbd>).
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-(--color-muted)">
              <li>
                <button type="button" className="mcpoke-btn-ghost text-(--color-accent) p-0" onClick={() => window.mcpoke.openMcpDocs()}>
                  modelcontextprotocol (GitHub)
                </button>
              </li>
              <li>
                <button type="button" className="mcpoke-btn-ghost text-(--color-accent) p-0" onClick={() => window.mcpoke.openPokeNpm()}>
                  Poke SDK on npm
                </button>
              </li>
              <li>
                <button type="button" className="mcpoke-btn-ghost text-(--color-accent) p-0" onClick={() => window.mcpoke.openMcpInspector('')}>
                  MCP Inspector
                </button>
              </li>
            </ul>
            <p className="text-[10px] text-(--color-muted)">
              Node {window.mcpoke.versions.node} · Electron {window.mcpoke.versions.electron} · {window.mcpoke.platform}
            </p>
            <button
              type="button"
              className="mcpoke-btn"
              onClick={() => {
                void loadRegistry()
              }}
            >
              Rescan registry
            </button>
          </div>
        )}
      </div>
      <CommandPalette />
    </div>
  )
}

function AuthPane() {
  const setAuth = useAppStore((s) => s.setAuth)
  return (
    <div className="max-w-md space-y-2 text-[12px]">
      <p className="text-(--color-muted)">Poke.com device login via the `poke` SDK. Credentials: ~/.config/poke (or $XDG_CONFIG_HOME).</p>
      <div className="flex gap-1">
        <button
          type="button"
          className="mcpoke-btn-pri"
          onClick={async () => {
            const a = await window.mcpoke.login()
            setAuth(a)
          }}
        >
          Login
        </button>
        <button
          type="button"
          className="mcpoke-btn"
          onClick={async () => {
            const a = await window.mcpoke.logout()
            setAuth(a)
          }}
        >
          Logout
        </button>
        <button
          type="button"
          className="mcpoke-btn-ghost"
          onClick={async () => {
            setAuth(await window.mcpoke.getAuth())
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
