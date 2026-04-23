import { useAppStore } from '../../state/appStore'
import { chipRun, chipSurface, chipDeploy, chipTransport, short } from './statusFormat'
import { sounds } from '../../renderer/sounds'

function chipTunnel(on: boolean, authState: string) {
  const warn = !on && authState !== 'authenticated'
  return (
    <span className="mcpoke-chip" style={on
      ? { color: 'var(--color-ok)', borderColor: 'rgba(34,197,94,0.2)' }
      : warn
      ? { color: 'var(--color-warn)', borderColor: 'rgba(245,158,11,0.3)' }
      : {}
    }>
      {on ? 'active' : warn ? 'no auth' : 'off'}
    </span>
  )
}

export function RegistryTable() {
  const servers = useAppStore((s) => s.servers)
  const selectedId = useAppStore((s) => s.selectedId)
  const setSelectedId = useAppStore((s) => s.setSelectedId)
  return (
    <div className="mcpoke-table-wrap">
      <div className="mcpoke-col-head">
        <div className="col-dot" />
        <div className="col-name">Name</div>
        <div className="col-sm">Transport</div>
        <div className="col-md">Surface</div>
        <div className="col-sm">Run</div>
        <div className="col-sm">Deploy</div>
        <div className="col-sm">Tunnel</div>
        <div className="col-sm">Port</div>
        <div className="col-lg">Endpoint</div>
        <div className="col-xs">Tools</div>
      </div>
      <div className="mcpoke-table-rows">
        {servers.map((row) => {
          const id = row.item.id
          const isSel = selectedId === id
          const port = row.port.assigned ?? row.port.value ?? '—'
          const endpoint = row.endpoint.pokeUrl ?? row.endpoint.remoteUrl ?? row.endpoint.localUrl ?? '—'
          const isActive = ['running', 'tunneling', 'tunneled', 'deployed'].includes(row.running.state)
          return (
            <div
              key={id}
              onClick={() => { setSelectedId(id); sounds.select() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedId(id); sounds.select() } }}
              role="row"
              tabIndex={0}
              className={`mcpoke-data-row${isSel ? ' is-selected' : ''}`}
            >
              <div className="col-dot">
                {isActive && <div className="mcpoke-dot mcpoke-dot-ok" />}
                {row.running.state === 'error' && <div className="mcpoke-dot mcpoke-dot-err" />}
              </div>
              <div className="col-name">
                <div className="mcpoke-card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }} title={row.item.name}>
                  {row.item.name}
                </div>
                {row.item.description && (
                  <div className="mcpoke-card-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.item.description}>
                    {row.item.description}
                  </div>
                )}
              </div>
              <div className="col-sm">{chipTransport(row.endpoint.transport)}</div>
              <div className="col-md">{chipSurface(row.surfaceState)}</div>
              <div className="col-sm">{chipRun(row.running.state)}</div>
              <div className="col-sm">{chipDeploy(row.deployment.state)}</div>
              <div className="col-sm">{chipTunnel(!!row.tunnel.active, row.poke.authState)}</div>
              <div className="col-sm mcpoke-id-code" title="port">
                {port}
                {row.port.status === 'conflict' && <span style={{ color: 'var(--color-danger)', marginLeft: '0.125rem' }}>!</span>}
              </div>
              <div className="col-lg mcpoke-id-code" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={endpoint}>
                {short(endpoint, 34)}
              </div>
              <div className="col-xs mcpoke-id-code">
                {row.toolsCount ? <span style={{ color: 'var(--color-fg)' }}>{row.toolsCount}</span> : '—'}
              </div>
            </div>
          )
        })}
        {servers.length === 0 && (
          <div className="mcpoke-log-empty">
            <div>No servers in registry</div>
            <div style={{ fontSize: '10px', marginTop: '0.25rem' }}>Add a custom server in the inspector →</div>
          </div>
        )}
      </div>
    </div>
  )
}
