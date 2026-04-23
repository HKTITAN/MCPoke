import type { DeploymentState, RuntimeState, ServerSurfaceState, ServerTransport } from '../../../shared/mcp-types.js'

const runLabels: Record<RuntimeState, string> = {
  idle: 'idle',
  installing: 'installing',
  installed: 'installed',
  starting: 'starting',
  running: 'running',
  tunneling: 'tunneling',
  tunneled: 'tunneled',
  deployed: 'deployed',
  stopping: 'stopping',
  error: 'error'
}

const surfaceLabels: Record<ServerSurfaceState, string> = {
  remote_http: 'remote http',
  remote_sse: 'remote sse',
  local_started: 'local',
  tunneling: 'tunneling',
  tunneled: 'tunneled',
  needs_tunnel: 'needs tunnel'
}

const deployLabels: Record<DeploymentState, string> = {
  pending: 'pending',
  syncing: 'syncing',
  synced: 'synced',
  deployed: 'deployed',
  error: 'error'
}

export function short(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n) + '…'
}

export function chipRun(s: RuntimeState) {
  const danger = s === 'error'
  const good = s === 'running' || s === 'tunneling' || s === 'tunneled' || s === 'deployed'
  return (
    <span
      className={`mcpoke-chip ${
        danger ? 'text-(--color-danger) border-red-500/20' : good ? 'text-(--color-ok) border-emerald-500/20' : ''
      }`}
    >
      {runLabels[s] ?? s}
    </span>
  )
}

export function chipInstall(i: boolean) {
  return (
    <span className={i ? 'mcpoke-chip text-(--color-ok) border-emerald-500/20' : 'mcpoke-chip border-dashed'}>
      in {i ? '✓' : '—'}
    </span>
  )
}

export function chipSurface(s: ServerSurfaceState) {
  const good = s === 'remote_http' || s === 'remote_sse' || s === 'tunneled'
  const warn = s === 'needs_tunnel' || s === 'tunneling'
  return (
    <span className={`mcpoke-chip ${good ? 'text-(--color-ok) border-emerald-500/20' : warn ? 'text-(--color-warn) border-amber-500/30' : ''}`}>
      {surfaceLabels[s]}
    </span>
  )
}

export function chipDeploy(s: DeploymentState) {
  const good = s === 'deployed' || s === 'synced'
  const warn = s === 'syncing' || s === 'pending'
  const bad = s === 'error'
  return (
    <span
      className={`mcpoke-chip ${good ? 'text-(--color-ok) border-emerald-500/20' : warn ? 'text-(--color-warn) border-amber-500/30' : bad ? 'text-(--color-danger) border-red-500/30' : ''}`}
    >
      {deployLabels[s]}
    </span>
  )
}

export function chipTransport(t: ServerTransport) {
  return <span className="mcpoke-chip font-mono">{t}</span>
}
