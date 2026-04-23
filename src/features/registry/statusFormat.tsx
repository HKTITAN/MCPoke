import type { RuntimeState } from '../../../shared/mcp-types.js'

const runLabels: Record<RuntimeState, string> = {
  idle: 'idle',
  installing: 'inst',
  installed: 'ok',
  starting: 'strt',
  running: 'run',
  tunneling: 'tun+',
  stopping: 'stop',
  error: 'err'
}

export function short(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n) + '…'
}

export function chipRun(s: RuntimeState) {
  const danger = s === 'error'
  const good = s === 'running' || s === 'tunneling'
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
