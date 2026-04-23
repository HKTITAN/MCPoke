import { useAppStore } from '../../state/appStore'
import { chipRun, chipSurface, chipDeploy, chipTransport, short } from './statusFormat'

function chipTunnel(on: boolean, authState: string) {
  const warn = !on && authState !== 'authenticated'
  return (
    <span className={on ? 'mcpoke-chip text-(--color-ok) border-emerald-500/20' : warn ? 'mcpoke-chip text-(--color-warn) border-amber-500/30' : 'mcpoke-chip'}>
      tnl {on ? 'on' : '·'}
    </span>
  )
}

export function RegistryTable() {
  const servers = useAppStore((s) => s.servers)
  const selectedId = useAppStore((s) => s.selectedId)
  const setSelectedId = useAppStore((s) => s.setSelectedId)
  return (
    <div className="mcpoke-panel flex-1 min-h-0 min-w-0 flex flex-col">
      <div className="mcpoke-table-head flex items-center border-b border-(--color-border) text-[10px]">
        <div className="w-8" />
        <div className="flex-1 min-w-[220px]">Name</div>
        <div className="w-22">Transport</div>
        <div className="w-28">Surface</div>
        <div className="w-20">Run</div>
        <div className="w-20">Deploy</div>
        <div className="w-20">Tnl</div>
        <div className="w-20">Port</div>
        <div className="w-36">Endpoint</div>
        <div className="w-20">#t</div>
        <div className="w-8" title="Poke tools sync" />
      </div>
      <div className="mcpoke-scroll flex-1">
        {servers.map((row) => {
          const id = row.item.id
          const isSel = selectedId === id
          const port = row.port.assigned ?? row.port.value ?? '—'
          const endpoint = row.endpoint.pokeUrl ?? row.endpoint.remoteUrl ?? row.endpoint.localUrl ?? '—'
          return (
            <div
              key={id}
              onClick={() => setSelectedId(id)}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedId(id)}
              role="row"
              tabIndex={0}
              className={`mcpoke-row border-b border-(--color-border) cursor-default gap-0 ${isSel ? 'bg-(--color-elevated)' : 'hover:bg-(--color-elevated)/60'}`}
            >
              <div className="w-6 text-(--color-muted)">
                {row.item.pinned ? '·' : ''}
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="font-medium text-(--color-fg) truncate" title={row.item.name}>
                  {row.item.name}
                </div>
                <div className="text-[10px] text-(--color-muted) truncate" title={row.item.description}>
                  {row.item.description}
                </div>
              </div>
              <div className="w-22">{chipTransport(row.endpoint.transport)}</div>
              <div className="w-28">{chipSurface(row.surfaceState)}</div>
              <div className="w-20">{chipRun(row.running.state)}</div>
              <div className="w-20">{chipDeploy(row.deployment.state)}</div>
              <div className="w-20">{chipTunnel(!!row.tunnel.active, row.poke.authState)}</div>
              <div className="w-20 text-[10px] font-mono" title="Assigned / config">
                {port}
                {row.port.status === 'conflict' && <span className="text-(--color-danger)"> !</span>}
              </div>
              <div className="w-36 text-[10px] font-mono text-(--color-muted) truncate" title={endpoint}>
                {short(endpoint, 34)}
              </div>
              <div className="w-20 text-[10px] font-mono text-(--color-muted)">{row.toolsCount || '—'}</div>
            </div>
          )
        })}
        {servers.length === 0 && (
          <div className="mcpoke-row text-(--color-muted) p-3">No servers — add a custom one in the inspector when nothing is selected, or use presets after pull.</div>
        )}
      </div>
    </div>
  )
}
