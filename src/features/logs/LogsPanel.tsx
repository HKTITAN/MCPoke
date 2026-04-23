import { useEffect, useMemo, useState } from 'react'
import type { LogEntry, LogLevel } from '../../../shared/mcp-types.js'
import { useAppStore } from '../../state/appStore'

const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']

export function LogsPanel() {
  const selectedId = useAppStore((s) => s.selectedId)
  const selected = useAppStore((s) => s.servers.find((x) => x.item.id === s.selectedId) ?? null)
  const servers = useAppStore((s) => s.servers)
  const storeLogs = useAppStore((s) => s.logs)
  const globalLogs = useAppStore((s) => s.globalLogs)
  const setLogs = useAppStore((s) => s.setLogs)
  const [q, setQ] = useState('')
  const [lv, setLv] = useState<LogLevel | 'all'>('all')
  const [stream, setStream] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'selected' | 'global'>('global')

  useEffect(() => {
    if (!selectedId) {
      setLogs([])
      return
    }
    void window.mcpoke.getLogs(selectedId, 2000).then(setLogs)
  }, [selectedId, setLogs])

  const activeLogs = viewMode === 'global' ? globalLogs : storeLogs

  const filtered = useMemo(() => {
    return activeLogs.filter((l) => {
      if (lv !== 'all' && l.level !== lv) return false
      if (stream !== 'all' && l.stream !== stream) return false
      if (q && !l.message.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [activeLogs, lv, stream, q])

  const copy = () => {
    const t = filtered.map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.serverName ?? l.serverId ?? ''} ${l.stream} ${l.level} ${l.message}`).join('\n')
    void navigator.clipboard.writeText(t)
  }

  const download = () => {
    const t = filtered.map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.serverName ?? l.serverId ?? ''} ${l.stream} ${l.level} ${l.message}`).join('\n')
    const b = new Blob([t], { type: 'text/plain' })
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u
    a.download = `mcpoke-${viewMode === 'global' ? 'all' : (selectedId ?? 'log')}.txt`
    a.click()
    URL.revokeObjectURL(u)
  }

  return (
    <div className="mcpoke-log-panel">
      <div className="mcpoke-log-toolbar">
        {/* View mode toggle */}
        <div className="mcpoke-seg">
          <button
            type="button"
            className={`mcpoke-seg-btn${viewMode === 'global' ? ' mcpoke-seg-btn-active' : ''}`}
            onClick={() => setViewMode('global')}
          >
            All activity
          </button>
          <button
            type="button"
            className={`mcpoke-seg-btn${viewMode === 'selected' ? ' mcpoke-seg-btn-active' : ''}`}
            onClick={() => setViewMode('selected')}
          >
            {selected?.item.name ?? 'Server'}
          </button>
        </div>

        <select className="mcpoke-input" style={{ width: '7rem' }} value={stream} onChange={(e) => setStream(e.target.value)}>
          <option value="all">all streams</option>
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
          <option value="system">system</option>
          <option value="tunnel">tunnel</option>
          <option value="poke">poke</option>
        </select>
        <select className="mcpoke-input" style={{ width: '7rem' }} value={lv} onChange={(e) => setLv(e.target.value as LogLevel | 'all')}>
          <option value="all">all levels</option>
          {levels.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <input className="mcpoke-input" style={{ flex: 1, minWidth: '7rem' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
        <button type="button" className="mcpoke-btn" onClick={copy}>Copy</button>
        <button type="button" className="mcpoke-btn" onClick={download}>Save</button>
        <span className="mcpoke-log-count">
          {filtered.length}/{activeLogs.length}
        </span>
      </div>

      {/* Server status bar (selected mode only) */}
      {viewMode === 'selected' && selected && (
        <div className="mcpoke-log-status">
          <span className="mcpoke-chip">{selected.running.state}</span>
          <span className="mcpoke-chip">{selected.deployment.state}</span>
          <span className="mcpoke-chip">{selected.surfaceState}</span>
          {selected.lastError && (
            <span className="mcpoke-log-error-inline">
              {selected.lastError}
            </span>
          )}
          {selected.poke.lastSyncAt && (
            <span style={{ marginLeft: 'auto' }}>synced {new Date(selected.poke.lastSyncAt).toLocaleTimeString()}</span>
          )}
        </div>
      )}

      {/* Global mode: server quick-select pills */}
      {viewMode === 'global' && servers.length > 0 && (
        <div className="mcpoke-log-status mcpoke-log-status-wrap">
          {servers.map((s) => (
            <span key={s.item.id} className="mcpoke-chip mcpoke-log-server-chip" style={{
              cursor: 'pointer',
              color: ['running', 'tunneling', 'tunneled', 'deployed'].includes(s.running.state) ? 'var(--color-ok)' : 'var(--color-muted)',
              borderColor: ['running', 'tunneling', 'tunneled', 'deployed'].includes(s.running.state) ? 'rgba(34,197,94,0.2)' : undefined
            }}>
              {s.item.name}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '10px' }}>streaming all servers</span>
        </div>
      )}

      <div className="mcpoke-log-rows">
        {viewMode === 'selected' && !selectedId && (
          <div className="mcpoke-log-empty">
            Select a server from the Registry tab to see its logs.
          </div>
        )}
        {filtered.length === 0 && (activeLogs.length > 0 || (viewMode === 'global')) && selectedId || (viewMode === 'global' && filtered.length === 0 && activeLogs.length > 0) ? (
          <div className="mcpoke-log-empty">
            No entries match the current filters.
          </div>
        ) : null}
        {viewMode === 'global' && filtered.length === 0 && activeLogs.length === 0 && (
          <div className="mcpoke-log-empty-lg">
            Activity will appear here as servers run.
          </div>
        )}
        {filtered.map((l) => <LogLine key={l.id} log={l} showServer={viewMode === 'global'} />)}
      </div>
    </div>
  )
}

function LogLine({ log, showServer }: { log: LogEntry; showServer: boolean }) {
  const t = new Date(log.timestamp).toISOString()

  const msgColor =
    log.level === 'error' ? 'var(--color-danger)' :
    log.level === 'warn' ? 'var(--color-warn)' :
    log.level === 'trace' || log.level === 'debug' ? 'var(--color-muted)' :
    'var(--color-fg)'

  const streamColor =
    log.stream === 'stderr' ? 'rgba(245,158,11,0.7)' :
    log.stream === 'tunnel' ? 'rgba(96,165,250,0.7)' :
    log.stream === 'system' ? 'rgba(192,132,252,0.7)' :
    log.stream === 'poke' ? 'rgba(29,155,240,0.7)' :
    'rgba(136,136,136,0.5)'

  const levelColor =
    log.level === 'error' ? 'rgba(248,113,113,0.8)' :
    log.level === 'warn' ? 'rgba(251,191,36,0.8)' :
    log.level === 'debug' ? 'rgba(96,165,250,0.6)' :
    log.level === 'trace' ? 'rgba(136,136,136,0.4)' :
    'rgba(136,136,136,0.6)'

  return (
    <div className="mcpoke-log-line" style={{ color: msgColor }}>
      <span className="mcpoke-log-time">{t.slice(11, 23)}</span>
      {showServer && (
        <span className="mcpoke-log-server" title={log.serverName ?? log.serverId}>
          {log.serverName ?? log.serverId?.slice(0, 6) ?? '?'}
        </span>
      )}
      <span className="mcpoke-log-stream" style={{ color: streamColor }}>{log.stream}</span>
      <span className="mcpoke-log-level" style={{ color: levelColor }}>{log.level}</span>
      <span className="mcpoke-log-msg">{log.message}</span>
    </div>
  )
}
