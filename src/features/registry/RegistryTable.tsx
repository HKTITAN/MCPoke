import { useAppStore } from '../../state/appStore'
import { chipRun, chipInstall } from './statusFormat'

function chipTunnel(on: boolean) {
  return (
    <span className={on ? 'mcpoke-chip text-(--color-ok) border-emerald-500/20' : 'mcpoke-chip'}>
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
        <div className="flex-1 min-w-[200px]">Name</div>
        <div className="w-20">Source</div>
        <div className="w-20">Run</div>
        <div className="w-20">I</div>
        <div className="w-20">Tnl</div>
        <div className="w-20">Port</div>
        <div className="w-20">#t</div>
        <div className="w-8" title="Poke tools sync" />
      </div>
      <div className="mcpoke-scroll flex-1">
        {servers.map((row) => {
          const id = row.item.id
          const isSel = selectedId === id
          const port = row.port.assigned ?? row.port.value ?? '—'
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
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium text-(--color-fg) truncate" title={row.item.name}>
                  {row.item.name}
                </div>
                <div className="text-[10px] text-(--color-muted) truncate" title={row.item.description}>
                  {row.item.description}
                </div>
              </div>
              <div className="w-20 text-[10px] text-(--color-muted) font-mono">{row.item.source === 'preset' ? 'P' : 'C'}</div>
              <div className="w-20">{chipRun(row.running.state)}</div>
              <div className="w-20">{chipInstall(row.installed.installed)}</div>
              <div className="w-20">{chipTunnel(!!row.tunnel.active)}</div>
              <div className="w-20 text-[10px] font-mono" title="Assigned / config">
                {port}
                {row.port.status === 'conflict' && <span className="text-(--color-danger)"> !</span>}
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
