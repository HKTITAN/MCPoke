import { useCallback, useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useAppStore } from '../../state/appStore'
import { Z_INDEX } from './constants'

const actions = (sel: string | null) => {
  const a = (label: string, k: string, run: () => void) => ({ label, k, run })
  return [
    a('Open Registry', 'registry', () => useAppStore.getState().setTab('registry')),
    a('Poke: Login', 'login', () => {
      void window.mcpoke.login()
    }),
    a('Poke: Logout', 'logout', () => {
      void window.mcpoke.logout()
    }),
    a('Auth tab', 'auth', () => useAppStore.getState().setTab('auth')),
    a('Running tab', 'running', () => useAppStore.getState().setTab('running')),
    a('Logs tab', 'logs', () => useAppStore.getState().setTab('logs')),
    a('Settings', 'settings', () => useAppStore.getState().setTab('settings')),
    a('MCP: GitHub (docs)', 'mcp', () => window.mcpoke.openMcpDocs()),
    a('Poke SDK (npm)', 'poke', () => window.mcpoke.openPokeNpm()),
    a('MCP Inspector (repo)', 'inspector', () => window.mcpoke.openMcpInspector('https://github.com/modelcontextprotocol/inspector')),
    ...(sel
      ? [
          a('Selected: Install', 'install', () => {
            const id = useAppStore.getState().selectedId
            if (id) void window.mcpoke.install(id)
          }),
          a('Selected: Start', 'start', () => {
            const id = useAppStore.getState().selectedId
            if (id) void window.mcpoke.start(id)
          }),
          a('Selected: Stop', 'stop', () => {
            const id = useAppStore.getState().selectedId
            if (id) void window.mcpoke.stop(id)
          }),
          a('Selected: Tunnel', 'tunnel', () => {
            const id = useAppStore.getState().selectedId
            if (id) void window.mcpoke.tunnel(id)
          }),
          a('Selected: Stop tunnel', 'tunnel off', () => {
            const id = useAppStore.getState().selectedId
            if (id) void window.mcpoke.tunnelStop(id)
          })
        ]
      : [])
  ]
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen)
  const setOpen = useAppStore((s) => s.setCommandOpen)
  const selectedId = useAppStore((s) => s.selectedId)
  const [q, setQ] = useState('')

  const go = useCallback(
    (fn: () => void) => {
      setOpen(false)
      fn()
    },
    [setOpen]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!useAppStore.getState().commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[10vh] bg-black/50"
      style={{ zIndex: Z_INDEX }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mcpoke-panel w-full max-w-lg shadow-2xl"
      >
        <Command
          className="rounded-md"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
        >
          <div className="border-b border-(--color-border) px-2 py-1">
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Quick action… (Esc)"
              className="mcpoke-input w-full"
              autoFocus
            />
            <p className="text-[10px] text-(--color-muted) mt-0.5">⌘K · dense ops · enter to run</p>
          </div>
          <Command.List>
            <Command.Empty className="mcpoke-row text-(--color-muted)">No match.</Command.Empty>
            {actions(selectedId).map((x) => (
              <Command.Item
                key={x.k + x.label}
                value={x.label + ' ' + x.k}
                onSelect={() => go(x.run)}
                className="mcpoke-row"
              >
                <span className="flex-1 text-(--color-fg)">{x.label}</span>
                <span className="mcpoke-chip">{x.k}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
