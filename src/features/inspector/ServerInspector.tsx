import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../state/appStore'
import type { PortConfig, ServerRegistryItem, ServerTransport } from '../../../shared/mcp-types.js'
import { DEFAULT_PLATFORM } from '../../../shared/mcp-types.js'
import { chipDeploy, chipRun, chipSurface, chipTransport } from '../registry/statusFormat'

export function ServerInspector() {
  const selectedId = useAppStore((s) => s.selectedId)
  const servers = useAppStore((s) => s.servers)
  const loadRegistry = useAppStore((s) => s.loadRegistry)
  const row = servers.find((x) => x.item.id === selectedId)
  const [portIn, setPortIn] = useState('')
  const [portMode, setPortMode] = useState<'manual' | 'random'>('random')
  const [err, setErr] = useState<string | null>(null)
  const endpointSummary = useMemo(() => {
    if (!row) return '—'
    return row.endpoint.pokeUrl ?? row.endpoint.remoteUrl ?? row.endpoint.localUrl ?? '—'
  }, [row])

  useEffect(() => {
    if (!row) return
    const p = row.port
    setPortMode(p.mode === 'manual' ? 'manual' : 'random')
    setPortIn(p.value ? String(p.value) : '')
  }, [row?.item.id, row?.port.value, row?.port.mode])

  if (!row) {
    return (
      <div className="mcpoke-panel h-full flex flex-col border-l border-(--color-border) w-[360px] shrink-0">
        <div className="border-b border-(--color-border) px-2 py-1 text-[10px] uppercase text-(--color-muted)">Inspector</div>
        <div className="p-2 text-(--color-muted) text-[12px]">Select a row. Add a custom server:</div>
        <AddCustomForm onDone={() => void loadRegistry()} />
      </div>
    )
  }

  const id = row.item.id
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      await fn()
      await loadRegistry()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const applyPort = async () => {
    const v = portMode === 'manual' && portIn ? parseInt(portIn, 10) : undefined
    if (portMode === 'manual' && (!v || Number.isNaN(v))) {
      setErr('Port must be a number for manual mode')
      return
    }
    const config: PortConfig =
      portMode === 'random'
        ? { mode: 'random', status: 'none' }
        : { mode: 'manual', value: v, status: 'none' }
    await run(() => window.mcpoke.setPort(id, config))
  }

  return (
    <div className="mcpoke-panel h-full flex flex-col border-l border-(--color-border) w-[380px] shrink-0 min-h-0">
      <div className="border-b border-(--color-border) px-2 py-1 flex justify-between items-center">
        <span className="text-[10px] uppercase text-(--color-muted)">Inspector</span>
        <span className="text-[10px] font-mono text-(--color-muted) truncate max-w-[180px]" title={id}>
          {id}
        </span>
      </div>
      <div className="mcpoke-scroll flex-1 p-2 space-y-2 text-[12px]">
        {err && <div className="text-(--color-danger) text-[11px] border border-red-500/20 p-1 rounded">{err}</div>}
        <div className="mcpoke-panel p-2 space-y-1">
          <div className="text-(--color-muted) text-[10px] uppercase">State surface</div>
          <div className="flex flex-wrap items-center gap-1">
            {chipTransport(row.endpoint.transport)}
            {chipSurface(row.surfaceState)}
            {chipRun(row.running.state)}
            {chipDeploy(row.deployment.state)}
            <span className={row.poke.authState === 'authenticated' ? 'mcpoke-chip text-(--color-ok) border-emerald-500/20' : 'mcpoke-chip text-(--color-warn) border-amber-500/30'}>
              auth {row.poke.authState}
            </span>
            <span className={row.poke.connected ? 'mcpoke-chip text-(--color-ok) border-emerald-500/20' : 'mcpoke-chip'}>
              poke {row.poke.connected ? 'connected' : 'idle'}
            </span>
          </div>
          <div className="text-[10px] text-(--color-muted) font-mono break-all">
            endpoint {endpointSummary}
          </div>
          {row.lastError && <div className="text-[10px] text-(--color-danger)">last error: {row.lastError}</div>}
          {row.poke.lastSyncAt && (
            <div className="text-[10px] text-(--color-muted)">
              last sync {new Date(row.poke.lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        <div className="mcpoke-panel p-2 space-y-1">
          <div className="text-(--color-muted) text-[10px] uppercase">Deployment instructions</div>
          <ul className="space-y-0.5">
            {row.deployment.instructions.map((step, idx) => (
              <li key={step + idx} className="text-[11px] text-(--color-fg) flex items-start gap-1">
                <span className="text-(--color-muted) w-3 text-right">{idx + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-(--color-muted) text-[10px] uppercase mb-0.5">Connection</div>
          <div className="font-mono text-[11px] text-(--color-fg)">{row.connection}</div>
          {row.tunnel.tunnelUrl && (
            <div className="font-mono text-[10px] text-(--color-accent) break-all mt-0.5" title="Tunnel URL">
              {row.tunnel.tunnelUrl}
            </div>
          )}
          {row.tunnel.localUrl && (
            <div className="font-mono text-[10px] text-(--color-muted) break-all">local {row.tunnel.localUrl}</div>
          )}
        </div>
        {row.item.config.transport === 'http' && row.endpoint.origin === 'local' && (
          <div>
            <div className="text-(--color-muted) text-[10px] uppercase mb-0.5">Port</div>
            <div className="flex gap-1 items-center flex-wrap">
              <select
                className="mcpoke-input w-24"
                value={portMode}
                onChange={(e) => setPortMode(e.target.value as 'manual' | 'random')}
              >
                <option value="random">random</option>
                <option value="manual">manual</option>
              </select>
              {portMode === 'manual' && (
                <input className="mcpoke-input w-20" value={portIn} onChange={(e) => setPortIn(e.target.value)} placeholder="3000" />
              )}
              <button type="button" className="mcpoke-btn" onClick={() => void applyPort()}>
                Apply
              </button>
              <button
                type="button"
                className="mcpoke-btn-ghost"
                onClick={() => void run(() => window.mcpoke.checkPort(id))}
              >
                Check
              </button>
              <button
                type="button"
                className="mcpoke-btn-ghost"
                onClick={() =>
                  void run(async () => {
                    const r = await window.mcpoke.pickRandomPort()
                    setPortMode('manual')
                    setPortIn(String(r.port))
                  })
                }
              >
                Pick
              </button>
            </div>
            {row.port.status === 'conflict' && (
              <div className="text-(--color-warn) text-[10px] mt-0.5">Conflict on this port — change or free it.</div>
            )}
          </div>
        )}
        <div>
          <div className="text-(--color-muted) text-[10px] uppercase mb-1">Operator actions</div>
          <div className="flex flex-wrap gap-0.5">
            <Act label="Install" onClick={() => run(() => window.mcpoke.install(id))} />
            <Act label="Start" onClick={() => run(() => window.mcpoke.start(id))} />
            <Act label="Stop" onClick={() => run(() => window.mcpoke.stop(id))} />
            <Act label="Restart" onClick={() => run(() => window.mcpoke.restart(id))} />
            <Act label="Tunnel" onClick={() => run(() => window.mcpoke.tunnel(id))} />
            <Act label="Tunnel off" onClick={() => run(() => window.mcpoke.tunnelStop(id))} />
            <Act label="Tools" onClick={() => run(() => window.mcpoke.refreshTools(id))} />
            <Act label="Inspector ↗" onClick={() => window.mcpoke.openMcpInspector('https://github.com/modelcontextprotocol/inspector')} />
            {row.lastError && <Act label="Recover" onClick={() => run(() => window.mcpoke.restart(id))} />}
          </div>
        </div>
        <div>
          <div className="text-(--color-muted) text-[10px] uppercase mb-0.5">Tools ({row.toolsCount})</div>
          <div className="font-mono text-[10px] max-h-40 mcpoke-scroll border border-(--color-border) rounded p-1 bg-(--color-canvas)">
            {row.tools.length === 0 && <span className="text-(--color-muted)">— tools appear after successful connection</span>}
            {row.tools.map((t) => (
              <div key={t.name} className="border-b border-(--color-border) last:border-0 py-0.5">
                <span className="text-(--color-fg)">{t.name}</span>
                {t.description && <div className="text-(--color-muted) text-[9px]">{t.description}</div>}
              </div>
            ))}
          </div>
        </div>
        {row.item.source === 'custom' && (
          <button
            type="button"
            className="mcpoke-btn text-(--color-danger) border-red-500/20"
            onClick={() =>
              void run(async () => {
                await window.mcpoke.deleteServer(id)
                useAppStore.getState().setSelectedId(null)
              })
            }
          >
            Delete custom
          </button>
        )}
      </div>
    </div>
  )
}

function Act({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="mcpoke-btn text-[11px]" onClick={onClick}>
      {label}
    </button>
  )
}

function AddCustomForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('My MCP')
  const [desc, setDesc] = useState('')
  const [transport, setTransport] = useState<ServerTransport>('stdio')
  const [cmd, setCmd] = useState('npx')
  const [args, setArgs] = useState('-y @modelcontextprotocol/server-filesystem .')
  const [pkg, setPkg] = useState('@modelcontextprotocol/server-filesystem')
  const [ext, setExt] = useState(false)
  const [mcpPath, setMcpPath] = useState('/mcp')
  const [remoteUrl, setRemoteUrl] = useState('')

  const submit = async () => {
    const item: ServerRegistryItem = {
      id: crypto.randomUUID(),
      name,
      description: desc,
      source: 'custom',
      config: {
        transport,
        remoteUrl: transport === 'sse' && remoteUrl ? remoteUrl : undefined,
        packageSpec: pkg || undefined,
        command: cmd,
        args: args.split(/\s+/).filter(Boolean),
        mcpPath: transport === 'http' ? mcpPath : undefined,
        useExternalStart: transport === 'http' ? ext : undefined
      },
      platform: DEFAULT_PLATFORM,
      lastSync: Date.now()
    }
    await window.mcpoke.upsertServer(item)
    onDone()
  }

  return (
    <div className="px-2 pb-2 space-y-1.5 text-[12px]">
      <input className="mcpoke-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input className="mcpoke-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" />
      <select className="mcpoke-input" value={transport} onChange={(e) => setTransport(e.target.value as ServerTransport)}>
        <option value="stdio">stdio</option>
        <option value="http">http</option>
        <option value="sse">sse</option>
      </select>
      {transport === 'sse' && (
        <input className="mcpoke-input" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="remote endpoint URL" />
      )}
      <input className="mcpoke-input" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="npm package (install)" />
      <input className="mcpoke-input" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="internal start command" />
      {transport !== 'sse' && (
        <input className="mcpoke-input" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="internal start args (space-separated)" />
      )}
      {transport === 'http' && (
        <>
          <label className="flex items-center gap-1 text-(--color-muted) text-[11px]">
            <input type="checkbox" checked={ext} onChange={(e) => setExt(e.target.checked)} />
            External start (you run the server)
          </label>
          <input className="mcpoke-input" value={mcpPath} onChange={(e) => setMcpPath(e.target.value)} placeholder="MCP path e.g. /mcp" />
        </>
      )}
      <button type="button" className="mcpoke-btn-pri w-full" onClick={() => void submit()}>
        Add custom server
      </button>
    </div>
  )
}
